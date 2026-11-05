'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SuperAdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pesan, setPesan] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setPesan('Memverifikasi...')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setPesan('Akses ditolak: ' + error.message)
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin_utama') {
        await supabase.auth.signOut()
        setPesan('Akses ditolak: Akun ini bukan pemilik platform.')
        setLoading(false)
        return
      }
    }

    router.push('/dashboard-superadmin')
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-700">
        
        <div className="bg-gray-950 p-6 text-center border-b border-gray-800">
          <h2 className="text-2xl font-bold text-white tracking-widest">SUPER ADMIN</h2>
          <p className="text-xs text-gray-400 mt-1">Pintu Masuk Pemilik Platform</p>
        </div>

        <form onSubmit={handleLogin} className="p-6" autoComplete="off">
          
          <label className="block mb-2 text-sm font-medium text-gray-300">Email Pemilik</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 mb-4 text-white focus:ring-blue-500 focus:border-blue-500"
            required
            autoComplete="off"
          />

          <label className="block mb-2 text-sm font-medium text-gray-300">Kunci Rahasia</label>
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
            className="w-full bg-blue-600 text-white py-2.5 rounded hover:bg-blue-500 disabled:bg-gray-600 font-bold tracking-wider"
          >
            {loading ? 'MEMPROSES...' : 'MASUK'}
          </button>

          {pesan && (
            <p className={`mt-4 text-sm text-center break-words ${pesan.includes('Memverifikasi') ? 'text-gray-400' : 'text-red-400'}`}>
              {pesan}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}