import {NextResponse} from "next/server";
import {parseApprovalToken, hashApprovalToken} from "@/lib/approvals/tokens";
import {checkApiRateLimit} from "@/lib/api/rate-limit";
import {readBoundedJson, RequestBodyError} from "@/lib/api/request";
import {supabaseService} from "@/lib/supabase/server";

const MAX_BODY_BYTES = 512;

export async function POST(
  request: Request,
  {params}: {params: Promise<{token: string}>}
) {
  const limit = await checkApiRateLimit(request, {
    bucket: "approval-decision",
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      {error: "Too many attempts. Please try again later."},
      {status: 429, headers: {"Retry-After": String(limit.retryAfter)}}
    );
  }

  const {token} = await params;
  let parsed;
  try {
    parsed = parseApprovalToken(token);
  } catch {
    return NextResponse.json({error: "Approval links are unavailable"}, {status: 503});
  }
  if (!parsed) {
    return NextResponse.json({error: "This approval link is invalid"}, {status: 404});
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    return NextResponse.json({error: "Invalid request body"}, {status: 400});
  }
  const decision =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).decision
      : null;
  if (decision !== "approved" && decision !== "declined") {
    return NextResponse.json({error: "Invalid decision"}, {status: 400});
  }

  const {data, error} = await supabaseService.rpc(
    "decide_autoshop_approval",
    {
      p_request_id: parsed.requestId,
      p_token_hash: hashApprovalToken(parsed.token),
      p_decision: decision,
    }
  );
  if (error || !data) {
    return NextResponse.json({error: "Decision could not be recorded"}, {status: 500});
  }
  if (data.outcome === "invalid") {
    return NextResponse.json({error: "This approval link is invalid"}, {status: 404});
  }
  if (data.outcome === "expired") {
    return NextResponse.json({error: "This approval link has expired"}, {status: 410});
  }
  if (data.outcome === "already_decided") {
    return NextResponse.json(
      {error: "This approval link has already been used", status: data.approval?.status},
      {status: 409}
    );
  }
  if (data.outcome === "conflict") {
    return NextResponse.json(
      {error: "This repair changed after the approval was requested"},
      {status: 409}
    );
  }
  return NextResponse.json({
    ok: true,
    decision: data.outcome,
  });
}
