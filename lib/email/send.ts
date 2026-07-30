import "server-only";
import {Resend} from "resend";
import {callWithRetry} from "@/lib/callWithRetry";
import {completeEmailDelivery, reserveEmailDelivery} from "@/lib/email/deliveries";
import {dispatchN8nEmail, dispatchResendEmail} from "@/lib/email/transports";
import type {
  EmailDelivery,
  EmailTransport,
  SendEmailInput,
  SendEmailResult,
} from "@/lib/email/types";

const DEFAULT_DEMO_SEND_CAP = 10;
const SAFE_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

class EmailConfigurationError extends Error {}

export type EmailReservationConfig = {
  transport: EmailTransport;
  recipient: string;
  cap: number;
};

function getTransport(): EmailTransport {
  const value = process.env.EMAIL_TRANSPORT ?? "n8n";
  if (value !== "n8n" && value !== "resend") {
    throw new EmailConfigurationError(
      "EMAIL_TRANSPORT must be n8n or resend"
    );
  }
  return value;
}

function getSendCap(): number {
  const parsed = Number(process.env.EMAIL_DEMO_SEND_CAP ?? DEFAULT_DEMO_SEND_CAP);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new EmailConfigurationError(
      "EMAIL_DEMO_SEND_CAP must be a positive integer"
    );
  }
  return parsed;
}

function resolveRecipient(requested: string | null): string {
  const recipient = process.env.EMAIL_DEMO_RECIPIENT?.trim() || requested?.trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new EmailConfigurationError(
      "A valid customer email or EMAIL_DEMO_RECIPIENT is required"
    );
  }
  return recipient;
}

function validateDispatchConfiguration(
  input: SendEmailInput,
  delivery: EmailDelivery
): void {
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.shop.email_sender_address) ||
    /\.example$/i.test(input.shop.email_sender_address)
  ) {
    throw new EmailConfigurationError(
      "The active shop email sender must use a verified delivery domain"
    );
  }
  if (
    !process.env.EMAIL_DEMO_RECIPIENT &&
    /\.example$/i.test(delivery.recipient)
  ) {
    throw new EmailConfigurationError(
      "EMAIL_DEMO_RECIPIENT is required for seeded demo addresses"
    );
  }
}

function getAppBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;
  throw new EmailConfigurationError(
    "APP_BASE_URL is required for the n8n transport"
  );
}

function getN8nConfig() {
  const webhookUrl = process.env.N8N_WEBHOOK_URL?.trim();
  const secret = process.env.N8N_WEBHOOK_SECRET?.trim();
  if (!webhookUrl || !secret) {
    throw new EmailConfigurationError(
      "N8N_WEBHOOK_URL and N8N_WEBHOOK_SECRET are required"
    );
  }

  return {webhookUrl, secret, appBaseUrl: getAppBaseUrl()};
}

export function prepareEmailReservation(
  requestedRecipient: string | null
): EmailReservationConfig {
  return {
    transport: getTransport(),
    recipient: resolveRecipient(requestedRecipient),
    cap: getSendCap(),
  };
}

function isInsideSafeRetryWindow(delivery: EmailDelivery): boolean {
  return Date.now() - new Date(delivery.created_at).getTime() < SAFE_RETRY_WINDOW_MS;
}

export async function sendEmail(
  input: SendEmailInput,
  reservedDelivery?: EmailDelivery
): Promise<SendEmailResult> {
  let delivery = reservedDelivery;
  if (!delivery) {
    const config = prepareEmailReservation(input.to);
    const reservation = await reserveEmailDelivery({
      shopId: input.shop.id,
      jobId: input.jobId,
      messageId: input.messageId,
      templateId: input.templateId,
      transport: config.transport,
      recipient: config.recipient,
      cap: config.cap,
    });
    delivery = reservation.delivery;
    if (!reservation.isNew) {
      if (
        delivery.status !== "pending" &&
        delivery.status !== "reconciling"
      ) {
        return {delivery, dispatched: false};
      }
    }
  }

  if (
    delivery.status === "sent" ||
    delivery.status === "failed" ||
    delivery.status === "capped"
  ) {
    return {delivery, dispatched: false};
  }
  if (
    delivery.status === "reconciling" &&
    !isInsideSafeRetryWindow(delivery)
  ) {
    return {delivery, dispatched: false};
  }

  try {
    validateDispatchConfiguration(input, delivery);

    if (delivery.transport === "n8n") {
      await dispatchN8nEmail(
        input,
        delivery.recipient,
        delivery.id,
        getN8nConfig()
      );
      return {delivery, dispatched: true};
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      throw new EmailConfigurationError("RESEND_API_KEY is required");
    }
    const resend = new Resend(apiKey);
    const providerMessageId = await callWithRetry(() =>
      dispatchResendEmail(
        input,
        delivery.recipient,
        delivery.id,
        resend.emails.send.bind(resend.emails)
      )
    );
    const completed = await completeEmailDelivery(
      delivery.id,
      "sent",
      providerMessageId
    );
    return {delivery: completed, dispatched: true};
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Email delivery failed";
    const status =
      error instanceof EmailConfigurationError ? "failed" : "reconciling";
    const completed = await completeEmailDelivery(
      delivery.id,
      status,
      null,
      message
    );
    throw Object.assign(new Error(message), {delivery: completed});
  }
}
