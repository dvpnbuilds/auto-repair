import { supabaseAnon } from "@/lib/supabase/client";
import { callWithRetry } from "@/lib/callWithRetry";

export const ESTIMATE_DISCLAIMER = "Initial estimate, subject to inspection.";

export type TriageMessage = { role: "user" | "assistant"; content: string };

export type TriageAsk = {
  status: "ask";
  question: string;
};

export type TriageDone = {
  status: "done";
  probable_issue: string;
  urgency: "low" | "medium" | "high";
  service_name: string | null;
  estimate_min: number | null;
  estimate_max: number | null;
  needs_inspection: boolean;
  disclaimer: string;
};

export type TriageResult = TriageAsk | TriageDone;

type Service = {
  name: string;
  category: string;
  price_min: number;
  price_max: number;
};

async function fetchServices(): Promise<Service[]> {
  const { data, error } = await supabaseAnon
    .from("autoshop_services")
    .select("name, category, price_min, price_max");
  if (error) throw error;
  return data ?? [];
}

function buildSystemPrompt(services: Service[], forceFinal: boolean): string {
  const priceList = services
    .map((s) => `- ${s.name} (${s.category}): P${s.price_min}-P${s.price_max}`)
    .join("\n");

  return `You are RapidFix's Taglish-speaking intake assistant for a Philippine auto repair shop.
A customer describes a car problem. Ask at most 2-3 short clarifying questions in Taglish
ONLY if genuinely needed to identify the issue and match it to one of the shop's services.
Otherwise, give your best-effort diagnosis right away.

Shop price list (use the EXACT name string when picking a service):
${priceList}

Respond with ONLY a JSON object, no other text, in one of these two shapes:

To ask a follow-up question:
{"status":"ask","question":"<short Taglish question>"}

To give a final diagnosis:
{"status":"done","probable_issue":"<short description>","urgency":"low"|"medium"|"high","service_name":"<exact name from the price list, or null if none fits>","needs_inspection":<true if you cannot confidently match a service>}

${
  forceFinal
    ? "You MUST respond with status \"done\" now, using your best judgment from the information given. Do not ask further questions."
    : ""
}`;
}

function isValidUrgency(value: unknown): value is TriageDone["urgency"] {
  return value === "low" || value === "medium" || value === "high";
}

function parseModelJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
  const parsed = JSON.parse(trimmed);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Model response was not a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function groundInPriceList(parsed: Record<string, unknown>, services: Service[]): TriageDone {
  if (typeof parsed.probable_issue !== "string" || !isValidUrgency(parsed.urgency)) {
    throw new Error("Model response missing required fields");
  }

  const requestedName = typeof parsed.service_name === "string" ? parsed.service_name : null;
  const matched = requestedName
    ? services.find((s) => s.name.toLowerCase() === requestedName.toLowerCase())
    : undefined;

  if (!matched) {
    return {
      status: "done",
      probable_issue: parsed.probable_issue,
      urgency: parsed.urgency,
      service_name: null,
      estimate_min: null,
      estimate_max: null,
      needs_inspection: true,
      disclaimer: ESTIMATE_DISCLAIMER,
    };
  }

  return {
    status: "done",
    probable_issue: parsed.probable_issue,
    urgency: parsed.urgency,
    service_name: matched.name,
    estimate_min: matched.price_min,
    estimate_max: matched.price_max,
    needs_inspection: false,
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}

function validateAsk(parsed: Record<string, unknown>): TriageAsk {
  if (typeof parsed.question !== "string" || parsed.question.trim() === "") {
    throw new Error("Model 'ask' response missing question");
  }
  return { status: "ask", question: parsed.question };
}

export async function runTriage(
  messages: TriageMessage[],
  forceFinal = false
): Promise<TriageResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");
  if (!model) throw new Error("Missing OPENROUTER_MODEL");

  const services = await fetchServices();
  const systemPrompt = buildSystemPrompt(services, forceFinal);

  const response = await callWithRetry(() =>
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        response_format: { type: "json_object" },
      }),
    })
  );

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenRouter response missing message content");
  }

  const parsed = parseModelJson(content);

  if (parsed.status === "ask" && !forceFinal) {
    return validateAsk(parsed);
  }
  return groundInPriceList(parsed, services);
}
