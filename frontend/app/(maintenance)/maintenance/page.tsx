'use client'

import { useState, useEffect } from 'react'

const getApiBase = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
};

export default function MaintenancePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/auth/me`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          if (data.user && (data.user.role === 'admin' || data.user.role === 'super_admin')) {
            setIsAdmin(true);
          }
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };

    checkAdmin();
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/settings/maintenance-status`, {
          cache: 'no-store'
        });
        if (response.ok) {
          const data = await response.json()
          if (!data.maintenanceMode) {
            window.location.href = '/'
          }
        }
      } catch (error) {
        console.error('Error checking maintenance status:', error)
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 3000)
    return () => clearInterval(interval)
  }, [])

  const handleOpenSite = async () => {
    try {
      setOpening(true);
      setMessage(null);
      
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/settings/maintenance-toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ maintenanceMode: false })
      });
      
      const data = await res.json();
      
      if (res.ok && data.ok) {
        setMessage('تم فتح الموقع بنجاح!');
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      } else {
        setMessage(data.message || 'حدث خطأ');
      }
    } catch (error) {
      console.error('Error opening site:', error);
      setMessage('حدث خطأ في الاتصال');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div 
      dir="rtl" 
      className="fixed inset-0 z-[9999] bg-gradient-to-br from-[#0A1628] to-[#1a2d4a] flex items-center justify-center p-4"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
    >
      <div className="text-center max-w-lg">
        <div className="mb-8">
          <div className="w-32 h-32 mx-auto bg-gradient-to-br from-[#D4AF37] to-[#F4D03F] rounded-full flex items-center justify-center shadow-2xl">
            <svg className="w-16 h-16 text-[#0A1628]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold text-[#D4AF37] mb-4">
          الموقع تحت الصيانة
        </h1>
        
        <p className="text-xl text-gray-300 mb-6">
          نعمل على تحسين تجربتكم. سنعود قريباً!
        </p>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-[#D4AF37]/20">
          <p className="text-gray-400 text-sm">
            نحن نقوم بإجراء بعض التحسينات على الموقع.
            <br />
            يرجى العودة لاحقاً.
          </p>
        </div>

        {isAdmin && (
          <div className="mt-8 bg-green-900/30 border border-green-500/30 rounded-2xl p-6">
            <p className="text-green-400 text-sm mb-4">أنت مسجل كمسؤول</p>
            
            {message && (
              <p className={`text-sm mb-4 ${message.includes('خطأ') ? 'text-red-400' : 'text-green-400'}`}>
                {message}
              </p>
            )}
            
            <button
              onClick={handleOpenSite}
              disabled={opening}
              className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold py-3 px-6 rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              {opening ? 'جارٍ الفتح...' : 'فتح الموقع الآن'}
            </button>
            
            <a
              href="/admin/settings"
              className="block mt-3 text-[#D4AF37] hover:text-[#F4D03F] text-sm underline"
            >
              أو اذهب إلى لوحة التحكم
            </a>
          </div>
        )}

        <div className="mt-8 flex justify-center gap-2">
          <div className="w-3 h-3 bg-[#D4AF37] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-3 h-3 bg-[#D4AF37] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-3 h-3 bg-[#D4AF37] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  )
}
