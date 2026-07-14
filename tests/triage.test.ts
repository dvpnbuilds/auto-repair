import { test } from "node:test";
import assert from "node:assert/strict";
import { runTriage, type TriageMessage } from "../lib/openrouter/triage";

const sampleComplaints: string[] = [
  "Kumakalampag pag nagbe-brake, parang bakal kagat-kagat.",
  "Mainit hangin sa aircon kahit naka-max na yung blower.",
  "Ayaw na mag-start, mabagal yung crank tapos namamatay dashboard lights.",
  "Regular PM lang, malapit na sa 5000km, need paba oil change?",
  "May tunog na 'tuk tuk' sa harap tuwing may bump, lalo na sa mabilis.",
];

for (const complaint of sampleComplaints) {
  test(`triage gives a grounded estimate for: "${complaint}"`, async () => {
    const messages: TriageMessage[] = [{ role: "user", content: complaint }];
    const result = await runTriage(messages, true);

    assert.equal(result.status, "done");
    if (result.status !== "done") return;

    assert.ok(result.probable_issue.length > 0, "expected a probable_issue");
    assert.ok(["low", "medium", "high"].includes(result.urgency), "expected a valid urgency");
    assert.equal(result.disclaimer, "Initial estimate, subject to inspection.");

    if (result.needs_inspection) {
      assert.equal(result.estimate_min, null);
      assert.equal(result.estimate_max, null);
    } else {
      assert.ok(typeof result.estimate_min === "number");
      assert.ok(typeof result.estimate_max === "number");
      assert.ok(result.estimate_min! <= result.estimate_max!);
    }
  });
}
