'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DAFTAR_KOTA } from '@/lib/data-armada';

export default function Home() {
  const router = useRouter();
  const [asal, setAsal] = useState('');
  const [tujuan, setTujuan] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [jadwal, setJadwal] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const hasilRef = useRef<HTMLDivElement>(null);

  const clickCount = useRef(0);
  const clickTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - offset).toISOString();
    const jamSekarang = now.getHours();
    
    if (jamSekarang >= 16) {
      const besok = new Date(now.getTime() - offset + 24 * 60 * 60 * 1000);
      setTanggal(besok.toISOString().split('T')[0]);
    } else {
      setTanggal(localISOTime.split('T')[0]);
    }
  }, []);

  const handleSecretLogin = () => {
    clickCount.current += 1;
    if (clickTimeout.current) clearTimeout(clickTimeout.current);

    if (clickCount.current === 3) {
      router.push('/login');
      clickCount.current = 0;
    } else {
      clickTimeout.current = setTimeout(() => {
        clickCount.current = 0;
      }, 1000);
    }
  };

  const handleTukarRute = () => {
    const tempAsal = asal;
    setAsal(tujuan);
    setTujuan(tempAsal);
  };

  const getWaktuLokal = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - offset).toISOString();
    return {
      tanggalLokal: localISOTime.split('T')[0],
      jamLokal: localISOTime.split('T')[1].substring(0, 5),
    };
  };

  const handleCari = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setHasSearched(true);

    const { tanggalLokal, jamLokal } = getWaktuLokal();
    const tanggalCari = tanggal ? tanggal : tanggalLokal;

    const { data: templates } = await supabase
      .from('template_jadwal')
      .select(`*, kapal:kapal_id (kapasitas, layout_kursi)`)
      .eq('rute_asal', asal)
      .eq('rute_tujuan', tujuan)
      .eq('aktif', true);

    let { data, error } = await supabase
      .from('jadwal')
      .select(`*, kapal:kapal_id (nama, kapasitas, layout_kursi)`)
      .eq('rute_asal', asal)
      .eq('rute_tujuan', tujuan)
      .eq('tanggal', tanggalCari)
      .eq('status_jadwal', 'open')
      .order('jam_berangkat', { ascending: true });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    if (templates && templates.length > 0) {
      const newJadwalPayload: any[] = [];
      
      for (const t of templates) {
        const existing = data?.find((j: any) => j.kapal_id === t.kapal_id);
        
        if (!existing) {
          newJadwalPayload.push({
            kapal_id: t.kapal_id,
            rute_asal: t.rute_asal,
            rute_tujuan: t.rute_tujuan,
            tanggal: tanggalCari,
            jam_berangkat: t.jam_berangkat,
            harga: 150000, 
            status_jadwal: 'open',
          });
        } else {
          if (existing.jam_berangkat !== t.jam_berangkat) {
            const { count } = await supabase
              .from('pesanan')
              .select('*', { count: 'exact', head: true })
              .eq('jadwal_id', existing.id);

            if (count === 0) {
              await supabase
                .from('jadwal')
                .update({ jam_berangkat: t.jam_berangkat })
                .eq('id', existing.id);
            }
          }
        }
      }

      if (newJadwalPayload.length > 0) {
        const { data: insertedJadwal } = await supabase
          .from('jadwal')
          .insert(newJadwalPayload, { ignoreDuplicates: true })
          .select(`*, kapal:kapal_id (nama, kapasitas, layout_kursi)`);

        if (insertedJadwal) {
          const kursiPayload: any[] = [];
          for (const j of insertedJadwal) {
            const t = templates.find((x: any) => x.jam_berangkat === j.jam_berangkat);
            const kapasitas = t?.kapal?.kapasitas || 0;
            if (kapasitas > 0) {
              for (let i = 1; i <= kapasitas; i++) {
                kursiPayload.push({
                  jadwal_id: j.id,
                  nomor_kursi: i.toString(),
                  status: 'kosong'
                });
              }
            }
          }
          if (kursiPayload.length > 0) {
            await supabase.from('kursi').insert(kursiPayload, { ignoreDuplicates: true });
          }
        }
      }

      const { data: refreshedData } = await supabase
        .from('jadwal')
        .select(`*, kapal:kapal_id (nama, kapasitas, layout_kursi)`)
        .eq('rute_asal', asal)
        .eq('rute_tujuan', tujuan)
        .eq('tanggal', tanggalCari)
        .eq('status_jadwal', 'open')
        .order('jam_berangkat', { ascending: true });
      
      if (refreshedData) data = refreshedData;
    }

    let filteredData = data || [];
    if (tanggalCari === tanggalLokal) {
      filteredData = filteredData.filter((j: any) => {
        const jamBerangkat = j.jam_berangkat.substring(0, 5);
        const [jamB, menitB] = jamBerangkat.split(':').map(Number);
        const [jamL, menitL] = jamLokal.split(':').map(Number);
        const totalMenitBerangkat = (jamB * 60) + menitB;
        const totalMenitSekarang = (jamL * 60) + menitL;
        return (totalMenitBerangkat - totalMenitSekarang) >= 60;
      });
    }

    setJadwal(filteredData);
    setLoading(false);

    setTimeout(() => {
      if (hasilRef.current) {
        hasilRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 300);
  };

  return (
    <div className={`flex flex-col items-center pt-8 px-4 pb-12 w-full min-h-[100dvh] transition-colors duration-500 ${hasSearched ? 'bg-purple-100' : 'bg-purple-700'}`}>
      
      {/* CSS Animasi Kustom */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes muter {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.2); }
          100% { transform: rotate(360deg) scale(1); }
        }
        .lingkaran-loading {
          animation: muter 1.5s infinite ease-in-out;
        }
        .lingkaran-loading:nth-child(2) { animation-delay: 0.1s; }
        .lingkaran-loading:nth-child(3) { animation-delay: 0.2s; }
        .lingkaran-loading:nth-child(4) { animation-delay: 0.3s; }
        .lingkaran-loading:nth-child(5) { animation-delay: 0.4s; }
        .lingkaran-loading:nth-child(6) { animation-delay: 0.5s; }
      `}} />

      {/* KARTU BRAND (PUTIH) */}
      <div className={`w-full max-w-md bg-white rounded-xl shadow-md p-4 mb-4 flex flex-col items-center ${hasSearched ? 'hidden md:flex' : 'flex'}`}>
        <h2 
          onClick={handleSecretLogin} 
          className="text-3xl font-normal text-gray-900 tracking-widest cursor-default select-none lowercase"
        >
          tempakul
        </h2>
        
        {/* 6 Lingkaran Berputar */}
        <div className="flex gap-1.5 mt-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 lingkaran-loading"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 lingkaran-loading"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 lingkaran-loading"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 lingkaran-loading"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-purple-500 lingkaran-loading"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-pink-500 lingkaran-loading"></div>
        </div>
      </div>

      {/* KARTU PENCARIAN */}
      <div className={`w-full max-w-md bg-white rounded-xl shadow-lg p-6 ${hasSearched ? 'hidden md:block' : 'block'}`}>
        
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">
            Cari Jadwal Tiket Speed
          </h1>
        </div>

        <form onSubmit={handleCari} className="space-y-4 relative">
          <div>
            <label className="block text-sm font-medium text-gray-700">Dari</label>
            <select required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-purple-500 focus:border-purple-500" value={asal} onChange={(e) => setAsal(e.target.value)}>
              <option value="">-- Pilih Kota --</option>
              {DAFTAR_KOTA.map((kota) => <option key={kota} value={kota}>{kota}</option>)}
            </select>
          </div>

          <div className="flex justify-center -my-2 relative z-10">
            <button type="button" onClick={handleTukarRute} className="bg-white border border-gray-300 rounded-full p-2 shadow-sm text-gray-500 hover:text-purple-600 hover:border-purple-400 transition-colors" title="Tukar Rute">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Ke</label>
            <select required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-purple-500 focus:border-purple-500" value={tujuan} onChange={(e) => setTujuan(e.target.value)}>
              <option value="">-- Pilih Kota --</option>
              {DAFTAR_KOTA.map((kota) => <option key={kota} value={kota}>{kota}</option>)}
            </select>
          </div>

          <div className="pt-2">
            <label className="block text-sm font-medium text-gray-700">Tanggal</label>
            <input type="date" required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-purple-500 focus:border-purple-500" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>

          <button type="submit" disabled={loading} className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none disabled:opacity-50 transition-colors">
            {loading ? 'Mencari...' : 'Cari Jadwal'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-500 mb-2">Lupa atau belum cetak e-tiket?</p>
          <Link href="/cek-tiket" className="inline-block w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100">
            Cek Transaksi / Tiket Anda
          </Link>
        </div>
      </div>

      {hasSearched && (
        <div ref={hasilRef} className="w-full max-w-3xl mt-2 md:mt-8 space-y-3 mb-10 scroll-mt-6">
          
          <div className="block md:hidden mb-4">
            <button onClick={() => setHasSearched(false)} className="text-sm text-purple-700 font-medium hover:underline flex items-center gap-1">
              &larr; Ubah Pencarian
            </button>
          </div>

          <h3 className="text-lg font-bold text-purple-900 border-b border-purple-300 pb-2">Jadwal Tersedia</h3>
          {jadwal.length === 0 ? (
            <p className="text-center text-purple-900 py-4 bg-purple-200 rounded-lg shadow-sm">Tidak ada jadwal yang tersedia atau waktu pembelian sudah ditutup.</p>
          ) : (
            jadwal.map((j) => (
              <div key={j.id} className="bg-white p-3 md:px-4 md:py-3 rounded-lg shadow border border-gray-200 flex items-stretch gap-3 md:gap-4">
                
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex justify-between items-center mb-0.5 md:mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm md:text-lg text-gray-900 leading-tight">
                        {j.jam_berangkat.substring(0,5)}
                      </span>
                      <span className="text-[10px] md:text-sm text-purple-800 font-semibold truncate">
                        {j.rute_asal} - {j.rute_tujuan}
                      </span>
                    </div>
                    <div className="font-bold text-purple-600 text-xs md:text-base whitespace-nowrap ml-2">
                      Rp {j.harga?.toLocaleString('id-ID')}
                    </div>
                  </div>
                  
                  <div>
                    <p className="font-bold text-xs md:text-base text-gray-900 truncate leading-tight">{j.kapal?.nama}</p>
                  </div>
                </div>

                <div className="w-[60px] md:w-24 flex-shrink-0 flex items-stretch">
                  <Link href={`/kursi?jadwal=${j.id}`} className="flex-1 flex items-center justify-center border border-transparent rounded-md shadow-sm text-[11px] md:text-sm font-medium text-white bg-green-600 hover:bg-green-700">
                    Pilih
                  </Link>
                </div>

              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}