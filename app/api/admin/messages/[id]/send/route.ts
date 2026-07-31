import {NextResponse} from "next/server";
import {isAdminAuthedFromHeader} from "@/lib/admin/auth";
import {readBoundedJson, RequestBodyError} from "@/lib/api/request";
import {createEmailPayload} from "@/lib/email/payload";
import {sendEmail} from "@/lib/email/send";
import type {EmailDelivery} from "@/lib/email/types";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseService} from "@/lib/supabase/server";

const MAX_SEND_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE_BODY_LENGTH = 10_000;

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  if (!isAdminAuthedFromHeader(request.headers.get("cookie"))) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const {id} = await params;
  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_SEND_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    return NextResponse.json({error: "Invalid request body"}, {status: 400});
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({error: "Invalid request body"}, {status: 400});
  }
  const bodyValue = (body as Record<string, unknown>).body;
  if (
    bodyValue !== undefined &&
    (typeof bodyValue !== "string" ||
      bodyValue.length > MAX_MESSAGE_BODY_LENGTH)
  ) {
    return NextResponse.json({error: "Invalid message body"}, {status: 400});
  }
  const editedBody =
    typeof bodyValue === "string" ? bodyValue.trim() : null;

  const {data: message, error: messageError} = await supabaseService
    .from("autoshop_messages")
    .select("*")
    .eq("id", id)
    .single();

  if (messageError || !message) {
    return NextResponse.json({error: "Message not found"}, {status: 404});
  }

  const shop = await getActiveShop(supabaseService);
  const {data: job, error: jobError} = await supabaseService
    .from("autoshop_jobs")
    .select("*")
    .eq("id", message.job_id)
    .eq("shop_id", shop.id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({error: "Job not found"}, {status: 404});
  }

  if (editedBody) {
    const {error} = await supabaseService
      .from("autoshop_messages")
      .update({body: editedBody})
      .eq("id", id)
      .eq("job_id", job.id);
    if (error) {
      return NextResponse.json({error: "Failed to update message"}, {status: 500});
    }
    message.body = editedBody;
  }

  try {
    const email = await sendEmail({
      shop,
      jobId: job.id,
      messageId: message.id,
      templateId: message.kind,
      to: job.customer_email,
      payload: createEmailPayload(job, shop, message.body),
    });
    const {data: updatedMessage} = await supabaseService
      .from("autoshop_messages")
      .select("*")
      .eq("id", id)
      .single();

    return NextResponse.json({
      message: updatedMessage ?? message,
      email,
    });
  } catch (err) {
    console.error("Email delivery moved to a durable recovery state:", err);
    const delivery =
      err && typeof err === "object" && "delivery" in err
        ? (err.delivery as EmailDelivery)
        : null;
    const {data: updatedMessage} = await supabaseService
      .from("autoshop_messages")
      .select("*")
      .eq("id", id)
      .single();
    return NextResponse.json(
      {
        message: updatedMessage ?? message,
        email: delivery ? {delivery, dispatched: false} : null,
        emailError: true,
      },
      {status: 202}
    );
  }
}
