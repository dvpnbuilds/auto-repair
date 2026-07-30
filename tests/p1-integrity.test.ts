import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

async function source(...segments: string[]) {
  return readFile(join(root, ...segments), "utf8");
}

test("booking is one server-authoritative transaction", async () => {
  const route = await source("app", "api", "book", "route.ts");
  const form = await source(
    "app",
    "[locale]",
    "book",
    "BookingForm.tsx"
  );
  const intake = await source(
    "app",
    "[locale]",
    "intake",
    "IntakeForm.tsx"
  );
  const migration = await source(
    "supabase",
    "migrations",
    "20260730_p1_integrity_hardening.sql"
  );
  const bookingFunction = migration.slice(
    migration.indexOf("create or replace function create_autoshop_booking"),
    migration.indexOf("create or replace function transition_autoshop_job")
  );

  assert.match(route, /\.rpc\("create_autoshop_booking"/);
  assert.doesNotMatch(route, /\.from\("autoshop_jobs"\)|\.insert\(/);
  assert.doesNotMatch(route, /estimate_min|estimate_max|scheduled_at/);
  assert.match(form, /shop_id: shop\.id/);
  assert.match(form, /scheduled_date: date/);
  assert.match(form, /scheduled_time: time/);
  assert.doesNotMatch(form, /estimate_min:|estimate_max:|scheduled_at:/);
  assert.doesNotMatch(
    intake,
    /query:\s*\{[\s\S]*?estimate_min:|query:\s*\{[\s\S]*?estimate_max:/
  );

  assert.match(bookingFunction, /where id = p_shop_id[\s\S]*is_active = true/);
  assert.match(bookingFunction, /and shop_id = selected_shop\.id/);
  assert.match(
    bookingFunction,
    /selected_service\.price_min[\s\S]*selected_service\.price_max/
  );
  assert.match(
    bookingFunction,
    /at time zone selected_shop\.timezone/
  );
  assert.match(
    bookingFunction,
    /insert into autoshop_jobs[\s\S]*insert into autoshop_status_history/
  );
});

test("status transition, history, message, and outbox are atomic and replay-safe", async () => {
  const route = await source(
    "app",
    "api",
    "admin",
    "jobs",
    "[id]",
    "status",
    "route.ts"
  );
  const migration = await source(
    "supabase",
    "migrations",
    "20260730_p1_integrity_hardening.sql"
  );
  const transitionFunction = migration.slice(
    migration.indexOf("create or replace function transition_autoshop_job"),
    migration.indexOf("create or replace function complete_autoshop_email_delivery")
  );

  assert.ok(
    route.indexOf("draftMessage(") <
      route.indexOf('.rpc(\n    "transition_autoshop_job"'),
    "AI drafting must finish before the transactional mutation"
  );
  assert.match(route, /expectedStatus/);
  assert.match(route, /status: 409/);
  assert.match(transitionFunction, /for update/);
  assert.match(transitionFunction, /current_job\.status <> p_expected_status/);
  assert.match(transitionFunction, /action_key_value := format/);
  assert.match(transitionFunction, /'is_replay', true/);
  assert.match(
    transitionFunction,
    /update autoshop_jobs[\s\S]*insert into autoshop_status_history[\s\S]*insert into autoshop_messages[\s\S]*reserve_autoshop_email_delivery/
  );
});

test("ambiguous email outcomes reconcile under the same provider identity", async () => {
  const send = await source("lib", "email", "send.ts");
  const migration = await source(
    "supabase",
    "migrations",
    "20260730_p1_integrity_hardening.sql"
  );
  const workflow = JSON.parse(
    await source(
      "n8n",
      "workflows",
      "auto-repair-email-delivery.json"
    )
  );
  const renderer = workflow.nodes.find(
    (node: {name: string}) => node.name === "Render Email Template"
  );
  const sender = workflow.nodes.find(
    (node: {name: string}) => node.name === "Send with Resend"
  );
  const failureCallback = workflow.nodes.find(
    (node: {name: string}) => node.name === "Callback Failed"
  );

  assert.match(send, /callWithRetry\(\(\) =>[\s\S]*dispatchResendEmail/);
  assert.match(send, /"reconciling"/);
  assert.match(send, /SAFE_RETRY_WINDOW_MS/);
  assert.match(migration, /status in \('pending', 'sent', 'failed', 'capped', 'reconciling'\)/);
  assert.match(migration, /if delivery\.status = 'sent'/);

  assert.equal(sender.type, "n8n-nodes-base.httpRequest");
  assert.equal(sender.parameters.url, "https://api.resend.com/emails");
  assert.match(JSON.stringify(sender.parameters), /Idempotency-Key/);
  assert.match(JSON.stringify(sender.parameters), /idempotency_key/);
  assert.match(renderer.parameters.jsCode, /Delivery idempotency key mismatch/);
  assert.match(failureCallback.parameters.jsonBody, /reconciling/);
});
