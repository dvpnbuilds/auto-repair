import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));

async function collectTsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectTsxFiles(path);
      return entry.name.endsWith(".tsx") ? [path] : [];
    })
  );
  return nested.flat();
}

test("English message catalog contains every application namespace", async () => {
  const messages = JSON.parse(
    await readFile(join(root, "messages", "en.json"), "utf8")
  ) as Record<string, unknown>;

  assert.deepEqual(Object.keys(messages).sort(), [
    "Admin",
    "Approval",
    "Booking",
    "Common",
    "Dashboard",
    "Home",
    "Intake",
    "Jobs",
    "Metadata",
    "Navigation",
    "Services",
    "Tracking",
  ]);
});

test("localized components contain no embedded user-facing text nodes", async () => {
  const files = await collectTsxFiles(join(root, "app", "[locale]"));

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const textNodes: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node) && node.text.trim()) {
        textNodes.push(node.text.trim());
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    assert.equal(
      textNodes.some((text) => /[A-Za-z]/.test(text)),
      false,
      `${file}: ${textNodes.join(", ")}`
    );
  }
});

test("AI prompts use shop language and contain no Taglish-specific instruction", async () => {
  for (const file of ["lib/openrouter/triage.ts", "lib/openrouter/messages.ts"]) {
    const source = await readFile(join(root, file), "utf8");
    assert.match(source, /shop\.language/);
    assert.doesNotMatch(source, /Taglish/i);
  }
});
