import {getTranslations} from "next-intl/server";
import {getActiveShop} from "@/lib/shop-config";
import TrackerLookup from "./TrackerLookup";

export default async function TrackPage() {
  const t = await getTranslations("Tracking");
  const shop = await getActiveShop();

  return (
    <div className="page-shell">
      <header className="mb-10 max-w-3xl">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="page-title-compact">{t("title")}</h1>
        <p className="page-lede">{t("intro")}</p>
      </header>
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
