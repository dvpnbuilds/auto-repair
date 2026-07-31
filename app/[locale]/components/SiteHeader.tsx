"use client";

import {useTranslations} from "next-intl";
import {Link, usePathname} from "@/i18n/navigation";
import {
  CalendarIcon,
  CarIcon,
  HomeIcon,
  LockIcon,
  SearchIcon,
  WrenchIcon,
} from "./Icons";

const items = [
  {href: "/", label: "home", icon: HomeIcon},
  {href: "/intake", label: "estimate", icon: SearchIcon},
  {href: "/services", label: "services", icon: WrenchIcon},
  {href: "/book", label: "book", icon: CalendarIcon},
  {href: "/track", label: "track", icon: CarIcon},
] as const;

export default function SiteHeader({shopName}: {shopName: string}) {
  const t = useTranslations("Navigation");
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[#dce5e3]/90 bg-[#f6f8f7]/92 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3 sm:px-6 lg:flex-nowrap">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none"
          aria-label={t("brandHome", {shopName})}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#087f78] text-white shadow-[0_8px_20px_rgba(8,127,120,0.18)]">
            <WrenchIcon className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-[-0.02em] text-[#173744]">
              {shopName}
            </span>
            <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#708288]">
              {t("brandLabel")}
            </span>
          </span>
        </Link>

        <nav
          aria-label={t("primaryNavigation")}
          className="no-scrollbar order-3 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1 overflow-x-auto px-1 pb-0.5 lg:order-none lg:mx-auto lg:w-auto lg:overflow-visible lg:px-0"
        >
          {items.map(({href, label, icon: Icon}) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
                  active
                    ? "bg-[#dff2ee] text-[#06665f]"
                    : "text-[#52676f] hover:bg-white hover:text-[#173744]"
                }`}
              >
                <Icon className="size-4" />
                {t(label)}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/admin"
          aria-current={pathname.startsWith("/admin") ? "page" : undefined}
          className={`ml-auto flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${
            pathname.startsWith("/admin")
              ? "border-[#a8cec7] bg-[#dff2ee] text-[#06665f]"
              : "border-[#d6e0de] bg-white text-[#52676f] hover:border-[#a8cec7] hover:text-[#173744]"
          }`}
        >
          <LockIcon className="size-4" />
          {t("admin")}
        </Link>
      </div>
    </header>
  );
}
