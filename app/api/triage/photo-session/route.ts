import {NextResponse} from "next/server";
import {checkApiRateLimit} from "@/lib/api/rate-limit";
import {issueIntakePhotoToken} from "@/lib/photos/session";
import {purgeExpiredUnattachedIntakePhotos} from "@/lib/photos/server";

export async function POST(request: Request) {
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
    await purgeExpiredUnattachedIntakePhotos();
    return NextResponse.json(
      {token: issueIntakePhotoToken()},
      {headers: {"Cache-Control": "no-store"}}
    );
  } catch {
    return NextResponse.json(
      {error: "Photo upload is unavailable"},
      {status: 503}
    );
  }
}
