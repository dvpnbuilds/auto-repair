export const ACTIVE_REMINDER_DELIVERY_STATUSES = [
  "pending",
  "sent",
  "reconciling",
] as const;

type ReminderJob = {id: string};
type ReminderDelivery = {
  job_id: string;
  status: string;
};

export function planReminderJobs<T extends ReminderJob>(
  jobs: T[],
  deliveries: ReminderDelivery[]
): T[] {
  const activeJobIds = new Set(
    deliveries
      .filter((delivery) =>
        ACTIVE_REMINDER_DELIVERY_STATUSES.includes(
          delivery.status as (typeof ACTIVE_REMINDER_DELIVERY_STATUSES)[number]
        )
      )
      .map((delivery) => delivery.job_id)
  );

  return jobs.filter((job) => !activeJobIds.has(job.id));
}
