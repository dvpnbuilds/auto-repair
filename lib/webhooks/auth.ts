import {timingSafeEqual} from "node:crypto";

export const N8N_SECRET_HEADER = "x-autoshop-webhook-secret";

export function hasValidN8nSecret(headers: Headers): boolean {
  const configured = process.env.N8N_WEBHOOK_SECRET;
  const provided = headers.get(N8N_SECRET_HEADER);
  if (!configured || !provided) return false;

  const configuredBuffer = Buffer.from(configured);
  const providedBuffer = Buffer.from(provided);
  return (
    configuredBuffer.length === providedBuffer.length &&
    timingSafeEqual(configuredBuffer, providedBuffer)
  );
}
