import "server-only";
import {createHash} from "node:crypto";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseService} from "@/lib/supabase/server";
import type {IntakePhotoMimeType} from "@/lib/photos/validation";
import {isValidIntakePhotoToken} from "@/lib/photos/session";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type IntakePhotoReference = {
  id: string;
  mimeType: IntakePhotoMimeType;
  bytes: Uint8Array;
};

export function intakePhotoBucket(): string {
  return (
    process.env.INTAKE_PHOTO_BUCKET?.trim() ||
    "auto-repair-intake-photos"
  );
}

export function hashIntakeKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPhotoContent(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function purgeExpiredUnattachedIntakePhotos(
  now = new Date()
): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const {data, error} = await supabaseService
    .from("autoshop_intake_photos")
    .select("id, intake_key_hash, storage_path")
    .is("job_id", null)
    .lt("created_at", cutoff)
    .limit(100);
  if (error || !data?.length) return 0;

  const claimed: Array<{
    id: string;
    intakeKeyHash: string;
    storagePath: string;
  }> = [];
  for (const photo of data) {
    const {data: claim, error: claimError} = await supabaseService.rpc(
      "claim_autoshop_intake_photo_deletion",
      {
        p_photo_id: photo.id,
        p_intake_key_hash: photo.intake_key_hash,
      }
    );
    if (!claimError && claim?.status === "deleting") {
      claimed.push({
        id: claim.id,
        intakeKeyHash: claim.intake_key_hash,
        storagePath: claim.storage_path,
      });
    }
  }
  if (claimed.length === 0) return 0;

  const {error: storageError} = await supabaseService.storage
    .from(intakePhotoBucket())
    .remove(claimed.map((photo) => photo.storagePath));
  if (storageError) return 0;

  let deleted = 0;
  for (const photo of claimed) {
    const {data: finalized, error: finalizeError} = await supabaseService.rpc(
      "finalize_autoshop_intake_photo_deletion",
      {
        p_photo_id: photo.id,
        p_intake_key_hash: photo.intakeKeyHash,
      }
    );
    if (!finalizeError && finalized === true) deleted += 1;
  }
  return deleted;
}

export async function loadIntakePhotos(
  intakeToken: string,
  photoIds: string[]
): Promise<IntakePhotoReference[]> {
  if (
    !isValidIntakePhotoToken(intakeToken) ||
    photoIds.length < 1 ||
    photoIds.length > 3
  ) {
    throw new Error("Invalid intake photo references");
  }
  if (
    new Set(photoIds).size !== photoIds.length ||
    photoIds.some((id) => !UUID_PATTERN.test(id))
  ) {
    throw new Error("Invalid intake photo references");
  }

  const shop = await getActiveShop(supabaseService);
  const intakeKeyHash = hashIntakeKey(intakeToken);
  const {data, error} = await supabaseService
    .from("autoshop_intake_photos")
    .select("id, storage_path, mime_type, size_bytes")
    .eq("shop_id", shop.id)
    .eq("intake_key_hash", intakeKeyHash)
    .eq("status", "ready")
    .is("job_id", null)
    .in("id", photoIds);
  if (error || !data || data.length !== photoIds.length) {
    throw new Error("Intake photos are unavailable");
  }

  const byId = new Map(data.map((photo) => [photo.id, photo]));
  const photos: IntakePhotoReference[] = [];
  for (const photoId of photoIds) {
    const photo = byId.get(photoId);
    if (!photo) throw new Error("Intake photos are unavailable");
    const {data: blob, error: downloadError} = await supabaseService.storage
      .from(intakePhotoBucket())
      .download(photo.storage_path);
    if (downloadError || !blob) {
      throw new Error("Intake photo download failed");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length !== photo.size_bytes) {
      throw new Error("Intake photo size mismatch");
    }
    photos.push({
      id: photo.id,
      mimeType: photo.mime_type as IntakePhotoMimeType,
      bytes,
    });
  }
  return photos;
}
