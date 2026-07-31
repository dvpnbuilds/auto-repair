import {getTranslations} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {isAdminAuthed} from "@/lib/admin/auth";
import {formatCurrency} from "@/lib/formatting";
import {getActiveShop} from "@/lib/shop-config";
import {
  DASHBOARD_RANGES,
  loadDashboardMetrics,
  parseDashboardRange,
} from "@/lib/dashboard/metrics";
import {supabaseService} from "@/lib/supabase/server";
import {LockIcon} from "../../components/Icons";
import AdminSectionNav from "../AdminSectionNav";
import PasscodeForm from "../PasscodeForm";
import DashboardShopSwitcher from "./DashboardShopSwitcher";

const STATUS_COLORS = {
  booked: "bg-[#4b8ed7]",
  in_progress: "bg-[#087f78]",
  waiting_parts: "bg-[#d39045]",
  ready: "bg-[#7b70c9]",
  done: "bg-[#55a06a]",
} as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{range?: string}>;
}) {
  const t = await getTranslations("Dashboard");
  const admin = await getTranslations("Admin");
  const common = await getTranslations("Common");
  const authed = await isAdminAuthed();

  if (!authed) {
    return (
      <div className="page-shell">
        <div className="surface mx-auto max-w-md p-6 sm:p-8">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#dff2ee] text-[#087f78]">
            <LockIcon className="size-5" />
          </span>
          <p className="eyebrow mt-6">{admin("loginEyebrow")}</p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#173744]">
            {admin("loginTitle")}
          </h1>
          <p className="mb-7 mt-3 text-sm leading-6 text-[#60727a]">
            {admin("loginHint")}
          </p>
          <PasscodeForm />
        </div>
      </div>
    );
  }

  const range = parseDashboardRange((await searchParams).range);
  const shop = await getActiveShop(supabaseService);
  const {data: shops, error: shopsError} = await supabaseService
    .from("autoshop_shops")
    .select("shop_key, name, country, currency")
    .order("shop_key", {ascending: false});
  if (shopsError) {
    return <div className="page-shell status-message">{t("loadError")}</div>;
  }

  let metrics;
  try {
    metrics = await loadDashboardMetrics(supabaseService, shop.id, range);
  } catch (error) {
    console.error("Dashboard metrics failed:", error);
    return <div className="page-shell status-message">{t("loadError")}</div>;
  }

  const valueRange = `${formatCurrency(
    metrics.estimated_booked_value.minimum,
    shop
  )}–${formatCurrency(metrics.estimated_booked_value.maximum, shop)}`;
  const ticketRange = `${formatCurrency(
    metrics.estimated_average_ticket.minimum,
    shop
  )}–${formatCurrency(metrics.estimated_average_ticket.maximum, shop)}`;
  const periodStart = new Intl.DateTimeFormat(shop.locale, {
    dateStyle: "medium",
    timeZone: shop.timezone,
  }).format(new Date(metrics.period_start));
  const periodEnd = new Intl.DateTimeFormat(shop.locale, {
    dateStyle: "medium",
    timeZone: shop.timezone,
  }).format(new Date());
  const maxStatusCount = Math.max(
    1,
    ...Object.values(metrics.jobs_by_status)
  );
  const maxWorkload = Math.max(
    1,
    metrics.current_unassigned_jobs,
    ...metrics.technician_workload.map((item) => item.active_jobs)
  );

  return (
    <div className="page-shell-wide">
      <AdminSectionNav
        active="dashboard"
        boardLabel={admin("navBoard")}
        dashboardLabel={admin("navDashboard")}
      />

      <header className="grid gap-6 border-b border-[#dce5e3] pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="page-title-compact">
            {t("title", {shopName: shop.name})}
          </h1>
          <p className="page-lede">{t("intro")}</p>
        </div>
        <DashboardShopSwitcher
          activeShopKey={shop.shop_key}
          shops={shops ?? []}
        />
      </header>

      <section
        aria-labelledby="dashboard-period"
        className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p id="dashboard-period" className="text-sm font-bold text-[#173744]">
            {t("periodLabel", {start: periodStart, end: periodEnd})}
          </p>
          <p className="mt-1 text-xs text-[#718187]">{t("periodHint")}</p>
        </div>
        <div className="inline-flex self-start rounded-xl border border-[#dce5e3] bg-white p-1">
          {DASHBOARD_RANGES.map((days) => (
            <Link
              key={days}
              href={{pathname: "/admin/dashboard", query: {range: days}}}
              aria-current={range === days ? "page" : undefined}
              className={`rounded-lg px-3.5 py-2 text-sm font-bold ${
                range === days
                  ? "bg-[#087f78] text-white"
                  : "text-[#60727a] hover:bg-[#edf5f3]"
              }`}
            >
              {t("rangeDays", {days})}
            </Link>
          ))}
        </div>
      </section>

      {metrics.jobs_total === 0 && (
        <section className="mb-6 rounded-2xl border border-[#d7e4e1] bg-[#f7fbfa] p-6">
          <p className="font-bold text-[#173744]">{t("emptyTitle")}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60727a]">
            {t("emptyHint", {days: range})}
          </p>
        </section>
      )}

      <section
        aria-label={t("summaryLabel")}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <article className="rounded-2xl bg-[#173744] p-6 text-white sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#a8d9d2]">
            {t("estimatedBookedValue")}
          </p>
          <p className="mt-4 text-2xl font-semibold tracking-[-0.04em]">
            {valueRange}
          </p>
          <p className="mt-3 text-xs leading-5 text-[#c7d7dc]">
            {t("estimateDisclaimer")}
          </p>
        </article>
        <article className="surface-flat p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#718187]">
            {t("jobsBooked")}
          </p>
          <p className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-[#173744]">
            {metrics.jobs_total}
          </p>
          <p className="mt-2 text-xs text-[#718187]">{t("withinPeriod")}</p>
        </article>
        <article className="surface-flat p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#718187]">
            {t("estimatedAverageTicket")}
          </p>
          <p className="mt-4 text-xl font-semibold tracking-[-0.04em] text-[#173744]">
            {ticketRange}
          </p>
          <p className="mt-2 text-xs text-[#718187]">{t("estimateDisclaimer")}</p>
        </article>
        <article className="surface-flat p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#718187]">
            {t("remindersSent")}
          </p>
          <p className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-[#173744]">
            {metrics.reminders_sent}
          </p>
          <p className="mt-2 text-xs text-[#718187]">{t("withinPeriod")}</p>
        </article>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="surface p-6 sm:p-8" aria-labelledby="job-status-title">
          <div>
            <p className="eyebrow">{t("jobsEyebrow")}</p>
            <h2 id="job-status-title" className="text-xl font-semibold tracking-[-0.03em] text-[#173744]">
              {t("jobsByStatus")}
            </h2>
          </div>
          <div className="mt-7 space-y-5">
            {Object.entries(metrics.jobs_by_status).map(([status, count]) => (
              <div key={status}>
                <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                  <span className="font-bold text-[#29434d]">
                    {common(`status.${status}`)}
                  </span>
                  <span className="tabular-nums text-[#60727a]">{count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#e9efed]">
                  <div
                    className={`h-full rounded-full ${STATUS_COLORS[status as keyof typeof STATUS_COLORS]}`}
                    style={{width: `${(count / maxStatusCount) * 100}%`}}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="surface p-6 sm:p-8" aria-labelledby="conversion-title">
          <p className="eyebrow">{t("customerJourneyEyebrow")}</p>
          <h2 id="conversion-title" className="text-xl font-semibold tracking-[-0.03em] text-[#173744]">
            {t("customerJourney")}
          </h2>
          <div className="mt-7 space-y-8">
            <RateBlock
              label={t("intakeConversion")}
              rate={metrics.intake_conversion.rate}
              locale={shop.locale}
              detail={t("intakeConversionDetail", {
                booked: metrics.intake_conversion.booked,
                completed: metrics.intake_conversion.completed,
              })}
            />
            <RateBlock
              label={t("approvalAcceptance")}
              rate={metrics.approval_acceptance.rate}
              locale={shop.locale}
              detail={t("approvalAcceptanceDetail", {
                approved: metrics.approval_acceptance.approved,
                decided: metrics.approval_acceptance.decided,
              })}
            />
          </div>
        </section>
      </div>

      <section className="surface mt-6 p-6 sm:p-8" aria-labelledby="workload-title">
        <div className="max-w-2xl">
          <p className="eyebrow">{t("workloadEyebrow")}</p>
          <h2 id="workload-title" className="text-xl font-semibold tracking-[-0.03em] text-[#173744]">
            {t("workloadTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#60727a]">
            {t("workloadHint")}
          </p>
        </div>
        <div className="mt-7 grid gap-x-10 gap-y-5 md:grid-cols-2">
          {metrics.technician_workload.map((technician) => (
            <WorkloadRow
              key={technician.id}
              name={technician.name}
              count={technician.active_jobs}
              maximum={maxWorkload}
              jobsLabel={t("activeJobs", {count: technician.active_jobs})}
            />
          ))}
          <WorkloadRow
            name={t("unassigned")}
            count={metrics.current_unassigned_jobs}
            maximum={maxWorkload}
            jobsLabel={t("activeJobs", {count: metrics.current_unassigned_jobs})}
            muted
          />
        </div>
      </section>
    </div>
  );
}

function RateBlock({
  label,
  rate,
  detail,
  locale,
}: {
  label: string;
  rate: number;
  detail: string;
  locale: string;
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <p className="font-bold text-[#29434d]">{label}</p>
        <p className="text-2xl font-semibold tracking-[-0.04em] text-[#173744]">
          {rate.toLocaleString(locale, {maximumFractionDigits: 1})}%
        </p>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e9efed]">
        <div
          className="h-full rounded-full bg-[#6bc2b5]"
          style={{width: `${Math.min(100, rate)}%`}}
        />
      </div>
      <p className="mt-2 text-xs leading-5 text-[#718187]">{detail}</p>
    </div>
  );
}

function WorkloadRow({
  name,
  count,
  maximum,
  jobsLabel,
  muted = false,
}: {
  name: string;
  count: number;
  maximum: number;
  jobsLabel: string;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-[#29434d]">{name}</span>
        <span className="text-[#60727a]">{jobsLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#e9efed]">
        <div
          className={`h-full rounded-full ${muted ? "bg-[#a8b6b8]" : "bg-[#087f78]"}`}
          style={{width: `${(count / maximum) * 100}%`}}
        />
      </div>
    </div>
  );
}
