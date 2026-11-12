'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as 'operator' | 'syahbandar') || 'operator'

  const [tab, setTab] = useState<'operator' | 'syahbandar'>(initialTab)
  const [noHp, setNoHp] = useState('')
  const [password, setPassword] = useState('')
  const [pesan, setPesan] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setPesan('Memeriksa data...')

    const inputLogin = noHp.trim()
    let emailCek = inputLogin;
    
    if (!inputLogin.includes('@')) {
      const bersihHp = inputLogin.replace(/\D/g, '')
      emailCek = `${bersihHp}@petugas.local`
    } 

    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('email', emailCek).single()
      
      if (error || !data) { 
        setPesan('Akun tidak terdaftar.'); 
        setLoading(false); 
        return 
      }
      
      if (!data.aktif) { 
        setPesan('Akun dinonaktifkan.'); 
        setLoading(false); 
        return 
      }
      
      if (data.password_plain !== password) { 
        setPesan('Password salah.'); 
        setLoading(false); 
        return 
      }

      if (data.sesi_aktif) {
        const lastUpdate = data.updated_at ? new Date(data.updated_at).getTime() : 0;
        const now = new Date().getTime();
        const diffSeconds = (now - lastUpdate) / 1000;

        if (diffSeconds < 30) {
          setPesan('Akun ini sedang aktif di perangkat lain. Silakan tunggu 30 detik lalu coba lagi.');
          setLoading(false);
          return;
        }
      }
      
      await supabase.from('profiles').update({ sesi_aktif: true, updated_at: new Date().toISOString() }).eq('id', data.id);

      localStorage.setItem('petugas_session', JSON.stringify({
        id: data.id, nama: data.nama, role: data.role, lokasi: data.lokasi, unit: data.unit, email: data.email
      }))

      setPesan('Login berhasil, mengalihkan...');
      setTimeout(() => {
        if (data.role === 'admin_utama') {
          window.location.href = '/dashboard'; 
        } else if (data.role === 'terminal_keberangkatan') {
          window.location.href = '/dashboard/keberangkatan';
        } else if (data.role === 'agen') {
          window.location.href = '/dashboard/agen';
        } else {
          window.location.href = '/pilih-mode';
        }
      }, 500);
      
    } catch (err: any) {
      setPesan('Error: ' + err.message);
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm transition-all duration-300">
        
        <div className="bg-white rounded shadow-md overflow-hidden">
          <div className="flex border-b">
            <button onClick={() => { setTab('operator'); setPesan('') }} className={`flex-1 py-3 text-sm font-medium transition ${tab === 'operator' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>Login Petugas / Agen</button>
            <button onClick={() => { setTab('syahbandar'); setPesan('') }} className={`flex-1 py-3 text-sm font-medium transition ${tab === 'syahbandar' ? 'bg-blue-800 text-white border-b-2 border-blue-900' : 'text-gray-500 hover:bg-gray-50'}`}>Portal Syahbandar</button>
          </div>

          {tab === 'operator' && (
            <form onSubmit={handleLogin} className="p-6" autoComplete="off">
              <label className="block mb-2 text-sm font-medium text-gray-900">Nomor HP / Email</label>
              <input type="text" name="operator_hp_no_autofill" value={noHp} onChange={(e) => setNoHp(e.target.value)} className="w-full border rounded px-3 py-2 mb-4 text-gray-900 focus:ring-blue-500 focus:border-blue-500" required autoComplete="off" />

              <label className="block mb-2 text-sm font-medium text-gray-900">Password</label>
              <div className="relative mb-6">
                <input type={showPassword ? 'text' : 'password'} name="admin_pass_no_autofill" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded px-3 py-2 pr-10 text-gray-900 focus:ring-blue-500 focus:border-blue-500" required autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none">
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>

              <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 font-medium">
                {loading ? 'Memproses...' : 'Login'}
              </button>

              {pesan && (
                <p className={`mt-4 text-sm text-center break-words font-medium ${pesan.includes('berhasil') ? 'text-green-600' : 'text-red-600'}`}>{pesan}</p>
              )}
            </form>
          )}

          {tab === 'syahbandar' && (
            <div className="p-6 bg-gray-50 min-h-[300px] flex flex-col items-center justify-center text-center">
              <div className="text-5xl mb-4">⚓</div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">Portal Syahbandar</h2>
              <p className="text-sm text-gray-600 mb-6">Silakan masuk ke halaman khusus Syahbandar untuk melihat dan mencetak manifest penumpang.</p>
              
              <button 
                onClick={() => router.push('/syahbandar')} 
                className="w-full bg-blue-800 text-white py-2.5 rounded hover:bg-blue-900 font-bold shadow-sm transition"
              >
                Masuk ke Portal Syahbandar &rarr;
              </button>
            </div>
          )}
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