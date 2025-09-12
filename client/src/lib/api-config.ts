// API Configuration for production deployment
// Force Lambda URL for ALL environments to bypass CloudFront CORS issues
export const API_BASE_URL = 'https://kpqqhqz2akdmklu23echtowfvq0bajsz.lambda-url.us-east-2.on.aws';

// Custom domain detection for future use
export const isCustomDomain = () => {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'demo.jeldi.app' || hostname === 'overlay.jeldi.app';
};

export function getApiUrl(endpoint: string): string {
  // Remove leading slash if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return API_BASE_URL ? `${API_BASE_URL}/${cleanEndpoint}` : `/${cleanEndpoint}`;
}