'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LupaPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pesan, setPesan] = useState('')

  function handleLupa(e: React.FormEvent) {
    e.preventDefault()
    setPesan(`Permintaan reset untuk ${email} telah dicatat. Silakan hubungi Admin di WhatsApp 0812-3456-7890 untuk meminta password baru.`)
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-700">
        
        <div className="bg-gray-950 p-6 text-center border-b border-gray-800">
          <h2 className="text-2xl font-bold text-white tracking-widest">LUPA PASSWORD</h2>
          <p className="text-xs text-gray-400 mt-1">Reset Akses Pemilik Platform</p>
        </div>

        <form onSubmit={handleLupa} className="p-6" autoComplete="off">
          
          <label className="block mb-2 text-sm font-medium text-gray-300">Masukkan Email Anda</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 mb-6 text-white focus:ring-blue-500 focus:border-blue-500"
            required
            autoComplete="off"
          />

          <button
            type="submit"
            className="w-full bg-yellow-600 text-white py-2.5 rounded hover:bg-yellow-500 font-bold tracking-wider"
          >
            MINTA RESET
          </button>

          {pesan && (
            <p className="mt-4 text-sm text-center text-green-400 break-words">
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