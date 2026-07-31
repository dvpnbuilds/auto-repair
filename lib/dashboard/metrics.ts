import "server-only";
import type {AppSupabaseClient} from "@/lib/supabase/schema";

export const DASHBOARD_RANGES = [7, 30, 90] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export type DashboardMetrics = {
  period_days: DashboardRange;
  period_start: string;
  jobs_total: number;
  jobs_by_status: Record<
    "booked" | "in_progress" | "waiting_parts" | "ready" | "done",
    number
  >;
  estimated_booked_value: {minimum: number; maximum: number};
  estimated_average_ticket: {minimum: number; maximum: number};
  intake_conversion: {completed: number; booked: number; rate: number};
  approval_acceptance: {decided: number; approved: number; rate: number};
  reminders_sent: number;
  technician_workload: Array<{id: string; name: string; active_jobs: number}>;
  current_unassigned_jobs: number;
};

export function parseDashboardRange(value: string | undefined): DashboardRange {
  const parsed = Number(value);
  return DASHBOARD_RANGES.includes(parsed as DashboardRange)
    ? (parsed as DashboardRange)
    : 30;
}

export async function loadDashboardMetrics(
  client: AppSupabaseClient,
  shopId: string,
  range: DashboardRange
): Promise<DashboardMetrics> {
  const {data, error} = await client.rpc("get_autoshop_dashboard_metrics", {
    p_shop_id: shopId,
    p_days: range,
  });
  if (error || !data || typeof data !== "object") {
    throw error ?? new Error("Dashboard metrics were not returned");
  }
  return data as DashboardMetrics;
}
