import "server-only";
import {completeEmailDelivery} from "@/lib/email/deliveries";
import {createEmailPayload} from "@/lib/email/payload";
import {sendEmail} from "@/lib/email/send";
import type {EmailDelivery} from "@/lib/email/types";
import {supabaseService} from "@/lib/supabase/server";

const MINIMUM_AGE_MS = 5 * 60 * 1000;
const MAXIMUM_RETRY_AGE_MS = 23 * 60 * 60 * 1000;
const MAX_BATCH_SIZE = 20;

export type ReconciliationResult = {
  deliveryId: string;
  status: string;
};

export async function reconcileEmailDeliveries(): Promise<
  ReconciliationResult[]
> {
  const now = Date.now();
  const {data: deliveries, error} = await supabaseService
    .from("autoshop_email_deliveries")
    .select("*")
    .in("status", ["pending", "reconciling"])
    .lte("created_at", new Date(now - MINIMUM_AGE_MS).toISOString())
    .gte("created_at", new Date(now - MAXIMUM_RETRY_AGE_MS).toISOString())
    .order("created_at", {ascending: true})
    .limit(MAX_BATCH_SIZE);

  if (error) {
    throw new Error(`Failed to load email reconciliation queue: ${error.message}`);
  }

  const results: ReconciliationResult[] = [];
  for (const row of deliveries ?? []) {
    const delivery = row as EmailDelivery;
    const [shopResult, jobResult, messageResult] = await Promise.all([
      supabaseService
        .from("autoshop_shops")
        .select("*")
        .eq("id", delivery.shop_id)
        .single(),
      supabaseService
        .from("autoshop_jobs")
        .select("*")
        .eq("id", delivery.job_id)
        .single(),
      delivery.message_id
        ? supabaseService
            .from("autoshop_messages")
            .select("*")
            .eq("id", delivery.message_id)
            .single()
        : Promise.resolve({data: null, error: null}),
    ]);

    if (
      shopResult.error ||
      jobResult.error ||
      messageResult.error ||
      !shopResult.data ||
      !jobResult.data ||
      !messageResult.data
    ) {
      const failed = await completeEmailDelivery(
        delivery.id,
        "failed",
        delivery.provider_message_id,
        "Delivery source records are unavailable"
      );
      results.push({deliveryId: delivery.id, status: failed.status});
      continue;
    }

    try {
      const result = await sendEmail(
        {
          shop: shopResult.data,
          jobId: jobResult.data.id,
          messageId: messageResult.data.id,
          templateId: delivery.template_id,
          to: jobResult.data.customer_email,
          payload: createEmailPayload(
            jobResult.data,
            shopResult.data,
            messageResult.data.body
          ),
        },
        delivery
      );
      results.push({
        deliveryId: delivery.id,
        status: result.delivery.status,
      });
    } catch (sendError) {
      const status =
        sendError && typeof sendError === "object" && "delivery" in sendError
          ? String((sendError.delivery as EmailDelivery).status)
          : "reconciling";
      results.push({deliveryId: delivery.id, status});
    }
  }

  return results;
}
