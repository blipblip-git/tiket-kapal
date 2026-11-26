import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Next.js 16: file `middleware.ts` sudah diganti menjadi `proxy.ts`.
// Di deployment DEMO, seluruh area Superadmin disembunyikan. Demo tetap memakai
// kode yang sama dengan REAL, tetapi tidak punya Superadmin/Pusat Kontrol/Data
// Penyewa. API Superadmin juga ditutup supaya tidak ada jalan masuk lewat API.
const MODE_DEMO =
  process.env.DEMO_MODE === 'true' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

function areaSuperadmin(pathname: string): boolean {
  return (
    pathname === '/superadmin' ||
    pathname.startsWith('/superadmin/') ||
    pathname === '/dashboard-superadmin' ||
    pathname.startsWith('/dashboard-superadmin/') ||
    pathname === '/api/superadmin' ||
    pathname.startsWith('/api/superadmin/')
  )
}

export function proxy(request: NextRequest) {
  if (!MODE_DEMO) return NextResponse.next()

  if (areaSuperadmin(request.nextUrl.pathname)) {
    return new NextResponse('Halaman ini tidak tersedia di lingkungan demo.', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store'
      }
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/superadmin',
    '/superadmin/:path*',
    '/dashboard-superadmin',
    '/dashboard-superadmin/:path*',
    '/api/superadmin',
    '/api/superadmin/:path*'
  ]
}
