const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://baytaljazeera-platform-production.up.railway.app';

export function getImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  
  if (url.startsWith("/uploads/") || url.startsWith("/images/")) {
    return `${API_URL}${url}`;
  }
  
  if (url.startsWith("/")) {
    return `${API_URL}${url}`;
  }
  
  return `${API_URL}/uploads/${url}`;
}
