'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function DaftarAdminPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [namaAkun, setNamaAkun] = useState('')
  const [password, setPassword] = useState('')
  const [nomorWa, setNomorWa] = useState('')
  const [pesan, setPesan] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleDaftar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setPesan('')

    // Validasi Nama Akun (min 6 karakter, huruf & angka)
    const regexNamaAkun = /^[a-zA-Z0-9]{6,}$/
    if (!regexNamaAkun.test(namaAkun)) {
      setPesan('Nama Akun minimal 6 karakter, hanya huruf dan angka (tanpa spasi).')
      setLoading(false)
      return
    }

    // Validasi Password (min 6 karakter, huruf, angka, simbol)
    const regexPassword = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/
    if (!regexPassword.test(password)) {
      setPesan('Password minimal 6 karakter, harus mengandung huruf, angka, dan simbol (misal: Sheil@2000).')
      setLoading(false)
      return
    }

    // Validasi No WA
    if (nomorWa.length < 10) {
      setPesan('Nomor WhatsApp tidak valid.')
      setLoading(false)
      return
    }

    setPesan('Mendaftarkan akun...')

    // 1. Daftarkan ke Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      setPesan('Gagal daftar: ' + authError.message)
      setLoading(false)
      return
    }

    if (!authData.user) {
      setPesan('Gagal mendapatkan data user.')
      setLoading(false)
      return
    }

    // 2. Simpan ke tabel profiles
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email: email,
        nama: namaAkun, // Nama tampilan diambil dari nama akun
        nama_akun: namaAkun,
        role: 'admin_utama',
        password_plain: password,
        nomor_hp: nomorWa,
        aktif: true,
      })

    if (profileError) {
      setPesan('Gagal buat profil: ' + profileError.message)
      setLoading(false)
      return
    }

    setPesan('Pendaftaran berhasil! Mengalihkan ke Login...')
    setLoading(false)
    setTimeout(() => {
      router.push('/login')
    }, 2500)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
        
        <div className="bg-blue-600 p-6 text-center">
          <h2 className="text-2xl font-bold text-white tracking-widest">DAFTAR ADMIN KAPAL</h2>
          <p className="text-sm text-blue-100 mt-1">Buat Akun Pemilik Kapal Baru</p>
        </div>

        <form onSubmit={handleDaftar} className="p-6" autoComplete="off">
          
          <label className="block mb-2 text-sm font-medium text-gray-700">Email (Untuk Verifikasi)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-4 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
            required
            placeholder="contoh: admin@perusahaan.com"
            autoComplete="off"
          />

          <label className="block mb-2 text-sm font-medium text-gray-700">Nama Akun (Minimal 6 Karakter)</label>
          <input
            type="text"
            value={namaAkun}
            onChange={(e) => setNamaAkun(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-1 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
            required
            placeholder="contoh: deny123"
            autoComplete="off"
          />
          <p className="text-xs text-gray-500 mb-4">Hanya huruf & angka, tanpa spasi.</p>

          <label className="block mb-2 text-sm font-medium text-gray-700">Password (Kombinasi)</label>
          <div className="relative mb-1">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 pr-10 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
              required
              placeholder="contoh: Sheil@2000"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">Minimal 6 karakter (huruf, angka, simbol).</p>

          <label className="block mb-2 text-sm font-medium text-gray-700">Nomor WhatsApp (Untuk Verifikasi)</label>
          <input
            type="tel"
            value={nomorWa}
            onChange={(e) => setNomorWa(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-6 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
            required
            placeholder="contoh: 081234567890"
            autoComplete="off"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded hover:bg-blue-700 disabled:bg-gray-400 font-bold tracking-wider"
          >
            {loading ? 'MEMPROSES...' : 'DAFTAR SEKARANG'}
          </button>

          {pesan && (
            <p className={`mt-4 text-sm text-center break-words ${pesan.includes('berhasil') ? 'text-green-600' : 'text-red-600'}`}>
              {pesan}
            </p>
          )}

          <div className="mt-6 text-center border-t border-gray-200 pt-4">
            <Link href="/login" className="text-sm text-blue-600 hover:underline">
              Sudah punya akun? Login di sini
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}