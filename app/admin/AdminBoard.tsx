"use client";

import { useState } from "react";
import { STATUS_ORDER, nextStatus, type JobStatus } from "@/lib/statuses";
import type { MessageKind } from "@/lib/openrouter/messages";

type Job = {
  id: string;
  customer_name: string;
  plate_number: string;
  vehicle: string;
  probable_issue: string | null;
  status: JobStatus;
  scheduled_at: string | null;
};

type Message = {
  id: string;
  job_id: string;
  kind: MessageKind;
  body: string;
  sent: boolean;
  created_at: string;
};

const STATUS_LABEL: Record<JobStatus, string> = {
  booked: "Booked",
  in_progress: "In progress",
  waiting_parts: "Waiting parts",
  ready: "Ready",
  done: "Done",
};

const KIND_LABEL: Record<MessageKind, string> = {
  status_update: "Status update",
  completion_report: "Completion report",
  reminder: "Reminder",
  review_request: "Review request",
};

export default function AdminBoard({
  jobs: initialJobs,
  messages: initialMessages,
}: {
  jobs: Job[];
  messages: Message[];
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [messages, setMessages] = useState(initialMessages);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function upsertMessage(message: Message) {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === message.id);
      if (idx === -1) return [message, ...prev];
      const copy = [...prev];
      copy[idx] = message;
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to advance status");
      setJobs((prev) => prev.map((j) => (j.id === job.id ? data.job : j)));
      if (data.message) upsertMessage(data.message);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to advance status");
    } finally {
      setBusy(null);
    }
  }

  async function generateDraft(jobId: string, kind: MessageKind) {
    setBusy(`${jobId}:${kind}`);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate draft");
      upsertMessage(data.message);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate draft");
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editedBody ? { body: editedBody } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send message");
      upsertMessage(data.message);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      {STATUS_ORDER.map((status) => (
        <div key={status} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-600">{STATUS_LABEL[status]}</h2>
          {jobs
            .filter((j) => j.status === status)
            .map((job) => {
              const jobMessages = messages.filter((m) => m.job_id === job.id);
              const next = nextStatus(job.status);
              return (
                <div key={job.id} className="border border-black/10 rounded p-3 text-sm flex flex-col gap-2">
                  <div className="font-medium">{job.customer_name}</div>
                  <div className="text-zinc-600">
                    {job.vehicle} — {job.plate_number}
                  </div>
                  {job.probable_issue && <div className="text-zinc-600">{job.probable_issue}</div>}

                  {next && (
                    <button
                      onClick={() => advance(job)}
                      disabled={busy === job.id}
                      className="bg-black text-white rounded px-2 py-1 text-xs w-fit disabled:opacity-50"
                    >
                      {busy === job.id ? "Moving..." : `Advance to ${STATUS_LABEL[next]}`}
                    </button>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {(["completion_report", "reminder", "review_request"] as MessageKind[]).map((kind) => (
                      <button
                        key={kind}
                        onClick={() => generateDraft(job.id, kind)}
                        disabled={busy === `${job.id}:${kind}`}
                        className="border border-black/20 rounded px-2 py-1 text-xs disabled:opacity-50"
                      >
                        {busy === `${job.id}:${kind}` ? "Drafting..." : `Draft ${KIND_LABEL[kind]}`}
                      </button>
                    ))}
                  </div>

                  {jobMessages.length > 0 && (
                    <div className="flex flex-col gap-2 mt-1">
                      {jobMessages.map((m) => (
                        <div key={m.id} className="border-t border-black/10 pt-2">
                          <div className="text-xs text-zinc-600 mb-1">
                            {KIND_LABEL[m.kind]} — {m.sent ? "sent" : "draft"}
                          </div>
                          <textarea
                            defaultValue={m.body}
                            disabled={m.sent}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                            className="w-full border border-black/20 rounded px-2 py-1 text-xs disabled:bg-black/5"
                            rows={3}
                          />
                          {!m.sent && (
                            <button
                              onClick={() => sendMessage(m)}
                              disabled={busy === `send:${m.id}`}
                              className="mt-1 bg-black text-white rounded px-2 py-1 text-xs disabled:opacity-50"
                            >
                              {busy === `send:${m.id}` ? "Sending..." : "Send"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
