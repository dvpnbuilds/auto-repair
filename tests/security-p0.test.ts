import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

async function source(...segments: string[]) {
  return readFile(join(root, ...segments), "utf8");
}

test("anonymous customer-data policies are removed and private tables are revoked", async () => {
  const migration = await source(
    "supabase",
    "migrations",
    "20260730120000_p0_security_hardening.sql"
  );
  const schema = await source("supabase", "schema.sql");

  for (const sql of [migration, schema]) {
    assert.match(sql, /drop policy if exists "public read autoshop_jobs"/);
    assert.match(sql, /drop policy if exists "public read autoshop_status_history"/);
    assert.match(sql, /drop policy if exists "public read sent autoshop_messages"/);
    assert.doesNotMatch(
      sql,
      /create policy "public read autoshop_jobs"[\s\S]*?using \(true\)/
    );
    assert.doesNotMatch(
      sql,
      /create policy "public read autoshop_status_history"[\s\S]*?using \(true\)/
    );
  }

  assert.match(migration, /revoke all on autoshop_jobs from anon, authenticated/);
  assert.match(
    migration,
    /revoke all on autoshop_status_history from anon, authenticated/
  );
  assert.match(migration, /revoke all on autoshop_messages from anon, authenticated/);
});

test("tracker is a rate-limited server lookup with a minimized response", async () => {
  const route = await source("app", "api", "track", "route.ts");
  const trackerPage = await source("app", "[locale]", "track", "page.tsx");
  const jobsPage = await source("app", "[locale]", "jobs", "page.tsx");
  const migration = await source(
    "supabase",
    "migrations",
    "20260730120000_p0_security_hardening.sql"
  );
  const lookupFunction = migration.slice(
    migration.indexOf("create or replace function lookup_autoshop_job"),
    migration.indexOf(
      "revoke all on function check_autoshop_tracker_rate_limit"
    )
  );

  assert.match(route, /supabaseService\.rpc\(\s*"check_autoshop_tracker_rate_limit"/);
  assert.match(route, /supabaseService\.rpc\("lookup_autoshop_job"/);
  assert.match(route, /status: 429/);
  assert.match(route, /Cache-Control": "no-store, private"/);
  assert.doesNotMatch(trackerPage, /supabaseAnon|autoshop_jobs|autoshop_messages/);
  assert.match(jobsPage, /redirect\(`\/\$\{locale\}\/track`\)/);

  for (const key of ["vehicle", "plate_number", "status", "scheduled_at"]) {
    assert.match(lookupFunction, new RegExp(`'${key}'`));
  }
  for (const sensitiveKey of [
    "customer_name",
    "customer_email",
    "phone",
    "issue_description",
    "probable_issue",
    "estimate_min",
    "estimate_max",
    "body",
    "note",
  ]) {
    assert.doesNotMatch(
      lookupFunction,
      new RegExp(`jsonb_build_object[\\s\\S]*?'${sensitiveKey}'`)
    );
  }
});

test("admin sessions use a new HMAC-signed cookie and no credential is documented", async () => {
  const auth = await source("lib", "admin", "auth.ts");
  const progress = await source("PROGRESS.md");

  assert.match(auth, /const COOKIE_NAME = "autoshop_admin_v2"/);
  assert.match(auth, /createHmac\("sha256", secret\)/);
  assert.match(auth, /ADMIN_SESSION_SECRET/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /store\.delete\(LEGACY_COOKIE_NAME\)/);
  assert.doesNotMatch(auth, /createHash/);
  assert.doesNotMatch(progress, /ADMIN_PASSCODE set to a demo default \(`/);
});
