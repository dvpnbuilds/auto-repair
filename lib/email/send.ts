import "server-only";
import {Resend} from "resend";
import {completeEmailDelivery, reserveEmailDelivery} from "@/lib/email/deliveries";
import {
  dispatchN8nEmail,
  dispatchResendEmail,
} from "@/lib/email/transports";
import type {
  EmailTransport,
  SendEmailInput,
  SendEmailResult,
} from "@/lib/email/types";

const DEFAULT_DEMO_SEND_CAP = 10;

function getTransport(): EmailTransport {
  const value = process.env.EMAIL_TRANSPORT ?? "n8n";
  if (value !== "n8n" && value !== "resend") {
    throw new Error("EMAIL_TRANSPORT must be n8n or resend");
  }
  return value;
}

function getSendCap(): number {
  const parsed = Number(process.env.EMAIL_DEMO_SEND_CAP ?? DEFAULT_DEMO_SEND_CAP);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("EMAIL_DEMO_SEND_CAP must be a positive integer");
  }
  return parsed;
}

function resolveRecipient(requested: string | null): string {
  const recipient = process.env.EMAIL_DEMO_RECIPIENT?.trim() || requested?.trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error("A valid customer email or EMAIL_DEMO_RECIPIENT is required");
  }
  if (!process.env.EMAIL_DEMO_RECIPIENT && /\.example$/i.test(recipient)) {
    throw new Error("EMAIL_DEMO_RECIPIENT is required for seeded demo addresses");
  }
  return recipient;
}

function validateSender(address: string): void {
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ||
    /\.example$/i.test(address)
  ) {
    throw new Error(
      "The active shop email sender must use a verified delivery domain"
    );
  }
}

function getAppBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;
  throw new Error("APP_BASE_URL is required for the n8n transport");
}

function getN8nConfig() {
  const webhookUrl = process.env.N8N_WEBHOOK_URL?.trim();
  const secret = process.env.N8N_WEBHOOK_SECRET?.trim();
  if (!webhookUrl || !secret) {
    throw new Error("N8N_WEBHOOK_URL and N8N_WEBHOOK_SECRET are required");
  }

  return {webhookUrl, secret, appBaseUrl: getAppBaseUrl()};
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const transport = getTransport();
  validateSender(input.shop.email_sender_address);
  const recipient = resolveRecipient(input.to);
  const {delivery, isNew} = await reserveEmailDelivery({
    shopId: input.shop.id,
    jobId: input.jobId,
    messageId: input.messageId,
    templateId: input.templateId,
    transport,
    recipient,
    cap: getSendCap(),
  });

  if (!isNew || delivery.status === "capped") {
    return {delivery, dispatched: false};
  }

  try {
    if (transport === "n8n") {
      await dispatchN8nEmail(input, recipient, delivery.id, getN8nConfig());
      return {delivery, dispatched: true};
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error("RESEND_API_KEY is required");
    const resend = new Resend(apiKey);
    const providerMessageId = await dispatchResendEmail(
      input,
      recipient,
      delivery.id,
      resend.emails.send.bind(resend.emails)
    );
    const completed = await completeEmailDelivery(
      delivery.id,
      "sent",
      providerMessageId
    );
    return {delivery: completed, dispatched: true};
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    const failed = await completeEmailDelivery(delivery.id, "failed", null, message);
    throw Object.assign(new Error(message), {delivery: failed});
  }
}
