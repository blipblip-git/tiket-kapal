// lib/pdfTiket.ts
// Satu pintu menyimpan e-tiket (PNG data URL) menjadi PDF seukuran tiket.

import { jsPDF } from 'jspdf'

async function bangunPdf(dataUrl: string): Promise<jsPDF> {
  const img = new Image()
  img.src = dataUrl
  await new Promise<void>((selesai, gagal) => {
    img.onload = () => selesai()
    img.onerror = () => gagal(new Error('Gambar tiket gagal dimuat.'))
  })

  // PENTING: dengan orientation 'portrait', jsPDF selalu menaruh sisi
  // TERPENDEK sebagai lebar halaman. Tiket yang lebih lebar daripada tinggi
  // (kartu pendek, sedikit penumpang) jadi diletakkan pada halaman yang lebih
  // sempit - sisi kanan gambar keluar dari halaman dan terlihat terpotong di
  // penampil PDF (paling kentara di tablet). Orientasi wajib mengikuti bentuk
  // gambarnya supaya gambar mengisi halaman dengan pas.
  const orientasi = img.width > img.height ? 'landscape' : 'portrait'

  const pdf = new jsPDF({ orientation: orientasi, unit: 'px', format: [img.width, img.height] })
  pdf.addImage(dataUrl, 'PNG', 0, 0, img.width, img.height)
  return pdf
}

/**
 * PDF tiket sebagai Blob (belum diunduh).
 *
 * Dipakai halaman e-tiket publik: berkasnya dibuat SEKALI, lalu dipakai untuk
 * mengunduh, dibuka di tab baru, atau dikirim lewat lembar berbagi HP.
 */
export async function buatBlobPdfTiket(dataUrl: string): Promise<Blob> {
  const pdf = await bangunPdf(dataUrl)
  return pdf.output('blob')
}

/** Unduh Blob sebagai berkas. Jalan di desktop maupun HP/tablet. */
export function unduhBlob(blob: Blob, namaFile: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = namaFile
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Jangan cabut terlalu cepat: sebagian browser baru mulai membaca URL-nya
  // setelah klik selesai.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function simpanTiketKePdf(dataUrl: string, namaFile: string): Promise<void> {
  unduhBlob(await buatBlobPdfTiket(dataUrl), namaFile)
}

