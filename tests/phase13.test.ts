import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {createClient} from "@supabase/supabase-js";
import {AUTO_REPAIR_SCHEMA} from "../lib/supabase/schema";

const root = fileURLToPath(new URL("../", import.meta.url));

test("owner dashboard stays admin-gated, localized, and dependency-free", async () => {
  const [page, controls, messages, packageJson] = await Promise.all([
    readFile(
      join(root, "app", "[locale]", "admin", "dashboard", "page.tsx"),
      "utf8"
    ),
    readFile(
      join(
        root,
        "app",
        "[locale]",
        "admin",
        "dashboard",
        "DashboardShopSwitcher.tsx"
      ),
      "utf8"
    ),
    readFile(join(root, "messages", "en.json"), "utf8"),
    readFile(join(root, "package.json"), "utf8"),
  ]);

  assert.match(page, /isAdminAuthed/);
  assert.match(page, /loadDashboardMetrics/);
  assert.match(page, /estimated_booked_value/);
  assert.match(page, /DASHBOARD_RANGES/);
  assert.match(page, /formatCurrency/);
  assert.match(page, /locale=\{shop\.locale\}/);
  assert.match(page, /rate\.toLocaleString\(locale/);
  assert.doesNotMatch(page, /toLocaleString\(undefined/);
  assert.match(controls, /api\/admin\/shop/);
  assert.match(messages, /Estimated booked value/);
  assert.match(messages, /not final invoices/);
  assert.doesNotMatch(packageJson, /recharts|chart\.js|d3/);
});

test("dashboard RPC matches independent database queries", async (t) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    t.skip("Local Supabase service credentials are unavailable");
    return;
  }
  const client = createClient(url, key, {
    db: {schema: AUTO_REPAIR_SCHEMA},
  });
  const {data: shop, error: shopError} = await client
    .from("autoshop_shops")
    .select("id")
    .eq("is_active", true)
    .single();
  assert.ifError(shopError);

  const {data: metrics, error: metricsError} = await client.rpc(
    "get_autoshop_dashboard_metrics",
    {p_shop_id: shop.id, p_days: 30}
  );
  assert.ifError(metricsError);
  assert.ok(metrics);

  const {data: jobs, error: jobsError} = await client
    .from("autoshop_jobs")
    .select("status, estimate_min, estimate_max")
    .eq("shop_id", shop.id)
    .gte("created_at", metrics.period_start);
  assert.ifError(jobsError);
  const rows = jobs ?? [];
  assert.equal(metrics.jobs_total, rows.length);
  for (const status of [
    "booked",
    "in_progress",
    "waiting_parts",
    "ready",
    "done",
  ]) {
    assert.equal(
      metrics.jobs_by_status[status],
      rows.filter((job) => job.status === status).length
    );
  }
  assert.equal(
    metrics.estimated_booked_value.minimum,
    rows.reduce((sum, job) => sum + (job.estimate_min ?? 0), 0)
  );
  assert.equal(
    metrics.estimated_booked_value.maximum,
    rows.reduce((sum, job) => sum + (job.estimate_max ?? 0), 0)
  );
  const average = (field: "estimate_min" | "estimate_max") =>
    rows.length === 0
      ? 0
      : Math.round(
          (rows.reduce((sum, job) => sum + (job[field] ?? 0), 0) /
            rows.length) *
            100
        ) / 100;
  assert.equal(metrics.estimated_average_ticket.minimum, average("estimate_min"));
  assert.equal(metrics.estimated_average_ticket.maximum, average("estimate_max"));

  const {data: sessions, error: sessionsError} = await client
    .from("autoshop_intake_sessions")
    .select("job_id, completed_at")
    .eq("shop_id", shop.id)
    .gte("started_at", metrics.period_start)
    .not("completed_at", "is", null);
  assert.ifError(sessionsError);
  assert.equal(metrics.intake_conversion.completed, sessions?.length ?? 0);
  assert.equal(
    metrics.intake_conversion.booked,
    (sessions ?? []).filter((session) => session.job_id).length
  );
  const expectedConversion =
    (sessions?.length ?? 0) === 0
      ? 0
      : Math.round(
          ((sessions ?? []).filter((session) => session.job_id).length * 1000) /
            (sessions?.length ?? 1)
        ) / 10;
  assert.equal(metrics.intake_conversion.rate, expectedConversion);

  const {data: approvals, error: approvalsError} = await client
    .from("autoshop_approval_requests")
    .select("status")
    .eq("shop_id", shop.id)
    .gte("decided_at", metrics.period_start)
    .in("status", ["approved", "declined"]);
  assert.ifError(approvalsError);
  assert.equal(metrics.approval_acceptance.decided, approvals?.length ?? 0);
  assert.equal(
    metrics.approval_acceptance.approved,
    (approvals ?? []).filter((approval) => approval.status === "approved").length
  );
  const expectedAcceptance =
    (approvals?.length ?? 0) === 0
      ? 0
      : Math.round(
          ((approvals ?? []).filter((approval) => approval.status === "approved")
            .length *
            1000) /
            (approvals?.length ?? 1)
        ) / 10;
  assert.equal(metrics.approval_acceptance.rate, expectedAcceptance);

  const {count: reminders, error: remindersError} = await client
    .from("autoshop_email_deliveries")
    .select("id", {count: "exact", head: true})
    .eq("shop_id", shop.id)
    .eq("template_id", "reminder")
    .eq("status", "sent")
    .gte("sent_at", metrics.period_start);
  assert.ifError(remindersError);
  assert.equal(metrics.reminders_sent, reminders ?? 0);

  const {data: technicians, error: techniciansError} = await client
    .from("autoshop_technicians")
    .select("id, name")
    .eq("shop_id", shop.id)
    .eq("is_active", true);
  assert.ifError(techniciansError);
  const {data: activeJobs, error: activeJobsError} = await client
    .from("autoshop_jobs")
    .select("technician_id")
    .eq("shop_id", shop.id)
    .neq("status", "done");
  assert.ifError(activeJobsError);
  for (const technician of technicians ?? []) {
    assert.equal(
      metrics.technician_workload.find(
        (item: {id: string}) => item.id === technician.id
      )?.active_jobs,
      (activeJobs ?? []).filter(
        (job) => job.technician_id === technician.id
      ).length
    );
  }
  assert.equal(
    metrics.current_unassigned_jobs,
    (activeJobs ?? []).filter((job) => job.technician_id === null).length
  );
});
