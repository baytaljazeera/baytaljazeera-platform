import { create } from 'zustand';

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
      
      const response = await fetch('/api/auth/login', {
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
        } else if (response.status === 423) {
          errorMessage = data.error || 'الحساب مقفل، حاول لاحقاً';
        } else if (response.status === 500) {
          errorMessage = data.error || 'خطأ في السيرفر، يرجى المحاولة لاحقاً';
          console.error('Login server error:', data);
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
      
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        set({ isLoading: false });
        return { success: false, error: result.error || 'فشل إنشاء الحساب' };
      }

      set({ 
        user: result.user, 
        isAuthenticated: true,
        isLoading: false 
      });

      return { success: true };
    } catch (error) {
      set({ isLoading: false });
      return { success: false, error: 'حدث خطأ في الاتصال' };
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include' 
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
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
      
      const response = await fetch('/api/auth/me', { 
        credentials: 'include',
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
      const response = await fetch('/api/auth/status', { credentials: 'include' });
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
