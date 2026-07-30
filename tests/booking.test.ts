import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { shopLocalDateTimeToIso } from "../lib/formatting";
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

test("booking creates a job with a status history entry, retrievable by plate + phone", async () => {
  const plate = "TEST 0001";
  const phone = "0900 000 0001";
  const { data: shop, error: shopError } = await supabaseService
    .from("autoshop_shops")
    .select("*")
    .eq("is_active", true)
    .single();
  assert.equal(shopError, null);
  assert.ok(shop);

  const { data: job, error: jobError } = await supabaseService
    .from("autoshop_jobs")
    .insert({
      shop_id: shop!.id,
      customer_name: "Test Customer",
      plate_number: plate,
      phone,
      vehicle: "2020 Toyota Wigo",
      issue_description: "Test booking from tests/booking.test.ts",
      scheduled_at: shopLocalDateTimeToIso("2026-08-01", "09:00", shop!),
    })
    .select()
    .single();

  assert.equal(jobError, null);
  assert.ok(job);

  const { error: historyError } = await supabaseService.from("autoshop_status_history").insert({
    job_id: job!.id,
    status: "booked",
    note: "Booked via customer portal",
  });
  assert.equal(historyError, null);

  try {
    const { data: foundJob, error: lookupError } = await supabaseAnon
      .from("autoshop_jobs")
      .select("*")
      .eq("shop_id", shop!.id)
      .ilike("plate_number", plate)
      .eq("phone", phone)
      .maybeSingle();

    assert.equal(lookupError, null);
    assert.ok(foundJob, "expected the booked job to be retrievable by plate + phone");
    assert.equal(foundJob!.status, "booked");

    const { data: history, error: historyLookupError } = await supabaseAnon
      .from("autoshop_status_history")
      .select("*")
      .eq("job_id", foundJob!.id);

    assert.equal(historyLookupError, null);
    assert.ok(history && history.length >= 1, "expected at least one status history entry");
    assert.equal(history![0].status, "booked");
  } finally {
    await supabaseService.from("autoshop_jobs").delete().eq("id", job!.id);
  }
});
