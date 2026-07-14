import { callWithRetry } from "@/lib/callWithRetry";

export type MessageKind = "status_update" | "completion_report" | "reminder" | "review_request";

export type DraftJob = {
  customer_name: string;
  vehicle: string;
  probable_issue: string | null;
  status: string;
  scheduled_at: string | null;
};

function buildPrompt(kind: MessageKind, job: DraftJob): string {
  const base = `You are RapidFix Auto Care's assistant drafting a short Taglish-English customer message.
Customer: ${job.customer_name}. Vehicle: ${job.vehicle}.
${job.probable_issue ? `Issue: ${job.probable_issue}.` : ""}
Respond with ONLY a JSON object: {"body":"<message text>"}. Keep it under 3 sentences, warm and professional.`;

  switch (kind) {
    case "status_update":
      return `${base}\nThe job status just changed to "${job.status.replace(/_/g, " ")}". Draft a status update telling the customer this.`;
    case "completion_report":
      return `${base}\nThe repair is done. Draft a completion report summarizing the work done for the customer, in friendly plain language.`;
    case "reminder":
      return `${base}\nDraft a booking reminder for the customer's upcoming slot${job.scheduled_at ? ` on ${new Date(job.scheduled_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}` : ""}.`;
    case "review_request":
      return `${base}\nThe repair is complete. Draft a friendly message asking the customer to leave a review.`;
  }
}

function parseBody(raw: string): string {
  const trimmed = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
  const parsed = JSON.parse(trimmed);
  if (typeof parsed !== "object" || parsed === null || typeof parsed.body !== "string" || !parsed.body.trim()) {
    throw new Error("Model response missing body");
  }
  return parsed.body;
}

export async function draftMessage(kind: MessageKind, job: DraftJob): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");
  if (!model) throw new Error("Missing OPENROUTER_MODEL");

  const response = await callWithRetry(() =>
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: buildPrompt(kind, job) }],
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

  return parseBody(content);
}
