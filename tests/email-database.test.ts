import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {test} from "node:test";
import {AUTO_REPAIR_SCHEMA} from "../lib/supabase/schema";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
}

const service = createClient(supabaseUrl, supabaseServiceRoleKey, {
  db: {schema: AUTO_REPAIR_SCHEMA},
});
const anon = createClient(supabaseUrl, supabaseAnonKey, {
  db: {schema: AUTO_REPAIR_SCHEMA},
});

test("delivery log is private, idempotent, status-aware, and capped", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const {data: sourceShop, error: sourceError} = await service
    .from("autoshop_shops")
    .select("*")
    .eq("is_active", true)
    .single();
  assert.equal(sourceError, null);
  assert.ok(sourceShop);

  const {data: shop, error: shopError} = await service
    .from("autoshop_shops")
    .insert({
      ...sourceShop,
      id: undefined,
      shop_key: `email-test-${suffix}`,
      name: `Email Test ${suffix}`,
      is_active: false,
    })
    .select()
    .single();
  assert.equal(shopError, null);
  assert.ok(shop);

  let jobId: string | undefined;
  try {
    const {data: job, error: jobError} = await service
      .from("autoshop_jobs")
      .insert({
        shop_id: shop.id,
        customer_name: "Email Test Customer",
        customer_email: "recipient@example.test",
        plate_number: `EMAIL-${suffix}`,
        phone: suffix,
        vehicle: "Test vehicle",
        status: "booked",
      })
      .select()
      .single();
    assert.equal(jobError, null);
    assert.ok(job);
    jobId = job.id;

    const {data: firstMessage, error: firstMessageError} = await service
      .from("autoshop_messages")
      .insert({
        job_id: job.id,
        kind: "status_update",
        body: "The vehicle is being inspected.",
        sent: false,
      })
      .select()
      .single();
    assert.equal(firstMessageError, null);

    const reserveArgs = {
      p_shop_id: shop.id,
      p_job_id: job.id,
      p_message_id: firstMessage.id,
      p_template_id: "status_update",
      p_transport: "n8n",
      p_recipient: "recipient@example.test",
      p_cap: 1,
    };
    const {data: firstReservation, error: firstReserveError} = await service.rpc(
      "reserve_autoshop_email_delivery",
      reserveArgs
    );
    assert.equal(firstReserveError, null);
    assert.equal(firstReservation.is_new, true);
    assert.equal(firstReservation.delivery.status, "pending");

    const {data: repeatedReservation, error: repeatedError} = await service.rpc(
      "reserve_autoshop_email_delivery",
      reserveArgs
    );
    assert.equal(repeatedError, null);
    assert.equal(repeatedReservation.is_new, false);
    assert.equal(
      repeatedReservation.delivery.id,
      firstReservation.delivery.id
    );

    const {data: ambiguous, error: ambiguousError} = await service.rpc(
      "complete_autoshop_email_delivery",
      {
        p_delivery_id: firstReservation.delivery.id,
        p_status: "reconciling",
        p_provider_message_id: null,
        p_error: "provider response lost",
      }
    );
    assert.equal(ambiguousError, null);
    assert.equal(ambiguous.status, "reconciling");

    const {data: retryReservation, error: retryReservationError} =
      await service.rpc("reserve_autoshop_email_delivery", reserveArgs);
    assert.equal(retryReservationError, null);
    assert.equal(retryReservation.is_new, false);
    assert.equal(retryReservation.delivery.id, firstReservation.delivery.id);

    const {data: completed, error: completeError} = await service.rpc(
      "complete_autoshop_email_delivery",
      {
        p_delivery_id: firstReservation.delivery.id,
        p_status: "sent",
        p_provider_message_id: "test-provider-id",
        p_error: null,
      }
    );
    assert.equal(completeError, null);
    assert.equal(completed.status, "sent");
    assert.ok(completed.sent_at);

    const {data: replayed, error: replayError} = await service.rpc(
      "complete_autoshop_email_delivery",
      {
        p_delivery_id: firstReservation.delivery.id,
        p_status: "failed",
        p_provider_message_id: null,
        p_error: "late duplicate callback",
      }
    );
    assert.equal(replayError, null);
    assert.equal(replayed.status, "sent");
    assert.equal(replayed.provider_message_id, "test-provider-id");

    const {data: sentMessage, error: sentMessageError} = await service
      .from("autoshop_messages")
      .select("sent")
      .eq("id", firstMessage.id)
      .single();
    assert.equal(sentMessageError, null);
    assert.equal(sentMessage.sent, true);

    const {data: secondMessage, error: secondMessageError} = await service
      .from("autoshop_messages")
      .insert({
        job_id: job.id,
        kind: "review_request",
        body: "Please share your experience.",
        sent: false,
      })
      .select()
      .single();
    assert.equal(secondMessageError, null);

    const {data: capped, error: cappedError} = await service.rpc(
      "reserve_autoshop_email_delivery",
      {
        ...reserveArgs,
        p_message_id: secondMessage.id,
        p_template_id: "review_request",
      }
    );
    assert.equal(cappedError, null);
    assert.equal(capped.is_new, false);
    assert.equal(capped.delivery.status, "capped");

    const {data: leaked, error: anonError} = await anon
      .from("autoshop_email_deliveries")
      .select("id")
      .eq("job_id", job.id);
    assert.equal(leaked, null);
    assert.ok(anonError, "anonymous delivery-table access must be denied");
  } finally {
    if (jobId) {
      await service.from("autoshop_jobs").delete().eq("id", jobId);
    }
    await service.from("autoshop_shops").delete().eq("id", shop.id);
  }
});
