import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { draftMessage } from "../lib/openrouter/messages";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
}

const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

test("admin loop: status change drafts an AI message, and sending it surfaces in the customer tracker", async () => {
  const plate = "TEST 0002";
  const phone = "0900 000 0002";

  const { data: job, error: jobError } = await supabaseService
    .from("autoshop_jobs")
    .insert({
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

    const { data: unsentVisible } = await supabaseAnon
      .from("autoshop_messages")
      .select("*")
      .eq("id", draftMsg!.id)
      .maybeSingle();
    assert.equal(unsentVisible, null, "unsent drafts must not be visible to the customer tracker");

    const { error: sendError } = await supabaseService
      .from("autoshop_messages")
      .update({ sent: true })
      .eq("id", draftMsg!.id);
    assert.equal(sendError, null);

    const { data: sentVisible, error: sentError } = await supabaseAnon
      .from("autoshop_messages")
      .select("*")
      .eq("job_id", job!.id)
      .eq("sent", true)
      .maybeSingle();

    assert.equal(sentError, null);
    assert.ok(sentVisible, "expected the sent message to be visible via the anon client");
    assert.equal(sentVisible!.body, draftBody);
  } finally {
    await supabaseService.from("autoshop_jobs").delete().eq("id", job!.id);
  }
});
