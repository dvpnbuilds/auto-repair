import { NextResponse } from "next/server";
import { isAdminAuthedFromHeader } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/server";
import { isJobStatus } from "@/lib/statuses";
import { draftMessage } from "@/lib/openrouter/messages";
import { getActiveShop } from "@/lib/shop-config";
import {createEmailPayload} from "@/lib/email/payload";
import {sendEmail} from "@/lib/email/send";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthedFromHeader(request.headers.get("cookie"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const status = body?.status;

  if (!isJobStatus(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const shop = await getActiveShop(supabaseService);
  const { data: job, error: jobError } = await supabaseService
    .from("autoshop_jobs")
    .update({ status })
    .eq("id", id)
    .eq("shop_id", shop.id)
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }

  const { error: historyError } = await supabaseService.from("autoshop_status_history").insert({
    job_id: id,
    status,
    note: "Status updated via admin board",
  });

  if (historyError) {
    return NextResponse.json({ error: "Failed to record status history" }, { status: 500 });
  }

  let draftBody: string;
  try {
    draftBody = await draftMessage("status_update", job);
  } catch (err) {
    console.error("Draft generation failed:", err);
    return NextResponse.json({ job, message: null, draftError: true });
  }

  const { data: message, error: messageError } = await supabaseService
    .from("autoshop_messages")
    .insert({ job_id: id, kind: "status_update", body: draftBody, sent: false })
    .select()
    .single();

  if (messageError) {
    return NextResponse.json({ error: "Failed to save draft message" }, { status: 500 });
  }

  try {
    const email = await sendEmail({
      shop,
      jobId: job.id,
      messageId: message.id,
      templateId: "status_update",
      to: job.customer_email,
      payload: createEmailPayload(job, shop, message.body),
    });
    return NextResponse.json({job, message, email});
  } catch (err) {
    console.error("Status email delivery failed:", err);
    return NextResponse.json({
      job,
      message,
      email: null,
      emailError: true,
    });
  }
}
