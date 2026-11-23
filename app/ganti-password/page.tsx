'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getOperatorSession, hapusSesiAuthLokal } from '@/lib/supabase'
import { fieldPasswordBaru } from '@/lib/password'

export default function GantiPasswordPage() {
  const router = useRouter()
  const [passwordLama, setPasswordLama] = useState('')
  const [passwordBaru, setPasswordBaru] = useState('')
  const [konfirmasi, setKonfirmasi] = useState('')
  const [pesan, setPesan] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setPesan('')

    if (passwordBaru !== konfirmasi) {
      setPesan('Password baru dan konfirmasi tidak cocok.')
      setLoading(false)
      return
    }

    if (passwordBaru.length < 6) {
      setPesan('Password baru minimal 6 karakter.')
      setLoading(false)
      return
    }

    // 1. Tentukan akun yang sedang ganti password.
    //    Sesi lokal (/login) diutamakan supaya sisa sesi Supabase Auth di browser
    //    yang sama (misalnya login Superadmin) tidak ikut berubah password-nya.
    const { data: { user } } = await supabase.auth.getUser()
    const sesiLokal = getOperatorSession()
    const idProfil = sesiLokal?.id || user?.id

    if (!idProfil) {
      setPesan('Sesi login tidak ditemukan. Silakan login ulang.')
      setLoading(false)
      return
    }

    // 2. Password lama WAJIB benar (dicek ke hash di server, bukan di browser).
    const identifier = sesiLokal?.email || sesiLokal?.nomor_hp || ''
    if (!identifier) {
      setPesan('Sesi login tidak lengkap. Silakan logout lalu login ulang.')
      setLoading(false)
      return
    }

    const cekLama = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: passwordLama })
    })

    if (!cekLama.ok) {
      setPesan('Password lama salah.')
      setLoading(false)
      return
    }

    // 3. Kalau akun ini juga punya Supabase Auth, sinkronkan password-nya.
    if (user && user.id === idProfil) {
      const { error } = await supabase.auth.updateUser({
        password: passwordBaru
      })

      if (error) {
        setPesan('Gagal ganti password: ' + error.message)
        setLoading(false)
        return
      }
    }

    // 4. Simpan HASH password di tabel profiles (plaintext tidak pernah disimpan)
    const { error: errorHash } = await supabase
      .from('profiles')
      .update(await fieldPasswordBaru(passwordBaru))
      .eq('id', idProfil)
      .select('id')

    if (errorHash) {
      setPesan('Gagal menyimpan password baru: ' + errorHash.message)
      setLoading(false)
      return
    }

    setPesan('Password berhasil diganti! Silakan login ulang dengan password baru.')
    setLoading(false)
    
    setTimeout(() => {
      // Logout paksa setelah ganti password (hanya akun yang barusan diganti)
      if (user && user.id === idProfil) supabase.auth.signOut()
      // Token Auth browser ini juga harus dibuang, kalau tidak sesi lama tetap
      // dianggap sah oleh database meski layar sudah kembali ke /login.
      hapusSesiAuthLokal()
      localStorage.removeItem('petugas_session')
      router.push('/login')
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
        
        <div className="bg-gray-800 p-6 text-center">
          <h2 className="text-2xl font-bold text-white tracking-widest">GANTI PASSWORD</h2>
          <p className="text-sm text-gray-300 mt-1">Amankan Akun Anda</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6" autoComplete="off">
          
          <label className="block mb-2 text-sm font-medium text-gray-700">Password Baru</label>
          <div className="relative mb-4">
            <input
              type={showPassword ? 'text' : 'password'}
              value={passwordBaru}
              onChange={(e) => setPasswordBaru(e.target.value)}
              className="w-full border rounded px-3 py-2 pr-10 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
              required
              placeholder="Minimal 6 karakter"
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

          <label className="block mb-2 text-sm font-medium text-gray-700">Konfirmasi Password Baru</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={konfirmasi}
            onChange={(e) => setKonfirmasi(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-6 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
            required
            placeholder="Ketik ulang password baru"
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-800 text-white py-2.5 rounded hover:bg-gray-700 disabled:bg-gray-400 font-bold tracking-wider"
          >
            {loading ? 'MEMPROSES...' : 'SIMPAN PASSWORD BARU'}
          </button>

          {pesan && (
            <p className={`mt-4 text-sm text-center break-words ${pesan.includes('berhasil') ? 'text-green-600' : 'text-red-600'}`}>
              {pesan}
            </p>
          )}

          <div className="mt-6 text-center border-t border-gray-200 pt-4">
            <button 
              type="button" 
              onClick={() => router.push('/dashboard')}
              className="text-sm text-gray-500 hover:text-blue-600 hover:underline"
            >
              &larr; Kembali ke Dashboard
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}