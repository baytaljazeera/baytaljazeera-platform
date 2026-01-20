const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://baytaljazeera-platform-production.up.railway.app';

export function getImageUrl(url: string | null | undefined): string {
  if (!url || url.trim() === "") {
    return "/images/property1.jpg"; // Default placeholder
  }
  
  // Already full URL
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  
  // Remove leading slash for consistent handling
  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  
  // Handle uploads directory
  if (cleanUrl.startsWith("/uploads/") || cleanUrl.startsWith("/images/")) {
    return `${API_URL}${cleanUrl}`;
  }
  
  // Default: assume it's in uploads
  if (!cleanUrl.includes("/")) {
    return `${API_URL}/uploads/${cleanUrl}`;
  }
  
  // For any other path starting with /
  return `${API_URL}${cleanUrl}`;
}
