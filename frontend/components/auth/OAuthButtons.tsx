'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface OAuthButtonsProps {
  className?: string;
}

export default function OAuthButtons({ className = '' }: OAuthButtonsProps) {
  const { loginWithOAuth } = useAuthStore();
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState<boolean | null>(null);

  // Check OAuth availability on mount
  useEffect(() => {
    const checkOAuthStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/status`, { credentials: 'include' });
        const data = await response.json();
        // OAuth is available if Google or Apple is configured
        setOauthAvailable(data.available || data.google || false);
      } catch (error) {
        console.error('Error checking OAuth status:', error);
        // Default to showing buttons - let the backend handle errors
        setOauthAvailable(true);
      }
    };
    checkOAuthStatus();
  }, []);

  const handleOAuthClick = (provider: string) => {
    setLoadingProvider(provider);
    // Redirect to OAuth provider via backend
    if (provider === 'google') {
      window.location.href = `${API_URL}/api/auth/google`;
    } else if (provider === 'apple') {
      window.location.href = `${API_URL}/api/auth/apple`;
    } else {
      loginWithOAuth(); // Fallback for other providers
    }
  };

  // Don't render if OAuth is not available
  if (oauthAvailable === false) {
    return null;
  }

  // Show loading state while checking
  if (oauthAvailable === null) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">أو تسجيل الدخول عبر</span>
        </div>
      </div>

      <button
        onClick={() => handleOAuthClick('google')}
        disabled={loadingProvider !== null}
        className="w-full flex items-center justify-center gap-3 px-4 py-3.5 border-2 border-gray-200 rounded-xl 
          bg-white hover:bg-gray-50 hover:border-[#4285F4]/30
          active:scale-[0.98] active:bg-gray-100 active:border-[#4285F4]
          disabled:opacity-60 disabled:cursor-not-allowed
          transition-all duration-150 ease-out
          shadow-sm hover:shadow-md"
      >
        {loadingProvider === 'google' ? (
          <svg className="w-5 h-5 animate-spin text-[#4285F4]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )}
        <span className="text-gray-700 font-semibold">
          {loadingProvider === 'google' ? 'جاري التحويل...' : 'تسجيل الدخول بـ Google'}
        </span>
      </button>

      <p className="text-center text-xs text-gray-500 mt-3">
        يدعم أيضاً: GitHub, X, البريد الإلكتروني
      </p>
    </div>
  );
}
