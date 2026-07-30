import {NextResponse} from "next/server";
import {checkApiRateLimit} from "@/lib/api/rate-limit";
import {readBoundedJson, RequestBodyError} from "@/lib/api/request";
import {runTriage, type TriageMessage} from "@/lib/openrouter/triage";

function isValidMessages(value: unknown): value is TriageMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 20 &&
    value.every(
      (m) =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0 &&
        m.content.length <= 2_000
    ) &&
    value.reduce((total, message) => total + message.content.length, 0) <=
      8_000 &&
    value.at(-1)?.role === "user"
  );
}

export async function POST(request: Request) {
  try {
    const rateLimit = await checkApiRateLimit(request, {
      bucket: "triage",
      limit: 12,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {error: "Too many triage requests"},
        {
          status: 429,
          headers: {"Retry-After": String(rateLimit.retryAfter)},
        }
      );
    }
  } catch (error) {
    console.error("Triage rate limit failed:", error);
    return NextResponse.json({error: "Triage is unavailable"}, {status: 503});
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, 16 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    return NextResponse.json({error: "Invalid request body"}, {status: 400});
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({error: "messages array is required"}, {status: 400});
  }
  const input = body as Record<string, unknown>;
  if (
    !isValidMessages(input.messages) ||
    (input.forceFinal !== undefined && typeof input.forceFinal !== "boolean")
  ) {
    return NextResponse.json({error: "Invalid triage messages"}, {status: 400});
  }

  try {
    const result = await runTriage(input.messages, input.forceFinal === true);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Triage failed:", error);
    return NextResponse.json({error: "Triage failed"}, {status: 502});
  }
}
