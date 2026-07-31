import {getTranslations} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {formatCurrency} from "@/lib/formatting";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseAnon} from "@/lib/supabase/client";
import {ArrowRightIcon, ClockIcon, WrenchIcon} from "../components/Icons";

export default async function ServicesPage() {
  const t = await getTranslations("Services");
  const shop = await getActiveShop();
  const {data: services, error} = await supabaseAnon
    .from("autoshop_services")
    .select("*")
    .eq("shop_id", shop.id)
    .order("category");

  if (error) {
    return <div className="page-shell status-message">{t("loadError")}</div>;
  }

  return (
    <div className="page-shell">
      <header className="mb-10 grid gap-6 lg:grid-cols-[1fr_0.55fr] lg:items-end">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="page-title-compact">{t("title")}</h1>
          <p className="page-lede">{t("intro")}</p>
        </div>
        <div className="surface-flat flex items-start gap-3 p-4 text-sm leading-6 text-[#60727a]">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#dff2ee] text-[#087f78]">
            <WrenchIcon className="size-5" />
          </span>
          <p>{t("pricingNote")}</p>
        </div>
      </header>

      {services && services.length === 0 && (
        <div className="surface-flat px-6 py-12 text-center text-sm text-[#60727a]">
          {t("empty")}
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services?.map((service) => (
          <li key={service.id} className="surface-flat flex min-h-60 flex-col p-6">
            <div className="mb-8 flex items-start justify-between gap-4">
              <span className="rounded-lg bg-[#f5f1e9] px-2.5 py-1 text-xs font-bold uppercase tracking-[0.08em] text-[#76644f]">
                {service.category}
              </span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#718187]">
                <ClockIcon className="size-4 text-[#087f78]" />
                {t("duration", {minutes: service.duration_minutes})}
              </span>
            </div>
            <h2 className="text-lg font-semibold tracking-[-0.025em] text-[#173744]">
              {service.name}
            </h2>
            <p className="mt-2 text-sm text-[#60727a]">
              {formatCurrency(service.price_min, shop)} –{" "}
              {formatCurrency(service.price_max, shop)}
            </p>
            <Link
              href={{
                pathname: "/book",
                query: {service_name: service.name},
              }}
              className="mt-auto flex items-center gap-2 pt-8 text-sm font-bold text-[#087f78] hover:text-[#06665f]"
            >
              {t("bookService")}
              <ArrowRightIcon className="size-4" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
