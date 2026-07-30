import {NextResponse} from "next/server";
import {setAdminCookie, verifyPasscode} from "@/lib/admin/auth";
import {checkApiRateLimit} from "@/lib/api/rate-limit";
import {readBoundedJson, RequestBodyError} from "@/lib/api/request";

export async function POST(request: Request) {
  try {
    const rateLimit = await checkApiRateLimit(request, {
      bucket: "admin-login",
      limit: 5,
      windowSeconds: 15 * 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {error: "Too many login attempts"},
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(rateLimit.retryAfter),
          },
        }
      );
    }
  } catch (error) {
    console.error("Admin login rate limit failed:", error);
    return NextResponse.json(
      {error: "Login is unavailable"},
      {status: 503, headers: {"Cache-Control": "no-store"}}
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, 1024);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json(
        {error: error.message},
        {status: error.status, headers: {"Cache-Control": "no-store"}}
      );
    }
    return NextResponse.json(
      {error: "Invalid request body"},
      {status: 400, headers: {"Cache-Control": "no-store"}}
    );
  }

  const passcode =
    body &&
    typeof body === "object" &&
    typeof (body as Record<string, unknown>).passcode === "string"
      ? ((body as Record<string, unknown>).passcode as string)
      : "";

  if (passcode.length > 256 || !verifyPasscode(passcode)) {
    return NextResponse.json(
      {error: "Incorrect passcode"},
      {status: 401, headers: {"Cache-Control": "no-store"}}
    );
  }

  await setAdminCookie();
  return NextResponse.json(
    {ok: true},
    {headers: {"Cache-Control": "no-store"}}
  );
}
