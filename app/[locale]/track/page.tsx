import {getTranslations} from "next-intl/server";
import {formatCurrency, formatDateTime} from "@/lib/formatting";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseAnon} from "@/lib/supabase/client";

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{[key: string]: string | string[] | undefined}>;
}) {
  const t = await getTranslations("Tracking");
  const common = await getTranslations("Common");
  const params = await searchParams;
  const shop = await getActiveShop();
  const plate = typeof params.plate === "string" ? params.plate.trim() : "";
  const phone = typeof params.phone === "string" ? params.phone.trim() : "";
  const searched = plate.length > 0 && phone.length > 0;

  let job: Record<string, unknown> | null = null;
  let history: {id: string; status: string; note: string | null; created_at: string}[] = [];
  let shopMessages: {id: string; kind: string; body: string; created_at: string}[] = [];
  let notFound = false;

  if (searched) {
    const {data: jobData, error} = await supabaseAnon
      .from("autoshop_jobs")
      .select("*")
      .eq("shop_id", shop.id)
      .ilike("plate_number", plate)
      .eq("phone", phone)
      .order("created_at", {ascending: false})
      .limit(1)
      .maybeSingle();

    if (error) {
      return <div className="px-6 py-12">{t("lookupError")}</div>;
    }

    if (!jobData) {
      notFound = true;
    } else {
      job = jobData;
      const {data: historyData, error: historyError} = await supabaseAnon
        .from("autoshop_status_history")
        .select("*")
        .eq("job_id", jobData.id)
        .order("created_at", {ascending: true});

      if (historyError) {
        return <div className="px-6 py-12">{t("historyError")}</div>;
      }
      history = historyData ?? [];

      const {data: messagesData, error: messagesError} = await supabaseAnon
        .from("autoshop_messages")
        .select("id, kind, body, created_at")
        .eq("job_id", jobData.id)
        .in("kind", ["status_update", "completion_report"])
        .order("created_at", {ascending: false});

      if (messagesError) {
        return <div className="px-6 py-12">{t("messagesError")}</div>;
      }
      shopMessages = messagesData ?? [];
    }
  }

  return (
    <div className="px-6 py-12 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">{t("title")}</h1>
      <p className="text-sm text-zinc-600 mb-6">{t("intro")}</p>

      <form method="get" className="flex flex-col gap-3 mb-8">
        <label className="text-sm flex flex-col gap-1">
          {t("plateNumber")}
          <input
            name="plate"
            defaultValue={plate}
            className="border border-black/20 rounded px-3 py-2"
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          {t("phone")}
          <input
            name="phone"
            defaultValue={phone}
            className="border border-black/20 rounded px-3 py-2"
          />
        </label>
        <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm w-fit">
          {t("track")}
        </button>
      </form>

      {notFound && <p className="text-sm text-red-600">{t("notFound")}</p>}

      {job && (
        <div className="border border-black/10 rounded p-6">
          <div className="flex justify-between mb-4">
            <div>
              <div className="font-medium">{job.customer_name as string}</div>
              <div className="text-sm text-zinc-600">
                {job.vehicle as string} — {job.plate_number as string}
              </div>
            </div>
            <span className="text-sm px-2 py-0.5 rounded bg-black/5 h-fit">
              {common(`status.${job.status as string}`)}
            </span>
          </div>

          {job.probable_issue ? (
            <div className="text-sm mb-4">
              <div className="text-zinc-600">{t("probableIssue")}</div>
              <div>{job.probable_issue as string}</div>
              {Boolean(job.estimate_min) && Boolean(job.estimate_max) ? (
                <div className="text-zinc-600">
                  {formatCurrency(job.estimate_min as number, shop)}–
                  {formatCurrency(job.estimate_max as number, shop)} (
                  {common("initialEstimateDisclaimer")})
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="text-sm text-zinc-600 mb-2">{t("statusTimeline")}</div>
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.id} className="text-sm border-l-2 border-black/10 pl-3">
                <div className="font-medium">{common(`status.${entry.status}`)}</div>
                <div className="text-zinc-600">{formatDateTime(entry.created_at, shop)}</div>
                {entry.note && <div className="text-zinc-600">{entry.note}</div>}
              </li>
            ))}
          </ul>

          {shopMessages.length > 0 && (
            <>
              <div className="text-sm text-zinc-600 mt-6 mb-2">{t("shopMessages")}</div>
              <ul className="space-y-2">
                {shopMessages.map((message) => (
                  <li key={message.id} className="text-sm border-l-2 border-black/10 pl-3">
                    <div className="text-zinc-600">
                      {formatDateTime(message.created_at, shop)}
                    </div>
                    <div>{message.body}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
