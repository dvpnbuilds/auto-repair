import {NextResponse} from "next/server";
import {readBoundedJson, RequestBodyError} from "@/lib/api/request";
import {completeEmailDelivery} from "@/lib/email/deliveries";
import {hasValidN8nSecret} from "@/lib/webhooks/auth";

const MAX_STATUS_BODY_BYTES = 8 * 1024;
const MAX_PROVIDER_MESSAGE_ID_LENGTH = 512;
const MAX_PROVIDER_ERROR_LENGTH = 4_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StatusBody = {
  delivery_id: string;
  status: "sent" | "failed" | "reconciling";
  provider_message_id?: string | null;
  error?: string | null;
};

function isStatusBody(value: unknown): value is StatusBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.delivery_id === "string" &&
    UUID_PATTERN.test(body.delivery_id) &&
    (body.status === "sent" ||
      body.status === "failed" ||
      body.status === "reconciling") &&
    (body.provider_message_id === undefined ||
      body.provider_message_id === null ||
      (typeof body.provider_message_id === "string" &&
        body.provider_message_id.length <= MAX_PROVIDER_MESSAGE_ID_LENGTH)) &&
    (body.error === undefined ||
      body.error === null ||
      (typeof body.error === "string" &&
        body.error.length <= MAX_PROVIDER_ERROR_LENGTH))
  );
}

export async function POST(request: Request) {
  if (!hasValidN8nSecret(request.headers)) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_STATUS_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    return NextResponse.json({error: "Invalid request body"}, {status: 400});
  }

  if (!isStatusBody(body)) {
    return NextResponse.json({error: "Invalid status payload"}, {status: 400});
  }

  try {
    const delivery = await completeEmailDelivery(
      body.delivery_id,
      body.status,
      body.provider_message_id,
      body.error
    );
    return NextResponse.json({ok: true, delivery});
  } catch (error) {
    console.error("Email status callback failed:", error);
    return NextResponse.json({error: "Failed to update delivery"}, {status: 500});
  }
}
