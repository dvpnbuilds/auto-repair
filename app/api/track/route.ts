import {createHmac} from "crypto";
import {NextResponse} from "next/server";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseService} from "@/lib/supabase/server";

const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 10 * 60;

function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function rateKeyFor(request: Request): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters");
  }

  return createHmac("sha256", secret)
    .update(`tracker-rate-limit:${clientAddress(request)}`)
    .digest("hex");
}

function readLookupInput(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const plate = typeof record.plate === "string" ? record.plate.trim() : "";
  const phone = typeof record.phone === "string" ? record.phone.trim() : "";

  if (
    plate.length < 2 ||
    plate.length > 20 ||
    phone.length < 7 ||
    phone.length > 24
  ) {
    return null;
  }

  return {plate, phone};
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const input = readLookupInput(body);
  if (!input) {
    return NextResponse.json({error: "Invalid tracker lookup"}, {status: 400});
  }

  let rateKey: string;
  try {
    rateKey = rateKeyFor(request);
  } catch {
    return NextResponse.json({error: "Tracker is not configured"}, {status: 503});
  }

  const {data: allowed, error: rateError} = await supabaseService.rpc(
    "check_autoshop_tracker_rate_limit",
    {
      p_rate_key: rateKey,
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    }
  );

  if (rateError) {
    return NextResponse.json({error: "Tracker is unavailable"}, {status: 503});
  }
  if (!allowed) {
    return NextResponse.json(
      {error: "Too many tracker attempts"},
      {
        status: 429,
        headers: {"Retry-After": String(RATE_WINDOW_SECONDS)},
      }
    );
  }

  const shop = await getActiveShop(supabaseService);
  const {data, error} = await supabaseService.rpc("lookup_autoshop_job", {
    p_shop_id: shop.id,
    p_plate: input.plate,
    p_phone: input.phone,
  });

  if (error) {
    return NextResponse.json({error: "Tracker is unavailable"}, {status: 503});
  }

  return NextResponse.json(
    data ?? {job: null, history: []},
    {headers: {"Cache-Control": "no-store, private"}}
  );
}
