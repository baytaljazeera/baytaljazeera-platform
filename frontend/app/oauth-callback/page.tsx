'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Cookies from 'js-cookie';
import { useAuthStore } from '@/lib/stores/authStore';

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
        
        // Set the cookie
        Cookies.set('token', token, {
          expires: 7,
          secure: true,
          sameSite: 'lax',
          path: '/'
        });
        
        // Wait a moment for cookie to be saved
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify the cookie was set
        const savedToken = Cookies.get('token');
        if (!savedToken) {
          console.error('Failed to save token cookie');
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
