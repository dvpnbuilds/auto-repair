"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {STATUS_ORDER, nextStatus, type JobStatus} from "@/lib/statuses";
import type {MessageKind} from "@/lib/openrouter/messages";

type Job = {
  id: string;
  customer_name: string;
  plate_number: string;
  vehicle: string;
  probable_issue: string | null;
  status: JobStatus;
  scheduled_at: string | null;
};

export type Message = {
  id: string;
  job_id: string;
  kind: MessageKind;
  body: string;
  sent: boolean;
  created_at: string;
  delivery_status?: "pending" | "sent" | "failed" | "capped" | "reconciling";
};

type ShopOption = {
  shop_key: string;
  name: string;
  country: string;
  currency: string;
  is_active: boolean;
};

const DRAFT_KINDS: MessageKind[] = [
  "completion_report",
  "reminder",
  "review_request",
];

export default function AdminBoard({
  jobs: initialJobs,
  messages: initialMessages,
  activeShopKey,
  shops,
}: {
  jobs: Job[];
  messages: Message[];
  activeShopKey: string;
  shops: ShopOption[];
}) {
  const t = useTranslations("Admin");
  const common = useTranslations("Common");
  const [jobs, setJobs] = useState(initialJobs);
  const [messages, setMessages] = useState(initialMessages);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function statusLabel(status: JobStatus) {
    return common(`status.${status}`);
  }

  function kindLabel(kind: MessageKind) {
    return common(`messageKind.${kind}`);
  }

  async function resetDemoData() {
    if (!confirm(t("resetConfirm"))) return;
    setBusy("reset");
    try {
      const res = await fetch("/api/admin/reset", {method: "POST"});
      if (!res.ok) throw new Error();
      window.location.reload();
    } catch {
      alert(t("resetError"));
    } finally {
      setBusy(null);
    }
  }

  async function switchShop(shopKey: string) {
    if (shopKey === activeShopKey) return;
    setBusy(`shop:${shopKey}`);
    try {
      const res = await fetch("/api/admin/shop", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({shopKey}),
      });
      if (!res.ok) throw new Error();
      window.location.reload();
    } catch {
      alert(t("switchError"));
      setBusy(null);
    }
  }

  function upsertMessage(message: Message) {
    setMessages((previous) => {
      const index = previous.findIndex((item) => item.id === message.id);
      if (index === -1) return [message, ...previous];
      const copy = [...previous];
      copy[index] = message;
      return copy;
    });
  }

  async function advance(job: Job) {
    const next = nextStatus(job.status);
    if (!next) return;
    setBusy(job.id);
    try {
      const res = await fetch(`/api/admin/jobs/${job.id}/status`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({status: next, expectedStatus: job.status}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setJobs((previous) =>
        previous.map((item) => (item.id === job.id ? data.job : item))
      );
      if (data.message) {
        upsertMessage({
          ...data.message,
          delivery_status: data.email?.delivery?.status,
        });
      }
    } catch {
      alert(t("advanceError"));
    } finally {
      setBusy(null);
    }
  }

  async function generateDraft(jobId: string, kind: MessageKind) {
    setBusy(`${jobId}:${kind}`);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/draft`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({kind}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      upsertMessage({
        ...data.message,
        delivery_status: data.email?.delivery?.status,
      });
    } catch {
      alert(t("draftError"));
    } finally {
      setBusy(null);
    }
  }

  async function sendMessage(message: Message) {
    setBusy(`send:${message.id}`);
    try {
      const editedBody = drafts[message.id];
      const res = await fetch(`/api/admin/messages/${message.id}/send`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(editedBody ? {body: editedBody} : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      upsertMessage({
        ...data.message,
        delivery_status: data.email?.delivery?.status,
      });
    } catch {
      alert(t("sendError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <section
        aria-labelledby="demo-market-title"
        className="mb-8 grid gap-5 rounded-2xl bg-zinc-950 p-5 text-white shadow-sm sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"
      >
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            {t("activeShop")}
          </p>
          <h2 id="demo-market-title" className="text-xl font-semibold tracking-tight">
            {t("demoMarket")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
            {t("demoMarketHint")}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2" aria-label={t("shopOptions")}>
            {shops.map((shop) => {
              const selected = shop.shop_key === activeShopKey;
              const switching = busy === `shop:${shop.shop_key}`;
              return (
                <button
                  key={shop.shop_key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => switchShop(shop.shop_key)}
                  disabled={selected || busy !== null}
                  className={`min-h-20 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-default ${
                    selected
                      ? "border-amber-300 bg-amber-300 text-zinc-950"
                      : "border-white/15 bg-white/[0.04] text-white hover:border-white/35 hover:bg-white/[0.08] disabled:opacity-55"
                  }`}
                >
                  <span className="block text-sm font-semibold">{shop.name}</span>
                  <span
                    className={`mt-1 block text-xs ${
                      selected ? "text-zinc-700" : "text-zinc-400"
                    }`}
                  >
                    {switching
                      ? t("switching")
                      : t("shopRegion", {
                          country: shop.country,
                          currency: shop.currency,
                        })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="border-t border-white/10 pt-5 lg:max-w-xs lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="mb-3 text-sm leading-6 text-zinc-400">
            {t("resetHint")}
          </p>
          <button
            type="button"
            onClick={resetDemoData}
            disabled={busy !== null}
            className="min-h-11 w-full rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-50 lg:w-auto"
          >
            {busy === "reset" ? t("resetting") : t("reset")}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {STATUS_ORDER.map((status) => (
          <section key={status} className="flex min-w-0 flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-600">
              {statusLabel(status)}
            </h2>
            {jobs.filter((job) => job.status === status).length === 0 && (
              <p className="rounded-xl border border-dashed border-black/10 px-3 py-6 text-center text-xs text-zinc-400">
                {t("noJobs")}
              </p>
            )}
            {jobs
              .filter((job) => job.status === status)
              .map((job) => {
                const jobMessages = messages.filter((message) => message.job_id === job.id);
                const next = nextStatus(job.status);
                return (
                  <div
                    key={job.id}
                    className="flex min-w-0 flex-col gap-2 rounded-xl border border-black/10 bg-white p-4 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                  >
                    <div className="font-medium">{job.customer_name}</div>
                    <div className="break-words text-zinc-600">
                      {job.vehicle} — {job.plate_number}
                    </div>
                    {job.probable_issue && (
                      <div className="text-zinc-600">{job.probable_issue}</div>
                    )}

                    {next && (
                      <button
                        onClick={() => advance(job)}
                        disabled={busy === job.id}
                        className="min-h-9 w-fit rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
                      >
                        {busy === job.id
                          ? t("moving")
                          : t("advanceTo", {status: statusLabel(next)})}
                      </button>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {DRAFT_KINDS.map((kind) => (
                        <button
                          key={kind}
                          onClick={() => generateDraft(job.id, kind)}
                          disabled={busy === `${job.id}:${kind}`}
                          className="min-h-9 rounded-lg border border-black/20 px-3 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
                        >
                          {busy === `${job.id}:${kind}`
                            ? t("drafting")
                            : t("draftKind", {kind: kindLabel(kind)})}
                        </button>
                      ))}
                    </div>

                    {jobMessages.length > 0 && (
                      <div className="flex flex-col gap-2 mt-1">
                        {jobMessages.map((message) => (
                          <div key={message.id} className="border-t border-black/10 pt-3">
                            <div className="text-xs text-zinc-600 mb-1">
                              {t("messageState", {
                                kind: kindLabel(message.kind),
                                state: message.sent
                                  ? t("sent")
                                  : message.delivery_status === "pending"
                                    ? t("queued")
                                    : message.delivery_status === "failed"
                                      ? t("failed")
                                      : message.delivery_status === "reconciling"
                                        ? t("reconciling")
                                      : message.delivery_status === "capped"
                                        ? t("capped")
                                        : t("draft"),
                              })}
                            </div>
                            <textarea
                              defaultValue={message.body}
                              disabled={message.sent || Boolean(message.delivery_status)}
                              onChange={(event) =>
                                setDrafts((previous) => ({
                                  ...previous,
                                  [message.id]: event.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-black/20 px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:bg-black/5"
                              rows={3}
                            />
                            {!message.sent && !message.delivery_status && (
                              <button
                                onClick={() => sendMessage(message)}
                                disabled={busy === `send:${message.id}`}
                                className="mt-2 min-h-9 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
                              >
                                {busy === `send:${message.id}` ? t("sending") : t("send")}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </section>
        ))}
      </div>
    </div>
  );
}
