import {NextResponse} from "next/server";
import {
  hashIntakeKey,
  intakePhotoBucket,
} from "@/lib/photos/server";
import {checkApiRateLimit} from "@/lib/api/rate-limit";
import {isValidPhotoActionToken} from "@/lib/photos/session";
import {supabaseService} from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
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
      {error: "Photo removal is unavailable"},
      {status: 503}
    );
  }

  const intakeToken = request.headers.get("x-intake-token");
  const deleteToken = request.headers.get("x-photo-action-token");
  const {id} = await params;
  if (
    !intakeToken ||
    !UUID_PATTERN.test(id) ||
    !isValidPhotoActionToken(deleteToken, intakeToken, id, "delete")
  ) {
    return NextResponse.json({error: "Photo not found"}, {status: 404});
  }
  const intakeKeyHash = hashIntakeKey(intakeToken);
  const {data: photo, error: claimError} = await supabaseService.rpc(
    "claim_autoshop_intake_photo_deletion",
    {
      p_photo_id: id,
      p_intake_key_hash: intakeKeyHash,
    }
  );
  if (claimError || !photo) {
    return NextResponse.json({error: "Photo not found"}, {status: 404});
  }
  const {error: storageError} = await supabaseService.storage
    .from(intakePhotoBucket())
    .remove([photo.storage_path]);
  if (storageError) {
    return NextResponse.json({error: "Photo could not be removed"}, {status: 502});
  }
  const {data: finalized, error: deleteError} = await supabaseService.rpc(
    "finalize_autoshop_intake_photo_deletion",
    {
      p_photo_id: photo.id,
      p_intake_key_hash: intakeKeyHash,
    }
  );
  if (deleteError || finalized !== true) {
    return NextResponse.json({error: "Photo could not be removed"}, {status: 500});
  }
  return NextResponse.json({ok: true});
}
