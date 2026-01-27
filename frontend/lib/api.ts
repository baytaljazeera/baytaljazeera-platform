import Cookies from 'js-cookie';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const getAuthHeaders = (): HeadersInit => {
  const token = Cookies.get('token');
  const headers: HeadersInit = {};
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
