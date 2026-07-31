import {NextResponse} from "next/server";
import {isAdminAuthedFromHeader} from "@/lib/admin/auth";
import {readBoundedJson, RequestBodyError} from "@/lib/api/request";
import {
  createApprovalToken,
  hashApprovalToken,
} from "@/lib/approvals/tokens";
import {
  getPublicAppBaseUrl,
  prepareEmailDispatch,
  sendEmail,
} from "@/lib/email/send";
import type {EmailDelivery} from "@/lib/email/types";
import {formatCurrency, formatDateTime} from "@/lib/formatting";
import {draftApprovalExplanation} from "@/lib/openrouter/approvals";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseService} from "@/lib/supabase/server";

const MAX_BODY_BYTES = 8192;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ApprovalBody = {
  idempotencyKey: string;
  serviceId: string;
  description: string;
  amount: number;
};

function parseBody(value: unknown): ApprovalBody | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (
    typeof body.idempotencyKey !== "string" ||
    !UUID_PATTERN.test(body.idempotencyKey) ||
    typeof body.serviceId !== "string" ||
    !UUID_PATTERN.test(body.serviceId) ||
    !description ||
    description.length > 1000 ||
    !Number.isInteger(body.amount) ||
    (body.amount as number) < 1 ||
    (body.amount as number) > 10_000_000
  ) {
    return null;
  }
  return {
    idempotencyKey: body.idempotencyKey.toLowerCase(),
    serviceId: body.serviceId.toLowerCase(),
    description,
    amount: body.amount as number,
  };
}

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  if (!isAdminAuthedFromHeader(request.headers.get("cookie"))) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    return NextResponse.json({error: "Invalid request body"}, {status: 400});
  }
  const input = parseBody(body);
  if (!input) {
    return NextResponse.json({error: "Invalid approval request"}, {status: 400});
  }

  const {id: jobId} = await params;
  if (!UUID_PATTERN.test(jobId)) {
    return NextResponse.json({error: "Job not found"}, {status: 404});
  }

  const shop = await getActiveShop(supabaseService);
  const [{data: job}, {data: service}] = await Promise.all([
    supabaseService
      .from("autoshop_jobs")
      .select(
        "id, shop_id, customer_name, customer_email, vehicle, probable_issue, status"
      )
      .eq("id", jobId)
      .eq("shop_id", shop.id)
      .single(),
    supabaseService
      .from("autoshop_services")
      .select("id, name, price_min, price_max")
      .eq("id", input.serviceId)
      .eq("shop_id", shop.id)
      .single(),
  ]);
  if (!job) return NextResponse.json({error: "Job not found"}, {status: 404});
  if (!service) {
    return NextResponse.json({error: "Service not found"}, {status: 400});
  }
  if (!["in_progress", "waiting_parts"].includes(job.status)) {
    return NextResponse.json(
      {error: "Extra work can only be requested for active repairs"},
      {status: 409}
    );
  }
  if (input.amount < service.price_min || input.amount > service.price_max) {
    return NextResponse.json(
      {error: "Amount must stay within the selected service price range"},
      {status: 400}
    );
  }

  let reservationConfig;
  let baseUrl: string;
  let token: string;
  let tokenHash: string;
  try {
    reservationConfig = prepareEmailDispatch(shop, job.customer_email);
    baseUrl = getPublicAppBaseUrl();
    token = createApprovalToken(input.idempotencyKey);
    tokenHash = hashApprovalToken(token);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Email delivery is not configured",
      },
      {status: 503}
    );
  }

  const formattedAmount = formatCurrency(input.amount, shop);
  let drafted;
  try {
    drafted = await draftApprovalExplanation({
      customerName: job.customer_name,
      vehicle: job.vehicle,
      probableIssue: job.probable_issue,
      serviceName: service.name,
      technicianDescription: input.description,
      formattedAmount,
      shop,
    });
  } catch {
    return NextResponse.json(
      {error: "Approval explanation could not be drafted"},
      {status: 502}
    );
  }

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const customerExplanation = `${drafted.explanation} ${drafted.consequenceOfDeclining}`;
  const {data, error} = await supabaseService.rpc(
    "create_autoshop_approval_request",
    {
      p_request_id: input.idempotencyKey,
      p_shop_id: shop.id,
      p_job_id: job.id,
      p_service_id: service.id,
      p_description: input.description,
      p_amount: input.amount,
      p_customer_explanation: customerExplanation,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
      p_transport: reservationConfig.transport,
      p_recipient: reservationConfig.recipient,
      p_cap: reservationConfig.cap,
    }
  );
  if (error || !data?.approval || !data?.message || !data?.delivery) {
    const message = error?.message ?? "Approval request could not be saved";
    if (message.includes("APPROVAL_DELIVERY_CAPPED")) {
      return NextResponse.json(
        {error: "The email send limit has been reached"},
        {status: 429}
      );
    }
    const conflict =
      message.includes("APPROVAL_ALREADY_PENDING") ||
      message.includes("IDEMPOTENCY_CONFLICT");
    return NextResponse.json(
      {error: conflict ? "This job already has a pending approval" : message},
      {status: conflict ? 409 : 500}
    );
  }

  const approvalUrl = `${baseUrl}/en/approve/${encodeURIComponent(token)}`;
  const storedExplanation = data.approval.customer_explanation as string;
  const storedDescription = data.approval.description as string;
  const storedAmount = data.approval.amount as number;
  try {
    const email = await sendEmail(
      {
        shop,
        jobId: job.id,
        messageId: data.message.id,
        templateId: "extra_work_approval",
        to: job.customer_email,
        payload: {
          customerName: job.customer_name,
          shopName: shop.name,
          shopAddress: shop.address,
          vehicle: job.vehicle,
          messageBody: storedExplanation,
          approvalUrl,
          approvalAmount: formatCurrency(storedAmount, shop),
          approvalDescription: `${service.name}: ${storedDescription}`,
          approvalExpiresAt: formatDateTime(data.approval.expires_at, shop),
        },
      },
      data.delivery as EmailDelivery
    );
    return NextResponse.json({
      approval: data.approval,
      message: data.message,
      email,
      isReplay: data.is_replay === true,
    });
  } catch (error) {
    const delivery =
      error && typeof error === "object" && "delivery" in error
        ? (error as {delivery: EmailDelivery}).delivery
        : data.delivery;
    return NextResponse.json(
      {
        error: "Approval was saved, but email delivery needs reconciliation",
        approval: data.approval,
        message: data.message,
        email: {delivery, dispatched: false},
      },
      {status: 202}
    );
  }
}
