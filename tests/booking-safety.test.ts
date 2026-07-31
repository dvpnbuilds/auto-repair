import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

async function source(...segments: string[]) {
  return readFile(join(root, ...segments), "utf8");
}

test("booking retries reuse one database job and overlapping work is rejected transactionally", async () => {
  const migration = await source(
    "supabase",
    "migrations",
    "20260731120000_booking_and_reminder_safety.sql"
  );
  const route = await source("app", "api", "book", "route.ts");
  const form = await source("app", "[locale]", "book", "BookingForm.tsx");

  assert.match(
    migration,
    /create unique index if not exists autoshop_jobs_booking_idempotency_key[\s\S]*shop_id, booking_idempotency_key/
  );
  assert.match(migration, /autoshop-booking-key:%s:%s/);
  assert.match(
    migration,
    /where shop_id = p_shop_id[\s\S]*booking_idempotency_key = p_idempotency_key[\s\S]*return to_jsonb\(created_job\)/
  );
  assert.match(migration, /autoshop-booking-capacity:%s:%s/);
  assert.match(migration, /existing_job\.scheduled_at[\s\S]*make_interval/);
  assert.match(migration, /raise exception 'SLOT_UNAVAILABLE'/);

  assert.match(route, /p_idempotency_key: body\.idempotency_key/);
  assert.match(route, /error\.message\.includes\("SLOT_UNAVAILABLE"\)/);
  assert.match(form, /idempotencyKey\.current \?\?= crypto\.randomUUID\(\)/);
  assert.match(form, /idempotency_key: idempotencyKey\.current/);
});
