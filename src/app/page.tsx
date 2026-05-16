import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  BarChart3,
  Calculator,
  CheckCircle,
  ShieldCheck,
  Star,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Profit Tebel — Tau Profit Beneran, Bukan Cuma Omzet",
};

const featureCards = [
  {
    title: "Analisis Profit",
    icon: TrendingUp,
    tone: "bg-primary/10 text-primary",
    desc: "Upload laporan income Shopee dan langsung lihat omzet, fee marketplace, HPP, hingga profit bersih per produk.",
    items: [
      "Real profit setelah HPP, packaging, dan fee.",
      "Breakdown biaya yang rapi dan gampang discan.",
      "Produk rugi lebih cepat ketahuan.",
      "Trend harian dan mingguan siap pakai.",
    ],
  },
  {
    title: "Analisis Iklan",
    icon: BarChart3,
    tone: "bg-orange-100 text-orange-700",
    desc: "Tarik data Shopee Ads, lalu lihat kampanye mana yang layak di-scale, dioptimasi, atau dihentikan.",
    items: [
      "Traffic light untuk keputusan yang lebih cepat.",
      "True ROAS setelah HPP dan fee marketplace.",
      "CPA antar produk lebih gampang dibandingkan.",
      "Peluang budget bocor bisa langsung disorot.",
    ],
  },
  {
    title: "Kalkulator ROAS",
    icon: Calculator,
    tone: "bg-amber-100 text-amber-700",
    desc: "Simulasikan target ROAS, CPA, dan budget aman sebelum campaign dijalankan atau dinaikkan.",
    items: [
      "Preset fee otomatis biar input lebih cepat.",
      "Break-even ROAS terlihat dalam hitungan detik.",
      "Skenario budget lebih gampang diuji.",
      "Pas untuk planning campaign baru.",
    ],
  },
];

const steps = [
  {
    step: "1",
    title: "Upload File",
    desc: "Upload XLSX income atau CSV iklan dari Seller Center kamu.",
  },
  {
    step: "2",
    title: "Isi HPP",
    desc: "Masukkan harga pokok produk dan biaya packaging sekali saja.",
  },
  {
    step: "3",
    title: "Analisis",
    desc: "Langsung dapat dashboard profit, analisis iklan, dan rekomendasi.",
  },
];

