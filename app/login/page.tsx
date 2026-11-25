'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { adalahKolektor } from '@/lib/kolektor'
import { supabase } from '@/lib/supabase'

// Pesan dari SessionGuard / cekValidasiSesi: sesi lama sudah tidak dipakai.
function pesanDariQuery(kode: string | null): string {
  if (kode === 'session_expired') {
    return 'Sesi login berakhir. Silakan login ulang untuk melanjutkan.'
  }
  if (kode === 'jam_kerja_selesai') {
    return 'Jam kerja sudah berakhir. Sesi ditutup. Hubungi Admin Utama jika jam operasional perlu diubah.'
  }
  return ''
}

function LoginContent() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as 'operator' | 'syahbandar') || 'operator'

  const [tab, setTab] = useState<'operator' | 'syahbandar'>(initialTab)
  const [noHp, setNoHp] = useState('')
  const [password, setPassword] = useState('')
  const [pesan, setPesan] = useState(() => pesanDariQuery(searchParams.get('pesan')))
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function prosesLogin() {
    setLoading(true)
    setPesan('Memeriksa data...')

    const inputLogin = noHp.trim()
    
    // Login diproses di server (/api/auth/login) — password dicek ke hash di server.
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: inputLogin,
          password
        })
      })

      const hasil = await response.json()

      if (!response.ok) {
        // Termasuk penolakan karena nomor HP dipakai lebih dari satu akun
        // atau login di luar jam operasional. Tidak ada pemilihan akun.
        setPesan(hasil.error || 'Login gagal. Coba lagi.')
        setLoading(false)
        return
      }

      const data = hasil.profile

      // Sesi Supabase Auth dipasang di browser. Inilah "KTP digital" staf untuk
      // database: setiap tulis/baca akan dikenali sebagai akun ini (RLS).
      // Tanpa sesi ini (mis. SUPABASE_SERVICE_ROLE_KEY tidak terbaca di server),
      // staf bisa masuk aplikasi tetapi semua baca/tulis ditolak dan halaman
      // tampil kosong. Jadi jangan lanjut login kalau sesinya tidak ada.
      if (!hasil.session?.access_token || !hasil.session?.refresh_token) {
        console.error('Sesi pengaman tidak tersedia:', hasil.peringatan)
        setPesan(
          'Login gagal: sesi pengaman tidak bisa dipasang. Hubungi Admin Utama (periksa SUPABASE_SERVICE_ROLE_KEY di server).'
        )
        setLoading(false)
        return
      }

      try {
        await supabase.auth.setSession({
          access_token: hasil.session.access_token,
          refresh_token: hasil.session.refresh_token
        })
      } catch (err) {
        console.error('Gagal memasang sesi pengaman:', err)
        setPesan('Login gagal: sesi pengaman tidak bisa dipasang di browser ini. Coba lagi.')
        setLoading(false)
        return
      }

      localStorage.setItem('petugas_session', JSON.stringify({
        id: data.id, nama: data.nama, role: data.role, lokasi: data.lokasi, unit: data.unit,
        email: data.email, nomor_hp: data.nomor_hp,
        operator_id: data.operator_id || null,
        nama_perusahaan: data.nama_perusahaan || null,
        api_token: hasil.api_token || null
      }))

      setPesan('Login berhasil, mengalihkan...');
      setTimeout(() => {
        if (data.role === 'syahbandar') {
          // Akun syahbandar selalu bermuara ke manifest, bukan dashboard petugas.
          window.location.href = '/syahbandar';
        } else if (data.role === 'admin_utama') {
          window.location.href = '/dashboard'; 
        } else if (data.role === 'terminal_keberangkatan') {
          window.location.href = '/dashboard/keberangkatan';
        } else if (data.role === 'agen') {
          window.location.href = '/dashboard/agen';
        } else if (data.role === 'kolektor' || adalahKolektor(data)) {
          window.location.href = '/dashboard/kolektor';
        } else {
          window.location.href = '/pilih-mode';
        }
      }, 500);
      
    } catch (err) {
      setPesan('Error: ' + (err instanceof Error ? err.message : 'Terjadi kesalahan'))
      setLoading(false)
    }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    void prosesLogin()
  }

  const labelIdentitas = tab === 'syahbandar' ? 'Nomor HP / Email Syahbandar' : 'Nomor HP / Email'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm transition-all duration-300">

        <h1 className="mb-4 text-center text-xl font-bold leading-snug text-gray-900">
          Login Petugas/Agen dan Syahbandar
        </h1>

        <div className="bg-white rounded shadow-md overflow-hidden">
          <div className="flex border-b">
            <button onClick={() => { setTab('operator'); setPesan('') }} className={`flex-1 py-3 text-sm font-medium transition ${tab === 'operator' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>Petugas / Agen</button>
            <button onClick={() => { setTab('syahbandar'); setPesan('') }} className={`flex-1 py-3 text-sm font-medium transition ${tab === 'syahbandar' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>Syahbandar</button>
          </div>

          <form onSubmit={handleLogin} className="p-6" autoComplete="off">
            <label className="block mb-2 text-sm font-medium text-gray-900">{labelIdentitas}</label>
            <input type="text" name="operator_hp_no_autofill" value={noHp} onChange={(e) => setNoHp(e.target.value)} className="w-full border rounded px-3 py-2 mb-4 text-gray-900 focus:ring-blue-500 focus:border-blue-500" required autoComplete="off" />

            <label className="block mb-2 text-sm font-medium text-gray-900">Password</label>
            <div className="relative mb-4">
              <input type={showPassword ? 'text' : 'password'} name="admin_pass_no_autofill" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded px-3 py-2 pr-10 text-gray-900 focus:ring-blue-500 focus:border-blue-500" required autoComplete="new-password" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none">
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>

            {tab === 'syahbandar' && (
              <p className="mb-4 text-[11px] leading-snug text-gray-500">
                Akun syahbandar diberikan oleh Admin. Password tidak dikirim lewat chat — minta reset ke Admin bila lupa.
              </p>
            )}

            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 font-medium">
              {loading ? 'Memproses...' : tab === 'syahbandar' ? 'Masuk Syahbandar' : 'Login'}
            </button>

            {pesan && (
              <p className={`mt-4 text-sm text-center break-words font-medium ${pesan.includes('berhasil') ? 'text-green-600' : 'text-red-600'}`}>{pesan}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <LoginContent />
    </Suspense>
  )
}