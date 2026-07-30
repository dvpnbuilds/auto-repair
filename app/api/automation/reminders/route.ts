import {NextResponse} from "next/server";
import {createEmailPayload} from "@/lib/email/payload";
import {sendEmail} from "@/lib/email/send";
import {draftMessage} from "@/lib/openrouter/messages";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseService} from "@/lib/supabase/server";
import {hasValidN8nSecret} from "@/lib/webhooks/auth";

export async function POST(request: Request) {
  if (!hasValidN8nSecret(request.headers)) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const shop = await getActiveShop(supabaseService);
  const now = new Date();
  const reminderWindowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const {data: jobs, error: jobsError} = await supabaseService
    .from("autoshop_jobs")
    .select("*")
    .eq("shop_id", shop.id)
    .eq("status", "booked")
    .not("customer_email", "is", null)
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", reminderWindowEnd.toISOString());

  if (jobsError) {
    return NextResponse.json({error: "Failed to load due reminders"}, {status: 500});
  }

  const jobIds = (jobs ?? []).map((job) => job.id);
  const {data: existing} = jobIds.length
    ? await supabaseService
        .from("autoshop_email_deliveries")
        .select("job_id")
        .in("job_id", jobIds)
        .eq("template_id", "reminder")
        .in("status", ["pending", "sent"])
    : {data: []};
  const alreadyQueued = new Set((existing ?? []).map((delivery) => delivery.job_id));
  const results: Array<{jobId: string; status: string}> = [];

  for (const job of jobs ?? []) {
    if (alreadyQueued.has(job.id)) continue;

    try {
      const messageBody = await draftMessage("reminder", job);
      const {data: message, error: messageError} = await supabaseService
        .from("autoshop_messages")
        .insert({
          job_id: job.id,
          kind: "reminder",
          body: messageBody,
          sent: false,
        })
        .select()
        .single();

      if (messageError || !message) throw messageError ?? new Error("No message");

      const email = await sendEmail({
        shop,
        jobId: job.id,
        messageId: message.id,
        templateId: "reminder",
        to: job.customer_email,
        payload: createEmailPayload(job, shop, message.body),
      });
      results.push({jobId: job.id, status: email.delivery.status});
    } catch (error) {
      console.error("Scheduled reminder failed:", error);
      results.push({jobId: job.id, status: "failed"});
    }
  }

  return NextResponse.json({
    ok: true,
    due: jobs?.length ?? 0,
    processed: results.length,
    results,
  });
}
