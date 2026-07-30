import {getTranslations} from "next-intl/server";

export default async function Loading() {
  const t = await getTranslations("Common");
  return <div className="px-6 py-12 text-sm text-zinc-500">{t("loading")}</div>;
}
