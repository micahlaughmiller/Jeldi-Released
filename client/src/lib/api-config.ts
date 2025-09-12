// API Configuration for multiple environments
export const getApiBaseUrl = () => {
  if (typeof window === 'undefined') return '';
  
  const hostname = window.location.hostname;
  
  // AWS CloudFront/Custom domains - use Lambda URL
  if (hostname === 'demo.jeldi.app' || hostname === 'overlay.jeldi.app') {
    return 'https://kpqqhqz2akdmklu23echtowfvq0bajsz.lambda-url.us-east-2.on.aws';
  }
  
  // Replit hosted - use relative URLs to same origin
  if (hostname.includes('replit.dev') || hostname.includes('replit.app')) {
    return '';
  }
  
  // Published Replit app with custom domain pointing to Replit
  if (hostname === 'demo.jeldi.app' && window.location.origin.includes('replit')) {
    return '';
  }
  
  // Development/localhost - use relative URLs
  return '';
};

// Custom domain detection
export const isCustomDomain = () => {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'demo.jeldi.app' || hostname === 'overlay.jeldi.app';
};

// Get the appropriate API URL for current environment
export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}/${cleanEndpoint}` : `/${cleanEndpoint}`;
}