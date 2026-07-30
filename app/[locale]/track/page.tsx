import {getTranslations} from "next-intl/server";
import {getActiveShop} from "@/lib/shop-config";
import TrackerLookup from "./TrackerLookup";

export default async function TrackPage() {
  const t = await getTranslations("Tracking");
  const shop = await getActiveShop();

  return (
    <div className="px-6 py-12 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">{t("title")}</h1>
      <p className="text-sm text-zinc-600 mb-6">{t("intro")}</p>
      <TrackerLookup
        regional={{
          locale: shop.locale,
          currency: shop.currency,
          timezone: shop.timezone,
        }}
      />
    </div>
  );
}
