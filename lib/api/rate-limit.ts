import "server-only";
import {createHmac} from "node:crypto";
import {supabaseService} from "@/lib/supabase/server";

type RateLimitOptions = {
  bucket:
    | "admin-login"
    | "booking"
    | "triage"
    | "approval-decision"
    | "photo-upload";
  limit: number;
  windowSeconds: number;
};

function clientAddress(request: Request): string {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) return vercelForwarded.split(",")[0].trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function rateKey(request: Request, bucket: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters");
  }

  return createHmac("sha256", secret)
    .update(`${bucket}:${clientAddress(request)}`)
    .digest("hex");
}

export async function checkApiRateLimit(
  request: Request,
  options: RateLimitOptions
): Promise<{allowed: boolean; retryAfter: number}> {
  const {data, error} = await supabaseService.rpc(
    "check_autoshop_api_rate_limit",
    {
      p_bucket: options.bucket,
      p_rate_key: rateKey(request, options.bucket),
      p_limit: options.limit,
      p_window_seconds: options.windowSeconds,
    }
  );

  if (error) {
    throw new Error(`Rate limit unavailable: ${error.message}`);
  }

  return {
    allowed: data === true,
    retryAfter: options.windowSeconds,
  };
}
