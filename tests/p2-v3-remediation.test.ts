import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {
  readBoundedBytes,
  RequestBodyError,
} from "../lib/api/bounded-bytes-core";

const root = fileURLToPath(new URL("../", import.meta.url));

test("raw uploads enforce the actual streamed byte limit", async () => {
  const request = new Request("https://example.test/upload", {
    method: "POST",
    headers: {"content-length": "1"},
    body: Uint8Array.from([1, 2, 3, 4, 5]),
  });
  await assert.rejects(
    readBoundedBytes(request, 4),
    (error: unknown) =>
      error instanceof RequestBodyError && error.status === 413
  );
});

test("terminal approval reads are redacted and do not block replacement UI", async () => {
  const query = await readFile(
    join(root, "lib", "approvals", "queries.ts"),
    "utf8"
  );
  const page = await readFile(
    join(root, "app", "[locale]", "approve", "[token]", "page.tsx"),
    "utf8"
  );
  const admin = await readFile(
    join(root, "app", "[locale]", "admin", "page.tsx"),
    "utf8"
  );
  const terminalCheck = query.indexOf('approval.status !== "pending"');
  const jobLookup = query.indexOf('from("autoshop_jobs")');

  assert.ok(terminalCheck >= 0 && jobLookup > terminalCheck);
  assert.match(query, /terminal: true/);
  assert.match(page, /if \(approval\.terminal\)/);
  assert.match(admin, /\.eq\("status", "pending"\)/);
  assert.match(admin, /\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/);
});

test("abandoned photo metadata remains available for locked cleanup", async () => {
  const migration = await readFile(
    join(
      root,
      "supabase",
      "migrations",
      "20260731150000_phase12_photo_intake.sql"
    ),
    "utf8"
  );
  const server = await readFile(
    join(root, "lib", "photos", "server.ts"),
    "utf8"
  );

  assert.doesNotMatch(
    migration,
    /delete from autoshop_intake_photos[\s\S]{0,180}status = 'uploading'/
  );
  assert.match(server, /claim_autoshop_intake_photo_deletion/);
  assert.match(server, /finalize_autoshop_intake_photo_deletion/);
});
