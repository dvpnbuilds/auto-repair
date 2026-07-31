import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {
  createApprovalTokenWithSecret,
  hashApprovalToken,
  parseApprovalTokenWithSecret,
} from "../lib/approvals/token-core";
import {renderEmailTemplate} from "../lib/email/templates";
import {
  buildApprovalPrompt,
  parseApprovalDraft,
} from "../lib/openrouter/approvals";

const root = fileURLToPath(new URL("../", import.meta.url));
const secret = "phase-11-test-secret-with-at-least-32-characters";
const requestId = "10000000-0000-4000-8000-000000000011";

test("approval tokens are signed, deterministic, hashed, and tamper resistant", () => {
  const token = createApprovalTokenWithSecret(requestId, secret);
  assert.equal(token, createApprovalTokenWithSecret(requestId, secret));
  assert.equal(parseApprovalTokenWithSecret(token, secret)?.requestId, requestId);
  assert.equal(hashApprovalToken(token).length, 64);
  assert.equal(
    parseApprovalTokenWithSecret(`${token.slice(0, -1)}x`, secret),
    null
  );
  assert.equal(
    parseApprovalTokenWithSecret(token, `${secret}-different`),
    null
  );
});

test("approval explanation prompt is grounded in the selected service and exact price", () => {
  const prompt = buildApprovalPrompt({
    customerName: "Sam",
    vehicle: "2022 Ford F-150",
    probableIssue: "Brake wear",
    serviceName: "Brake Pad Replacement",
    technicianDescription: "Rear pads are below the safe wear limit.",
    formattedAmount: "$275",
    shop: {
      id: requestId,
      shop_key: "test",
      name: "Test Auto",
      country: "US",
      locale: "en-US",
      currency: "USD",
      timezone: "America/Chicago",
      language: "en",
      email_sender_name: "Test Auto",
      email_sender_address: "service@test.invalid",
      address: "100 Main Street",
      tagline: "Straight answers for the road ahead.",
      phone: "(512) 555-0108",
      hours: "Mon–Fri, 7:30 AM–6:00 PM",
      is_active: true,
    },
  });
  assert.match(prompt, /Brake Pad Replacement/);
  assert.match(prompt, /\$275/);
  assert.match(prompt, /Rear pads are below the safe wear limit/);
  assert.match(prompt, /Do not diagnose anything new, change the price/);
});

test("approval model output must preserve the selected service and exact price", () => {
  const grounded = parseApprovalDraft(
    JSON.stringify({
      explanation: "Brake Pad Replacement is recommended for exactly $275.",
      consequence_of_declining: "Delaying may increase brake wear.",
    }),
    {serviceName: "Brake Pad Replacement", formattedAmount: "$275"}
  );
  assert.match(grounded.explanation, /\$275/);
  assert.throws(
    () =>
      parseApprovalDraft(
        JSON.stringify({
          explanation: "The additional work is recommended.",
          consequence_of_declining: "Delaying may increase wear.",
        }),
        {serviceName: "Brake Pad Replacement", formattedAmount: "$275"}
      ),
    /grounded approval facts/
  );
});

test("approval email carries the exact amount and one decision-page link", () => {
  const rendered = renderEmailTemplate("extra_work_approval", {
    customerName: "Sam <Customer>",
    shopName: "Test Auto",
    shopAddress: "100 Main Street",
    vehicle: "2022 Ford F-150",
    messageBody: "The rear pads need attention.",
    approvalUrl: "https://app.example.test/en/approve/private-token",
    approvalAmount: "$275",
    approvalDescription: "Brake Pad Replacement",
    approvalExpiresAt: "August 3, 2026 at 9:00 AM",
  });
  assert.match(rendered.html, /\$275/);
  assert.match(rendered.html, /Review and decide/);
  assert.equal(
    rendered.html.match(/https:\/\/app\.example\.test\/en\/approve\/private-token/g)
      ?.length,
    1
  );
  assert.doesNotMatch(rendered.html, /Sam <Customer>/);
});

test("public approval mutation is bounded, rate limited, and database mediated", async () => {
  const route = await readFile(
    join(root, "app", "api", "approvals", "[token]", "route.ts"),
    "utf8"
  );
  const adminRoute = await readFile(
    join(
      root,
      "app",
      "api",
      "admin",
      "jobs",
      "[id]",
      "approvals",
      "route.ts"
    ),
    "utf8"
  );
  assert.match(route, /readBoundedJson/);
  assert.match(route, /approval-decision/);
  assert.match(route, /decide_autoshop_approval/);
  assert.doesNotMatch(route, /request\.json\(/);
  assert.match(adminRoute, /prepareEmailDispatch/);
  assert.match(adminRoute, /create_autoshop_approval_request/);
  assert.match(adminRoute, /AMOUNT|price_min/);
});
