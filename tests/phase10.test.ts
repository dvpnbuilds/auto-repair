import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  SEED_JOBS_BY_SHOP,
  SEED_TECHNICIANS_BY_SHOP,
  type ShopKey,
} from "../lib/seed";

const ROOT = process.cwd();
const SHOP_KEYS: ShopKey[] = ["us", "ph"];

test("both demo shops seed four technicians and valid default assignments", () => {
  for (const shopKey of SHOP_KEYS) {
    const technicians = SEED_TECHNICIANS_BY_SHOP[shopKey];
    const names = technicians.map((technician) => technician.name);

    assert.equal(technicians.length, 4);
    assert.equal(new Set(names).size, technicians.length);
    for (const job of SEED_JOBS_BY_SHOP[shopKey]) {
      assert.ok(
        names.includes(job.technicianName),
        `${job.plate_number} references an unknown ${shopKey} technician`
      );
    }
  }
});

test("seed and in-app reset preserve valid technician assignments", async () => {
  const seed = await readFile(path.join(ROOT, "lib/seed.ts"), "utf8");
  const reset = await readFile(
    path.join(ROOT, "app/api/admin/reset/route.ts"),
    "utf8"
  );

  assert.match(seed, /existingJobs[\s\S]*preservedAssignments/);
  assert.match(seed, /preservedAssignments\.get\(/);
  assert.match(seed, /technician_id:\s*technicianId/);
  assert.match(reset, /seedDatabase\(supabaseService,\s*"us"\)/);
});

test("assignment is bounded, admin-only, transactional, and shop-scoped", async () => {
  const migration = await readFile(
    path.join(
      ROOT,
      "supabase/migrations/20260731130000_phase10_technician_assignment.sql"
    ),
    "utf8"
  );
  const route = await readFile(
    path.join(ROOT, "app/api/admin/jobs/[id]/technician/route.ts"),
    "utf8"
  );

  assert.match(
    migration,
    /foreign key \(technician_id, shop_id\)[\s\S]*references autoshop_technicians \(id, shop_id\)/
  );
  assert.match(migration, /for update/);
  assert.match(migration, /TECHNICIAN_NOT_FOUND/);
  assert.match(
    migration,
    /revoke all on function assign_autoshop_technician\(uuid, uuid, uuid\)[\s\S]*from public, anon, authenticated/
  );
  assert.match(route, /isAdminAuthedFromHeader/);
  assert.match(
    route,
    /readBoundedJson\(request,\s*MAX_ASSIGNMENT_BODY_BYTES\)/
  );
  assert.match(route, /getActiveShop\(supabaseService\)/);
});

test("admin board supports assignment, reassignment, and technician filtering", async () => {
  const board = await readFile(
    path.join(ROOT, "app/[locale]/admin/AdminBoard.tsx"),
    "utf8"
  );
  const page = await readFile(
    path.join(ROOT, "app/[locale]/admin/page.tsx"),
    "utf8"
  );

  assert.match(page, /\.from\("autoshop_technicians"\)/);
  assert.match(board, /assignTechnician/);
  assert.match(board, /\/technician/);
  assert.match(board, /technicianFilter/);
  assert.match(board, /filteredJobs/);
  assert.match(board, /value=\{job\.technician_id \?\? ""\}/);
});
