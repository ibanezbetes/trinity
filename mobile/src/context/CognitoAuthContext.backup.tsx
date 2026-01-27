/**
 * AWS Cognito Authentication Context
 * Manages authentication state using AWS Cognito User Pool
 */

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { cognitoAuthService, CognitoUser, CognitoTokens } from '../services/cognitoAuthService';
import { dualAuthFlowService, AuthenticationResult } from '../services/dualAuthFlowService';
import { backgroundTokenRefreshService, TokenRefreshResult } from '../services/backgroundTokenRefreshService';
import { sessionExpirationService, ExpirationEvent } from '../services/sessionExpirationService';
import { migrationService } from '../services/migrationService';

interface AuthState {
  user: CognitoUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  migrationStatus: 'checking' | 'completed' | 'relogin_required' | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; message?: string }>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  updateProfile: (attributes: { name?: string; picture?: string }) => Promise<void>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message?: string }>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
  // New dual auth methods
  getAvailableAuthMethods: () => Promise<{ email: boolean; google: boolean; googleMessage?: string }>;
  authenticateAuto: (credentials?: { email?: string; password?: string }) => Promise<void>;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: { user: CognitoUser; tokens: CognitoTokens } | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_MIGRATION_STATUS'; payload: 'checking' | 'completed' | 'relogin_required' | null }
  | { type: 'LOGOUT' };

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  migrationStatus: null,
};

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
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
    case 'LOGOUT':
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
};

const CognitoAuthContext = createContext<AuthContextType | undefined>(undefined);

export const useCognitoAuth = () => {
  const context = useContext(CognitoAuthContext);
  if (!context) {
    throw new Error('useCognitoAuth debe usarse dentro de CognitoAuthProvider');
  }
  return context;
};

