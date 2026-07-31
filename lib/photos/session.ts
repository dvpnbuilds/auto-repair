import "server-only";
import {
  isValidIntakePhotoTokenWithSecret,
  isValidPhotoActionTokenWithSecret,
  issueIntakePhotoTokenWithSecret,
  issuePhotoActionTokenWithSecret,
  type PhotoAction,
} from "@/lib/photos/session-core";

function sessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters");
  }
  return secret;
}

export function issueIntakePhotoToken(now = new Date()): string {
  return issueIntakePhotoTokenWithSecret(sessionSecret(), now);
}

export function isValidIntakePhotoToken(
  value: string | null,
  now = new Date()
): value is string {
  return isValidIntakePhotoTokenWithSecret(value, sessionSecret(), now);
}

export function issuePhotoActionToken(
  intakeToken: string,
  photoId: string,
  action: PhotoAction
): string {
  return issuePhotoActionTokenWithSecret(
    intakeToken,
    photoId,
    action,
    sessionSecret()
  );
}

export function isValidPhotoActionToken(
  value: string | null,
  intakeToken: string | null,
  photoId: string,
  action: PhotoAction
): value is string {
  return isValidPhotoActionTokenWithSecret(
    value,
    intakeToken,
    photoId,
    action,
    sessionSecret()
  );
}
