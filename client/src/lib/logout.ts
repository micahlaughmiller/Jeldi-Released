import { queryClient, apiRequest } from './queryClient';
import { toast } from '@/hooks/use-toast';

export interface LogoutOptions {
  showToast?: boolean;
  redirectTo?: string;
}

export interface LogoutResult {
  success: boolean;
  error?: string;
}

/**
 * Comprehensive logout function that handles all session cleanup
 */
export async function performLogout(
  setLocation: (path: string) => void,
  options: LogoutOptions = {}
): Promise<LogoutResult> {
  const { showToast = true, redirectTo = '/login' } = options;

  try {
    // Show loading toast if enabled
    if (showToast) {
      toast({
        title: "Signing out...",
        description: "Please wait while we clean up your session",
      });
    }

    // 1. Attempt server-side logout to invalidate JWT token
    try {
      await apiRequest('POST', '/api/auth/logout', {});
    } catch (serverError) {
      // Continue with client-side cleanup even if server logout fails
      console.warn('Server-side logout failed:', serverError);
    }

    // 2. Clear React Query cache
    queryClient.clear();

    // 3. Clear localStorage (token, user data, and any other app data)
    const keysToRemove = ['token', 'user'];
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn(`Failed to remove ${key} from localStorage:`, error);
      }
    });

    // 4. Clear sessionStorage as well for complete cleanup
    try {
      sessionStorage.clear();
    } catch (error) {
      console.warn('Failed to clear sessionStorage:', error);
    }

    // 5. Show success message if enabled
    if (showToast) {
      toast({
        title: "Signed out successfully",
        description: "Your session has been ended securely",
      });
    }

    // 6. Redirect to login page
    setLocation(redirectTo);

    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    console.error('Logout error:', error);
    
    // Show error toast if enabled
    if (showToast) {
      toast({
        title: "Logout error",
        description: "There was a problem signing you out. Please try again.",
        variant: "destructive",
      });
    }

    // Still attempt basic cleanup even on error
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      queryClient.clear();
      setLocation(redirectTo);
    } catch (cleanupError) {
      console.error('Emergency cleanup failed:', cleanupError);
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Check if user is authenticated by verifying token exists and is valid format
 */
export function isAuthenticated(): boolean {
  try {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (!token || !user) {
      return false;
    }

    // Basic token format validation (JWT should have 3 parts)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      return false;
    }

    // Try to parse user data
    JSON.parse(user);
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get current user from localStorage
 */
export function getCurrentUser() {
  try {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('Failed to parse user data from localStorage:', error);
    return null;
  }
}

/**
 * Clear user session without server call (for emergency cleanup)
 */
export function clearUserSession(setLocation: (path: string) => void) {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    queryClient.clear();
    setLocation('/login');
  } catch (error) {
    console.error('Emergency session cleanup failed:', error);
    // Force page reload as last resort
    window.location.href = '/login';
  }
}