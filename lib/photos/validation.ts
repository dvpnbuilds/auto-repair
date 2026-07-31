export const MAX_INTAKE_PHOTOS = 3;
export const MAX_INTAKE_PHOTO_BYTES = 4 * 1024 * 1024;
export const INTAKE_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type IntakePhotoMimeType =
  (typeof INTAKE_PHOTO_MIME_TYPES)[number];

export function isIntakePhotoMimeType(
  value: string
): value is IntakePhotoMimeType {
  return (INTAKE_PHOTO_MIME_TYPES as readonly string[]).includes(value);
}

export function detectImageMimeType(
  bytes: Uint8Array
): IntakePhotoMimeType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function extensionForMimeType(
  mimeType: IntakePhotoMimeType
): "jpg" | "png" | "webp" {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}
