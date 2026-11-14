'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-gray-700 font-medium text-sm">Mengalihkan ke E-Tiket...</p>
    </div>
  )
}

export default function EtiketPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-gray-600">Memuat...</p></div>}>
      <EtiketRedirectContent />
    </Suspense>
  )
}