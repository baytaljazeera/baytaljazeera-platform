import Cookies from 'js-cookie';

// Production fallback for Vercel deployment
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://baytaljazeera-backend.onrender.com';

// Helper function to get API base URL
export const getApiBase = (): string => API_URL;

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
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const getAuthHeadersWithJson = (): HeadersInit => {
  return {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  };
};

export const apiFetch = async (path: string, options: RequestInit = {}): Promise<Response> => {
  const url = `${API_URL}${path}`;
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };
  
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
