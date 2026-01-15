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
    const baseUrl = process.env.NEXT_PUBLIC_API_URL
    if (!baseUrl) {
      return NextResponse.next()
    }
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    
    const response = await fetch(`${baseUrl}/api/settings/maintenance-status`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json()
      if (data.maintenanceMode === true) {
        const maintenanceUrl = new URL('/maintenance', request.url)
        return NextResponse.redirect(maintenanceUrl)
      }
    }
  } catch (error) {
    // Silently continue if API is unavailable
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|uploads).*)',
  ],
}
