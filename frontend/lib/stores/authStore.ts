import { create } from 'zustand';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Helper to get token from cookie with fallbacks (essential for incognito mode)
const getToken = (): string | null => {
  // Try js-cookie first
  const jsCookieToken = Cookies.get('token');
  if (jsCookieToken) return jsCookieToken;
  
  // Fallback to document.cookie parsing
  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'token' && value) {
        return decodeURIComponent(value);
      }
    }
  }
  
  // Check localStorage (essential for incognito mode where cookies may fail)
  if (typeof localStorage !== 'undefined') {
    try {
      // Check direct token first
      const lsToken = localStorage.getItem('token');
      if (lsToken) return lsToken;
      
      // Then check oauth_token
      const oauthToken = localStorage.getItem('oauth_token');
      if (oauthToken) return oauthToken;
    } catch (e) {
      // localStorage not available
    }
  }
  
  return null;
};

// Helper to get auth headers
const getAuthHeaders = (): HeadersInit => {
  const token = getToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  planName?: string;
  tier?: string;
  listingsCount?: number;
  listingLimit?: number;
  subscriptionStatus?: string;
  subscriptionEndDate?: string;
  emailVerified?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: { name: string; email: string; password: string; phone?: string; referralCode?: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  checkOAuthStatus: () => Promise<boolean>;
  loginWithOAuth: () => void;
  logoutOAuth: () => void;
  updateUser: (userData: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    set({ isHydrated: true });
  },

  login: async (email: string, password: string) => {
    try {
      set({ isLoading: true });
      
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        // If response is not JSON, create error object
        const text = await response.text();
        console.error('Login response parse error:', text);
        set({ isLoading: false });
        return { 
          success: false, 
          error: response.status === 500 
            ? 'خطأ في السيرفر، يرجى المحاولة لاحقاً' 
            : `خطأ ${response.status}: ${text || 'فشل تسجيل الدخول'}`
        };
      }

      if (!response.ok) {
        set({ isLoading: false });
        // Handle different error statuses
        let errorMessage = data.error || data.errorEn || 'فشل تسجيل الدخول';
        
        if (response.status === 401) {
          errorMessage = data.error || 'بيانات الدخول غير صحيحة';
          // Add attempts remaining info if available
          if (data.attemptsRemaining !== undefined) {
            errorMessage += ` (محاولات متبقية: ${data.attemptsRemaining})`;
          }
        } else if (response.status === 423) {
          errorMessage = data.error || 'الحساب مقفل، حاول لاحقاً';
        } else if (response.status === 500) {
          errorMessage = data.error || 'خطأ في السيرفر، يرجى المحاولة لاحقاً';
          // In development, show more details
          if (data.details && process.env.NODE_ENV === 'development') {
            console.error('Login server error details:', data.details);
          } else {
            console.error('Login server error:', data);
          }
        }
        
        return { success: false, error: errorMessage };
      }

      if (!data.user) {
        set({ isLoading: false });
        return { success: false, error: 'لم يتم استلام بيانات المستخدم' };
      }

      set({ 
        user: data.user, 
        isAuthenticated: true,
        isLoading: false 
      });

      return { success: true };
    } catch (error: any) {
      console.error('Login error:', error);
      set({ isLoading: false });
      return { 
        success: false, 
        error: error.message?.includes('fetch') 
          ? 'لا يمكن الاتصال بالسيرفر، تحقق من اتصالك بالإنترنت' 
          : 'حدث خطأ غير متوقع، حاول مرة أخرى' 
      };
    }
  },

  register: async (data) => {
    try {
      set({ isLoading: true });
      
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        // If response is not JSON, create error object
        const text = await response.text();
        console.error('Register response parse error:', text);
        set({ isLoading: false });
        return { 
          success: false, 
          error: response.status === 500 
            ? 'خطأ في السيرفر، يرجى المحاولة لاحقاً' 
            : `خطأ ${response.status}: ${text || 'فشل إنشاء الحساب'}`
        };
      }

      if (!response.ok) {
        set({ isLoading: false });
        // Use Arabic error message if available, otherwise translate common errors
        let errorMessage = result.error || result.errorEn || 'فشل إنشاء الحساب';
        
        // Translate common English errors to Arabic
        if (errorMessage.includes('Cannot use a pool') || 
            errorMessage.includes('pool') || 
            errorMessage.includes('connection')) {
          errorMessage = 'خطأ في اتصال قاعدة البيانات، يرجى المحاولة مرة أخرى';
        } else if (errorMessage.includes('Email already exists') || 
                   errorMessage.includes('email')) {
          errorMessage = 'البريد الإلكتروني مستخدم من قبل';
        } else if (errorMessage.includes('Phone already exists') || 
                   errorMessage.includes('phone')) {
          errorMessage = 'رقم الجوال مستخدم من قبل';
        } else if (errorMessage.includes('Password') || 
                   errorMessage.includes('password')) {
          errorMessage = result.error || 'كلمة المرور لا تلبي المتطلبات';
        } else if (response.status === 500) {
          errorMessage = result.error || 'خطأ في السيرفر، يرجى المحاولة لاحقاً';
        } else if (response.status === 409) {
          errorMessage = result.error || 'البيانات موجودة مسبقاً';
        }
        
        return { success: false, error: errorMessage };
      }

      set({ 
        user: result.user, 
        isAuthenticated: true,
        isLoading: false 
      });

      return { success: true };
    } catch (error: any) {
      console.error('Register error:', error);
      set({ isLoading: false });
      
      // Translate common errors to Arabic
      let errorMessage = 'حدث خطأ في الاتصال، حاول مرة أخرى';
      
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        errorMessage = 'لا يمكن الاتصال بالسيرفر، تحقق من اتصالك بالإنترنت';
      } else if (error.message?.includes('pool') || error.message?.includes('database') || error.message?.includes('connection')) {
        errorMessage = 'خطأ في اتصال قاعدة البيانات، يرجى المحاولة مرة أخرى';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return { success: false, error: errorMessage };
    }
  },

  logout: async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, { 
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      Cookies.remove('token');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },

  checkAuth: async () => {
    const state = get();
    if (!state.isHydrated) {
      state.hydrate();
    }
    
    try {
      set({ isLoading: true });
      
      const response = await fetch(`${API_URL}/api/auth/me`, { 
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      
      if (response.ok) {
        const data = await response.json();
        const user = data.user || data;
        set({ 
          user, 
          isAuthenticated: true,
          isLoading: false 
        });
      } else {
        // Clear invalid token
        Cookies.remove('token');
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  updateUser: (userData) => {
    const currentUser = get().user;
    if (currentUser) {
      const updatedUser = { ...currentUser, ...userData };
      set({ user: updatedUser });
    }
  },

  setLoading: (loading) => set({ isLoading: loading }),

  checkOAuthStatus: async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/status`, { 
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      
      if (data.authenticated && data.user) {
        const oauthUser: User = {
          id: data.user.id,
          name: `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim() || 'مستخدم',
          email: data.user.email || '',
          role: 'customer',
        };
        set({ user: oauthUser, isAuthenticated: true });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  loginWithOAuth: () => {
    window.location.href = '/api/login';
  },

  logoutOAuth: () => {
    window.location.href = '/api/logout';
  },
}));
