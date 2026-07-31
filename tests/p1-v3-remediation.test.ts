import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {
  ADMIN_SESSION_LIFETIME_SECONDS,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "../lib/admin/session-token";

const root = fileURLToPath(new URL("../", import.meta.url));
const sessionSecret = "p1-session-test-secret-with-at-least-32-characters";

test("admin session tokens expire server-side and reject tampering", () => {
  const issuedAt = Date.parse("2026-07-31T00:00:00.000Z");
  const token = createAdminSessionToken(sessionSecret, issuedAt);

  assert.equal(
    verifyAdminSessionToken(
      token,
      sessionSecret,
      issuedAt + (ADMIN_SESSION_LIFETIME_SECONDS - 1) * 1000
    ),
    true
  );
  assert.equal(
    verifyAdminSessionToken(
      token,
      sessionSecret,
      issuedAt + ADMIN_SESSION_LIFETIME_SECONDS * 1000
    ),
    false
  );
  assert.equal(
    verifyAdminSessionToken(`${token.slice(0, -1)}x`, sessionSecret, issuedAt),
    false
  );
});

test("approval and photo routes use the database P1 safety protocols", async () => {
  const approvalMigration = await readFile(
    join(
      root,
      "supabase",
      "migrations",
      "20260731140000_phase11_extra_work_approvals.sql"
    ),
    "utf8"
  );
  const photoMigration = await readFile(
    join(
      root,
      "supabase",
      "migrations",
      "20260731150000_phase12_photo_intake.sql"
    ),
    "utf8"
  );
  const deleteRoute = await readFile(
    join(root, "app", "api", "triage", "photos", "[id]", "route.ts"),
    "utf8"
  );
  const uploadRoute = await readFile(
    join(root, "app", "api", "triage", "photos", "route.ts"),
    "utf8"
  );

  assert.match(approvalMigration, /APPROVAL_DELIVERY_CAPPED/);
  assert.match(
    approvalMigration,
    /target_job\.status not in \('in_progress', 'waiting_parts'\)/
  );
  assert.match(photoMigration, /claim_autoshop_intake_photo_deletion/);
  assert.match(photoMigration, /finalize_autoshop_intake_photo_deletion/);
  assert.match(deleteRoute, /claim_autoshop_intake_photo_deletion/);
  assert.match(deleteRoute, /finalize_autoshop_intake_photo_deletion/);
  assert.doesNotMatch(
    uploadRoute,
    /uploadError[\s\S]{0,300}\.remove\(\[storagePath\]\)/
  );
});
