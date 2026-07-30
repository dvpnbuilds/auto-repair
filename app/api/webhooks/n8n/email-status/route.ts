import {NextResponse} from "next/server";
import {completeEmailDelivery} from "@/lib/email/deliveries";
import {hasValidN8nSecret} from "@/lib/webhooks/auth";

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
    (body.status === "sent" ||
      body.status === "failed" ||
      body.status === "reconciling") &&
    (body.provider_message_id === undefined ||
      body.provider_message_id === null ||
      typeof body.provider_message_id === "string") &&
    (body.error === undefined ||
      body.error === null ||
      typeof body.error === "string")
  );
}

export async function POST(request: Request) {
  if (!hasValidN8nSecret(request.headers)) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const body = await request.json().catch(() => null);
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
