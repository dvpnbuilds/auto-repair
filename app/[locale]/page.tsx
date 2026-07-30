import {getTranslations} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {getActiveShop} from "@/lib/shop-config";

export default async function Home() {
  const t = await getTranslations("Home");
  const shop = await getActiveShop();

  return (
    <div className="px-6 py-12 max-w-3xl">
      <h1 className="text-2xl font-semibold">{t("title", {shopName: shop.name})}</h1>
      <p className="mt-2 text-zinc-600">
        {t.rich("intro", {
          servicesLink: (chunks) => (
            <Link href="/services" className="underline">
              {chunks}
            </Link>
          ),
          jobsLink: (chunks) => (
            <Link href="/jobs" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
