import Cookies from 'js-cookie';

// Production fallback for Vercel deployment
// ⚠️ تأكد أن NEXT_PUBLIC_API_URL على Vercel = https://baytaljazeera-backend.onrender.com (مع d في backend)
const CORRECT_API = 'https://baytaljazeera-backend.onrender.com';
let _url = (process.env.NEXT_PUBLIC_API_URL || '').trim() || CORRECT_API;
// إصلاح خطأ شائع: baytaljazeera-backen (بدون d) يسبب ERR_NAME_NOT_RESOLVED
if (_url.includes('baytaljazeera-backen') && !_url.includes('baytaljazeera-backend')) {
  _url = CORRECT_API;
  if (typeof console !== 'undefined') console.warn('[API] تصحيح عنوان خاطئ: baytaljazeera-backen → baytaljazeera-backend');
}
export const API_URL = _url;

// Helper function to get API base URL
export const getApiBase = (): string => API_URL;

// CSRF token for requests without Bearer (login, register)
let csrfTokenCache: string | null = null;
export async function getCsrfToken(): Promise<string | null> {
  if (csrfTokenCache) return csrfTokenCache;
  try {
    const res = await fetch(`${API_URL}/api/csrf-token`, { credentials: 'include' });
    const data = await res.json();
    csrfTokenCache = data.csrfToken || null;
    return csrfTokenCache;
  } catch {
    return null;
  }
}

// Helper to get token from multiple sources (essential for incognito mode)
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
      const lsToken = localStorage.getItem('token');
      if (lsToken) return lsToken;
      
      const oauthToken = localStorage.getItem('oauth_token');
      if (oauthToken) return oauthToken;
    } catch (e) {
      // localStorage not available
    }
  }
  
  return null;
};

export const getAuthHeaders = (): HeadersInit => {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

/** For FormData requests - only Authorization, no Content-Type (browser sets multipart boundary) */
export const getAuthHeadersForFormData = (): HeadersInit => {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

export const getAuthHeadersWithJson = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...getAuthHeaders(),
});

export const apiFetch = async (path: string, options: RequestInit = {}): Promise<Response> => {
  const url = `${API_URL}${path}`;
  let headers: HeadersInit = { ...getAuthHeaders(), ...options.headers };
  if (!getToken()) {
    const csrf = await getCsrfToken();
    if (csrf) headers = { ...headers, 'x-csrf-token': csrf };
  }
  
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
};

export const apiGet = async (path: string): Promise<Response> => {
  return apiFetch(path, { method: 'GET' });
};

export const apiPost = async (path: string, body?: unknown): Promise<Response> => {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
};

export const apiPut = async (path: string, body?: unknown): Promise<Response> => {
  return apiFetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
};

export const apiDelete = async (path: string): Promise<Response> => {
  return apiFetch(path, { method: 'DELETE' });
};
