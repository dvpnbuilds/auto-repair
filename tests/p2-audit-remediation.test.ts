import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = promisify(execFile);

async function source(...segments: string[]) {
  return readFile(join(root, ...segments), "utf8");
}

test("Phase 6 upgrade and P2 forward migration backfill shop ownership", async () => {
  const phase6 = await source(
    "supabase",
    "migrations",
    "20260730090000_phase6_shop_config.sql"
  );
  const p2 = await source(
    "supabase",
    "migrations",
    "20260730140000_p2_audit_hardening.sql"
  );

  for (const migration of [phase6, p2]) {
    assert.match(
      migration,
      /update autoshop_services[\s\S]*where shop_id is null/
    );
    assert.match(
      migration,
      /update autoshop_jobs[\s\S]*where shop_id is null/
    );
    assert.match(
      migration,
      /alter table autoshop_services[\s\S]*shop_id set not null/
    );
    assert.match(
      migration,
      /alter table autoshop_jobs[\s\S]*shop_id set not null/
    );
  }
});

test("public mutation endpoints enforce bounded bodies and database quotas", async () => {
  for (const path of [
    ["app", "api", "book", "route.ts"],
    ["app", "api", "triage", "route.ts"],
    ["app", "api", "admin", "login", "route.ts"],
  ]) {
    const route = await source(...path);
    assert.match(route, /checkApiRateLimit\(/);
    assert.match(route, /readBoundedJson\(/);
    assert.match(route, /status: 429/);
    assert.match(route, /Retry-After/);
  }

  const migration = await source(
    "supabase",
    "migrations",
    "20260730140000_p2_audit_hardening.sql"
  );
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /autoshop_api_attempts/);
  assert.match(
    migration,
    /revoke all on function check_autoshop_api_rate_limit[\s\S]*anon/
  );
});

test("adding a message bundle regenerates locale routing without code edits", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "auto-repair-locales-"));
  try {
    const messages = join(temporary, "messages");
    const output = join(temporary, "locales.generated.ts");
    await import("node:fs/promises").then(({mkdir}) =>
      mkdir(messages, {recursive: true})
    );
    await writeFile(
      join(messages, "en.json"),
      '{"Common":{"continue":"Continue"}}',
      "utf8"
    );
    await writeFile(
      join(messages, "es.json"),
      '{"Common":{"continue":"Continuar"}}',
      "utf8"
    );

    await run(
      process.execPath,
      [
        join(root, "scripts", "generate-locales.mjs"),
        messages,
        output,
      ],
      {cwd: root}
    );

    const generated = await readFile(output, "utf8");
    assert.match(generated, /locales = \["en","es"\]/);
    const routing = await source("i18n", "routing.ts");
    assert.match(routing, /import \{locales\} from "\.\/locales\.generated"/);
    assert.match(routing, /locales,/);
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
});

test("runtime dependency pins and release lineage close audit hygiene findings", async () => {
  const pkg = JSON.parse(await source("package.json"));
  assert.equal(pkg.dependencies.next, "16.2.12");
  assert.equal(pkg.devDependencies["eslint-config-next"], "16.2.12");
  assert.equal(pkg.overrides.next.postcss, "8.5.18");
  assert.equal(pkg.overrides.next.sharp, "0.35.0");

  const release = await source("RELEASE-v2.md");
  for (const revision of [
    "8feff2c",
    "9ef4c57",
    "f56c4ce",
    "0537202",
    "v2-audit-remediated",
  ]) {
    assert.match(release, new RegExp(revision));
  }
});
