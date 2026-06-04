import type { Metadata } from 'next'
import { LegalShell, LegalSection } from '@/components/legal/legal-shell'

export const metadata: Metadata = {
  title: 'Syarat & Ketentuan — Profit Tebel',
  description: 'Syarat dan ketentuan penggunaan layanan Profit Tebel.',
}

const LAST_UPDATED = '4 Juni 2026'
const SUPPORT_EMAIL = 'support@profitebel.web.id'

export default function SyaratKetentuanPage() {
  return (
    <LegalShell title="Syarat & Ketentuan" lastUpdated={LAST_UPDATED}>
      <p>
        Selamat datang di Profit Tebel. Dengan mendaftar, mengakses, atau menggunakan layanan
        Profit Tebel (&quot;Layanan&quot;), Anda dianggap telah membaca, memahami, dan menyetujui
        Syarat &amp; Ketentuan ini. Jika Anda tidak setuju, mohon untuk tidak menggunakan Layanan.
      </p>

      <LegalSection title="1. Tentang Layanan">
        <p>
          Profit Tebel adalah aplikasi berbasis web yang membantu penjual (seller) e-commerce
          Indonesia—khususnya Shopee dan TikTok Shop—menganalisis profit, biaya marketplace,
          performa iklan, serta mengelola data persediaan/produksi. Layanan bekerja dengan cara
          mengunggah dan memproses laporan yang Anda peroleh dari Seller Center marketplace Anda.
        </p>
      </LegalSection>

      <LegalSection title="2. Akun Pengguna">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Anda wajib memberikan data pendaftaran yang benar dan menjaga kerahasiaan akun Anda.</li>
          <li>Anda bertanggung jawab penuh atas seluruh aktivitas yang terjadi pada akun Anda.</li>
          <li>Satu akun ditujukan untuk digunakan oleh satu pemilik usaha/penjual.</li>
          <li>
            Kami berhak menangguhkan atau menghentikan akun yang terindikasi melanggar Syarat &amp;
            Ketentuan ini atau menyalahgunakan Layanan.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Paket & Pembayaran">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Akses Lifetime</strong> tersedia dengan pembayaran satu kali sebesar Rp 99.000
            untuk fitur analisis (profit, iklan, kalkulator ROAS).
          </li>
          <li>
            <strong>Profit Tebel Pro</strong> (fitur Inventori &amp; Produksi) tersedia sebagai
            langganan bulanan sebesar Rp 49.000 per 30 hari.
          </li>
          <li>
            Pembayaran diproses melalui penyedia pembayaran pihak ketiga, <strong>iPaymu</strong>
            {' '}(QRIS, Virtual Account, dan e-wallet). Kami tidak menyimpan data kartu atau kredensial
            pembayaran Anda.
          </li>
          <li>
            Akses akan aktif secara otomatis setelah pembayaran terkonfirmasi. Jika pembayaran sudah
            berhasil namun akses belum aktif, hubungi kami di {SUPPORT_EMAIL}.
          </li>
          <li>Harga dapat berubah sewaktu-waktu; perubahan tidak berlaku surut untuk pembelian yang sudah selesai.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Data & Privasi">
        <p>
          Data laporan yang Anda unggah disimpan secara aman dan hanya dapat diakses oleh akun Anda
          sendiri. Kami tidak menjual data Anda kepada pihak ketiga. Pemrosesan data dilakukan
          semata-mata untuk menyediakan fitur analisis kepada Anda.
        </p>
      </LegalSection>

      <LegalSection title="5. Penggunaan yang Dilarang">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Menggunakan Layanan untuk tujuan melanggar hukum yang berlaku di Indonesia.</li>
          <li>Mencoba meretas, merekayasa balik, atau mengganggu keamanan dan infrastruktur Layanan.</li>
          <li>Membagikan, menjual, atau menyewakan akses akun kepada pihak lain tanpa izin.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Batasan Tanggung Jawab">
        <p>
          Profit Tebel menyediakan alat bantu analisis. Seluruh keputusan bisnis (termasuk penetapan
          harga, anggaran iklan, dan strategi penjualan) sepenuhnya menjadi tanggung jawab Anda. Kami
          berupaya menjaga keakuratan perhitungan, namun tidak menjamin Layanan bebas dari kesalahan
          atau gangguan, dan tidak bertanggung jawab atas kerugian yang timbul dari penggunaan hasil
          analisis.
        </p>
      </LegalSection>

      <LegalSection title="7. Perubahan Syarat">
        <p>
          Kami dapat memperbarui Syarat &amp; Ketentuan ini dari waktu ke waktu. Perubahan akan
          ditampilkan pada halaman ini disertai tanggal pembaruan. Dengan terus menggunakan Layanan
          setelah perubahan, Anda dianggap menyetujui versi terbaru.
        </p>
      </LegalSection>

      <LegalSection title="8. Kontak">
        <p>
          Untuk pertanyaan terkait Syarat &amp; Ketentuan ini, hubungi kami di{' '}
          <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
