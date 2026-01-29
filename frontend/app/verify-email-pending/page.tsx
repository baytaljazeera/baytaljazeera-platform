'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { api } from '@/lib/api';
import { Mail, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

export default function VerifyEmailPendingPage() {
  const router = useRouter();
  const { user, checkAuth } = useAuthStore();
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (user?.email_verified) {
      router.replace('/');
    }
  }, [user, router]);

  const handleResend = async () => {
    if (resending) return;
    
    setResending(true);
    setResendStatus('idle');
    
    try {
      const response = await api.post('/auth/resend-verification');
      if (response.ok) {
        setResendStatus('success');
        setMessage('تم إرسال رابط التفعيل إلى بريدك الإلكتروني');
      } else {
        setResendStatus('error');
        setMessage(response.error || 'حدث خطأ أثناء إعادة الإرسال');
      }
    } catch (err) {
      setResendStatus('error');
      setMessage('حدث خطأ في الاتصال');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#01273C] to-[#012F4A] p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-[#D4AF37] to-[#B8962E] rounded-full flex items-center justify-center mx-auto mb-6">
          <Mail className="w-10 h-10 text-white" />
        </div>
        
        <h1 className="text-2xl font-bold text-[#01273C] mb-4">
          تفعيل البريد الإلكتروني
        </h1>
        
        <p className="text-gray-600 mb-6">
          تم إرسال رابط التفعيل إلى بريدك الإلكتروني
          {user?.email && (
            <span className="block mt-2 font-semibold text-[#01273C]">
              {user.email}
            </span>
          )}
        </p>
        
        <p className="text-sm text-gray-500 mb-6">
          يرجى فتح بريدك الإلكتروني والنقر على رابط التفعيل لإكمال التسجيل.
          <br />
          قد يستغرق وصول الرسالة بضع دقائق.
        </p>

        {resendStatus === 'success' && (
          <div className="flex items-center gap-2 bg-green-50 text-green-700 p-3 rounded-lg mb-4">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {resendStatus === 'error' && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 p-3 rounded-lg mb-4">
            <XCircle className="w-5 h-5 flex-shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <button
          onClick={handleResend}
          disabled={resending}
          className="w-full py-3 px-6 bg-gradient-to-l from-[#D4AF37] to-[#B8962E] text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {resending ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              جاري الإرسال...
            </>
          ) : (
            <>
              <RefreshCw className="w-5 h-5" />
              إعادة إرسال رابط التفعيل
            </>
          )}
        </button>

        <p className="text-xs text-gray-400 mt-6">
          لم تتلق الرسالة؟ تحقق من مجلد البريد المزعج (Spam)
        </p>
      </div>
    </div>
  );
}
