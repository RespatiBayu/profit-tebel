import type { Metadata } from "next";
import { AnalyticsScripts } from '@/components/analytics/analytics-scripts'
import "./globals.css";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://profittebel.com'
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Profit Tebel — Analisis Profit Marketplace Shopee & TikTok Shop",
    template: "%s | Profit Tebel",
  },
  description:
    "Tau profit beneran, bukan cuma omzet. Upload laporan Shopee atau TikTok Shop, langsung dapat analisis profit, iklan, dan ROAS kalkulator.",
  keywords: [
    "analisis profit shopee",
    "kalkulator ROAS",
    "analisis iklan shopee",
    "profit toko online",
    "HPP marketplace",
    "seller shopee indonesia",
  ],
  authors: [{ name: "Profit Tebel" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: APP_URL,
    siteName: "Profit Tebel",
    title: "Profit Tebel — Tau Profit Beneran, Bukan Cuma Omzet",
    description:
      "Upload laporan Shopee atau TikTok Shop kamu, langsung dapat breakdown lengkap: profit bersih per produk, analisis iklan ROAS, dan simulasi budget.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Profit Tebel — Analisis Profit Marketplace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Profit Tebel — Tau Profit Beneran",
    description:
      "Analisis profit, iklan, dan ROAS untuk seller Shopee & TikTok Shop Indonesia.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="bg-background font-sans text-foreground antialiased">
        {children}
        <AnalyticsScripts
          gaMeasurementId={GA_MEASUREMENT_ID}
          clarityProjectId={CLARITY_PROJECT_ID}
        />
      </body>
    </html>
  );
}
