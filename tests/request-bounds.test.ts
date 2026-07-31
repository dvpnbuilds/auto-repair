import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const ROUTES = [
  "app/api/track/route.ts",
  "app/api/webhooks/n8n/email-status/route.ts",
  "app/api/admin/shop/route.ts",
  "app/api/admin/jobs/[id]/status/route.ts",
  "app/api/admin/messages/[id]/send/route.ts",
  "app/api/admin/jobs/[id]/draft/route.ts",
];

async function listRouteFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return listRouteFiles(target);
      return entry.isFile() && entry.name === "route.ts" ? [target] : [];
    })
  );
  return nested.flat();
}

test("all JSON API routes use the bounded request parser", async () => {
  const apiRoot = path.join(ROOT, "app", "api");
  const routeFiles = await listRouteFiles(apiRoot);

  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile, "utf8");
    assert.doesNotMatch(
      source,
      /\brequest\.json\s*\(/,
      `${path.relative(apiRoot, routeFile)} must not parse an unbounded request body`
    );
  }
});

test("previously unbounded routes declare body caps and bounded parsing", async () => {
  for (const routeFile of ROUTES) {
    const source = await readFile(path.join(ROOT, routeFile), "utf8");
    assert.match(source, /MAX_[A-Z_]+_BODY_BYTES\s*=/);
    assert.match(source, /readBoundedJson\(request,\s*MAX_[A-Z_]+_BODY_BYTES\)/);
    assert.match(source, /error instanceof RequestBodyError/);
  }
});

test("free-form callback and message fields have explicit length caps", async () => {
  const webhook = await readFile(
    path.join(ROOT, "app/api/webhooks/n8n/email-status/route.ts"),
    "utf8"
  );
  const send = await readFile(
    path.join(ROOT, "app/api/admin/messages/[id]/send/route.ts"),
    "utf8"
  );

  assert.match(webhook, /MAX_PROVIDER_MESSAGE_ID_LENGTH/);
  assert.match(webhook, /MAX_PROVIDER_ERROR_LENGTH/);
  assert.match(send, /MAX_MESSAGE_BODY_LENGTH/);
});
