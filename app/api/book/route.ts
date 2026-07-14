import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/server";

type BookBody = {
  customer_name: string;
  plate_number: string;
  phone: string;
  vehicle: string;
  service_id: string | null;
  issue_description: string | null;
  probable_issue: string | null;
  urgency: string | null;
  estimate_min: number | null;
  estimate_max: number | null;
  scheduled_at: string;
};

function isValidBody(value: unknown): value is BookBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.customer_name === "string" &&
    v.customer_name.trim().length > 0 &&
    typeof v.plate_number === "string" &&
    v.plate_number.trim().length > 0 &&
    typeof v.phone === "string" &&
    v.phone.trim().length > 0 &&
    typeof v.vehicle === "string" &&
    v.vehicle.trim().length > 0 &&
    typeof v.scheduled_at === "string" &&
    v.scheduled_at.trim().length > 0
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isValidBody(body)) {
    return NextResponse.json({ error: "Missing required booking fields" }, { status: 400 });
  }

  const { data: job, error: jobError } = await supabaseService
    .from("autoshop_jobs")
    .insert({
      customer_name: body.customer_name.trim(),
      plate_number: body.plate_number.trim().toUpperCase(),
      phone: body.phone.trim(),
      vehicle: body.vehicle.trim(),
      service_id: body.service_id ?? null,
      issue_description: body.issue_description ?? null,
      probable_issue: body.probable_issue ?? null,
      urgency: body.urgency ?? null,
      estimate_min: body.estimate_min ?? null,
      estimate_max: body.estimate_max ?? null,
      scheduled_at: body.scheduled_at,
    })
    .select()
    .single();

  if (jobError) {
    console.error("Booking insert failed:", jobError);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }

  const { error: historyError } = await supabaseService.from("autoshop_status_history").insert({
    job_id: job.id,
    status: "booked",
    note: "Booked via customer portal",
  });

  if (historyError) {
    console.error("Status history insert failed:", historyError);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }

  return NextResponse.json({ job });
}
