import {getTranslations} from "next-intl/server";

export default async function Loading() {
  const t = await getTranslations("Booking");
  return <div className="page-shell text-sm text-[#60727a]">{t("loading")}</div>;
}
