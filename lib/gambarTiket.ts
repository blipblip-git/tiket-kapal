// lib/gambarTiket.ts
// Satu pintu untuk mengubah kartu e-tiket (HTML) menjadi gambar PNG.
//
// Kenapa tidak memakai clientWidth/clientHeight seperti sebelumnya:
// `client*` hanya mengukur kotak yang terlihat. Di layar lebar (tablet) isi
// kartu bisa sedikit melewati kotaknya - teks nama panjang, padding `md:`,
// dan pembulatan subpiksel - sehingga hasil gambar terpotong di sisi kanan.
// `scroll*` ikut menghitung isi yang melewati kotak, jadi tidak ada yang
// hilang. Tambahan 2 px menutup pembulatan border/shadow.

import { toPng } from 'html-to-image'

const TAMBAHAN_PIKSEL = 2

export async function tangkapGambarTiket(node: HTMLElement): Promise<string> {
  // Pastikan font web sudah siap, kalau tidak lebar teks bisa dihitung salah
  // dan baris terakhir keluar dari gambar.
  if (typeof document !== 'undefined' && document.fonts && 'ready' in document.fonts) {
    await document.fonts.ready
  }

  const kotak = node.getBoundingClientRect()
  const lebar = Math.max(node.scrollWidth, Math.ceil(kotak.width)) + TAMBAHAN_PIKSEL
  const tinggi = Math.max(node.scrollHeight, Math.ceil(kotak.height)) + TAMBAHAN_PIKSEL

  return toPng(node, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    width: lebar,
    height: tinggi,
    // Jangan biarkan salinan html-to-image memotong isi yang melewati kotak.
    style: { overflow: 'visible', margin: '0' }
  })
}

/**
 * Ubah data URL (hasil tangkapGambarTiket) menjadi Blob TANPA fetch().
 *
 * Kenapa tidak `await (await fetch(dataUrl)).blob()`: fetch ke `data:` diatur
 * oleh CSP `connect-src`. Di server ini `data:` sempat tidak diizinkan, jadi
 * Chrome menolak dengan TypeError "Failed to fetch" walau gambarnya jelas ada -
 * itulah pesan "Gagal menyimpan gambar: failed to fetch" di HP/tablet.
 * Decode base64 langsung tidak menyentuh jaringan sama sekali, jadi aman
 * berapa pun ketatnya CSP.
 */
export function dataUrlKeBlob(dataUrl: string): Blob {
  const koma = dataUrl.indexOf(',')
  if (koma === -1) throw new Error('Data gambar tidak valid.')

  const kepala = dataUrl.slice(0, koma)
  const isi = dataUrl.slice(koma + 1)
  const tipe = /data:([^;]+)/.exec(kepala)?.[1] || 'image/png'

  // Sebagian browser menghasilkan base64 dengan spasi/baris baru.
  const biner = atob(isi.replace(/\s/g, ''))
  const bytes = new Uint8Array(biner.length)
  for (let i = 0; i < biner.length; i++) bytes[i] = biner.charCodeAt(i)

  return new Blob([bytes], { type: tipe })
}

/** Bungkus data URL menjadi File supaya bisa dikirim lewat Web Share. */
export function dataUrlKeFile(dataUrl: string, namaFile: string): File {
  return new File([dataUrlKeBlob(dataUrl)], namaFile, { type: 'image/png' })
}

/**
 * Unduh gambar sekali ketuk, TANPA membuka popup pratinjau.
 *
 * Kenapa tidak memasang `dataUrl` langsung di `<a download>`: Chrome modern
 * dan WebView memblokir navigasi ke `data:` URL, sehingga tombol "Unduh
 * Gambar" terasa tidak berfungsi (tidak ada reaksi apa pun). Objek URL dari
 * Blob dianggap file biasa, jadi atribut `download` dihormati dan hasilnya
 * masuk folder Unduhan/Galeri.
 */
export function unduhGambarDariDataUrl(dataUrl: string, namaFile: string): void {
  const blob = dataUrlKeBlob(dataUrl)
  const objectUrl = URL.createObjectURL(blob)
  const tautan = document.createElement('a')

  tautan.href = objectUrl
  tautan.download = namaFile
  tautan.rel = 'noopener'
  tautan.style.display = 'none'
  document.body.appendChild(tautan)
  tautan.click()

  // Jangan lepas objek URL langsung: sebagian browser membatalkan unduhan
  // kalau blob-nya dicabut sebelum file selesai ditulis.
  setTimeout(() => {
    tautan.remove()
    URL.revokeObjectURL(objectUrl)
  }, 30_000)
}
