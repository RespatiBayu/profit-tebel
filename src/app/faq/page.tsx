import type { Metadata } from 'next'
import { LegalShell } from '@/components/legal/legal-shell'

export const metadata: Metadata = {
  title: 'FAQ — Profit Tebel',
  description: 'Pertanyaan yang sering diajukan seputar Profit Tebel.',
}

const LAST_UPDATED = '4 Juni 2026'
const SUPPORT_EMAIL = 'support@profitebel.web.id'

const faqs: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Apa itu Profit Tebel?',
    a: 'Profit Tebel adalah aplikasi web untuk membantu seller Shopee & TikTok Shop menghitung profit beneran (bukan cuma omzet), menganalisis biaya marketplace dan iklan, serta mengelola persediaan/produksi.',
  },
  {
    q: 'Marketplace apa saja yang didukung?',
    a: 'Saat ini Shopee (laporan income XLSX dan iklan CSV). Dukungan TikTok Shop ada di roadmap berikutnya.',
  },
  {
    q: 'Bagaimana cara mulai menggunakan?',
    a: 'Cukup 3 langkah: (1) Upload file income XLSX / iklan CSV dari Seller Center, (2) isi HPP produk sekali saja, (3) langsung lihat dashboard profit, analisis iklan, dan rekomendasi.',
  },
  {
    q: 'Berapa biayanya?',
    a: 'Akses fitur analisis tersedia dengan pembayaran satu kali Rp 99.000 (lifetime). Fitur Inventori & Produksi (Pro) tersedia sebagai langganan Rp 49.000 per 30 hari.',
  },
  {
    q: 'Metode pembayaran apa yang tersedia?',
    a: 'Pembayaran diproses melalui iPaymu, mendukung QRIS, Virtual Account bank, dan e-wallet. Akses aktif otomatis setelah pembayaran terkonfirmasi.',
  },
  {
    q: 'Apakah saya bisa minta pengembalian dana?',
    a: 'Bisa, sesuai ketentuan pada halaman Kebijakan Pengembalian Dana. Tersedia jaminan 7 hari untuk pembelian Lifetime jika ada kendala teknis yang tidak dapat kami selesaikan.',
  },
  {
    q: 'Apakah data saya aman?',
    a: 'Ya. Data yang Anda unggah disimpan aman dan hanya bisa diakses oleh akun Anda sendiri. Kami tidak menjual data Anda ke pihak ketiga.',
  },
  {
    q: 'Perlu install software?',
    a: 'Tidak. Profit Tebel berbasis web—cukup buka browser, login, dan upload file.',
  },
  {
    q: 'Bagaimana cara mengunduh file income XLSX dari Shopee?',
    a: 'Buka Seller Center → Keuangan → Penghasilan Saya, lalu unduh laporan penghasilan dalam format Excel (XLSX).',
  },
  {
    q: 'Saya sudah bayar tapi akses belum aktif, bagaimana?',
    a: (
      <>
        Tunggu beberapa menit karena konfirmasi pembayaran kadang butuh waktu. Jika tetap belum aktif,
        hubungi kami di{' '}
        <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{' '}
        dengan menyertakan email akun dan bukti pembayaran.
      </>
    ),
  },
]

export default function FaqPage() {
  return (
    <LegalShell title="Pertanyaan yang Sering Diajukan (FAQ)" lastUpdated={LAST_UPDATED}>
      <div className="space-y-5">
        {faqs.map((item) => (
          <div key={item.q} className="brand-panel-soft rounded-2xl p-5">
            <h2 className="font-semibold text-foreground">{item.q}</h2>
            <p className="mt-2 text-[15px] leading-7 text-muted-foreground">{item.a}</p>
          </div>
        ))}
      </div>
    </LegalShell>
  )
}
