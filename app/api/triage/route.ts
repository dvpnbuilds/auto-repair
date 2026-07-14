import { NextResponse } from "next/server";
import { runTriage, type TriageMessage } from "@/lib/openrouter/triage";

function isValidMessages(value: unknown): value is TriageMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (m) =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || !isValidMessages(body.messages)) {
    return NextResponse.json({ error: "messages array is required" }, { status: 400 });
  }

  try {
    const result = await runTriage(body.messages, Boolean(body.forceFinal));
    return NextResponse.json(result);
  } catch (err) {
    console.error("Triage failed:", err);
    return NextResponse.json({ error: "Triage failed" }, { status: 502 });
  }
}
