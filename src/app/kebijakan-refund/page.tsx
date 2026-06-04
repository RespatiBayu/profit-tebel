import type { Metadata } from 'next'
import { LegalShell, LegalSection } from '@/components/legal/legal-shell'

export const metadata: Metadata = {
  title: 'Kebijakan Pengembalian Dana — Profit Tebel',
  description: 'Kebijakan pengembalian dana (refund policy) layanan Profit Tebel.',
}

const LAST_UPDATED = '4 Juni 2026'
const SUPPORT_EMAIL = 'support@profitebel.web.id'

export default function KebijakanRefundPage() {
  return (
    <LegalShell title="Kebijakan Pengembalian Dana (Refund Policy)" lastUpdated={LAST_UPDATED}>
      <p>
        Kami ingin Anda puas menggunakan Profit Tebel. Kebijakan ini menjelaskan ketentuan
        pengembalian dana (refund) untuk pembayaran yang dilakukan melalui Layanan. Profit Tebel
        adalah produk digital, sehingga ketentuan di bawah berlaku khusus untuk produk digital.
      </p>

      <LegalSection title="1. Akses Lifetime (Pembayaran Satu Kali — Rp 99.000)">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Kami memberikan <strong>jaminan pengembalian dana dalam 7 (tujuh) hari</strong> sejak
            tanggal pembayaran untuk pembelian pertama, apabila terdapat kendala teknis yang membuat
            Anda tidak dapat menggunakan Layanan dan kendala tersebut tidak dapat kami selesaikan.
          </li>
          <li>
            Permohonan refund di luar masa 7 hari dapat ditolak, kecuali diwajibkan oleh hukum yang
            berlaku.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Langganan Pro Bulanan (Rp 49.000 / 30 hari)">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Biaya langganan yang sudah aktif pada periode berjalan bersifat tidak dapat dikembalikan,
            karena akses fitur sudah diberikan untuk periode tersebut.
          </li>
          <li>
            Anda dapat berhenti berlangganan kapan saja. Penghentian akan mencegah perpanjangan
            berikutnya, dan akses tetap berlaku hingga akhir periode yang sudah dibayar.
          </li>
          <li>
            Pengecualian dapat diberikan jika terjadi kesalahan penagihan ganda (double charge) atau
            kegagalan teknis dari sisi kami.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Kondisi yang Memenuhi Syarat Refund">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Pembayaran berhasil terdebet namun akses tidak kunjung aktif dan tidak dapat kami perbaiki.</li>
          <li>Penagihan ganda untuk transaksi yang sama.</li>
          <li>Transaksi yang tidak Anda otorisasi (mohon lengkapi dengan bukti pendukung).</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Kondisi yang Tidak Memenuhi Syarat Refund">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Berubah pikiran setelah masa jaminan 7 hari berakhir (untuk Lifetime).</li>
          <li>Periode langganan bulanan yang sudah berjalan/terpakai.</li>
          <li>Pelanggaran Syarat &amp; Ketentuan yang menyebabkan penangguhan akun.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Cara Mengajukan Refund">
        <p>
          Kirim email ke{' '}
          <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{' '}
          dengan menyertakan: (a) alamat email akun Anda, (b) tanggal &amp; nominal transaksi, dan
          (c) bukti pembayaran serta alasan permohonan. Kami akan meninjau permohonan dalam
          <strong> 1–3 hari kerja</strong>.
        </p>
      </LegalSection>

      <LegalSection title="6. Proses & Waktu Pengembalian">
        <p>
          Apabila permohonan disetujui, dana akan dikembalikan melalui metode/penyedia pembayaran
          semula (iPaymu) ke rekening atau dompet digital yang Anda gunakan. Proses pengembalian
          umumnya memakan waktu <strong>7–14 hari kerja</strong>, tergantung bank/penyedia
          pembayaran. Biaya administrasi dari penyedia pembayaran (jika ada) dapat dikurangkan dari
          jumlah yang dikembalikan.
        </p>
      </LegalSection>

      <LegalSection title="7. Kontak">
        <p>
          Pertanyaan seputar pengembalian dana dapat diajukan ke{' '}
          <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
