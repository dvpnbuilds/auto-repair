import { NextResponse } from "next/server";
import { verifyPasscode, setAdminCookie } from "@/lib/admin/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const passcode = typeof body?.passcode === "string" ? body.passcode : "";

  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 401 });
  }

  await setAdminCookie();
  return NextResponse.json({ ok: true });
}
