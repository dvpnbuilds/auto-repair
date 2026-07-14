import { NextResponse } from "next/server";
import { isAdminAuthedFromHeader } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthedFromHeader(request.headers.get("cookie"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const editedBody = typeof body?.body === "string" ? body.body.trim() : null;

  const update: { sent: boolean; body?: string } = { sent: true };
  if (editedBody) update.body = editedBody;

  const { data: message, error } = await supabaseService
    .from("autoshop_messages")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error || !message) {
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }

  return NextResponse.json({ message });
}
