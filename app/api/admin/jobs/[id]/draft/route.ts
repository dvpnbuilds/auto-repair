import {NextResponse} from "next/server";
import {isAdminAuthedFromHeader} from "@/lib/admin/auth";
import {readBoundedJson, RequestBodyError} from "@/lib/api/request";
import {supabaseService} from "@/lib/supabase/server";
import {draftMessage, type MessageKind} from "@/lib/openrouter/messages";
import {getActiveShop} from "@/lib/shop-config";

const DRAFTABLE_KINDS: MessageKind[] = [
  "completion_report",
  "reminder",
  "review_request",
];
const MAX_DRAFT_BODY_BYTES = 512;

function isDraftableKind(value: unknown): value is MessageKind {
  return (
    typeof value === "string" &&
    (DRAFTABLE_KINDS as string[]).includes(value)
  );
}

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  if (!isAdminAuthedFromHeader(request.headers.get("cookie"))) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const {id} = await params;
  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_DRAFT_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    return NextResponse.json({error: "Invalid request body"}, {status: 400});
  }

  const kind =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).kind
      : null;

  if (!isDraftableKind(kind)) {
    return NextResponse.json({error: "Invalid kind"}, {status: 400});
  }

  const shop = await getActiveShop(supabaseService);
  const {data: job, error: jobError} = await supabaseService
    .from("autoshop_jobs")
    .select("*")
    .eq("id", id)
    .eq("shop_id", shop.id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({error: "Job not found"}, {status: 404});
  }

  let draftBody: string;
  try {
    draftBody = await draftMessage(kind, job);
  } catch (err) {
    console.error("Draft generation failed:", err);
    return NextResponse.json({error: "Draft generation failed"}, {status: 502});
  }

  const {data: message, error: messageError} = await supabaseService
    .from("autoshop_messages")
    .insert({job_id: id, kind, body: draftBody, sent: false})
    .select()
    .single();

  if (messageError) {
    return NextResponse.json(
      {error: "Failed to save draft message"},
      {status: 500}
    );
  }

  return NextResponse.json({message});
}
