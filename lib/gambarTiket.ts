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
