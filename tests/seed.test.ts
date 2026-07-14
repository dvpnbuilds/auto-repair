import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

test("seed populates autoshop_services with the RapidFix price list", async () => {
  const { data, error } = await supabase.from("autoshop_services").select("*");
  assert.equal(error, null);
  assert.ok(data && data.length >= 10, "expected at least 10 seeded services");
  assert.ok(data!.some((s) => s.name === "Oil Change"));
});

test("seed populates autoshop_jobs with RapidFix demo jobs", async () => {
  const { data, error } = await supabase.from("autoshop_jobs").select("*");
  assert.equal(error, null);
  assert.ok(data && data.length >= 5, "expected at least 5 seeded jobs");
  assert.ok(data!.some((j) => j.plate_number === "NBC 1234"));
});
