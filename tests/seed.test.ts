import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { AUTO_REPAIR_SCHEMA } from "../lib/supabase/schema";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: AUTO_REPAIR_SCHEMA },
});
const service = createClient(supabaseUrl, supabaseServiceRoleKey, {
  db: {schema: AUTO_REPAIR_SCHEMA},
});

test("seed populates both shop configurations with exactly one active shop", async () => {
  const { data, error } = await supabase.from("autoshop_shops").select("*");
  assert.equal(error, null);
  assert.ok(data && data.some((shop) => shop.shop_key === "us"));
  assert.ok(data && data.some((shop) => shop.shop_key === "ph"));
  assert.equal(data?.filter((shop) => shop.is_active).length, 1);
});

test("seed populates autoshop_services with the RapidFix price list", async () => {
  const { data, error } = await supabase.from("autoshop_services").select("*");
  assert.equal(error, null);
  assert.ok(data && data.length >= 10, "expected at least 10 seeded services");
  assert.ok(data!.some((s) => s.name === "Oil Change"));
});

test("seed populates autoshop_jobs with RapidFix demo jobs", async () => {
  const {data: anonymousJobs, error: anonymousError} = await supabase
    .from("autoshop_jobs")
    .select("*");
  assert.equal(anonymousJobs, null);
  assert.ok(anonymousError, "anonymous jobs access must be denied");

  const { data, error } = await service.from("autoshop_jobs").select("*");
  assert.equal(error, null);
  assert.ok(data && data.length >= 5, "expected at least 5 seeded jobs");
  assert.ok(data!.some((j) => j.plate_number === "NBC 1234"));
});
