import {Buffer} from "node:buffer";
import {callWithRetry} from "@/lib/callWithRetry";
import {formatCurrency} from "@/lib/formatting";
import type {IntakePhotoReference} from "@/lib/photos/server";
import {getActiveShop, type ShopConfig} from "@/lib/shop-config";
import {supabaseAnon} from "@/lib/supabase/client";
import {
  ESTIMATE_DISCLAIMER,
  runTriage,
  type TriageDone,
  type TriageMessage,
  type TriageResult,
} from "@/lib/openrouter/triage";

type Service = {
  name: string;
  category: string;
  price_min: number;
  price_max: number;
};

export function buildVisionTriagePrompt(
  services: Service[],
  forceFinal: boolean,
  shop: ShopConfig
): string {
  const priceList = services
    .map(
      (service) =>
        `- ${service.name} (${service.category}): ${formatCurrency(
          service.price_min,
          shop
        )}-${formatCurrency(service.price_max, shop)}`
    )
    .join("\n");
  return `You are ${shop.name}'s visual intake assistant for an auto repair shop.
Write all customer-facing text in the language identified by BCP 47 code "${shop.language}".
Inspect the supplied vehicle photos conservatively. Report only visible facts. Do not infer hidden damage, identify a person, read a license plate, or claim a confirmed diagnosis from an image.

Shop price list (use the EXACT name string when picking a service):
${priceList}

Respond with ONLY JSON in one of these shapes:
{"status":"ask","question":"<one short question>"}
{"status":"done","probable_issue":"<short best-effort description>","urgency":"low"|"medium"|"high","service_name":"<exact price-list name or null>","needs_inspection":<boolean>,"visual_findings":["<visible fact>"]}

visual_findings must contain one to five short facts that are actually visible in the supplied photos. A warning symbol may be described by its visible shape or label, but it does not confirm the underlying fault.
If no service matches confidently, use null and needs_inspection true.
${forceFinal ? 'You MUST return status "done" now and must not ask a question.' : ""}`;
}

function parseJson(raw: string): Record<string, unknown> {
  const value = JSON.parse(
    raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "")
  );
  if (!value || typeof value !== "object") {
    throw new Error("Vision response was not an object");
  }
  return value as Record<string, unknown>;
}

function validUrgency(value: unknown): value is TriageDone["urgency"] {
  return value === "low" || value === "medium" || value === "high";
}

function groundVisionResult(
  parsed: Record<string, unknown>,
  services: Service[]
): TriageDone {
  if (
    typeof parsed.probable_issue !== "string" ||
    !parsed.probable_issue.trim() ||
    parsed.probable_issue.length > 500 ||
    !validUrgency(parsed.urgency) ||
    !Array.isArray(parsed.visual_findings) ||
    parsed.visual_findings.length < 1 ||
    parsed.visual_findings.length > 5 ||
    !parsed.visual_findings.every(
      (finding) =>
        typeof finding === "string" &&
        finding.trim().length > 0 &&
        finding.length <= 300
    )
  ) {
    throw new Error("Vision response missing required fields");
  }
  const requestedName =
    typeof parsed.service_name === "string" ? parsed.service_name : null;
  const matched = requestedName
    ? services.find(
        (service) =>
          service.name.toLowerCase() === requestedName.toLowerCase()
      )
    : undefined;
  return {
    status: "done",
    probable_issue: parsed.probable_issue.trim(),
    urgency: parsed.urgency,
    service_name: matched?.name ?? null,
    estimate_min: matched?.price_min ?? null,
    estimate_max: matched?.price_max ?? null,
    needs_inspection: !matched,
    disclaimer: ESTIMATE_DISCLAIMER,
    visual_findings: (parsed.visual_findings as string[]).map((finding) =>
      finding.trim()
    ),
    vision_used: true,
    vision_attempted: true,
  };
}

export async function runVisionTriage(
  messages: TriageMessage[],
  photos: IntakePhotoReference[],
  forceFinal = false
): Promise<TriageResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_VISION_MODEL;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");
  if (!model) {
    const fallback = await runTriage(messages, forceFinal);
    return fallback.status === "done"
      ? {
          ...fallback,
          visual_findings: [],
          vision_used: false,
          vision_attempted: true,
        }
      : fallback;
  }

  const shop = await getActiveShop();
  const {data: services, error} = await supabaseAnon
    .from("autoshop_services")
    .select("name, category, price_min, price_max")
    .eq("shop_id", shop.id);
  if (error) throw error;
  const serviceList = (services ?? []) as Service[];
  const systemPrompt = buildVisionTriagePrompt(serviceList, forceFinal, shop);

  try {
    const parsed = await callWithRetry(async () => {
      const lastIndex = messages.length - 1;
      const modelMessages = messages.map((message, index) => {
        if (index !== lastIndex || message.role !== "user") return message;
        return {
          role: "user",
          content: [
            {type: "text", text: message.content},
            ...photos.map((photo) => ({
              type: "image_url",
              image_url: {
                url: `data:${photo.mimeType};base64,${Buffer.from(photo.bytes).toString("base64")}`,
              },
            })),
          ],
        };
      });
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {role: "system", content: systemPrompt},
              ...modelMessages,
            ],
            response_format: {type: "json_object"},
          }),
        }
      );
      if (!response.ok) {
        throw new Error(`OpenRouter vision request failed: ${response.status}`);
      }
      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("OpenRouter vision response missing content");
      }
      return parseJson(content);
    });

    if (parsed.status === "ask" && !forceFinal) {
      if (
        typeof parsed.question !== "string" ||
        !parsed.question.trim() ||
        parsed.question.length > 500
      ) {
        throw new Error("Vision response missing question");
      }
      return {status: "ask", question: parsed.question.trim()};
    }
    return groundVisionResult(parsed, serviceList);
  } catch {
    const fallback = await runTriage(messages, forceFinal);
    return fallback.status === "done"
      ? {
          ...fallback,
          visual_findings: [],
          vision_used: false,
          vision_attempted: true,
        }
      : fallback;
  }
}
