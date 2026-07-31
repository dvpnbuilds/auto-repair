import {createHmac, timingSafeEqual} from "crypto";

const SESSION_VERSION = "v3";
export const ADMIN_SESSION_LIFETIME_SECONDS = 8 * 60 * 60;
const CLOCK_SKEW_SECONDS = 60;

function signatureFor(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`autoshop-admin-session:${payload}`)
    .digest("base64url");
}

export function createAdminSessionToken(
  secret: string,
  nowMs = Date.now()
): string {
  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = issuedAt + ADMIN_SESSION_LIFETIME_SECONDS;
  const payload = `${SESSION_VERSION}.${issuedAt}.${expiresAt}`;
  return `${payload}.${signatureFor(payload, secret)}`;
}

export function verifyAdminSessionToken(
  token: string | undefined,
  secret: string,
  nowMs = Date.now()
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== SESSION_VERSION) return false;

  const issuedAt = Number(parts[1]);
  const expiresAt = Number(parts[2]);
  const now = Math.floor(nowMs / 1000);
  if (
    !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt - issuedAt !== ADMIN_SESSION_LIFETIME_SECONDS ||
    issuedAt > now + CLOCK_SKEW_SECONDS ||
    expiresAt <= now
  ) {
    return false;
  }

  const payload = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const expected = Buffer.from(signatureFor(payload, secret));
  const provided = Buffer.from(parts[3]);
  return (
    expected.length === provided.length &&
    timingSafeEqual(expected, provided)
  );
}
