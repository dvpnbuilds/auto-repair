import {getTranslations} from "next-intl/server";
import {formatCurrency} from "@/lib/formatting";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseAnon} from "@/lib/supabase/client";

export default async function JobsPage() {
  const t = await getTranslations("Jobs");
  const common = await getTranslations("Common");
  const shop = await getActiveShop();
  const {data: jobs, error} = await supabaseAnon
    .from("autoshop_jobs")
    .select("*")
    .eq("shop_id", shop.id)
    .order("created_at", {ascending: false});

  if (error) {
    return <div className="px-6 py-12">{t("loadError")}</div>;
  }

  return (
    <div className="px-6 py-12 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">{t("title")}</h1>
      {jobs && jobs.length === 0 && (
        <p className="text-sm text-zinc-600">{t("empty")}</p>
      )}
      <ul className="divide-y divide-black/10">
        {jobs?.map((job) => (
          <li key={job.id} className="py-3">
            <div className="flex justify-between">
              <div className="font-medium">
                {job.customer_name} — {job.plate_number}
              </div>
              <span className="text-sm px-2 py-0.5 rounded bg-black/5">
                {common(`status.${job.status}`)}
              </span>
            </div>
            <div className="text-sm text-zinc-600">{job.vehicle}</div>
            {job.probable_issue && (
              <div className="text-sm mt-1">
                {job.probable_issue}
                {job.estimate_min && job.estimate_max && (
                  <span className="text-zinc-600">
                    {" "}
                    · {formatCurrency(job.estimate_min, shop)}–
                    {formatCurrency(job.estimate_max, shop)} (
                    {common("initialEstimateDisclaimer")})
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
