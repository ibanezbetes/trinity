/**
 * Enhanced Authentication Context
 * Extends Cognito authentication with Google Sign-In capabilities
 */

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { cognitoAuthService, CognitoUser, CognitoTokens } from '../services/cognitoAuthService';
import { migrationService } from '../services/migrationService';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { AuthResult, GoogleUser } from '../types/googleSignIn';

interface EnhancedAuthState {
  // Cognito Auth State
  user: CognitoUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  migrationStatus: 'checking' | 'completed' | 'relogin_required' | null;
  
  // Google Sign-In State
  googleUser: GoogleUser | null;
  isGoogleSignInAvailable: boolean;
  isGoogleSigningIn: boolean;
  googleSignInError: string | null;
}

interface EnhancedAuthContextType extends EnhancedAuthState {
  // Cognito Auth Methods
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  clearError: () => void;
  updateProfile: (attributes: { name?: string; picture?: string }) => Promise<void>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message?: string }>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
  
  // Google Sign-In Methods
  signInWithGoogle: () => Promise<AuthResult>;
  signOutFromGoogle: () => Promise<void>;
  linkGoogleAccount: () => Promise<{ success: boolean; message?: string }>;
  unlinkGoogleAccount: () => Promise<{ success: boolean; message?: string }>;
  clearGoogleError: () => void;
  
  // Utility Methods
  getAuthenticationMethods: () => Array<{ method: string; available: boolean; description: string }>;
  getAuthenticationStatus: () => string;
}

type EnhancedAuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: { user: CognitoUser; tokens: CognitoTokens } | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_MIGRATION_STATUS'; payload: 'checking' | 'completed' | 'relogin_required' | null }
  | { type: 'SET_GOOGLE_USER'; payload: GoogleUser | null }
  | { type: 'SET_GOOGLE_SIGNIN_AVAILABLE'; payload: boolean }
  | { type: 'SET_GOOGLE_SIGNING_IN'; payload: boolean }
  | { type: 'SET_GOOGLE_ERROR'; payload: string | null }
  | { type: 'CLEAR_GOOGLE_ERROR' }
  | { type: 'LOGOUT' };

const initialState: EnhancedAuthState = {
  // Cognito Auth State
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  migrationStatus: null,
  
  // Google Sign-In State
  googleUser: null,
  isGoogleSignInAvailable: false,
  isGoogleSigningIn: false,
  googleSignInError: null,
};

const enhancedAuthReducer = (state: EnhancedAuthState, action: EnhancedAuthAction): EnhancedAuthState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_USER':
      return {
        ...state,
        user: action.payload?.user || null,
        isAuthenticated: !!action.payload?.user,
        isLoading: false,
        error: null,
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'SET_MIGRATION_STATUS':
      return { ...state, migrationStatus: action.payload };
    case 'SET_GOOGLE_USER':
      return { ...state, googleUser: action.payload };
    case 'SET_GOOGLE_SIGNIN_AVAILABLE':
      return { ...state, isGoogleSignInAvailable: action.payload };
    case 'SET_GOOGLE_SIGNING_IN':
      return { ...state, isGoogleSigningIn: action.payload };
    case 'SET_GOOGLE_ERROR':
      return { ...state, googleSignInError: action.payload };
    case 'CLEAR_GOOGLE_ERROR':
      return { ...state, googleSignInError: null };
    case 'LOGOUT':
      return { 
        ...initialState, 
        isLoading: false,
        isGoogleSignInAvailable: state.isGoogleSignInAvailable, // Preserve availability status
      };
    default:
      return state;
  }
};

const EnhancedAuthContext = createContext<EnhancedAuthContextType | undefined>(undefined);

export const useEnhancedAuth = () => {
  const context = useContext(EnhancedAuthContext);
  if (!context) {
    throw new Error('useEnhancedAuth debe usarse dentro de EnhancedAuthProvider');
  }
  return context;
};

