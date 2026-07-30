import {NextResponse} from "next/server";
import {isAdminAuthedFromHeader} from "@/lib/admin/auth";
import {createEmailPayload} from "@/lib/email/payload";
import {
  prepareEmailReservation,
  sendEmail,
} from "@/lib/email/send";
import type {EmailDelivery} from "@/lib/email/types";
import {draftMessage} from "@/lib/openrouter/messages";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseService} from "@/lib/supabase/server";
import {isJobStatus} from "@/lib/statuses";

type TransitionResult = {
  conflict?: boolean;
  current_status?: string;
  is_replay?: boolean;
  job?: Record<string, unknown>;
  message?: Record<string, unknown>;
  delivery?: EmailDelivery;
};

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  if (!isAdminAuthedFromHeader(request.headers.get("cookie"))) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const {id} = await params;
  const body = await request.json().catch(() => null);
  const status = body?.status;
  const expectedStatus = body?.expectedStatus;
  if (!isJobStatus(status) || !isJobStatus(expectedStatus)) {
    return NextResponse.json({error: "Invalid status transition"}, {status: 400});
  }

  const shop = await getActiveShop(supabaseService);
  const {data: currentJob, error: jobError} = await supabaseService
    .from("autoshop_jobs")
    .select("*")
    .eq("id", id)
    .eq("shop_id", shop.id)
    .single();
  if (jobError || !currentJob) {
    return NextResponse.json({error: "Job not found"}, {status: 404});
  }

  let emailConfig;
  try {
    emailConfig = prepareEmailReservation(currentJob.customer_email);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Email configuration is invalid";
    return NextResponse.json({error: message}, {status: 503});
  }

  let draftBody: string | null = null;
  if (currentJob.status === expectedStatus) {
    try {
      draftBody = await draftMessage("status_update", {
        ...currentJob,
        status,
      });
    } catch (error) {
      console.error("Draft generation failed before status transition:", error);
      return NextResponse.json(
        {error: "Failed to draft the status message"},
        {status: 502}
      );
    }
  }

  const {data, error} = await supabaseService.rpc(
    "transition_autoshop_job",
    {
      p_job_id: id,
      p_shop_id: shop.id,
      p_expected_status: expectedStatus,
      p_target_status: status,
      p_draft_body: draftBody,
      p_transport: emailConfig.transport,
      p_recipient: emailConfig.recipient,
      p_cap: emailConfig.cap,
    }
  );

  if (error) {
    console.error("Transactional status transition failed:", error);
    return NextResponse.json(
      {error: "Failed to update job status"},
      {status: 500}
    );
  }

  const transition = data as TransitionResult;
  if (transition.conflict) {
    return NextResponse.json(
      {
        error: "Job status changed before this request completed",
        currentStatus: transition.current_status,
      },
      {status: 409}
    );
  }
  if (!transition.job || !transition.message || !transition.delivery) {
    return NextResponse.json(
      {error: "Status transition returned an incomplete result"},
      {status: 500}
    );
  }

  try {
    const email = await sendEmail(
      {
        shop,
        jobId: id,
        messageId: transition.message.id as string,
        templateId: "status_update",
        to: currentJob.customer_email,
        payload: createEmailPayload(
          transition.job as Parameters<typeof createEmailPayload>[0],
          shop,
          transition.message.body as string
        ),
      },
      transition.delivery
    );
    return NextResponse.json({
      job: transition.job,
      message: transition.message,
      email,
      replayed: transition.is_replay === true,
    });
  } catch (error) {
    console.error("Status email moved to durable recovery state:", error);
    const delivery =
      error && typeof error === "object" && "delivery" in error
        ? (error.delivery as EmailDelivery)
        : transition.delivery;
    return NextResponse.json({
      job: transition.job,
      message: transition.message,
      email: {delivery, dispatched: false},
      emailError: true,
      replayed: transition.is_replay === true,
    });
  }
}
