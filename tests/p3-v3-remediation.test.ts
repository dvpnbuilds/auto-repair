import assert from "node:assert/strict";
import {access} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

test("obsolete phase staging instructions are absent from release source", async () => {
  for (const filename of [
    "CLAUDE-md-updates.md",
    "CLAUDE-md-updates-v3.md",
    "PROGRESS-v2-additions.md",
    "PROGRESS-v3-additions.md",
  ]) {
    await assert.rejects(access(join(root, filename)));
  }
});
