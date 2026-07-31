import {NextResponse} from "next/server";
import {isAdminAuthedFromHeader} from "@/lib/admin/auth";
import {readBoundedJson, RequestBodyError} from "@/lib/api/request";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseService} from "@/lib/supabase/server";

const MAX_ASSIGNMENT_BODY_BYTES = 512;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  if (!isAdminAuthedFromHeader(request.headers.get("cookie"))) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const {id} = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({error: "Invalid job"}, {status: 400});
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_ASSIGNMENT_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    return NextResponse.json({error: "Invalid request body"}, {status: 400});
  }

  const technicianId =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).technicianId
      : undefined;
  if (
    technicianId !== null &&
    (typeof technicianId !== "string" || !UUID_PATTERN.test(technicianId))
  ) {
    return NextResponse.json(
      {error: "Invalid technician assignment"},
      {status: 400}
    );
  }

  const shop = await getActiveShop(supabaseService);
  const {data: job, error} = await supabaseService.rpc(
    "assign_autoshop_technician",
    {
      p_job_id: id,
      p_shop_id: shop.id,
      p_technician_id: technicianId,
    }
  );

  if (error) {
    if (error.message.includes("JOB_NOT_FOUND")) {
      return NextResponse.json({error: "Job not found"}, {status: 404});
    }
    if (error.message.includes("TECHNICIAN_NOT_FOUND")) {
      return NextResponse.json({error: "Technician not found"}, {status: 400});
    }
    console.error("Technician assignment failed:", error);
    return NextResponse.json(
      {error: "Failed to assign technician"},
      {status: 500}
    );
  }

  return NextResponse.json({job});
}
