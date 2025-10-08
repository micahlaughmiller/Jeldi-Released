// API Configuration for multiple environments
export const getApiBaseUrl = () => {
  if (typeof window === 'undefined') return '';
  
  const hostname = window.location.hostname;
  
  // For custom domains, check if they're pointed to AWS Lambda or Replit
  if (hostname === 'demo.jeldi.app' || hostname === 'overlay.jeldi.app') {
    // If running on Replit infrastructure (check origin), use relative URLs
    if (window.location.origin.includes('replit')) {
      return '';
    }
    // Otherwise use Lambda URL (when deployed to AWS)
    return 'https://kpqqhqz2akdmklu23echtowfvq0bajsz.lambda-url.us-east-2.on.aws';
  }
  
  // Replit hosted - use relative URLs to same origin
  if (hostname.includes('replit.dev') || hostname.includes('replit.app') || hostname.includes('repl.co')) {
    return '';
  }
  
  // Development/localhost - use relative URLs
  return '';
};

// Environment detection
export const getEnvironment = (): 'demo' | 'overlay' | 'development' => {
  if (typeof window === 'undefined') return 'development';
  
  const hostname = window.location.hostname;
  
  if (hostname === 'demo.jeldi.app') return 'demo';
  if (hostname === 'overlay.jeldi.app') return 'overlay';
  
  return 'development';
};

// Check if demo environment (should have dummy data)
export const isDemoEnvironment = () => {
  return getEnvironment() === 'demo';
};

// Check if overlay environment (production, no dummy data)
export const isOverlayEnvironment = () => {
  return getEnvironment() === 'overlay';
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