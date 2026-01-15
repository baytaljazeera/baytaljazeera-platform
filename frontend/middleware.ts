import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const EXCLUDED_PATHS = [
  '/admin',
  '/admin-login',
  '/login',
  '/maintenance',
  '/api',
  '/_next',
  '/favicon',
  '/uploads'
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isExcluded = EXCLUDED_PATHS.some(path => pathname.startsWith(path))
  if (isExcluded) {
    return NextResponse.next()
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'
    const response = await fetch(`${baseUrl}/api/settings/maintenance-status`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }
    })

    if (response.ok) {
      const data = await response.json()
      if (data.maintenanceMode === true) {
        const maintenanceUrl = new URL('/maintenance', request.url)
        return NextResponse.redirect(maintenanceUrl)
      }
    }
  } catch (error) {
    console.error('Maintenance check error:', error)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|uploads).*)',
  ],
}
