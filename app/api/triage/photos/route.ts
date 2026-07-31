import {NextResponse} from "next/server";
import {
  readBoundedBytes,
  RequestBodyError,
} from "@/lib/api/request";
import {checkApiRateLimit} from "@/lib/api/rate-limit";
import {
  detectImageMimeType,
  extensionForMimeType,
  isIntakePhotoMimeType,
  MAX_INTAKE_PHOTO_BYTES,
} from "@/lib/photos/validation";
import {
  hashIntakeKey,
  hashPhotoContent,
  intakePhotoBucket,
} from "@/lib/photos/server";
import {
  isValidIntakePhotoToken,
  isValidPhotoActionToken,
  issuePhotoActionToken,
} from "@/lib/photos/session";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseService} from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const rateLimit = await checkApiRateLimit(request, {
      bucket: "photo-upload",
      limit: 12,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {error: "Too many photo uploads"},
        {status: 429, headers: {"Retry-After": String(rateLimit.retryAfter)}}
      );
    }
  } catch {
    return NextResponse.json({error: "Photo upload is unavailable"}, {status: 503});
  }

  const intakeToken = request.headers.get("x-intake-token");
  const uploadToken = request.headers.get("x-photo-action-token");
  const photoId = request.headers.get("x-photo-id");
  const mimeType = request.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (
    !isValidIntakePhotoToken(intakeToken) ||
    !photoId ||
    !UUID_PATTERN.test(photoId) ||
    !isValidPhotoActionToken(uploadToken, intakeToken, photoId, "upload") ||
    !isIntakePhotoMimeType(mimeType)
  ) {
    return NextResponse.json({error: "Invalid photo upload"}, {status: 400});
  }

  let bytes: Uint8Array;
  let declaredBytes: number | null;
  try {
    ({bytes, declaredBytes} = await readBoundedBytes(
      request,
      MAX_INTAKE_PHOTO_BYTES
    ));
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    return NextResponse.json({error: "Invalid photo upload"}, {status: 400});
  }
  if (
    bytes.length < 1 ||
    (declaredBytes !== null && bytes.length !== declaredBytes) ||
    detectImageMimeType(bytes) !== mimeType
  ) {
    return NextResponse.json(
      {error: "The file content does not match an allowed image type"},
      {status: 415}
    );
  }

  const shop = await getActiveShop(supabaseService);
  const intakeKeyHash = hashIntakeKey(intakeToken);
  const contentHash = hashPhotoContent(bytes);
  const extension = extensionForMimeType(mimeType);
  const storagePath = `${shop.id}/${intakeKeyHash}/${photoId.toLowerCase()}.${extension}`;
  const {data: reserved, error: reserveError} = await supabaseService.rpc(
    "reserve_autoshop_intake_photo",
    {
      p_photo_id: photoId.toLowerCase(),
      p_shop_id: shop.id,
      p_intake_key_hash: intakeKeyHash,
      p_content_hash: contentHash,
      p_storage_path: storagePath,
      p_mime_type: mimeType,
      p_size_bytes: bytes.length,
    }
  );
  if (reserveError) {
    const limited = reserveError.message.includes("PHOTO_LIMIT_REACHED");
    return NextResponse.json(
      {error: limited ? "You can upload up to three photos" : "Photo upload failed"},
      {status: limited ? 409 : 400}
    );
  }
  if (reserved?.status === "ready") {
    return NextResponse.json({
      photo: {
        id: reserved.id,
        deleteToken: issuePhotoActionToken(intakeToken, reserved.id, "delete"),
      },
    });
  }
  if (reserved?.status === "deleting") {
    return NextResponse.json(
      {error: "This photo is being removed"},
      {status: 409}
    );
  }

  const {error: uploadError} = await supabaseService.storage
    .from(intakePhotoBucket())
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadError) {
    return NextResponse.json({error: "Photo upload failed"}, {status: 502});
  }

  const {data: completed, error: completionError} = await supabaseService.rpc(
    "complete_autoshop_intake_photo",
    {
      p_photo_id: photoId.toLowerCase(),
      p_intake_key_hash: intakeKeyHash,
    }
  );
  if (completionError || !completed) {
    return NextResponse.json({error: "Photo upload failed"}, {status: 500});
  }
  return NextResponse.json(
    {
      photo: {
        id: completed.id,
        deleteToken: issuePhotoActionToken(
          intakeToken,
          completed.id,
          "delete"
        ),
      },
    },
    {headers: {"Cache-Control": "no-store"}}
  );
}