export const EnhancedAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(enhancedAuthReducer, initialState);
  
  // Use Google Sign-In hook
  const {
    isAvailable: googleAvailable,
    isSigningIn: googleSigningIn,
    currentUser: googleCurrentUser,
    error: googleError,
    signIn: googleSignIn,
    signOut: googleSignOut,
    clearError: clearGoogleError,
  } = useGoogleSignIn();

  // Sync Google Sign-In state with context
  useEffect(() => {
    dispatch({ type: 'SET_GOOGLE_SIGNIN_AVAILABLE', payload: googleAvailable });
  }, [googleAvailable]);

  useEffect(() => {
    dispatch({ type: 'SET_GOOGLE_SIGNING_IN', payload: googleSigningIn });
  }, [googleSigningIn]);

  useEffect(() => {
    dispatch({ type: 'SET_GOOGLE_USER', payload: googleCurrentUser });
  }, [googleCurrentUser]);

  useEffect(() => {
    dispatch({ type: 'SET_GOOGLE_ERROR', payload: googleError });
  }, [googleError]);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      // First, perform migration check
      console.log('🔍 Checking for legacy token migration...');
      dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'checking' });
      
      const migrationResult = await migrationService.performMigrationCheck();
      
      switch (migrationResult) {
        case 'no_migration_needed':
          console.log('✅ No migration needed');
          dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
          break;
          
        case 'migration_completed':
          console.log('✅ Migration completed successfully');
          dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
          break;
          
        case 'relogin_required':
          console.log('🔄 Re-login required after migration');
          dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'relogin_required' });
          
          // Show re-login message to user
          migrationService.showReloginMessage();
          
          // Clear any existing auth state
          dispatch({ type: 'SET_USER', payload: null });
          return;
      }
      
      // After migration check, proceed with normal auth check
      const authResult = await cognitoAuthService.checkStoredAuth();
      
      if (authResult.isAuthenticated && authResult.user && authResult.tokens) {
        dispatch({ 
          type: 'SET_USER', 
          payload: { 
            user: authResult.user, 
            tokens: authResult.tokens 
          } 
        });
      } else {
        dispatch({ type: 'SET_USER', payload: null });
      }
    } catch (error) {
      console.error('Check auth status error:', error);
      dispatch({ type: 'SET_USER', payload: null });
      dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
    }
  };

  const login = async (email: string, password: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const result = await cognitoAuthService.login(email, password);
      
      if (result.success && result.data) {
        // Store tokens
        await cognitoAuthService.storeTokens(result.data.tokens);
        
        dispatch({ 
          type: 'SET_USER', 
          payload: { 
            user: result.data.user, 
            tokens: result.data.tokens 
          } 
        });
        
        // Mark migration as completed after successful login
        dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
        
        console.log('✅ Login successful with Cognito');
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error || 'Error al iniciar sesión' });
      }
    } catch (error: any) {
      console.error('Login error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
    }
  };

  const register = async (email: string, password: string, name: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const result = await cognitoAuthService.register(email, password, name);
      
      dispatch({ type: 'SET_LOADING', payload: false });
      
      if (result.success) {
        return { 
          success: true, 
          message: result.message || 'Cuenta creada exitosamente. Ya puedes iniciar sesión.' 
        };
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.message || 'Error al registrarse' });
        return { success: false, message: result.message };
      }
    } catch (error: any) {
      console.error('Register error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
      return { success: false, message: error.message || 'Error de conexión' };
    }
  };

  const logout = async () => {
    try {
      // Sign out from Google if signed in
      if (googleCurrentUser) {
        await googleSignOut();
      }
      
      // Get current tokens to sign out from Cognito
      const storedTokens = await cognitoAuthService.checkStoredAuth();
      if (storedTokens.isAuthenticated && storedTokens.tokens) {
        await cognitoAuthService.signOut(storedTokens.tokens.accessToken);
      }
    } catch (error) {
      console.warn('Error signing out:', error);
    } finally {
      // Always clear local tokens and state
      await cognitoAuthService.clearTokens();
      dispatch({ type: 'LOGOUT' });
    }
  };

  const clearError = () => dispatch({ type: 'CLEAR_ERROR' });

  const updateProfile = async (attributes: { name?: string; picture?: string }) => {
    if (!state.user) return;

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const storedTokens = await cognitoAuthService.checkStoredAuth();
      if (!storedTokens.isAuthenticated || !storedTokens.tokens) {
        throw new Error('No authenticated user found');
      }

      const updateAttributes: { name?: string; picture?: string; preferred_username?: string } = {};
      
      if (attributes.name) {
        updateAttributes.name = attributes.name;
        updateAttributes.preferred_username = attributes.name;
      }
      if (attributes.picture) {
        updateAttributes.picture = attributes.picture;
      }

      const result = await cognitoAuthService.updateUserAttributes(
        storedTokens.tokens.accessToken,
        updateAttributes
      );

      if (result.success) {
        // Update local user state
        const updatedUser: CognitoUser = {
          ...state.user,
          name: attributes.name || state.user.name,
          preferred_username: attributes.name || state.user.preferred_username,
          picture: attributes.picture || state.user.picture,
        };

        dispatch({ 
          type: 'SET_USER', 
          payload: { 
            user: updatedUser, 
            tokens: storedTokens.tokens 
          } 
        });
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error || 'Error al actualizar perfil' });
      }
    } catch (error: any) {
      console.error('Update profile error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error al actualizar perfil' });
    }
  };

  const forgotPassword = async (email: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const result = await cognitoAuthService.forgotPassword(email);
      dispatch({ type: 'SET_LOADING', payload: false });
      
      if (!result.success) {
        dispatch({ type: 'SET_ERROR', payload: result.message || 'Error al enviar código' });
      }
      
      return result;
    } catch (error: any) {
      console.error('Forgot password error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
      return { success: false, message: error.message || 'Error de conexión' };
    }
  };

  const confirmForgotPassword = async (email: string, code: string, newPassword: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const result = await cognitoAuthService.confirmForgotPassword(email, code, newPassword);
      dispatch({ type: 'SET_LOADING', payload: false });
      
      if (!result.success) {
        dispatch({ type: 'SET_ERROR', payload: result.message || 'Error al restablecer contraseña' });
      }
      
      return result;
    } catch (error: any) {
      console.error('Confirm forgot password error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
      return { success: false, message: error.message || 'Error de conexión' };
    }
  };

  // Google Sign-In Methods
  const signInWithGoogle = async (): Promise<AuthResult> => {
    dispatch({ type: 'CLEAR_GOOGLE_ERROR' });
    
    try {
      const result = await googleSignIn();
      
      if (result.success && result.user) {
        // TODO: Integrate Google Sign-In with Cognito
        // This would involve exchanging Google tokens for Cognito tokens
        console.log('✅ Google Sign-In successful, integrating with Cognito...');
        
        // For now, just return the result
        // In a full implementation, you would:
        // 1. Send Google ID token to your backend
        // 2. Backend verifies token with Google
        // 3. Backend creates/updates Cognito user
        // 4. Backend returns Cognito tokens
        // 5. Store Cognito tokens locally
      }
      
      return result;
    } catch (error: any) {
      const errorMessage = `Error en Google Sign-In: ${error.message || error}`;
      dispatch({ type: 'SET_GOOGLE_ERROR', payload: errorMessage });
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const signOutFromGoogle = async (): Promise<void> => {
    try {
      await googleSignOut();
      dispatch({ type: 'SET_GOOGLE_USER', payload: null });
    } catch (error: any) {
      console.error('Error signing out from Google:', error);
      dispatch({ type: 'SET_GOOGLE_ERROR', payload: `Error cerrando sesión de Google: ${error.message || error}` });
      throw error;
    }
  };

  const linkGoogleAccount = async (): Promise<{ success: boolean; message?: string }> => {
    if (!state.isAuthenticated) {
      return { success: false, message: 'Debes estar autenticado para vincular una cuenta de Google' };
    }

    try {
      const result = await signInWithGoogle();
      
      if (result.success) {
        // TODO: Link Google account to existing Cognito user
        return { success: true, message: 'Cuenta de Google vinculada exitosamente' };
      } else {
        return { success: false, message: result.error || 'Error vinculando cuenta de Google' };
      }
    } catch (error: any) {
      return { success: false, message: `Error vinculando cuenta: ${error.message || error}` };
    }
  };

  const unlinkGoogleAccount = async (): Promise<{ success: boolean; message?: string }> => {
    try {
      await signOutFromGoogle();
      // TODO: Remove Google account link from Cognito user
      return { success: true, message: 'Cuenta de Google desvinculada exitosamente' };
    } catch (error: any) {
      return { success: false, message: `Error desvinculando cuenta: ${error.message || error}` };
    }
  };

  const clearGoogleErrorAction = () => {
    dispatch({ type: 'CLEAR_GOOGLE_ERROR' });
    clearGoogleError();
  };

  // Utility Methods
  const getAuthenticationMethods = () => {
    return [
      {
        method: 'Email/Password',
        available: true,
        description: 'Autenticación tradicional con email y contraseña',
      },
      {
        method: 'Google Sign-In',
        available: state.isGoogleSignInAvailable,
        description: state.isGoogleSignInAvailable 
          ? 'Iniciar sesión con tu cuenta de Google'
          : 'Google Sign-In no disponible en este entorno',
      },
      {
        method: 'AWS Cognito',
        available: true,
        description: 'Sistema de autenticación principal (AWS Cognito)',
      },
    ];
  };

  const getAuthenticationStatus = () => {
    if (state.isLoading) {
      return 'Cargando...';
    }
    
    if (state.error) {
      return `Error: ${state.error}`;
    }
    
    if (state.isAuthenticated && state.user) {
      let status = `Autenticado como ${state.user.name || state.user.email}`;
      
      if (state.googleUser) {
        status += ` (Google: ${state.googleUser.name || state.googleUser.email})`;
      }
      
      return status;
    }
    
    return 'No autenticado';
  };

  return (
    <EnhancedAuthContext.Provider
      value={{
        ...state,
        // Cognito Auth Methods
        login,
        register,
        logout,
        clearError,
        updateProfile,
        forgotPassword,
        confirmForgotPassword,
        // Google Sign-In Methods
        signInWithGoogle,
        signOutFromGoogle,
        linkGoogleAccount,
        unlinkGoogleAccount,
        clearGoogleError: clearGoogleErrorAction,
        // Utility Methods
        getAuthenticationMethods,
        getAuthenticationStatus,
      }}
    >
      {children}
    </EnhancedAuthContext.Provider>
  );
};

export default EnhancedAuthProvider;