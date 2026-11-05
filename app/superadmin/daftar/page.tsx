'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DaftarSuperAdminPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [nomorWa, setNomorWa] = useState('')
  const [password, setPassword] = useState('')
  const [pesan, setPesan] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleDaftar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setPesan('Mendaftarkan akun...')

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nomor_wa: nomorWa }
      }
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

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email: email,
        nama: 'Super Admin',
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

    setPesan('Pendaftaran berhasil! Silakan login.')
    setLoading(false)
    setTimeout(() => {
      router.push('/superadmin')
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-700">
        
        <div className="bg-gray-950 p-6 text-center border-b border-gray-800">
          <h2 className="text-2xl font-bold text-white tracking-widest">DAFTAR SUPER ADMIN</h2>
          <p className="text-xs text-gray-400 mt-1">Buat Akun Pemilik Platform</p>
        </div>

        <form onSubmit={handleDaftar} className="p-6" autoComplete="off">
          
          <label className="block mb-2 text-sm font-medium text-gray-300">Email Pemilik</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 mb-4 text-white focus:ring-blue-500 focus:border-blue-500"
            required
            autoComplete="off"
          />

          <label className="block mb-2 text-sm font-medium text-gray-300">Nomor WhatsApp</label>
          <input
            type="tel"
            value={nomorWa}
            onChange={(e) => setNomorWa(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 mb-4 text-white focus:ring-blue-500 focus:border-blue-500"
            required
            placeholder="08xxxxxxxxxx"
          />

          <label className="block mb-2 text-sm font-medium text-gray-300">Kunci Rahasia (Password)</label>
          <div className="relative mb-6">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 pr-10 text-white focus:ring-blue-500 focus:border-blue-500"
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white focus:outline-none"
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-2.5 rounded hover:bg-green-500 disabled:bg-gray-600 font-bold tracking-wider"
          >
            {loading ? 'MEMPROSES...' : 'DAFTAR SEKARANG'}
          </button>

          {pesan && (
            <p className={`mt-4 text-sm text-center break-words ${pesan.includes('berhasil') ? 'text-green-400' : 'text-red-400'}`}>
              {pesan}
            </p>
          )}

          <div className="mt-6 text-center border-t border-gray-700 pt-4">
            <button 
              type="button" 
              onClick={() => router.push('/superadmin')}
              className="text-sm text-gray-400 hover:text-white hover:underline"
            >
              &larr; Kembali ke Login
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}