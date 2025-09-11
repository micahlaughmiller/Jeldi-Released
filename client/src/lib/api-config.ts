// API Configuration for production deployment
export const API_BASE_URL = import.meta.env.PROD 
  ? 'https://kpqqhqz2akdmklu23echtowfvq0bajsz.lambda-url.us-east-2.on.aws'
  : '';

export function getApiUrl(endpoint: string): string {
  // Remove leading slash if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return API_BASE_URL ? `${API_BASE_URL}/${cleanEndpoint}` : `/${endpoint}`;
}