const faqs = [
  {
    q: "Marketplace apa yang didukung?",
    a: "Shopee untuk laporan income XLSX dan iklan CSV. TikTok Shop tetap ada di roadmap berikutnya.",
  },
  {
    q: "Data saya aman?",
    a: "Ya. Data tersimpan aman dan hanya bisa diakses oleh akun kamu sendiri.",
  },
  {
    q: "Perlu install software?",
    a: "Tidak perlu. Profit Tebel berbasis web, cukup buka browser dan upload file.",
  },
  {
    q: "Bagaimana cara dapat file income XLSX dari Shopee?",
    a: "Buka Seller Center, masuk ke Keuangan, lalu unduh laporan dari Penghasilan Saya.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-[hsl(var(--brand-line)/0.75)] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[0_14px_30px_-22px_hsl(var(--primary)/0.9)]">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <span className="block font-heading text-base font-semibold">Profit Tebel</span>
              <span className="block text-[11px] text-muted-foreground">Analytics untuk seller</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Masuk</Button>
            </Link>
            <Link href="/login">
              <Button size="sm">Coba Gratis</Button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top,_rgba(255,131,67,0.24),_transparent_55%)]" />
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-14 lg:pb-20 lg:pt-20">
          <div>
            <Badge variant="secondary" className="mb-5 border-primary/10 bg-primary/10 px-3 py-1 text-primary">
              Khusus seller Shopee & TikTok Shop
            </Badge>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Tau profit beneran,
              <br />
              <span className="brand-text-gradient">bukan cuma omzet</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Upload laporan marketplace kamu, lalu lihat ringkasan profit, biaya,
              dan peluang optimasi dalam tampilan yang rapi, cepat, dan enak dibaca.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/login">
                <Button size="lg" className="w-full gap-2 sm:w-auto">
                  Mulai Analisis Sekarang
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Lihat Dashboard
                </Button>
              </Link>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: Store,
                  title: "Shopee-first",
                  desc: "Fokus untuk seller Indonesia",
                },
                {
                  icon: ShieldCheck,
                  title: "Clean & aman",
                  desc: "Data rapi dan akses terjaga",
                },
                {
                  icon: Wallet,
                  title: "Bayar sekali",
                  desc: "Tanpa biaya bulanan",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="brand-panel-soft rounded-2xl p-4">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <div className="brand-panel brand-grid rounded-[32px] p-6 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-primary">Preview Dashboard</p>
                  <p className="text-sm text-muted-foreground">Nuansa lebih bersih, fokus ke angka penting.</p>
                </div>
                <Badge variant="outline" className="bg-white/80">Seller-first</Badge>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/90 p-4 ring-1 ring-[hsl(var(--brand-line)/0.5)]">
                  <p className="text-sm text-muted-foreground">Profit Bersih</p>
                  <p className="mt-2 text-3xl font-extrabold text-foreground">Rp 14,8jt</p>
                  <p className="mt-2 text-sm text-primary">+18,6% dari periode lalu</p>
                </div>
                <div className="rounded-2xl bg-[hsl(var(--brand-surface))] p-4 ring-1 ring-[hsl(var(--brand-line)/0.45)]">
                  <p className="text-sm text-muted-foreground">Biaya Marketplace</p>
                  <p className="mt-2 text-3xl font-extrabold text-foreground">12,4%</p>
                  <p className="mt-2 text-sm text-muted-foreground">Semua fee langsung kebaca</p>
                </div>
              </div>

              <div className="mt-4 rounded-[24px] bg-white/88 p-4 ring-1 ring-[hsl(var(--brand-line)/0.5)]">
                <div className="mb-4 flex items-center justify-between">
                  <p className="font-semibold">Analisis cepat</p>
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-[#FDBA74] text-[#FDBA74]" />
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    "Produk profit tinggi langsung kelihatan tanpa bongkar Excel.",
                    "Kampanye iklan boros lebih cepat ketahuan.",
                    "ROAS aman bisa dicek sebelum budget dinaikkan.",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl bg-[hsl(var(--brand-surface))] px-3 py-3">
                      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <CheckCircle className="h-4 w-4" />
                      </div>
                      <p className="text-sm text-muted-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="absolute -bottom-5 left-4 hidden rounded-full bg-white px-4 py-2 text-sm font-medium text-foreground shadow-[0_20px_40px_-28px_rgba(15,23,42,0.35)] sm:flex">
              Dipakai seller omzet jutaan sampai ratusan juta
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold">3 Fitur yang Seller Butuhkan</h2>
          <p className="text-muted-foreground">
            Semua yang perlu kamu lihat untuk jualan lebih tenang dan lebih profit.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {featureCards.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="brand-panel rounded-[28px] p-6">
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${feature.tone}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{feature.desc}</p>
                <ul className="mt-5 space-y-3 text-sm">
                  {feature.items.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-[hsl(var(--brand-surface)/0.72)] py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold">Cara Pakai, 3 Langkah</h2>
          </div>
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
            {steps.map((item) => (
              <div key={item.step} className="brand-panel-soft rounded-[26px] p-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
                  {item.step}
                </div>
                <h3 className="mb-2 font-semibold">{item.title}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold">Harga Sederhana</h2>
          <p className="text-muted-foreground">Bayar sekali, pakai selamanya</p>
        </div>

        <div className="mx-auto max-w-sm">
          <div className="brand-panel rounded-[32px] p-8 text-center">
            <Badge className="mb-4">Paling Populer</Badge>
            <div className="mb-2">
              <span className="text-4xl font-extrabold">Rp 99.000</span>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              Pembayaran sekali, akses selamanya
            </p>
            <ul className="mb-8 space-y-3 text-left text-sm">
              {[
                "Analisis profit unlimited",
                "Analisis iklan unlimited",
                "Kalkulator ROAS",
                "Shopee & TikTok Shop",
                "Update fitur gratis",
                "Support via WhatsApp",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link href="/login">
              <Button size="lg" className="w-full gap-2">
                Beli Sekarang
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[hsl(var(--brand-surface)/0.68)] py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="mb-12 text-center text-3xl font-bold">Pertanyaan Umum</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {faqs.map((item) => (
              <div key={item.q} className="brand-panel-soft rounded-[24px] p-6">
                <h3 className="mb-2 font-semibold">{item.q}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="overflow-hidden rounded-[34px] bg-[linear-gradient(135deg,#f97316_0%,#fb923c_100%)] px-6 py-12 text-center text-white shadow-[0_26px_60px_-30px_rgba(249,115,22,0.65)] sm:px-10">
          <h2 className="mb-4 text-3xl font-bold">
            Mulai tau profit beneran sekarang
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-white/85">
            Berhenti nebak-nebak margin. Buka data toko kamu dalam nuansa yang lebih rapi,
            lebih hangat, dan lebih fokus ke keputusan penting.
          </p>
          <Link href="/login">
            <Button size="lg" variant="secondary" className="gap-2 bg-white text-primary hover:bg-white/92">
              Mulai Sekarang — Rp 99.000
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BarChart3 className="h-4 w-4" />
            </div>
            <span className="font-semibold">Profit Tebel</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 Profit Tebel. Dibuat untuk seller Indonesia.
          </p>
        </div>
      </footer>
    </div>
  );
}
