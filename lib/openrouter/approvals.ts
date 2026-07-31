import {callWithRetry} from "@/lib/callWithRetry";
import type {ShopConfig} from "@/lib/shop-config";

export type ApprovalDraftInput = {
  customerName: string;
  vehicle: string;
  probableIssue: string | null;
  serviceName: string;
  technicianDescription: string;
  formattedAmount: string;
  shop: ShopConfig;
};

export type ApprovalExplanation = {
  explanation: string;
  consequenceOfDeclining: string;
};

export function buildApprovalPrompt(input: ApprovalDraftInput): string {
  return `You are ${input.shop.name}'s service advisor.
Write in the language identified by BCP 47 code "${input.shop.language}".
Customer: ${input.customerName}
Vehicle: ${input.vehicle}
Known issue: ${input.probableIssue ?? "Not specified"}
Additional service from this shop's price list: ${input.serviceName}
Technician finding: ${input.technicianDescription}
Exact additional price: ${input.formattedAmount}

Explain only the supplied finding. Do not diagnose anything new, change the price, promise an outcome, or add services.
Return ONLY JSON in this shape:
{"explanation":"<plain-language explanation naming ${input.serviceName}, including the exact price ${input.formattedAmount}, and explaining why the work is recommended>","consequence_of_declining":"<plain-language consequence of declining or delaying>"}
Each value must be one or two concise sentences.`;
}

export function parseApprovalDraft(
  raw: string,
  input: Pick<ApprovalDraftInput, "serviceName" | "formattedAmount">
): ApprovalExplanation {
  const parsed = JSON.parse(
    raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "")
  ) as Record<string, unknown>;
  const explanation =
    typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
  const consequence =
    typeof parsed.consequence_of_declining === "string"
      ? parsed.consequence_of_declining.trim()
      : "";
  if (
    !explanation ||
    !consequence ||
    explanation.length > 2000 ||
    consequence.length > 1500
  ) {
    throw new Error("Model response is missing the approval explanation");
  }
  const groundedText = `${explanation} ${consequence}`;
  if (
    !groundedText.includes(input.serviceName) ||
    !groundedText.includes(input.formattedAmount)
  ) {
    throw new Error("Model response changed or omitted grounded approval facts");
  }
  return {explanation, consequenceOfDeclining: consequence};
}

export async function draftApprovalExplanation(
  input: ApprovalDraftInput
): Promise<ApprovalExplanation> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");
  if (!model) throw new Error("Missing OPENROUTER_MODEL");

  return callWithRetry(async () => {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{role: "system", content: buildApprovalPrompt(input)}],
        response_format: {type: "json_object"},
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter request failed: ${response.status}`);
    }
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenRouter response missing message content");
    }
    return parseApprovalDraft(content, input);
  });
}
