'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

function LayarMemuat({ teks }: { teks: string }) {
  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col items-center justify-center">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-spin-custom { animation: spin 1s linear infinite; }
      `}} />
      <div className="relative w-24 h-24 flex items-center justify-center mb-4">
        <div className="absolute w-24 h-24 rounded-full border-4 border-transparent border-t-red-500 border-r-yellow-400 border-b-green-500 border-l-blue-500 animate-spin-custom"></div>
        <div className="text-xs font-bold text-gray-500">Memuat...</div>
      </div>
      <p className="text-gray-700 font-medium text-sm">{teks}</p>
    </div>
  )
}

function EtiketRedirectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pesananParam = searchParams.get('pesanan')
  const dari = searchParams.get('dari')

  useEffect(() => {
    if (!pesananParam) {
      router.replace('/')
      return
    }
    // Redirect ke pusat-kontrol/etiket (Mother File) bawa parameter 'dari'
    const kanalParam = dari ? `&dari=${dari}` : ''
    router.replace(`/superadmin/pusat-kontrol/etiket?pesanan=${pesananParam}${kanalParam}`)
  }, [pesananParam, dari, router])

  return <LayarMemuat teks="Mengalihkan ke E-Tiket..." />
}

export default function EtiketPage() {
  return (
    <Suspense fallback={<LayarMemuat teks="Mengalihkan ke E-Tiket..." />}>
      <EtiketRedirectContent />
    </Suspense>
  )
}