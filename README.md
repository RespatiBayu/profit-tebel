# Profit Tebel

App Next.js untuk analisis profit marketplace, iklan, dan ROAS seller Shopee/TikTok Shop.

## Environment setup

Copy `.env.example` ke `.env.local`, lalu isi semua value yang dibutuhkan.

Field analytics yang baru:

- `NEXT_PUBLIC_GA_MEASUREMENT_ID`: Measurement ID Google Analytics 4, format `G-XXXXXXXXXX`
- `NEXT_PUBLIC_CLARITY_PROJECT_ID`: Project ID Microsoft Clarity

Kalau dua env di atas belum diisi, script analytics tidak akan dimuat sehingga aman untuk local/dev environment yang belum siap tracking.

## Analytics setup

Integrasi yang sudah dipasang:

- Google Analytics 4 via `gtag.js` global di root layout
- Microsoft Clarity via script global di root layout
- Event penting untuk auth, navigasi dashboard, upload data, paywall checkout, manajemen toko, reset data, dan recalculate HPP

Verifikasi setelah deploy:

1. Pastikan pageview muncul di GA4 Realtime.
2. Pastikan session baru muncul di Clarity dashboard / Recordings.
3. Coba flow login, upload, dan checkout lalu cek custom event di GA4 serta smart/API events di Clarity.

Catatan privasi:

- Clarity secara default mem-mask konten sensitif, tapi tetap pastikan kebijakan privasi/cookie banner aplikasi kamu sudah sesuai kebutuhan bisnis dan regulasi target user.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
