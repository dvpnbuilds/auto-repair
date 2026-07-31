import type {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {formatCurrency} from "@/lib/formatting";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseAnon} from "@/lib/supabase/client";
import {
  ArrowRightIcon,
  CalendarIcon,
  CarIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon,
  PhoneIcon,
  SearchIcon,
  WrenchIcon,
} from "./components/Icons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Home");
  const shop = await getActiveShop();
  return {
    title: t("metadataTitle", {shopName: shop.name}),
    description: shop.tagline,
  };
}

export default async function Home() {
  const t = await getTranslations("Home");
  const common = await getTranslations("Common");
  const shop = await getActiveShop();
  const {data: services, error: servicesError} = await supabaseAnon
    .from("autoshop_services")
    .select("id, name, category, price_min, price_max, duration_minutes")
    .eq("shop_id", shop.id)
    .order("category")
    .order("name")
    .limit(3);
  const phoneHref = `tel:${shop.phone.replace(/[^\d+]/g, "")}`;

  const journey = [
    {
      href: "/intake" as const,
      number: "01",
      title: t("journeyEstimateTitle"),
      description: t("journeyEstimateDescription"),
      action: t("journeyEstimateCta"),
      icon: SearchIcon,
    },
    {
      href: "/book" as const,
      number: "02",
      title: t("journeyBookTitle"),
      description: t("journeyBookDescription"),
      action: t("journeyBookCta"),
      icon: CalendarIcon,
    },
    {
      href: "/track" as const,
      number: "03",
      title: t("journeyTrackTitle"),
      description: t("journeyTrackDescription"),
      action: t("journeyTrackCta"),
      icon: CarIcon,
    },
  ];

  return (
    <>
      <section className="home-hero">
        <div className="page-shell grid gap-12 !pb-16 !pt-12 lg:grid-cols-[1.06fr_0.94fr] lg:items-center lg:gap-16 lg:!pb-24 lg:!pt-20">
          <div className="max-w-3xl">
            <p className="eyebrow">{t("eyebrow", {shopName: shop.name})}</p>
            <h1 className="page-title">{shop.tagline}</h1>
            <p className="page-lede">
              {t("intro", {shopName: shop.name})}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/intake" className="button-primary">
                {t("primaryCta")}
                <ArrowRightIcon className="size-4" />
              </Link>
              <Link href="/book" className="button-secondary">
                <CalendarIcon className="size-4" />
                {t("secondaryCta")}
              </Link>
            </div>
            <ul className="mt-8 grid gap-3 text-sm text-[#52676f] sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <CheckIcon className="size-4 shrink-0 text-[#087f78]" />
                {t("benefitPlainLanguage")}
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon className="size-4 shrink-0 text-[#087f78]" />
                {t("benefitLivePrices")}
              </li>
            </ul>
          </div>

          <aside className="service-desk" aria-label={t("serviceDeskLabel")}>
            <div className="service-desk-grid" aria-hidden="true" />
            <div className="relative z-10 flex h-full flex-col">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.17em] text-[#a8d9d2]">
                    {t("serviceDeskEyebrow")}
                  </p>
                  <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">
                    {shop.name}
                  </p>
                </div>
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#f3ad62] text-[#173744] shadow-[0_12px_28px_rgba(0,0,0,0.16)]">
                  <WrenchIcon className="size-6" />
                </span>
              </div>

              <div className="my-8 flex min-h-48 items-center justify-center sm:min-h-56">
                <svg
                  viewBox="0 0 560 260"
                  className="w-full max-w-[520px]"
                  aria-hidden="true"
                >
                  <path
                    d="M52 222h456"
                    stroke="#7fb7af"
                    strokeDasharray="4 12"
                    strokeLinecap="round"
                    strokeWidth="3"
                  />
                  <path
                    d="M119 168h325c20 0 36 16 36 36v13H82v-13c0-20 17-36 37-36Z"
                    fill="#f8fbfa"
                  />
                  <path
                    d="m136 168 39-70c8-14 23-23 39-23h124c16 0 31 9 39 23l39 70"
                    fill="#d9eeea"
                    stroke="#f8fbfa"
                    strokeWidth="8"
                  />
                  <path
                    d="M189 103h176l27 61H162Z"
                    fill="#8ecbc1"
                  />
                  <path d="M276 103v61" stroke="#f8fbfa" strokeWidth="6" />
                  <circle cx="152" cy="211" r="32" fill="#0d2934" />
                  <circle cx="152" cy="211" r="13" fill="#c9e7e2" />
                  <circle cx="411" cy="211" r="32" fill="#0d2934" />
                  <circle cx="411" cy="211" r="13" fill="#c9e7e2" />
                  <path
                    d="M105 193h68M390 193h66"
                    stroke="#f3ad62"
                    strokeLinecap="round"
                    strokeWidth="9"
                  />
                  <path
                    d="M55 86h70M90 51v70M435 67h72"
                    stroke="#7fb7af"
                    strokeLinecap="round"
                    strokeWidth="4"
                  />
                </svg>
              </div>

              <dl className="grid gap-4 border-t border-white/15 pt-5 sm:grid-cols-2">
                <div className="flex gap-3">
                  <ClockIcon className="mt-0.5 size-4 shrink-0 text-[#f3ad62]" />
                  <div>
                    <dt className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#a8d9d2]">
                      {t("hoursLabel")}
                    </dt>
                    <dd className="mt-1 text-sm leading-5 text-white/90">
                      {shop.hours}
                    </dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <PhoneIcon className="mt-0.5 size-4 shrink-0 text-[#f3ad62]" />
                  <div>
                    <dt className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#a8d9d2]">
                      {t("phoneLabel")}
                    </dt>
                    <dd className="mt-1 text-sm text-white/90">
                      <a className="hover:text-white hover:underline" href={phoneHref}>
                        {shop.phone}
                      </a>
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </section>

      <section className="bg-[#173744] text-white">
        <div className="page-shell !py-16 lg:!py-20">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="eyebrow home-eyebrow-light">{t("servicesEyebrow")}</p>
              <h2 className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                {t("servicesTitle")}
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-[#c7d7dc]">
                {t("servicesIntro")}
              </p>
            </div>
            <Link
              href="/services"
              className="flex items-center gap-2 self-start text-sm font-bold text-[#a8d9d2] hover:text-white sm:self-auto"
            >
              {t("viewAllServices")}
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>

          {servicesError ? (
            <p className="mt-8 rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-[#e9f1f1]">
              {t("servicesLoadError")}
            </p>
          ) : (
            <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/15 lg:grid-cols-3">
              {(services ?? []).map((service, index) => (
                <li
                  key={service.id}
                  className={`flex min-h-72 flex-col p-6 sm:p-7 ${
                    index === 0 ? "bg-[#f4eee3] text-[#173744]" : "bg-[#1d4553]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span
                      className={`text-[0.68rem] font-bold uppercase tracking-[0.14em] ${
                        index === 0 ? "text-[#876b48]" : "text-[#a8d9d2]"
                      }`}
                    >
                      {service.category}
                    </span>
                    <span
                      className={`flex items-center gap-1.5 text-xs ${
                        index === 0 ? "text-[#60727a]" : "text-[#c7d7dc]"
                      }`}
                    >
                      <ClockIcon className="size-4" />
                      {t("duration", {minutes: service.duration_minutes})}
                    </span>
                  </div>
                  <h3 className="mt-10 text-xl font-semibold tracking-[-0.03em]">
                    {service.name}
                  </h3>
                  <p
                    className={`mt-3 text-lg font-semibold ${
                      index === 0 ? "text-[#087f78]" : "text-white"
                    }`}
                  >
                    {formatCurrency(service.price_min, shop)}–
                    {formatCurrency(service.price_max, shop)}
                  </p>
                  <p
                    className={`mt-2 text-xs leading-5 ${
                      index === 0 ? "text-[#60727a]" : "text-[#b8cbd0]"
                    }`}
                  >
                    {common("initialEstimateDisclaimer")}
                  </p>
                  <Link
                    href={{
                      pathname: "/book",
                      query: {service_name: service.name},
                    }}
                    className={`mt-auto flex items-center gap-2 pt-8 text-sm font-bold ${
                      index === 0
                        ? "text-[#087f78] hover:text-[#06665f]"
                        : "text-[#a8d9d2] hover:text-white"
                    }`}
                  >
                    {t("bookService")}
                    <ArrowRightIcon className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="page-shell !py-20 lg:!py-28">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <div className="max-w-lg">
            <p className="eyebrow">{t("journeyEyebrow")}</p>
            <h2 className="text-3xl font-semibold tracking-[-0.045em] text-[#173744] sm:text-4xl">
              {t("journeyTitle")}
            </h2>
            <p className="mt-5 text-base leading-7 text-[#60727a]">
              {t("journeyIntro", {shopName: shop.name})}
            </p>
          </div>

          <ol className="border-t border-[#cfdcda]">
            {journey.map(({href, number, title, description, action, icon: Icon}) => (
              <li
                key={href}
                className="grid gap-5 border-b border-[#cfdcda] py-7 sm:grid-cols-[3rem_1fr_auto] sm:items-center"
              >
                <span className="font-mono text-xs font-bold text-[#087f78]">
                  {number}
                </span>
                <div className="flex gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#dff2ee] text-[#087f78]">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold tracking-[-0.02em] text-[#173744]">
                      {title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-[#60727a]">
                      {description}
                    </p>
                  </div>
                </div>
                <Link
                  href={href}
                  className="ml-16 flex items-center gap-2 text-sm font-bold text-[#087f78] hover:text-[#06665f] sm:ml-0"
                >
                  {action}
                  <ArrowRightIcon className="size-4" />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="page-shell !pb-20 !pt-0 lg:!pb-28">
        <div className="overflow-hidden rounded-[2rem] border border-[#dfd8ca] bg-[#f4eee3]">
          <div className="grid lg:grid-cols-[1fr_0.72fr]">
            <div className="p-7 sm:p-10 lg:p-12">
              <p className="eyebrow">{t("visitEyebrow")}</p>
              <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.045em] text-[#173744] sm:text-4xl">
                {t("visitTitle", {shopName: shop.name})}
              </h2>
              <div className="mt-8 grid gap-5 text-sm text-[#52676f] sm:grid-cols-2">
                <div className="flex gap-3">
                  <MapPinIcon className="mt-0.5 size-5 shrink-0 text-[#087f78]" />
                  <div>
                    <p className="font-bold text-[#29434d]">{t("addressLabel")}</p>
                    <p className="mt-1 leading-6">{shop.address}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <ClockIcon className="mt-0.5 size-5 shrink-0 text-[#087f78]" />
                  <div>
                    <p className="font-bold text-[#29434d]">{t("hoursLabel")}</p>
                    <p className="mt-1 leading-6">{shop.hours}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center bg-[#e4d8c3] p-7 sm:p-10 lg:p-12">
              <p className="text-sm leading-6 text-[#5f594f]">{t("visitPrompt")}</p>
              <Link href="/book" className="button-primary mt-6">
                {t("visitBookCta")}
                <ArrowRightIcon className="size-4" />
              </Link>
              <Link
                href="/track"
                className="mt-4 flex min-h-11 items-center justify-center gap-2 text-sm font-bold text-[#173744] hover:text-[#087f78]"
              >
                {t("visitTrackCta")}
                <CarIcon className="size-4" />
              </Link>
              <a
                href={phoneHref}
                aria-label={t("callShop", {phone: shop.phone})}
                className="mt-6 text-center text-sm font-semibold text-[#52676f] hover:text-[#173744] hover:underline"
              >
                {shop.phone}
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
