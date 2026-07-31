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

const STATUS_STYLES: Record<JobStatus, {dot: string; badge: string}> = {
  booked: {
    dot: "bg-[#4b8ed7]",
    badge: "bg-[#eaf2fb] text-[#326ba6]",
  },
  in_progress: {
    dot: "bg-[#087f78]",
    badge: "bg-[#dff2ee] text-[#06665f]",
  },
  waiting_parts: {
    dot: "bg-[#d39045]",
    badge: "bg-[#fbf0df] text-[#8a5b24]",
  },
  ready: {
    dot: "bg-[#7b70c9]",
    badge: "bg-[#efedfb] text-[#5d52ac]",
  },
  done: {
    dot: "bg-[#55a06a]",
    badge: "bg-[#e8f5eb] text-[#367747]",
  },
};

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
        className="surface mb-8 grid gap-6 overflow-hidden p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end"
      >
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-[#087f78]">
            {t("activeShop")}
          </p>
          <h2 id="demo-market-title" className="text-xl font-bold tracking-[-0.025em] text-[#173744]">
            {t("demoMarket")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#60727a]">
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
                  className={`min-h-20 rounded-xl border px-4 py-3 text-left transition disabled:cursor-default ${
                    selected
                      ? "border-[#8ac4ba] bg-[#dff2ee] text-[#173744] shadow-[inset_0_0_0_1px_rgba(8,127,120,0.08)]"
                      : "border-[#dce5e3] bg-[#fbfdfc] text-[#29434d] hover:border-[#a8cec7] hover:bg-[#f3f9f7] disabled:opacity-55"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <span
                      className={`size-2 rounded-full ${
                        selected ? "bg-[#087f78]" : "bg-[#b7c5c2]"
                      }`}
                    />
                    {shop.name}
                  </span>
                  <span
                    className="mt-1 block pl-4 text-xs text-[#60727a]"
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
        <div className="rounded-xl bg-[#f5f1e9] p-4">
          <p className="mb-3 text-sm leading-6 text-[#6f6251]">
            {t("resetHint")}
          </p>
          <button
            type="button"
            onClick={resetDemoData}
            disabled={busy !== null}
            className="button-secondary w-full !border-[#dacbb8] !bg-white/70 !text-[#6f5333] hover:!bg-white"
          >
            {busy === "reset" ? t("resetting") : t("reset")}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {STATUS_ORDER.map((status) => (
          <section key={status} className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center justify-between rounded-xl border border-[#dce5e3] bg-white/70 px-3 py-2.5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#29434d]">
                <span className={`size-2 rounded-full ${STATUS_STYLES[status].dot}`} />
                {statusLabel(status)}
              </h2>
              <span className="grid min-w-6 place-items-center rounded-md bg-[#edf2f1] px-1.5 py-0.5 text-xs font-bold text-[#60727a]">
                {jobs.filter((job) => job.status === status).length}
              </span>
            </div>
            {jobs.filter((job) => job.status === status).length === 0 && (
              <p className="rounded-xl border border-dashed border-[#cfdcda] bg-white/35 px-3 py-8 text-center text-xs text-[#829196]">
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
                    className="flex min-w-0 flex-col gap-3 rounded-xl border border-[#dce5e3] bg-white p-4 text-sm shadow-[0_7px_20px_rgba(28,63,72,0.05)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-bold text-[#173744]">{job.customer_name}</div>
                      <span className={`rounded-md px-2 py-1 text-[0.65rem] font-bold ${STATUS_STYLES[status].badge}`}>
                        {statusLabel(status)}
                      </span>
                    </div>
                    <div className="break-words text-[#60727a]">
                      {job.vehicle} · {job.plate_number}
                    </div>
                    {job.probable_issue && (
                      <div className="rounded-lg bg-[#f4f7f6] px-3 py-2 text-xs leading-5 text-[#52676f]">
                        {job.probable_issue}
                      </div>
                    )}

                    {next && (
                      <button
                        onClick={() => advance(job)}
                        disabled={busy === job.id}
                        className="button-primary !min-h-9 w-full !px-3 !py-1.5 !text-xs"
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
                          className="min-h-9 rounded-lg border border-[#cbd9d6] bg-white px-3 py-1.5 text-xs font-semibold text-[#52676f] hover:border-[#93bbb4] hover:bg-[#edf5f3] disabled:opacity-50"
                        >
                          {busy === `${job.id}:${kind}`
                            ? t("drafting")
                            : t("draftKind", {kind: kindLabel(kind)})}
                        </button>
                      ))}
                    </div>

                    {jobMessages.length > 0 && (
                      <div className="mt-1 flex flex-col gap-2 rounded-xl bg-[#f8faf9] p-3">
                        {jobMessages.map((message) => (
                          <div key={message.id} className="border-t border-[#e0e8e6] pt-3 first:border-t-0 first:pt-0">
                            <div className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.06em] text-[#718187]">
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
                              className="field-control !min-h-20 !px-3 !py-2 !text-xs disabled:!bg-[#edf1f0]"
                              rows={3}
                            />
                            {!message.sent && !message.delivery_status && (
                              <button
                                onClick={() => sendMessage(message)}
                                disabled={busy === `send:${message.id}`}
                                className="button-primary mt-2 !min-h-9 !px-3 !py-1.5 !text-xs"
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
