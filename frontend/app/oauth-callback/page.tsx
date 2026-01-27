'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Cookies from 'js-cookie';
import { useAuthStore } from '@/lib/stores/authStore';

// Helper to set token using ALL available methods
function saveToken(token: string): boolean {
  let success = false;
  
  try {
    // Method 1: Use js-cookie
    Cookies.set('token', token, {
      expires: 7,
      secure: window.location.protocol === 'https:',
      sameSite: 'lax',
      path: '/'
    });
    success = true;
  } catch (e) {
    console.warn('js-cookie failed:', e);
  }
  
  try {
    // Method 2: Also set via document.cookie
    const expires = new Date();
    expires.setTime(expires.getTime() + 7 * 24 * 60 * 60 * 1000);
    const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `token=${encodeURIComponent(token)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax${secureFlag}`;
    success = true;
  } catch (e) {
    console.warn('document.cookie failed:', e);
  }
  
  try {
    // Method 3: Always save to localStorage as backup (essential for incognito)
    localStorage.setItem('token', token);
    localStorage.setItem('oauth_token', token); // For compatibility
    success = true;
  } catch (e) {
    console.warn('localStorage failed:', e);
  }
  
  return success;
}

// Helper to verify token was saved somewhere
function verifyTokenSaved(expectedToken: string): boolean {
  // Check js-cookie
  const jsCookieToken = Cookies.get('token');
  if (jsCookieToken === expectedToken) return true;
  
  // Check document.cookie
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'token' && decodeURIComponent(value || '') === expectedToken) {
      return true;
    }
  }
  
  // Check localStorage
  try {
    const lsToken = localStorage.getItem('token');
    if (lsToken === expectedToken) return true;
    
    const oauthToken = localStorage.getItem('oauth_token');
    if (oauthToken === expectedToken) return true;
  } catch (e) {
    // localStorage not available
  }
  
  return false;
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
        
        // Save token using ALL available methods
        saveToken(token);
        
        // Wait a moment for storage operations
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify the token was saved somewhere
        const tokenSaved = verifyTokenSaved(token);
        if (!tokenSaved) {
          console.error('Failed to save token in any storage method');
          router.replace('/login?error=storage_failed');
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
