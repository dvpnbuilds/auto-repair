import {NextResponse} from "next/server";
import {checkApiRateLimit} from "@/lib/api/rate-limit";
import {readBoundedJson, RequestBodyError} from "@/lib/api/request";
import {supabaseService} from "@/lib/supabase/server";

type BookBody = {
  shop_id: string;
  customer_name: string;
  plate_number: string;
  phone: string;
  customer_email: string;
  vehicle: string;
  service_id: string | null;
  issue_description: string | null;
  probable_issue: string | null;
  urgency: string | null;
  scheduled_date: string;
  scheduled_time: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function boundedString(
  value: unknown,
  minimum: number,
  maximum: number
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= minimum &&
    value.trim().length <= maximum
  );
}

function nullableBoundedString(
  value: unknown,
  maximum: number
): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && value.trim().length <= maximum)
  );
}

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isValidBody(value: unknown): value is BookBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.shop_id === "string" &&
    UUID_PATTERN.test(v.shop_id) &&
    boundedString(v.customer_name, 1, 100) &&
    boundedString(v.plate_number, 2, 20) &&
    boundedString(v.phone, 7, 24) &&
    typeof v.customer_email === "string" &&
    v.customer_email.trim().length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.customer_email.trim()) &&
    boundedString(v.vehicle, 1, 120) &&
    (v.service_id === null ||
      (typeof v.service_id === "string" && UUID_PATTERN.test(v.service_id))) &&
    nullableBoundedString(v.issue_description, 2_000) &&
    nullableBoundedString(v.probable_issue, 500) &&
    (v.urgency === null ||
      v.urgency === "low" ||
      v.urgency === "medium" ||
      v.urgency === "high") &&
    typeof v.scheduled_date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.scheduled_date) &&
    isRealDate(v.scheduled_date) &&
    typeof v.scheduled_time === "string" &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.scheduled_time)
  );
}

export async function POST(request: Request) {
  try {
    const rateLimit = await checkApiRateLimit(request, {
      bucket: "booking",
      limit: 5,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {error: "Too many booking attempts"},
        {
          status: 429,
          headers: {"Retry-After": String(rateLimit.retryAfter)},
        }
      );
    }
  } catch (error) {
    console.error("Booking rate limit failed:", error);
    return NextResponse.json({error: "Booking is unavailable"}, {status: 503});
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, 8 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    return NextResponse.json({error: "Invalid request body"}, {status: 400});
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      {error: "Missing or invalid booking fields"},
      {status: 400}
    );
  }

  const {data, error} = await supabaseService.rpc("create_autoshop_booking", {
    p_shop_id: body.shop_id,
    p_customer_name: body.customer_name.trim(),
    p_plate_number: body.plate_number.trim().toUpperCase(),
    p_phone: body.phone.trim(),
    p_customer_email: body.customer_email.trim().toLowerCase(),
    p_vehicle: body.vehicle.trim(),
    p_service_id: body.service_id,
    p_issue_description: body.issue_description?.trim() || null,
    p_probable_issue: body.probable_issue?.trim() || null,
    p_urgency: body.urgency?.trim() || null,
    p_scheduled_date: body.scheduled_date,
    p_scheduled_time: body.scheduled_time,
  });

  if (error) {
    if (error.message.includes("STALE_SHOP")) {
      return NextResponse.json(
        {error: "The active shop changed. Refresh and try again."},
        {status: 409}
      );
    }
    if (
      error.message.includes("INVALID_SERVICE") ||
      error.message.includes("INVALID_SCHEDULE")
    ) {
      return NextResponse.json({error: "Invalid booking selection"}, {status: 400});
    }

    console.error("Transactional booking failed:", error);
    return NextResponse.json({error: "Failed to create booking"}, {status: 500});
  }

  return NextResponse.json({job: data});
}
