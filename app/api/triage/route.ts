import {NextResponse} from "next/server";
import {checkApiRateLimit} from "@/lib/api/rate-limit";
import {readBoundedJson, RequestBodyError} from "@/lib/api/request";
import {runTriage, type TriageMessage} from "@/lib/openrouter/triage";
import {runVisionTriage} from "@/lib/openrouter/vision-triage";
import {loadIntakePhotos} from "@/lib/photos/server";
import {isValidIntakePhotoToken} from "@/lib/photos/session";
import {supabaseService} from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    typeof input.sessionId !== "string" ||
    !UUID_PATTERN.test(input.sessionId) ||
    typeof input.shopId !== "string" ||
    !UUID_PATTERN.test(input.shopId) ||
    (input.forceFinal !== undefined && typeof input.forceFinal !== "boolean") ||
    (input.intakeToken !== undefined &&
      !isValidIntakePhotoToken(input.intakeToken as string)) ||
    (input.photoIds !== undefined &&
      (!Array.isArray(input.photoIds) ||
        input.photoIds.length < 1 ||
        input.photoIds.length > 3 ||
        input.photoIds.some(
          (id) => typeof id !== "string" || !UUID_PATTERN.test(id)
        ))) ||
    ((input.intakeToken === undefined) !== (input.photoIds === undefined))
  ) {
    return NextResponse.json({error: "Invalid triage messages"}, {status: 400});
  }

  try {
    const {error: sessionStartError} = await supabaseService.rpc(
      "record_autoshop_intake_session",
      {
        p_session_id: input.sessionId,
        p_shop_id: input.shopId,
        p_completed: false,
      }
    );
    if (sessionStartError) throw sessionStartError;

    let result;
    if (
      typeof input.intakeToken === "string" &&
      Array.isArray(input.photoIds)
    ) {
      let photos;
      try {
        photos = await loadIntakePhotos(
          input.intakeToken,
          input.photoIds as string[]
        );
      } catch {
        return NextResponse.json(
          {error: "Invalid intake photo references"},
          {status: 400}
        );
      }
      result = await runVisionTriage(
        input.messages,
        photos,
        input.forceFinal === true
      );
    } else {
      result = await runTriage(input.messages, input.forceFinal === true);
    }
    if (result.status === "done") {
      const {error: sessionCompleteError} = await supabaseService.rpc(
        "record_autoshop_intake_session",
        {
          p_session_id: input.sessionId,
          p_shop_id: input.shopId,
          p_completed: true,
        }
      );
      if (sessionCompleteError) throw sessionCompleteError;
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Triage failed:", error);
    return NextResponse.json({error: "Triage failed"}, {status: 502});
  }
}
