import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  TrendingUp,
  Calculator,
  CheckCircle,
  ArrowRight,
  Star,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Profit Tebel — Tau Profit Beneran, Bukan Cuma Omzet",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="border-b border-border sticky top-0 bg-white/95 backdrop-blur-sm z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">Profit Tebel</span>
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

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center">
        <Badge className="mb-4" variant="secondary">
          🇮🇩 Khusus seller Shopee & TikTok Shop
        </Badge>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground mb-6 leading-tight">
          Tau profit beneran,
          <br />
          <span className="text-primary">bukan cuma omzet</span>
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Upload laporan Shopee atau TikTok Shop kamu, langsung tau berapa profit
          sebenarnya setelah potong HPP, packaging, dan semua biaya marketplace.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/login">
            <Button size="lg" className="gap-2 w-full sm:w-auto">
              Mulai Analisis Sekarang
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Button size="lg" variant="outline" className="w-full sm:w-auto">
            Lihat Demo
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Bayar sekali, pakai selamanya. Tidak ada biaya bulanan.
        </p>
      </section>

      {/* Social Proof */}
      <section className="bg-muted/50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Dipercaya seller dengan omzet jutaan hingga ratusan juta
          </p>
          <div className="flex justify-center gap-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <p className="mt-2 text-sm font-medium">
            &ldquo;Akhirnya tau produk mana yang beneran untung!&rdquo;
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">3 Fitur yang Seller Butuhkan</h2>
          <p className="text-muted-foreground">
            Semua yang perlu kamu tau untuk jualan lebih profit
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="rounded-xl border bg-card p-6 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="font-bold text-lg mb-2">Analisis Profit</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Upload XLSX income Shopee, langsung dapat breakdown lengkap: omzet,
              semua fee marketplace, HPP, dan profit bersih per produk.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "Real profit setelah HPP & packaging",
                "Breakdown fee: admin, layanan, ongkir",
                "Trend harian & mingguan",
                "Alert produk dengan profit negatif",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Feature 2 */}
          <div className="rounded-xl border bg-card p-6 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center mb-4">
              <BarChart3 className="h-6 w-6 text-orange-600" />
            </div>
            <h3 className="font-bold text-lg mb-2">Analisis Iklan</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Upload CSV data iklan Shopee Ads, langsung tau produk mana yang harus
              di-scale, dioptimasi, atau dihentikan.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "Traffic light: SCALE / OPTIMIZE / KILL",
                "True ROAS (setelah HPP & fee)",
                "ROAS vs Profit quadrant matrix",
                "Perbandingan CPA antar produk",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Feature 3 */}
          <div className="rounded-xl border bg-card p-6 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center mb-4">
              <Calculator className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="font-bold text-lg mb-2">Kalkulator ROAS</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Hitung break-even ROAS, max budget iklan, dan CPA yang masih
              menguntungkan sebelum mulai campaign.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "Preset fee otomatis per marketplace",
                "Break-even ROAS & max ad spend",
                "Simulasi budget campaign",
                "Simpan & bandingkan skenario",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-muted/30 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Cara Pakai, 3 Langkah</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            {[
              {
                step: "1",
                title: "Upload File",
                desc: "Upload XLSX income atau CSV iklan dari Seller Center kamu",
              },
              {
                step: "2",
                title: "Isi HPP",
                desc: "Masukkan harga pokok produk & biaya packaging sekali saja",
              },
              {
                step: "3",
                title: "Analisis",
                desc: "Langsung dapat dashboard profit, analisis iklan, dan rekomendasi",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Harga Sederhana</h2>
          <p className="text-muted-foreground">Bayar sekali, pakai selamanya</p>
        </div>

        <div className="max-w-sm mx-auto">
          <div className="rounded-2xl border-2 border-primary bg-card p-8 text-center shadow-lg">
            <Badge className="mb-4">Paling Populer</Badge>
            <div className="mb-2">
              <span className="text-4xl font-extrabold">Rp 99.000</span>
            </div>
            <p className="text-muted-foreground text-sm mb-6">
              Pembayaran sekali, akses selamanya
            </p>
            <ul className="space-y-3 text-sm text-left mb-8">
              {[
                "Analisis profit unlimited",
                "Analisis iklan unlimited",
                "Kalkulator ROAS",
                "Shopee & TikTok Shop",
                "Update fitur gratis",
                "Support via WhatsApp",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link href="/login">
              <Button size="lg" className="w-full gap-2 bg-orange-500 hover:bg-orange-600 text-white">
                Beli Sekarang
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-muted/30 py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-center mb-12">Pertanyaan Umum</h2>
          <div className="space-y-6">
            {[
              {
                q: "Marketplace apa yang didukung?",
                a: "Shopee (XLSX income + CSV iklan) dan TikTok Shop (segera hadir).",
              },
              {
                q: "Data saya aman?",
                a: "Ya. Data kamu tersimpan aman di server terenkripsi dan tidak dibagikan ke siapapun. Setiap akun hanya bisa akses datanya sendiri.",
              },
              {
                q: "Perlu install software?",
                a: "Tidak perlu. Profit Tebel berbasis web, cukup buka browser dan upload file.",
              },
              {
                q: "Bagaimana cara dapat file income XLSX dari Shopee?",
                a: "Seller Center → Keuangan → Penghasilan Saya → Download laporan. File .xlsx langsung bisa diupload.",
              },
            ].map((item) => (
              <div key={item.q} className="border-b pb-6">
                <h3 className="font-semibold mb-2">{item.q}</h3>
                <p className="text-muted-foreground text-sm">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Mulai tau profit beneran sekarang
        </h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
          Bergabung dengan seller yang sudah berhenti nebak-nebak profit dan mulai
          ambil keputusan berdasarkan data.
        </p>
        <Link href="/login">
          <Button size="lg" className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
            Mulai Sekarang — Rp 99.000
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="font-semibold">Profit Tebel</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2025 Profit Tebel. Dibuat dengan ❤️ untuk seller Indonesia.
          </p>
        </div>
      </footer>
    </div>
  );
}
