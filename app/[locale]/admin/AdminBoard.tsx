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
  technician_id: string | null;
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

type Technician = {
  id: string;
  name: string;
};

type Service = {
  id: string;
  name: string;
  price_min: number;
  price_max: number;
  priceLabel: string;
};

type Approval = {
  id: string;
  job_id: string;
  description: string;
  amount: number;
  status: "pending" | "approved" | "declined" | "expired";
  expires_at: string;
};

type ApprovalDraft = {
  serviceId: string;
  amount: string;
  description: string;
  idempotencyKey: string;
};

type JobPhoto = {
  id: string;
  job_id: string;
  signedUrl: string;
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
  technicians,
  services,
  approvals: initialApprovals,
  jobPhotos,
}: {
  jobs: Job[];
  messages: Message[];
  activeShopKey: string;
  shops: ShopOption[];
  technicians: Technician[];
  services: Service[];
  approvals: Approval[];
  jobPhotos: JobPhoto[];
}) {
  const t = useTranslations("Admin");
  const common = useTranslations("Common");
  const [jobs, setJobs] = useState(initialJobs);
  const [messages, setMessages] = useState(initialMessages);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [approvals, setApprovals] = useState(initialApprovals);
  const [approvalDrafts, setApprovalDrafts] = useState<
    Record<string, ApprovalDraft>
  >({});

  const filteredJobs = jobs.filter((job) => {
    if (technicianFilter === "all") return true;
    if (technicianFilter === "unassigned") return job.technician_id === null;
    return job.technician_id === technicianFilter;
  });

  function statusLabel(status: JobStatus) {
    return common(`status.${status}`);
  }

  function kindLabel(kind: MessageKind) {
    return common(`messageKind.${kind}`);
  }

  function approvalDraft(jobId: string): ApprovalDraft {
    const service = services[0];
    return (
      approvalDrafts[jobId] ?? {
        serviceId: service?.id ?? "",
        amount: service ? String(service.price_min) : "",
        description: "",
        idempotencyKey: crypto.randomUUID(),
      }
    );
  }

  function updateApprovalDraft(
    jobId: string,
    update: Partial<ApprovalDraft>
  ) {
    setApprovalDrafts((previous) => ({
      ...previous,
      [jobId]: {...approvalDraft(jobId), ...update},
    }));
  }

  async function requestApproval(job: Job) {
    const draft = approvalDraft(job.id);
    const amount = Number(draft.amount);
    if (!draft.serviceId || !draft.description.trim() || !Number.isInteger(amount)) {
      alert(t("approvalRequiredError"));
      return;
    }
    const busyKey = `approval:${job.id}`;
    setBusy(busyKey);
    try {
      const res = await fetch(`/api/admin/jobs/${job.id}/approvals`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          idempotencyKey: draft.idempotencyKey,
          serviceId: draft.serviceId,
          description: draft.description.trim(),
          amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApprovals((previous) => [data.approval, ...previous]);
      if (data.message) {
        upsertMessage({
          ...data.message,
          delivery_status: data.email?.delivery?.status,
        });
      }
      setApprovalDrafts((previous) => {
        const copy = {...previous};
        delete copy[job.id];
        return copy;
      });
    } catch (error) {
      alert(error instanceof Error && error.message ? error.message : t("approvalError"));
    } finally {
      setBusy(null);
    }
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

  async function assignTechnician(job: Job, technicianId: string) {
    const busyKey = `assign:${job.id}`;
    setBusy(busyKey);
    try {
      const res = await fetch(`/api/admin/jobs/${job.id}/technician`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          technicianId: technicianId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setJobs((previous) =>
        previous.map((item) => (item.id === job.id ? data.job : item))
      );
    } catch {
      alert(t("assignmentError"));
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

      <section
        aria-labelledby="technician-filter-title"
        className="surface-flat mb-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5"
      >
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-[#087f78]">
            {t("workloadEyebrow")}
          </p>
          <h2
            id="technician-filter-title"
            className="text-lg font-bold tracking-[-0.025em] text-[#173744]"
          >
            {t("technicianFilterTitle")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#60727a]">
            {t("technicianFilterHint")}
          </p>
        </div>
        <label className="field-label w-full sm:max-w-xs">
          {t("filterByTechnician")}
          <select
            value={technicianFilter}
            onChange={(event) => setTechnicianFilter(event.target.value)}
            className="field-control"
          >
            <option value="all">{t("allTechnicians")}</option>
            <option value="unassigned">{t("unassigned")}</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.name}
              </option>
            ))}
          </select>
        </label>
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
                {filteredJobs.filter((job) => job.status === status).length}
              </span>
            </div>
            {filteredJobs.filter((job) => job.status === status).length ===
              0 && (
              <p className="rounded-xl border border-dashed border-[#cfdcda] bg-white/35 px-3 py-8 text-center text-xs text-[#829196]">
                {t("noJobs")}
              </p>
            )}
            {filteredJobs
              .filter((job) => job.status === status)
              .map((job) => {
                const jobMessages = messages.filter((message) => message.job_id === job.id);
                const pendingApproval = approvals.find(
                  (approval) =>
                    approval.job_id === job.id && approval.status === "pending"
                );
                const photosForJob = jobPhotos.filter(
                  (photo) => photo.job_id === job.id
                );
                const next = nextStatus(job.status);
                const canRequestApproval =
                  job.status === "in_progress" || job.status === "waiting_parts";
                const approvalForm = approvalDraft(job.id);
                return (
                  <div
                    key={job.id}
                    data-testid={`job-card-${job.id}`}
                    className="flex min-w-0 flex-col gap-3 rounded-xl border border-[#dce5e3] bg-white p-4 text-sm shadow-[0_7px_20px_rgba(28,63,72,0.05)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-bold text-[#173744]">{job.customer_name}</div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded-md px-2 py-1 text-[0.65rem] font-bold ${STATUS_STYLES[status].badge}`}>
                          {statusLabel(status)}
                        </span>
                        {pendingApproval && (
                          <span className="rounded-md bg-[#fff0cc] px-2 py-1 text-[0.65rem] font-bold text-[#805613]">
                            {t("approvalPending")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="break-words text-[#60727a]">
                      {job.vehicle} · {job.plate_number}
                    </div>
                    {job.probable_issue && (
                      <div className="rounded-lg bg-[#f4f7f6] px-3 py-2 text-xs leading-5 text-[#52676f]">
                        {job.probable_issue}
                      </div>
                    )}

                    {photosForJob.length > 0 && (
                      <div>
                        <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-[#718187]">
                          {t("intakePhotos")}
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {photosForJob.map((photo, index) => (
                            <a
                              key={photo.id}
                              href={photo.signedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="aspect-square overflow-hidden rounded-lg border border-[#dce5e3] bg-[#edf2f1] focus-visible:outline"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photo.signedUrl}
                                alt={t("jobPhotoAlt", {
                                  vehicle: job.vehicle,
                                  number: index + 1,
                                })}
                                width={160}
                                height={160}
                                className="size-full object-cover transition-transform hover:scale-[1.03]"
                              />
                            </a>
                          ))}
                        </div>
                        <p className="mt-2 text-[0.68rem] leading-5 text-[#718187]">
                          {t("photoLinkHint")}
                        </p>
                      </div>
                    )}

                    <label className="field-label !gap-1 !text-xs">
                      {t("assignedTechnician")}
                      <select
                        value={job.technician_id ?? ""}
                        onChange={(event) =>
                          assignTechnician(job, event.target.value)
                        }
                        disabled={busy === `assign:${job.id}`}
                        className="field-control !min-h-10 !px-2.5 !py-1.5 !text-xs"
                      >
                        <option value="">{t("unassigned")}</option>
                        {technicians.map((technician) => (
                          <option key={technician.id} value={technician.id}>
                            {technician.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    {next && (
                      <button
                        onClick={() => advance(job)}
                        disabled={busy === job.id || Boolean(pendingApproval)}
                        className="button-primary !min-h-9 w-full !px-3 !py-1.5 !text-xs"
                      >
                        {busy === job.id
                          ? t("moving")
                          : t("advanceTo", {status: statusLabel(next)})}
                      </button>
                    )}

                    {canRequestApproval && !pendingApproval && services.length > 0 && (
                      <details
                        data-testid={`approval-form-${job.id}`}
                        className="rounded-xl border border-[#d4e3df] bg-[#f7fbfa] p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-[#087f78]">
                          {t("requestExtraWork")}
                        </summary>
                        <div className="mt-3 space-y-3">
                          <label className="field-label !text-xs">
                            {t("approvalService")}
                            <select
                              value={approvalForm.serviceId}
                              onChange={(event) => {
                                const service = services.find(
                                  (item) => item.id === event.target.value
                                );
                                updateApprovalDraft(job.id, {
                                  serviceId: event.target.value,
                                  amount: service ? String(service.price_min) : "",
                                });
                              }}
                              className="field-control !min-h-10 !text-xs"
                            >
                              {services.map((service) => (
                                <option key={service.id} value={service.id}>
                                  {service.name} · {service.priceLabel}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field-label !text-xs">
                            {t("approvalAmount")}
                            <input
                              type="number"
                              min={services.find((item) => item.id === approvalForm.serviceId)?.price_min}
                              max={services.find((item) => item.id === approvalForm.serviceId)?.price_max}
                              step="1"
                              value={approvalForm.amount}
                              onChange={(event) =>
                                updateApprovalDraft(job.id, {amount: event.target.value})
                              }
                              className="field-control !min-h-10 !text-xs"
                            />
                          </label>
                          <label className="field-label !text-xs">
                            {t("technicianFinding")}
                            <textarea
                              value={approvalForm.description}
                              maxLength={1000}
                              rows={3}
                              placeholder={t("technicianFindingPlaceholder")}
                              onChange={(event) =>
                                updateApprovalDraft(job.id, {
                                  description: event.target.value,
                                })
                              }
                              className="field-control !min-h-20 !text-xs"
                            />
                          </label>
                          <p className="text-[0.7rem] leading-5 text-[#718187]">
                            {t("approvalEmailHint")}
                          </p>
                          <button
                            type="button"
                            onClick={() => requestApproval(job)}
                            disabled={busy === `approval:${job.id}`}
                            className="button-primary w-full !min-h-10 !text-xs"
                          >
                            {busy === `approval:${job.id}`
                              ? t("preparingApproval")
                              : t("sendApprovalRequest")}
                          </button>
                        </div>
                      </details>
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
