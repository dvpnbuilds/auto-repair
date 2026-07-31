import "server-only";
import {timingSafeEqual} from "crypto";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_LIFETIME_SECONDS,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "@/lib/admin/session-token";

const COOKIE_NAME = "autoshop_admin_v2";
const LEGACY_COOKIE_NAME = "autoshop_admin";

function sessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters");
  }
  return secret;
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
  return verifyAdminSessionToken(value, sessionSecret());
}

export async function setAdminCookie() {
  const store = await cookies();
  store.delete(LEGACY_COOKIE_NAME);
  store.set(COOKIE_NAME, createAdminSessionToken(sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_LIFETIME_SECONDS,
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
