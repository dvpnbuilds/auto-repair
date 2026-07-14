import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AutoShop Assistant",
  description: "RapidFix demo — AI-triaged repair intake and booking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-black/10 px-6 py-4 flex gap-6 items-center">
          <span className="font-semibold">RapidFix</span>
          <Link href="/" className="text-sm hover:underline">
            Home
          </Link>
          <Link href="/intake" className="text-sm hover:underline">
            Get Estimate
          </Link>
          <Link href="/services" className="text-sm hover:underline">
            Services
          </Link>
          <Link href="/jobs" className="text-sm hover:underline">
            Jobs
          </Link>
          <Link href="/book" className="text-sm hover:underline">
            Book
          </Link>
          <Link href="/track" className="text-sm hover:underline">
            Track
          </Link>
          <Link href="/admin" className="text-sm hover:underline">
            Admin
          </Link>
        </nav>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
