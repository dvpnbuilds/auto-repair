import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {
  ACTIVE_REMINDER_DELIVERY_STATUSES,
  planReminderJobs,
} from "../lib/email/reminder-plan";

const root = fileURLToPath(new URL("../", import.meta.url));

test("ambiguous reminder is reconciled without creating a second delivery or send", async () => {
  const job = {id: "job-1"};
  const firstDelivery = {
    id: "delivery-1",
    job_id: job.id,
    status: "reconciling",
  };
  const deliveryIds = [firstDelivery.id];
  let sends = 0;

  const nextRun = planReminderJobs([job], [firstDelivery]);
  if (nextRun.length > 0) {
    deliveryIds.push("delivery-2");
    sends += nextRun.length;
  }

  assert.deepEqual(ACTIVE_REMINDER_DELIVERY_STATUSES, [
    "pending",
    "sent",
    "reconciling",
  ]);
  assert.deepEqual(nextRun, []);
  assert.deepEqual(deliveryIds, ["delivery-1"]);
  assert.equal(sends, 0);

  const route = await readFile(
    join(root, "app", "api", "automation", "reminders", "route.ts"),
    "utf8"
  );
  assert.match(route, /reconcileEmailDeliveries\(\)/);
  assert.match(route, /\.in\("status", \[\.\.\.ACTIVE_REMINDER_DELIVERY_STATUSES\]\)/);

  const migration = await readFile(
    join(
      root,
      "supabase",
      "migrations",
      "20260731120000_booking_and_reminder_safety.sql"
    ),
    "utf8"
  );
  assert.match(
    migration,
    /template_id = 'reminder'[\s\S]*status in \('pending', 'sent', 'reconciling'\)/
  );
});
