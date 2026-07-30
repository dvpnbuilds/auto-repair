import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {
  dispatchN8nEmail,
  dispatchResendEmail,
  N8N_EMAIL_SECRET_HEADER,
} from "../lib/email/transports";
import {renderEmailTemplate} from "../lib/email/templates";
import type {
  EmailTemplateId,
  SendEmailInput,
} from "../lib/email/types";
import {hasValidN8nSecret} from "../lib/webhooks/auth";

const root = fileURLToPath(new URL("../", import.meta.url));
const deliveryId = "00000000-0000-4000-8000-000000000008";
const sampleInput: SendEmailInput = {
  shop: {
    id: "00000000-0000-4000-8000-000000000001",
    shop_key: "test-shop",
    name: "Test Auto Service",
    country: "US",
    locale: "en-US",
    currency: "USD",
    timezone: "America/Chicago",
    language: "en",
    email_sender_name: "Test Auto Service",
    email_sender_address: "service@example.test",
    address: "100 Main Street",
    is_active: true,
  },
  jobId: "00000000-0000-4000-8000-000000000002",
  messageId: "00000000-0000-4000-8000-000000000003",
  templateId: "status_update",
  to: "customer@example.test",
  payload: {
    customerName: "Sam <Customer>",
    shopName: "Test Auto Service",
    shopAddress: "100 Main Street",
    vehicle: "2022 Ford F-150",
    messageBody: "Your vehicle is now being inspected.",
    status: "In progress",
    scheduledAt: "July 31, 2026 at 9:00 AM",
  },
};

test("all four email templates render safe HTML and plain text", () => {
  const templateIds: EmailTemplateId[] = [
    "status_update",
    "completion_report",
    "reminder",
    "review_request",
  ];

  for (const templateId of templateIds) {
    const rendered = renderEmailTemplate(templateId, sampleInput.payload);
    assert.ok(rendered.subject.startsWith("Test Auto Service:"));
    assert.match(rendered.html, /Sam &lt;Customer&gt;/);
    assert.doesNotMatch(rendered.html, /Sam <Customer>/);
    assert.match(rendered.text, /2022 Ford F-150/);
  }
});

test("n8n transport authenticates, preserves idempotency, and sends the template payload", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(null, {status: 202});
  };

  await dispatchN8nEmail(
    sampleInput,
    "customer@example.test",
    deliveryId,
    {
      webhookUrl: "https://n8n.example.test/webhook/auto-repair-email",
      secret: "shared-test-secret",
      appBaseUrl: "https://app.example.test/",
    },
    fetcher
  );

  assert.equal(
    capturedUrl,
    "https://n8n.example.test/webhook/auto-repair-email"
  );
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get(N8N_EMAIL_SECRET_HEADER), "shared-test-secret");
  assert.equal(headers.get("Idempotency-Key"), deliveryId);
  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(body.template_id, "status_update");
  assert.deepEqual(body.payload, sampleInput.payload);
  assert.equal(
    body.callback_url,
    "https://app.example.test/api/webhooks/n8n/email-status"
  );
});

test("n8n retries preserve the exact same provider idempotency identity", async () => {
  const capturedKeys: string[] = [];
  let attempts = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    attempts += 1;
    capturedKeys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
    return new Response(null, {status: attempts === 1 ? 503 : 202});
  };

  await dispatchN8nEmail(
    sampleInput,
    "customer@example.test",
    deliveryId,
    {
      webhookUrl: "https://n8n.example.test/webhook/auto-repair-email",
      secret: "shared-test-secret",
      appBaseUrl: "https://app.example.test",
    },
    fetcher
  );

  assert.equal(attempts, 2);
  assert.deepEqual(capturedKeys, [deliveryId, deliveryId]);
});

test("Resend fallback renders the same template and uses the delivery id as its idempotency key", async () => {
  let capturedMessage: Record<string, unknown> | undefined;
  let capturedOptions: Record<string, unknown> | undefined;

  const providerId = await dispatchResendEmail(
    sampleInput,
    "customer@example.test",
    deliveryId,
    async (message, options) => {
      capturedMessage = message;
      capturedOptions = options;
      return {data: {id: "resend-provider-id"}, error: null};
    }
  );

  assert.equal(providerId, "resend-provider-id");
  assert.equal(capturedMessage?.to, "customer@example.test");
  assert.match(String(capturedMessage?.subject), /repair status update/);
  assert.equal(capturedOptions?.idempotencyKey, deliveryId);
});

test("webhook shared-secret verification rejects missing and incorrect credentials", async () => {
  const previous = process.env.N8N_WEBHOOK_SECRET;
  process.env.N8N_WEBHOOK_SECRET = "expected-secret";

  try {
    assert.equal(hasValidN8nSecret(new Headers()), false);
    assert.equal(
      hasValidN8nSecret(
        new Headers({[N8N_EMAIL_SECRET_HEADER]: "incorrect-secret"})
      ),
      false
    );
    assert.equal(
      hasValidN8nSecret(
        new Headers({[N8N_EMAIL_SECRET_HEADER]: "expected-secret"})
      ),
      true
    );

    const callbackRoute = await readFile(
      join(root, "app", "api", "webhooks", "n8n", "email-status", "route.ts"),
      "utf8"
    );
    const reminderRoute = await readFile(
      join(root, "app", "api", "automation", "reminders", "route.ts"),
      "utf8"
    );
    assert.match(callbackRoute, /hasValidN8nSecret\(request\.headers\)/);
    assert.match(reminderRoute, /hasValidN8nSecret\(request\.headers\)/);
  } finally {
    if (previous === undefined) {
      delete process.env.N8N_WEBHOOK_SECRET;
    } else {
      process.env.N8N_WEBHOOK_SECRET = previous;
    }
  }
});

test("exported n8n workflows are importable and include delivery plus on-demand reminder paths", async () => {
  const deliveryWorkflow = JSON.parse(
    await readFile(
      join(root, "n8n", "workflows", "auto-repair-email-delivery.json"),
      "utf8"
    )
  );
  const reminderWorkflow = JSON.parse(
    await readFile(
      join(root, "n8n", "workflows", "auto-repair-maintenance-reminders.json"),
      "utf8"
    )
  );

  assert.equal(deliveryWorkflow.active, false);
  assert.ok(
    deliveryWorkflow.nodes.some(
      (node: {type: string}) => node.type === "n8n-nodes-base.webhook"
    )
  );
  const sender = deliveryWorkflow.nodes.find(
    (node: {name: string}) => node.name === "Send with Resend"
  );
  assert.equal(sender.type, "n8n-nodes-base.httpRequest");
  assert.equal(sender.parameters.url, "https://api.resend.com/emails");
  assert.match(JSON.stringify(sender.parameters), /Idempotency-Key/);
  const renderer = deliveryWorkflow.nodes.find(
    (node: {name: string}) => node.name === "Render Email Template"
  );
  for (const templateId of [
    "status_update",
    "completion_report",
    "reminder",
    "review_request",
  ]) {
    assert.match(renderer.parameters.jsCode, new RegExp(templateId));
  }

  assert.ok(
    reminderWorkflow.nodes.some(
      (node: {type: string}) => node.type === "n8n-nodes-base.scheduleTrigger"
    )
  );
  assert.ok(
    reminderWorkflow.nodes.some(
      (node: {type: string}) => node.type === "n8n-nodes-base.manualTrigger"
    )
  );
  assert.doesNotMatch(JSON.stringify(reminderWorkflow.settings), /timezone/i);
});
