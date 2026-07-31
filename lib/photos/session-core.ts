import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const TOKEN_VERSION = "v1";
const TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;
const TOKEN_PATTERN =
  /^v1\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(\d{10})\.([A-Za-z0-9_-]{43})$/i;
const ACTION_TOKEN_PATTERN =
  /^v1\.(upload|delete)\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(\d{10})\.([A-Za-z0-9_-]{43})$/i;

export type PhotoAction = "upload" | "delete";

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`intake-photo:${payload}`)
    .digest("base64url");
}

function intakeClaims(value: string): {sessionId: string; expiresAt: string} {
  const match = TOKEN_PATTERN.exec(value);
  if (!match) throw new Error("Invalid intake photo token");
  return {sessionId: match[1].toLowerCase(), expiresAt: match[2]};
}

export function issueIntakePhotoTokenWithSecret(
  secret: string,
  now = new Date(),
  sessionId = randomUUID()
): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + TOKEN_LIFETIME_SECONDS;
  const payload = `${TOKEN_VERSION}.${sessionId.toLowerCase()}.${expiresAt}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function isValidIntakePhotoTokenWithSecret(
  value: string | null,
  secret: string,
  now = new Date()
): value is string {
  if (!value || value.length > 128) return false;
  const match = TOKEN_PATTERN.exec(value);
  if (!match) return false;

  const expiresAt = Number(match[2]);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < nowSeconds ||
    expiresAt > nowSeconds + TOKEN_LIFETIME_SECONDS + 60
  ) {
    return false;
  }

  const payload = value.slice(0, value.lastIndexOf("."));
  const expected = Buffer.from(signature(payload, secret));
  const supplied = Buffer.from(match[3]);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function issuePhotoActionTokenWithSecret(
  intakeToken: string,
  photoId: string,
  action: PhotoAction,
  secret: string,
  now = new Date()
): string {
  if (!isValidIntakePhotoTokenWithSecret(intakeToken, secret, now)) {
    throw new Error("Invalid intake photo token");
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      photoId
    )
  ) {
    throw new Error("Invalid photo id");
  }
  const {sessionId, expiresAt} = intakeClaims(intakeToken);
  const payload = `${TOKEN_VERSION}.${action}.${sessionId}.${photoId.toLowerCase()}.${expiresAt}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function isValidPhotoActionTokenWithSecret(
  value: string | null,
  intakeToken: string | null,
  photoId: string,
  action: PhotoAction,
  secret: string,
  now = new Date()
): value is string {
  if (
    !value ||
    value.length > 180 ||
    !isValidIntakePhotoTokenWithSecret(intakeToken, secret, now)
  ) {
    return false;
  }
  const match = ACTION_TOKEN_PATTERN.exec(value);
  if (!match || match[1] !== action) return false;
  const claims = intakeClaims(intakeToken);
  if (
    match[2].toLowerCase() !== claims.sessionId ||
    match[3].toLowerCase() !== photoId.toLowerCase() ||
    match[4] !== claims.expiresAt
  ) {
    return false;
  }
  const payload = value.slice(0, value.lastIndexOf("."));
  const expected = Buffer.from(signature(payload, secret));
  const supplied = Buffer.from(match[5]);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
