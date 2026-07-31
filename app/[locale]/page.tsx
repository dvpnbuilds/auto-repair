import {getTranslations} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {getActiveShop} from "@/lib/shop-config";
import {
  ArrowRightIcon,
  CalendarIcon,
  CarIcon,
  CheckIcon,
  ClockIcon,
  MessageIcon,
  SearchIcon,
  ShieldIcon,
  WrenchIcon,
} from "./components/Icons";

export default async function Home() {
  const t = await getTranslations("Home");
  const shop = await getActiveShop();

  const actions = [
    {
      href: "/intake" as const,
      title: t("actionEstimateTitle"),
      description: t("actionEstimateDescription"),
      action: t("actionEstimateCta"),
      icon: SearchIcon,
    },
    {
      href: "/book" as const,
      title: t("actionBookTitle"),
      description: t("actionBookDescription"),
      action: t("actionBookCta"),
      icon: CalendarIcon,
    },
    {
      href: "/track" as const,
      title: t("actionTrackTitle"),
      description: t("actionTrackDescription"),
      action: t("actionTrackCta"),
      icon: CarIcon,
    },
  ];

  return (
    <>
      <section className="page-shell grid items-center gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16">
        <div>
          <p className="eyebrow">{t("eyebrow", {shopName: shop.name})}</p>
          <h1 className="page-title">{t("title")}</h1>
          <p className="page-lede">{t("intro")}</p>
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
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#52676f]">
            <li className="flex items-center gap-2">
              <CheckIcon className="size-4 text-[#087f78]" />
              {t("benefitEstimate")}
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon className="size-4 text-[#087f78]" />
              {t("benefitBooking")}
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon className="size-4 text-[#087f78]" />
              {t("benefitUpdates")}
            </li>
          </ul>
        </div>

        <div
          className="relative min-h-[410px] overflow-hidden rounded-[2rem] border border-[#cfe1dd] bg-[#e7f3f0] p-6 shadow-[0_28px_70px_rgba(31,77,86,0.12)] sm:min-h-[500px] sm:p-10"
          aria-hidden="true"
        >
          <div className="absolute -right-16 -top-16 size-64 rounded-full border-[42px] border-white/55" />
          <div className="absolute bottom-0 left-0 h-1/3 w-full bg-gradient-to-t from-[#d6eae5] to-transparent" />
          <div className="relative flex h-full min-h-[360px] flex-col justify-between sm:min-h-[420px]">
            <div className="flex items-center justify-between">
              <span className="grid size-12 place-items-center rounded-2xl bg-white text-[#087f78] shadow-sm">
                <WrenchIcon className="size-6" />
              </span>
              <span className="flex items-center gap-2 rounded-full border border-white bg-white/80 px-3 py-2 text-xs font-bold text-[#416068] shadow-sm">
                <span className="size-2 rounded-full bg-[#55ad73]" />
                {t("illustrationOpen")}
              </span>
            </div>
            <div className="relative mx-auto w-full max-w-[460px]">
              <svg viewBox="0 0 520 260" className="w-full text-[#173744]">
                <path
                  d="M71 170c7-30 21-68 40-93 10-13 23-21 40-24 76-13 152-13 228 0 17 3 30 11 40 24 19 25 33 63 40 93"
                  fill="#fff"
                  stroke="currentColor"
                  strokeWidth="5"
                />
                <path
                  d="M126 91c93-15 185-15 278 0l29 72H97Z"
                  fill="#cce9e3"
                  stroke="currentColor"
                  strokeWidth="5"
                />
                <path
                  d="M163 91 144 161M357 91l19 70"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  d="M73 168h374c18 0 33 15 33 33v25H40v-25c0-18 15-33 33-33Z"
                  fill="#fff"
                  stroke="currentColor"
                  strokeWidth="5"
                />
                <path d="M205 193h110" stroke="#087f78" strokeWidth="7" />
                <circle cx="112" cy="218" r="28" fill="#173744" />
                <circle cx="112" cy="218" r="12" fill="#dff2ee" />
                <circle cx="408" cy="218" r="28" fill="#173744" />
                <circle cx="408" cy="218" r="12" fill="#dff2ee" />
                <path d="M57 198h69M394 198h69" stroke="#f3ad62" strokeWidth="8" />
              </svg>
              <div className="absolute -bottom-4 left-1/2 flex w-[88%] -translate-x-1/2 items-center justify-around rounded-2xl border border-white bg-white/90 px-4 py-3 text-[#087f78] shadow-[0_14px_35px_rgba(23,55,68,0.12)] backdrop-blur">
                <MessageIcon className="size-5" />
                <span className="h-px w-10 bg-[#bedbd5]" />
                <ClockIcon className="size-5" />
                <span className="h-px w-10 bg-[#bedbd5]" />
                <ShieldIcon className="size-5" />
              </div>
            </div>
            <div className="flex justify-between gap-4 text-xs font-semibold text-[#526f76]">
              <span>{t("illustrationEstimate")}</span>
              <span>{t("illustrationUpdates")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#dce5e3] bg-white/65">
        <div className="page-shell !py-16">
          <div className="mb-8 max-w-2xl">
            <p className="eyebrow">{t("actionsEyebrow")}</p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#173744] sm:text-4xl">
              {t("actionsTitle")}
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {actions.map(({href, title, description, action, icon: Icon}) => (
              <Link
                key={href}
                href={href}
                className="group surface-flat flex min-h-64 flex-col p-6 hover:-translate-y-1 hover:border-[#a8cec7] hover:shadow-[0_18px_45px_rgba(28,63,72,0.09)] sm:p-7"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-[#dff2ee] text-[#087f78]">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-8 text-xl font-semibold tracking-[-0.025em] text-[#173744]">
                  {title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-[#60727a]">
                  {description}
                </p>
                <span className="mt-6 flex items-center gap-2 text-sm font-bold text-[#087f78]">
                  {action}
                  <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
