import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { draftMessage } from "../lib/openrouter/messages";
import { AUTO_REPAIR_SCHEMA } from "../lib/supabase/schema";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
}

const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey, {
  db: { schema: AUTO_REPAIR_SCHEMA },
});
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: AUTO_REPAIR_SCHEMA },
});

test("admin loop: status change drafts an AI message, and sending it surfaces in the customer tracker", async () => {
  const plate = "TEST 0002";
  const phone = "0900 000 0002";
  const { data: shop, error: shopError } = await supabaseService
    .from("autoshop_shops")
    .select("id")
    .eq("is_active", true)
    .single();
  assert.equal(shopError, null);
  assert.ok(shop);

  const { data: job, error: jobError } = await supabaseService
    .from("autoshop_jobs")
    .insert({
      shop_id: shop!.id,
      customer_name: "Admin Test Customer",
      plate_number: plate,
      phone,
      vehicle: "2019 Toyota Vios",
      probable_issue: "Worn brake pads",
      status: "booked",
    })
    .select()
    .single();

  assert.equal(jobError, null);
  assert.ok(job);

  try {
    const draftBody = await draftMessage("status_update", {
      customer_name: job!.customer_name,
      vehicle: job!.vehicle,
      probable_issue: job!.probable_issue,
      status: "in_progress",
      scheduled_at: job!.scheduled_at,
    });
    assert.ok(draftBody.trim().length > 0, "expected a non-empty AI draft");

    const { error: updateError } = await supabaseService
      .from("autoshop_jobs")
      .update({ status: "in_progress" })
      .eq("id", job!.id);
    assert.equal(updateError, null);

    const { data: draftMsg, error: draftError } = await supabaseService
      .from("autoshop_messages")
      .insert({ job_id: job!.id, kind: "status_update", body: draftBody, sent: false })
      .select()
      .single();
    assert.equal(draftError, null);

    const {data: unsentVisible, error: unsentError} = await supabaseAnon
      .from("autoshop_messages")
      .select("*")
      .eq("id", draftMsg!.id)
      .maybeSingle();
    assert.equal(unsentVisible, null, "unsent drafts must not be visible to the customer tracker");
    assert.ok(unsentError, "anonymous message-table access must be denied");

    const {data: reservation, error: reserveError} = await supabaseService.rpc(
      "reserve_autoshop_email_delivery",
      {
        p_shop_id: shop!.id,
        p_job_id: job!.id,
        p_message_id: draftMsg!.id,
        p_template_id: "status_update",
        p_transport: "n8n",
        p_recipient: "admin-test@example.test",
        p_cap: 1000,
      }
    );
    assert.equal(reserveError, null);
    assert.equal(reservation.is_new, true);

    const {error: sendError} = await supabaseService.rpc(
      "complete_autoshop_email_delivery",
      {
        p_delivery_id: reservation.delivery.id,
        p_status: "sent",
        p_provider_message_id: "admin-test-provider-id",
        p_error: null,
      }
    );
    assert.equal(sendError, null);

    const { data: sentVisible, error: sentError } = await supabaseAnon
      .from("autoshop_messages")
      .select("*")
      .eq("job_id", job!.id)
      .eq("sent", true)
      .maybeSingle();

    assert.equal(sentVisible, null);
    assert.ok(sentError, "sent messages must remain private from the anon client");

    const {data: serviceMessage, error: serviceMessageError} =
      await supabaseService
        .from("autoshop_messages")
        .select("*")
        .eq("job_id", job!.id)
        .eq("sent", true)
        .maybeSingle();
    assert.equal(serviceMessageError, null);
    assert.equal(serviceMessage?.body, draftBody);
  } finally {
    await supabaseService.from("autoshop_jobs").delete().eq("id", job!.id);
  }
});
