import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {test} from "node:test";
import {seedDatabase} from "../lib/seed";
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

test("reset restores two complete regional demos with the US shop active", async () => {
  const result = await seedDatabase(service);
  assert.deepEqual(result, {
    shops: 2,
    technicians: 8,
    services: 20,
    jobs: 10,
    activeShop: "us",
  });

  const {data: shops, error: shopsError} = await anon
    .from("autoshop_shops")
    .select("id, shop_key, is_active");
  assert.equal(shopsError, null);
  assert.equal(shops?.filter((shop) => shop.is_active).length, 1);
  assert.equal(shops?.find((shop) => shop.is_active)?.shop_key, "us");

  for (const shop of shops ?? []) {
    const {count: serviceCount, error: serviceError} = await anon
      .from("autoshop_services")
      .select("*", {count: "exact", head: true})
      .eq("shop_id", shop.id);
    const {count: jobCount, error: jobError} = await service
      .from("autoshop_jobs")
      .select("*", {count: "exact", head: true})
      .eq("shop_id", shop.id);
    assert.equal(serviceError, null);
    assert.equal(jobError, null);
    assert.equal(serviceCount, 10);
    assert.equal(jobCount, 5);
  }

  const usShop = shops?.find((shop) => shop.shop_key === "us");
  const {data: usJobs, error: usJobsError} = await service
    .from("autoshop_jobs")
    .select("vehicle")
    .eq("shop_id", usShop?.id);
  assert.equal(usJobsError, null);
  const vehicles = (usJobs ?? []).map((job) => job.vehicle);
  assert.ok(vehicles.some((vehicle) => vehicle.includes("Ford F-150")));
  assert.ok(vehicles.some((vehicle) => vehicle.includes("Toyota Camry")));
  assert.ok(
    vehicles.some((vehicle) => vehicle.includes("Chevrolet Silverado"))
  );
});

test("shop switcher changes the active market atomically and can return to US", async () => {
  try {
    const {data: phShop, error: phError} = await service.rpc(
      "set_active_autoshop",
      {p_shop_key: "ph"}
    );
    assert.equal(phError, null);
    assert.equal(phShop.shop_key, "ph");

    const {data: afterPh, error: afterPhError} = await anon
      .from("autoshop_shops")
      .select("shop_key, is_active");
    assert.equal(afterPhError, null);
    assert.equal(afterPh?.filter((shop) => shop.is_active).length, 1);
    assert.equal(afterPh?.find((shop) => shop.is_active)?.shop_key, "ph");
  } finally {
    const {data: usShop, error: usError} = await service.rpc(
      "set_active_autoshop",
      {p_shop_key: "us"}
    );
    assert.equal(usError, null);
    assert.equal(usShop.shop_key, "us");
  }
});