export const CognitoAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    checkAuthStatus();
    
    // Set up background token refresh service
    const handleTokenRefresh = (result: TokenRefreshResult) => {
      if (result.success && result.refreshed && result.newTokens) {
        console.log('🔄 Background token refresh successful, updating context');
        
        // Update user context with new tokens
        if (state.user) {
          dispatch({ 
            type: 'SET_USER', 
            payload: { 
              user: state.user, 
              tokens: result.newTokens 
            } 
          });
          
          // Broadcast token refresh
          broadcastAuthState(true, state.user);
        }
      } else if (!result.success && result.error) {
        console.warn('⚠️ Background token refresh failed:', result.error);
        
        // If refresh failed due to invalid refresh token, logout user
        if (result.error.includes('expirada') || result.error.includes('expired') || result.error.includes('NotAuthorizedException')) {
          console.log('🔄 Refresh token expired, logging out user');
          dispatch({ type: 'LOGOUT' });
          broadcastAuthState(false, null);
        }
      }
    };

    // Set up session expiration service
    const handleSessionExpiration = (event: ExpirationEvent) => {
      console.log('⏰ Session expiration event:', event.type, event.message);
      
      switch (event.type) {
        case 'expired':
          if (event.action === 'reauth') {
            // User needs to re-authenticate
            console.log('🔄 Session expired, logging out user');
            dispatch({ type: 'LOGOUT' });
            broadcastAuthState(false, null);
          }
          break;
          
        case 'refreshed':
          console.log('✅ Session refreshed automatically');
          // Token refresh is handled by background service
          break;
          
        case 'warning':
          console.log('⚠️ Session expiration warning shown to user');
          break;
          
        case 'reauth_required':
          console.log('🔄 User chose to re-authenticate');
          dispatch({ type: 'LOGOUT' });
          broadcastAuthState(false, null);
          break;
      }
    };

    // Add listeners
    backgroundTokenRefreshService.addRefreshListener(handleTokenRefresh);
    sessionExpirationService.addExpirationListener(handleSessionExpiration);
    
    // Start services when user is authenticated
    if (state.isAuthenticated) {
      backgroundTokenRefreshService.start({
        refreshThresholdMinutes: 15, // Refresh 15 minutes before expiry
        backgroundRefreshIntervalMinutes: 5, // Check every 5 minutes
        enableBackgroundRefresh: true,
      });
      
      sessionExpirationService.start({
        warningThresholdMinutes: 10, // Warn 10 minutes before expiry
        checkIntervalMinutes: 2, // Check every 2 minutes
        enableWarnings: true,
        autoRefreshEnabled: true,
      });
    }

    return () => {
      // Cleanup
      backgroundTokenRefreshService.removeRefreshListener(handleTokenRefresh);
      sessionExpirationService.removeExpirationListener(handleSessionExpiration);
      
      // Stop services when component unmounts or user logs out
      if (!state.isAuthenticated) {
        backgroundTokenRefreshService.stop();
        sessionExpirationService.stop();
      }
    };
  }, [state.isAuthenticated, state.user]);

  const checkAuthStatus = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      console.log('🔍 CognitoAuth: Checking auth status...');
      
      // First, perform migration check with error handling
      console.log('🔍 Checking for legacy token migration...');
      dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'checking' });
      
      let migrationResult: string;
      try {
        migrationResult = await migrationService.performMigrationCheck();
      } catch (migrationError) {
        console.error('❌ Migration check failed:', migrationError);
        // Continue with auth check even if migration fails
        migrationResult = 'completed';
      }
      
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
          try {
            migrationService.showReloginMessage();
          } catch (alertError) {
            console.warn('⚠️ Could not show re-login message:', alertError);
          }
          
          // Clear any existing auth state
          dispatch({ type: 'SET_USER', payload: null });
          return;
      }
      
      // After migration check, proceed with normal auth check
      console.log('🔍 CognitoAuth: Checking stored auth...');
      let authResult;
      try {
        authResult = await cognitoAuthService.checkStoredAuth();
      } catch (authError) {
        console.error('❌ Auth check failed:', authError);
        // Set default auth result on error
        authResult = { isAuthenticated: false };
      }
      
      console.log('🔍 CognitoAuth: Auth result:', {
        isAuthenticated: authResult.isAuthenticated,
        hasUser: !!authResult.user,
        hasTokens: !!authResult.tokens
      });
      
      if (authResult.isAuthenticated && authResult.user && authResult.tokens) {
        console.log('✅ CognitoAuth: User authenticated, setting user state');
        dispatch({ 
          type: 'SET_USER', 
          payload: { 
            user: authResult.user, 
            tokens: authResult.tokens 
          } 
        });
        
        // Broadcast authentication state change
        broadcastAuthState(true, authResult.user);
      } else {
        console.log('❌ CognitoAuth: No valid auth found, setting null user');
        dispatch({ type: 'SET_USER', payload: null });
        broadcastAuthState(false, null);
      }
    } catch (error) {
      console.error('❌ CognitoAuth: Check auth status error:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Error verificando autenticación' });
      dispatch({ type: 'SET_USER', payload: null });
      dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
      broadcastAuthState(false, null);
    }
  };

  // Broadcast authentication state changes to all components
  const broadcastAuthState = (isAuthenticated: boolean, user: CognitoUser | null) => {
    try {
      // Create custom event for auth state changes
      const authEvent = new CustomEvent('authStateChange', {
        detail: { isAuthenticated, user }
      });
      
      // In React Native, we can use a simple event emitter pattern
      // This will be picked up by components that need to react to auth changes
      console.log('📡 Broadcasting auth state:', { isAuthenticated, hasUser: !!user });
      
      // Store current auth state for components that need immediate access
      global.currentAuthState = { isAuthenticated, user };
      
    } catch (error) {
      console.warn('⚠️ Failed to broadcast auth state:', error);
    }
  };

  const login = async (email: string, password: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const result = await dualAuthFlowService.authenticateWithEmail(email, password);
      
      if (result.success && result.user && result.tokens) {
        // Store tokens
        await cognitoAuthService.storeTokens(result.tokens);
        
        dispatch({ 
          type: 'SET_USER', 
          payload: { 
            user: result.user, 
            tokens: result.tokens 
          } 
        });
        
        // Mark migration as completed after successful login
        dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
        
        // Broadcast authentication state change
        broadcastAuthState(true, result.user);
        
        // Start background services
        backgroundTokenRefreshService.start({
          refreshThresholdMinutes: 15,
          backgroundRefreshIntervalMinutes: 5,
          enableBackgroundRefresh: true,
        });
        
        sessionExpirationService.start({
          warningThresholdMinutes: 10,
          checkIntervalMinutes: 2,
          enableWarnings: true,
          autoRefreshEnabled: true,
        });
        
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
      const result = await dualAuthFlowService.registerWithEmail(email, password, name);
      
      dispatch({ type: 'SET_LOADING', payload: false });
      
      if (result.success) {
        return { 
          success: true, 
          message: 'Cuenta creada exitosamente. Ya puedes iniciar sesión.' 
        };
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error || 'Error al registrarse' });
        return { success: false, message: result.error };
      }
    } catch (error: any) {
      console.error('Register error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
      return { success: false, message: error.message || 'Error de conexión' };
    }
  };

  const signInWithGoogle = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      console.log('🔍 Starting Google Sign-In process...');
      
      const result = await dualAuthFlowService.authenticateWithGoogle({ allowFallback: false });
      
      if (result.success && result.user && result.tokens) {
        // Store tokens
        await cognitoAuthService.storeTokens(result.tokens);
        
        dispatch({ 
          type: 'SET_USER', 
          payload: { 
            user: result.user, 
            tokens: result.tokens 
          } 
        });
        
        // Mark migration as completed after successful login
        dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
        
        // Broadcast authentication state change
        broadcastAuthState(true, result.user);
        
        // Start background services
        backgroundTokenRefreshService.start({
          refreshThresholdMinutes: 15,
          backgroundRefreshIntervalMinutes: 5,
          enableBackgroundRefresh: true,
        });
        
        sessionExpirationService.start({
          warningThresholdMinutes: 10,
          checkIntervalMinutes: 2,
          enableWarnings: true,
          autoRefreshEnabled: true,
        });
        
        console.log('✅ Google Sign-In successful with Cognito');
      } else {
        console.log('❌ Google Sign-In failed:', result.error);
        dispatch({ type: 'SET_ERROR', payload: result.error || 'Error al iniciar sesión con Google' });
      }
    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      
      // Provide user-friendly error messages
      let errorMessage = 'Error de conexión con Google';
      
      if (error.message) {
        if (error.message.includes('not available')) {
          errorMessage = 'Google Sign-In no está disponible en este entorno. Usa email y contraseña.';
        } else if (error.message.includes('configuration')) {
          errorMessage = 'Google Sign-In no está configurado correctamente.';
        } else if (error.message.includes('cancelled')) {
          errorMessage = 'Inicio de sesión cancelado.';
        } else {
          errorMessage = error.message;
        }
      }
      
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
    }
  };

  const logout = async () => {
    try {
      // Stop background services
      backgroundTokenRefreshService.stop();
      sessionExpirationService.stop();
      
      // Use dual auth service for comprehensive sign out
      await dualAuthFlowService.signOutAll();
    } catch (error) {
      console.warn('Error signing out:', error);
    } finally {
      // Always clear local state
      dispatch({ type: 'LOGOUT' });
      
      // Broadcast logout state
      broadcastAuthState(false, null);
    }
  };

  const getAvailableAuthMethods = async () => {
    return await dualAuthFlowService.getAvailableAuthMethods();
  };

  const authenticateAuto = async (credentials: { email?: string; password?: string } = {}) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const result = await dualAuthFlowService.authenticateAuto(credentials, { allowFallback: true });
      
      if (result.success && result.user && result.tokens) {
        // Store tokens
        await cognitoAuthService.storeTokens(result.tokens);
        
        dispatch({ 
          type: 'SET_USER', 
          payload: { 
            user: result.user, 
            tokens: result.tokens 
          } 
        });
        
        // Mark migration as completed after successful login
        dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
        
        // Broadcast authentication state change
        broadcastAuthState(true, result.user);
        
        // Start background services
        backgroundTokenRefreshService.start({
          refreshThresholdMinutes: 15,
          backgroundRefreshIntervalMinutes: 5,
          enableBackgroundRefresh: true,
        });
        
        sessionExpirationService.start({
          warningThresholdMinutes: 10,
          checkIntervalMinutes: 2,
          enableWarnings: true,
          autoRefreshEnabled: true,
        });
        
        console.log(`✅ Auto authentication successful with ${result.method}`);
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error || 'Error en autenticación automática' });
      }
    } catch (error: any) {
      console.error('Auto authentication error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
    }
  };

  const clearError = () => dispatch({ type: 'CLEAR_ERROR' });
  const updateProfile = async (attributes: { name?: string; picture?: string }) => {

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

  return (
    <CognitoAuthContext.Provider
      value={{
        ...state,
        login,
        register,
        signInWithGoogle,
        logout,
        clearError,
        updateProfile,
        forgotPassword,
        confirmForgotPassword,
        getAvailableAuthMethods,
        authenticateAuto,
      }}
    >
      {children}
    </CognitoAuthContext.Provider>
  );
};

export default CognitoAuthProvider;