import {getTranslations} from "next-intl/server";
import {formatCurrency} from "@/lib/formatting";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseAnon} from "@/lib/supabase/client";

export default async function ServicesPage() {
  const t = await getTranslations("Services");
  const shop = await getActiveShop();
  const {data: services, error} = await supabaseAnon
    .from("autoshop_services")
    .select("*")
    .eq("shop_id", shop.id)
    .order("category");

  if (error) {
    return <div className="px-6 py-12">{t("loadError")}</div>;
  }

  return (
    <div className="px-6 py-12 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">{t("title")}</h1>
      {services && services.length === 0 && (
        <p className="text-sm text-zinc-600">{t("empty")}</p>
      )}
      <ul className="divide-y divide-black/10">
        {services?.map((service) => (
          <li key={service.id} className="py-3 flex justify-between">
            <div>
              <div className="font-medium">{service.name}</div>
              <div className="text-sm text-zinc-600">{service.category}</div>
            </div>
            <div className="text-right text-sm">
              <div>
                {formatCurrency(service.price_min, shop)} –{" "}
                {formatCurrency(service.price_max, shop)}
              </div>
              <div className="text-zinc-600">
                {t("duration", {minutes: service.duration_minutes})}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
