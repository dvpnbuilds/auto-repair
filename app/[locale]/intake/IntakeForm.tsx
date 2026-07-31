"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {formatCurrency} from "@/lib/formatting";
import type {ShopConfig} from "@/lib/shop-config";
import {
  ArrowRightIcon,
  CheckIcon,
  MessageIcon,
  SearchIcon,
  WrenchIcon,
} from "../components/Icons";

type ChatMessage = {role: "user" | "assistant"; content: string};

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

export default function IntakeForm({shop}: {shop: ShopConfig}) {
  const t = useTranslations("Intake");
  const common = useTranslations("Common");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageDone | null>(null);
  const examples = [t("exampleNoise"), t("exampleWarning"), t("exampleStart")];

  async function send(nextMessages: ChatMessage[], forceFinal = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({messages: nextMessages, forceFinal}),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      if (data.status === "ask") {
        setMessages([...nextMessages, {role: "assistant", content: data.question}]);
      } else {
        setResult(data);
      }
    } catch {
      setError(t("requestError"));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent, forceFinal = false) {
    e.preventDefault();
    if (!input.trim()) return;
    const nextMessages: ChatMessage[] = [...messages, {role: "user", content: input}];
    setMessages(nextMessages);
    setInput("");
    void send(nextMessages, forceFinal);
  }

  return (
    <div className="page-shell">
      <header className="mb-10 max-w-3xl">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="page-title-compact">{t("title")}</h1>
        <p className="page-lede">{t("intro")}</p>
      </header>

      {!result ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_19rem] lg:items-start">
          <div className="surface overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[#e3eae8] px-5 py-4 sm:px-7">
              <span className="grid size-9 place-items-center rounded-full bg-[#dff2ee] text-[#087f78]">
                <MessageIcon className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#173744]">{t("conversationTitle")}</h2>
                <p className="text-xs text-[#718187]">{t("conversationHint")}</p>
              </div>
            </div>

            <div className="min-h-44 space-y-4 px-5 py-6 sm:px-7">
              {messages.length === 0 && (
                <div className="mx-auto max-w-md py-4 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f5f1e9] text-[#876b48]">
                    <WrenchIcon className="size-5" />
                  </span>
                  <p className="mt-4 text-sm leading-6 text-[#60727a]">{t("emptyConversation")}</p>
                </div>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                      message.role === "user"
                        ? "rounded-br-md bg-[#087f78] text-white"
                        : "rounded-bl-md bg-[#edf5f3] text-[#29434d]"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="border-t border-[#e3eae8] bg-[#fbfdfc] p-5 sm:p-7">
              <label className="field-label">
                {t("messageLabel")}
                <textarea
                  className="field-control min-h-28 resize-y"
                  placeholder={t("placeholder")}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={loading}
                />
              </label>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="button-primary"
                >
                  {loading ? t("sending") : t("send")}
                  {!loading && <ArrowRightIcon className="size-4" />}
                </button>
                <button
                  type="button"
                  disabled={loading || !input.trim()}
                  onClick={(event) => handleSubmit(event, true)}
                  className="button-secondary"
                >
                  {t("estimateNow")}
                </button>
              </div>
              {error && (
                <p role="alert" className="status-message mt-4">
                  {error}
                </p>
              )}
            </form>
          </div>

          <aside className="surface-flat p-5 lg:sticky lg:top-28">
            <span className="grid size-11 place-items-center rounded-xl bg-[#dff2ee] text-[#087f78]">
              <SearchIcon className="size-5" />
            </span>
            <h2 className="mt-5 text-lg font-bold text-[#173744]">{t("examplesTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-[#60727a]">{t("examplesHint")}</p>
            <div className="mt-5 flex flex-col gap-2">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setInput(example)}
                  disabled={loading}
                  className="rounded-xl border border-[#dce5e3] bg-[#fbfdfc] px-3 py-3 text-left text-xs font-medium leading-5 text-[#52676f] hover:border-[#a8cec7] hover:bg-[#edf5f3]"
                >
                  {example}
                </button>
              ))}
            </div>
          </aside>
        </div>
      ) : (
        <div className="surface mx-auto max-w-3xl overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[#cfe3df] bg-[#edf7f5] px-6 py-5 sm:px-8">
            <span className="grid size-10 place-items-center rounded-full bg-white text-[#087f78]">
              <CheckIcon className="size-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#087f78]">
                {t("resultReady")}
              </p>
              <h2 className="font-bold text-[#173744]">{t("probableIssue")}</h2>
            </div>
          </div>
          <div className="p-6 sm:p-8">
            <p className="text-xl font-semibold tracking-[-0.025em] text-[#173744]">
              {result.probable_issue}
            </p>
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-[#f4f7f6] p-4">
                <div className="text-xs font-semibold text-[#718187]">{t("urgency")}</div>
                <div className="mt-1 font-bold text-[#29434d]">
                  {t(`urgencyLevel.${result.urgency}`)}
                </div>
              </div>
              <div className="rounded-xl bg-[#f4f7f6] p-4">
                <div className="text-xs font-semibold text-[#718187]">{t("suggestedService")}</div>
                <div className="mt-1 font-bold text-[#29434d]">
                  {result.service_name ?? common("needsInspection")}
                </div>
              </div>
              <div className="rounded-xl bg-[#f4f7f6] p-4">
                <div className="text-xs font-semibold text-[#718187]">{t("estimate")}</div>
                <div className="mt-1 font-bold text-[#29434d]">
                  {result.needs_inspection ||
                  result.estimate_min === null ||
                  result.estimate_max === null
                    ? common("needsInspection")
                    : `${formatCurrency(result.estimate_min, shop)} – ${formatCurrency(
                        result.estimate_max,
                        shop
                      )}`}
                </div>
              </div>
            </div>
            <p className="mt-5 text-xs leading-5 text-[#718187]">
              {common("initialEstimateDisclaimer")}
            </p>
            <Link
              href={{
                pathname: "/book",
                query: {
                  service_name: result.service_name ?? "",
                  probable_issue: result.probable_issue,
                  urgency: result.urgency,
                  issue_description:
                    messages.find((message) => message.role === "user")?.content ?? "",
                },
              }}
              className="button-primary mt-7"
            >
              {t("bookRepair")}
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
