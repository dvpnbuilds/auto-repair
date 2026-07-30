import {NextResponse} from "next/server";
import {isAdminAuthedFromHeader} from "@/lib/admin/auth";
import {createEmailPayload} from "@/lib/email/payload";
import {sendEmail} from "@/lib/email/send";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseService} from "@/lib/supabase/server";

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  if (!isAdminAuthedFromHeader(request.headers.get("cookie"))) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const {id} = await params;
  const body = await request.json().catch(() => null);
  const editedBody = typeof body?.body === "string" ? body.body.trim() : null;

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
    console.error("Email delivery failed:", err);
    return NextResponse.json({error: "Email delivery failed"}, {status: 502});
  }
}
