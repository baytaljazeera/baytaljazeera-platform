'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Cookies from 'js-cookie';
import { useAuthStore } from '@/lib/stores/authStore';

// Helper to set cookie using multiple methods for maximum compatibility
function setTokenCookie(token: string): boolean {
  try {
    // Method 1: Use js-cookie
    Cookies.set('token', token, {
      expires: 7,
      secure: window.location.protocol === 'https:',
      sameSite: 'lax',
      path: '/'
    });
    
    // Method 2: Also set via document.cookie as fallback
    const expires = new Date();
    expires.setTime(expires.getTime() + 7 * 24 * 60 * 60 * 1000);
    const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `token=${encodeURIComponent(token)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax${secureFlag}`;
    
    return true;
  } catch (e) {
    console.error('Error setting cookie:', e);
    return false;
  }
}

// Helper to get token from cookie
function getTokenFromCookie(): string | null {
  // Try js-cookie first
  const jsCookieToken = Cookies.get('token');
  if (jsCookieToken) return jsCookieToken;
  
  // Fallback to document.cookie parsing
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'token' && value) {
      return decodeURIComponent(value);
    }
  }
  
  return null;
}

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { checkAuth } = useAuthStore();
  const [status, setStatus] = useState('جاري تسجيل الدخول...');

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get('token');
      const provider = searchParams.get('provider');
      const error = searchParams.get('error');

      if (error) {
        router.replace(`/login?error=${error}`);
        return;
      }

      if (token) {
        setStatus('جاري حفظ بيانات الدخول...');
        
        // Set the cookie using multiple methods
        setTokenCookie(token);
        
        // Wait a moment for cookie to be saved
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify the cookie was set
        const savedToken = getTokenFromCookie();
        if (!savedToken) {
          console.error('Failed to save token cookie - trying localStorage fallback');
          // Try localStorage as last resort
          try {
            localStorage.setItem('oauth_token', token);
          } catch (e) {
            console.error('localStorage also failed:', e);
          }
          router.replace('/login?error=cookie_failed');
          return;
        }
        
        setStatus('جاري التحقق من الحساب...');
        
        // Check auth to load user data
        await checkAuth();
        
        // Redirect to home
        router.replace(`/?oauth=success&provider=${provider || 'google'}`);
      } else {
        router.replace('/login?error=no_token');
      }
    };

    handleCallback();
  }, [searchParams, router, checkAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#01273C] to-[#012F4A]">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white text-lg">{status}</p>
      </div>
    </div>
  );
}
