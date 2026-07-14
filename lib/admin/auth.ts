import "server-only";
import { createHash } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "autoshop_admin";

function expectedCookieValue(): string {
  const passcode = process.env.ADMIN_PASSCODE;
  if (!passcode) throw new Error("Missing ADMIN_PASSCODE");
  return createHash("sha256").update(passcode).digest("hex");
}

export function verifyPasscode(passcode: string): boolean {
  return passcode === process.env.ADMIN_PASSCODE;
}

export async function setAdminCookie() {
  const store = await cookies();
  store.set(COOKIE_NAME, expectedCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return value === expectedCookieValue();
}

export function isAdminAuthedFromHeader(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return false;
  return match.slice(COOKIE_NAME.length + 1) === expectedCookieValue();
}
