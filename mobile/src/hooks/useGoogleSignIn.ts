import { useState, useEffect, useCallback } from 'react';
import GoogleSignInManager from '../services/googleSignInManager';
import {
  AuthResult,
  GoogleUser,
  GoogleSignInCapabilities,
  GoogleSignInError,
} from '../types/googleSignIn';

interface UseGoogleSignInReturn {
  // State
  isAvailable: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  isSigningOut: boolean;
  currentUser: GoogleUser | null;
  capabilities: GoogleSignInCapabilities | null;
  error: string | null;
  
  // Actions
  signIn: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  
  // Utilities
  getStatusMessage: () => string;
  clearError: () => void;
}

export const useGoogleSignIn = (): UseGoogleSignInReturn => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [currentUser, setCurrentUser] = useState<GoogleUser | null>(null);
  const [capabilities, setCapabilities] = useState<GoogleSignInCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);

  const googleSignInManager = GoogleSignInManager.getInstance();

  // Initialize Google Sign-In
  const initialize = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await googleSignInManager.initialize();
      
      const available = googleSignInManager.isAvailable();
      const caps = googleSignInManager.getCapabilities();
      const user = await googleSignInManager.getCurrentUser();
      
      setIsAvailable(available);
      setCapabilities(caps);
      setCurrentUser(user);
      
    } catch (err: any) {
      console.error('❌ Error initializing Google Sign-In:', err);
      setError(`Error inicializando Google Sign-In: ${err.message || err}`);
      setIsAvailable(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sign in with Google
  const signIn = useCallback(async (): Promise<AuthResult> => {
    try {
      setIsSigningIn(true);
      setError(null);
      
      const result = await googleSignInManager.signIn();
      
      if (result.success && result.user) {
        setCurrentUser(result.user);
      } else {
        setError(result.error || 'Error desconocido durante Google Sign-In');
      }
      
      return result;
      
    } catch (err: any) {
      const errorMessage = `Error durante Google Sign-In: ${err.message || err}`;
      setError(errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        errorCode: GoogleSignInError.UNKNOWN_ERROR,
      };
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  // Sign out from Google
  const signOut = useCallback(async (): Promise<void> => {
    try {
      setIsSigningOut(true);
      setError(null);
      
      await googleSignInManager.signOut();
      setCurrentUser(null);
      
    } catch (err: any) {
      console.error('❌ Error signing out from Google:', err);
      setError(`Error cerrando sesión: ${err.message || err}`);
      throw err;
    } finally {
      setIsSigningOut(false);
    }
  }, []);

  // Refresh current state
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      
      const user = await googleSignInManager.getCurrentUser();
      setCurrentUser(user);
      
      const available = googleSignInManager.isAvailable();
      setIsAvailable(available);
      
    } catch (err: any) {
      console.error('❌ Error refreshing Google Sign-In state:', err);
      setError(`Error actualizando estado: ${err.message || err}`);
    }
  }, []);

  // Get status message
  const getStatusMessage = useCallback((): string => {
    if (isLoading) {
      return 'Inicializando Google Sign-In...';
    }
    
    if (error) {
      return `Error: ${error}`;
    }
    
    if (!isAvailable) {
      return 'Google Sign-In no disponible';
    }
    
    if (currentUser) {
      return `Conectado como ${currentUser.name || currentUser.email}`;
    }
    
    return googleSignInManager.getStatusMessage();
  }, [isLoading, error, isAvailable, currentUser]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  return {
    // State
    isAvailable,
    isLoading,
    isSigningIn,
    isSigningOut,
    currentUser,
    capabilities,
    error,
    
    // Actions
    signIn,
    signOut,
    refresh,
    
    // Utilities
    getStatusMessage,
    clearError,
  };
};