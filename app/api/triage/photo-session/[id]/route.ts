import {NextResponse} from "next/server";
import {checkApiRateLimit} from "@/lib/api/rate-limit";
import {
  isValidIntakePhotoToken,
  issuePhotoActionToken,
} from "@/lib/photos/session";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const rateLimit = await checkApiRateLimit(request, {
      bucket: "photo-upload",
      limit: 24,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {error: "Too many photo requests"},
        {status: 429, headers: {"Retry-After": String(rateLimit.retryAfter)}}
      );
    }
  } catch {
    return NextResponse.json(
      {error: "Photo upload is unavailable"},
      {status: 503}
    );
  }

  const intakeToken = request.headers.get("x-intake-token");
  const {id} = await params;
  if (!UUID_PATTERN.test(id) || !isValidIntakePhotoToken(intakeToken)) {
    return NextResponse.json({error: "Invalid photo request"}, {status: 400});
  }
  return NextResponse.json(
    {uploadToken: issuePhotoActionToken(intakeToken, id, "upload")},
    {headers: {"Cache-Control": "no-store"}}
  );
}
