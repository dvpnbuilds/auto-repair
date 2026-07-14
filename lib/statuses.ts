export const STATUS_ORDER = ["booked", "in_progress", "waiting_parts", "ready", "done"] as const;
export type JobStatus = (typeof STATUS_ORDER)[number];

export function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && (STATUS_ORDER as readonly string[]).includes(value);
}

export function nextStatus(current: JobStatus): JobStatus | null {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx === -1 || idx === STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[idx + 1];
}
