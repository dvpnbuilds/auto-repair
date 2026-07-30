import {NextResponse} from "next/server";
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

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isValidBody(value: unknown): value is BookBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.shop_id === "string" &&
    /^[0-9a-f-]{36}$/i.test(v.shop_id) &&
    typeof v.customer_name === "string" &&
    v.customer_name.trim().length > 0 &&
    typeof v.plate_number === "string" &&
    v.plate_number.trim().length > 0 &&
    typeof v.phone === "string" &&
    v.phone.trim().length > 0 &&
    typeof v.customer_email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.customer_email.trim()) &&
    typeof v.vehicle === "string" &&
    v.vehicle.trim().length > 0 &&
    (v.service_id === null ||
      (typeof v.service_id === "string" && /^[0-9a-f-]{36}$/i.test(v.service_id))) &&
    nullableString(v.issue_description) &&
    nullableString(v.probable_issue) &&
    nullableString(v.urgency) &&
    typeof v.scheduled_date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.scheduled_date) &&
    typeof v.scheduled_time === "string" &&
    /^\d{2}:\d{2}$/.test(v.scheduled_time)
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
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
