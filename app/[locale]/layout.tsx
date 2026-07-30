import type {Metadata} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import {hasLocale, NextIntlClientProvider} from "next-intl";
import {getMessages, getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {Link} from "@/i18n/navigation";
import {routing} from "@/i18n/routing";
import {getActiveShop} from "@/lib/shop-config";
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
  const t = await getTranslations("Navigation");
  const shop = await getActiveShop();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <nav className="border-b border-black/10 px-6 py-4 flex flex-wrap gap-x-6 gap-y-2 items-center">
            <span className="font-semibold">{shop.name}</span>
            <Link href="/" className="text-sm hover:underline">
              {t("home")}
            </Link>
            <Link href="/intake" className="text-sm hover:underline">
              {t("estimate")}
            </Link>
            <Link href="/services" className="text-sm hover:underline">
              {t("services")}
            </Link>
            <Link href="/jobs" className="text-sm hover:underline">
              {t("jobs")}
            </Link>
            <Link href="/book" className="text-sm hover:underline">
              {t("book")}
            </Link>
            <Link href="/track" className="text-sm hover:underline">
              {t("track")}
            </Link>
            <Link href="/admin" className="text-sm hover:underline">
              {t("admin")}
            </Link>
          </nav>
          <main className="flex-1">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
