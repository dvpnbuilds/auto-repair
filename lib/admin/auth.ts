import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "autoshop_admin_v2";
const LEGACY_COOKIE_NAME = "autoshop_admin";
const SESSION_VERSION = "v2";

function expectedCookieValue(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters");
  }

  const signature = createHmac("sha256", secret)
    .update(`autoshop-admin-session:${SESSION_VERSION}`)
    .digest("base64url");
  return `${SESSION_VERSION}.${signature}`;
}

export function verifyPasscode(passcode: string): boolean {
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected || !passcode) return false;

  const providedBuffer = Buffer.from(passcode);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function matchesExpectedCookie(value: string | undefined): boolean {
  if (!value) return false;
  const expected = expectedCookieValue();
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

export async function setAdminCookie() {
  const store = await cookies();
  store.delete(LEGACY_COOKIE_NAME);
  store.set(COOKIE_NAME, expectedCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return matchesExpectedCookie(value);
}

export function isAdminAuthedFromHeader(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return false;
  return matchesExpectedCookie(match.slice(COOKIE_NAME.length + 1));
}
