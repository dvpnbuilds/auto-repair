import { NextResponse } from "next/server";
import { isAdminAuthedFromHeader } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/server";
import { seedDatabase } from "@/lib/seed";

export async function POST(request: Request) {
  if (!isAdminAuthedFromHeader(request.headers.get("cookie"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await seedDatabase(supabaseService, "us");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Reset failed:", err);
    return NextResponse.json({ error: "Failed to reset demo data" }, { status: 500 });
  }
}
