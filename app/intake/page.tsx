"use client";

import { useState } from "react";
import Link from "next/link";

type ChatMessage = { role: "user" | "assistant"; content: string };

type TriageDone = {
  status: "done";
  probable_issue: string;
  urgency: "low" | "medium" | "high";
  service_name: string | null;
  estimate_min: number | null;
  estimate_max: number | null;
  needs_inspection: boolean;
  disclaimer: string;
};

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString("en-PH")}`;
}

export default function IntakePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageDone | null>(null);

  async function send(nextMessages: ChatMessage[], forceFinal = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, forceFinal }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();

      if (data.status === "ask") {
        setMessages([...nextMessages, { role: "assistant", content: data.question }]);
      } else {
        setResult(data);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent, forceFinal = false) {
    e.preventDefault();
    if (!input.trim()) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: input }];
    setMessages(nextMessages);
    setInput("");
    send(nextMessages, forceFinal);
  }

  return (
    <div className="px-6 py-12 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">Describe your car problem</h1>
      <p className="text-sm text-zinc-600 mb-6">
        Isulat mo lang sa Taglish ang problema ng sasakyan mo.
      </p>

      {!result && (
        <>
          <div className="space-y-3 mb-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "text-right"
                    : "text-left text-zinc-800 bg-zinc-100 rounded px-3 py-2 inline-block"
                }
              >
                {m.role === "user" ? (
                  <span className="inline-block bg-black text-white rounded px-3 py-2">
                    {m.content}
                  </span>
                ) : (
                  m.content
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <textarea
              className="border border-black/20 rounded px-3 py-2 min-h-24"
              placeholder="Hal. Kumakalampag pag nagbe-brake..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send"}
              </button>
              <button
                type="button"
                disabled={loading || !input.trim()}
                onClick={(e) => handleSubmit(e, true)}
                className="border border-black/20 rounded px-4 py-2 text-sm disabled:opacity-50"
              >
                Get my estimate now
              </button>
            </div>
          </form>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </>
      )}

      {result && (
        <div className="border border-black/10 rounded p-6">
          <h2 className="font-semibold mb-3">Probable issue</h2>
          <p className="mb-4">{result.probable_issue}</p>

          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <div className="text-zinc-600">Urgency</div>
              <div className="capitalize">{result.urgency}</div>
            </div>
            <div>
              <div className="text-zinc-600">Suggested service</div>
              <div>{result.service_name ?? "Needs inspection"}</div>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-zinc-600 text-sm">Estimate</div>
            {result.needs_inspection || result.estimate_min === null || result.estimate_max === null ? (
              <div className="text-lg font-medium">Needs inspection</div>
            ) : (
              <div className="text-lg font-medium">
                {formatPeso(result.estimate_min)} – {formatPeso(result.estimate_max)}
              </div>
            )}
          </div>

          <p className="text-xs text-zinc-500 mb-4">{result.disclaimer}</p>

          <Link
            href={{
              pathname: "/book",
              query: {
                service_name: result.service_name ?? "",
                probable_issue: result.probable_issue,
                urgency: result.urgency,
                estimate_min: result.estimate_min ?? "",
                estimate_max: result.estimate_max ?? "",
                issue_description: messages.find((m) => m.role === "user")?.content ?? "",
              },
            }}
            className="inline-block bg-black text-white rounded px-4 py-2 text-sm"
          >
            Book this repair
          </Link>
        </div>
      )}
    </div>
  );
}
