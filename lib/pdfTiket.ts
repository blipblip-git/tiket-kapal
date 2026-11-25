// lib/pdfTiket.ts
// Satu pintu menyimpan e-tiket (PNG data URL) menjadi PDF seukuran tiket.

import { jsPDF } from 'jspdf'

export async function simpanTiketKePdf(dataUrl: string, namaFile: string): Promise<void> {
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
  pdf.save(namaFile)
}
