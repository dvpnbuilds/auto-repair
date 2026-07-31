import type {Metadata} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import {hasLocale, NextIntlClientProvider} from "next-intl";
import {getMessages, getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {routing} from "@/i18n/routing";
import {getActiveShop} from "@/lib/shop-config";
import SiteHeader from "./components/SiteHeader";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{locale: string}>;
}): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Metadata"});

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}>) {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const shop = await getActiveShop();
  const phoneHref = `tel:${shop.phone.replace(/[^\d+]/g, "")}`;

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider messages={messages}>
          <SiteHeader shopName={shop.name} />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[#dce5e3] bg-white/70">
            <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-6 text-xs text-[#718187] sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span>{shop.name}</span>
              <div className="flex flex-col gap-1 sm:items-end">
                <span>{shop.address}</span>
                <a className="hover:text-[#173744] hover:underline" href={phoneHref}>
                  {shop.phone}
                </a>
              </div>
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
