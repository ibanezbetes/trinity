/**
 * AWS Cognito Authentication Context
 * Manages authentication state using AWS Cognito User Pool
 * FIXED: Proper service imports and error handling
 */

import React, { createContext, useContext, useReducer, useEffect, useRef, ReactNode } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { 
  cognitoAuthService, 
  CognitoUser, 
  CognitoTokens,
  SessionRevokedError
} from '../services/cognitoAuthService';
import { 
  dualAuthFlowService, 
  AuthenticationResult 
} from '../services/dualAuthFlowService';
import { migrationService } from '../services/migrationService';
import { 
  backgroundTokenRefreshService, 
  TokenRefreshResult 
} from '../services/backgroundTokenRefreshService';
import { 
  sessionExpirationService, 
  ExpirationEvent 
} from '../services/sessionExpirationService';

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

// Helper function to safely start background services
const startBackgroundServices = () => {
  try {
    if (backgroundTokenRefreshService && typeof backgroundTokenRefreshService.start === 'function') {
      backgroundTokenRefreshService.start({
        refreshThresholdMinutes: 15,
        backgroundRefreshIntervalMinutes: 5,
        enableBackgroundRefresh: true,
      });
    }
    
    if (sessionExpirationService && typeof sessionExpirationService.start === 'function') {
      sessionExpirationService.start({
        warningThresholdMinutes: 10,
        checkIntervalMinutes: 2,
        enableWarnings: true,
        autoRefreshEnabled: true,
      });
    }
  } catch (error) {
    console.error('❌ Error starting background services:', error);
  }
};

// Helper function to safely stop background services
const stopBackgroundServices = () => {
  try {
    if (backgroundTokenRefreshService && typeof backgroundTokenRefreshService.stop === 'function') {
      backgroundTokenRefreshService.stop();
    }
    
    if (sessionExpirationService && typeof sessionExpirationService.stop === 'function') {
      sessionExpirationService.stop();
    }
  } catch (error) {
    console.error('❌ Error stopping background services:', error);
  }
};

export const CognitoAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  
  // Control initialization to prevent infinite loops
  const isInitialized = useRef(false);
  const backgroundServicesSetup = useRef(false);

  // Initial authentication check - runs only once on mount
  useEffect(() => {
    if (isInitialized.current) return; // Prevent multiple initializations
    isInitialized.current = true;
    
    console.log('🔍 CognitoAuthProvider: Starting initial authentication check');
    checkAuthStatus();
  }, []); // Empty dependencies - runs only on mount

  // Background services setup - runs only when authentication state changes meaningfully
  useEffect(() => {
    // Only setup services once when user becomes authenticated
    if (state.isAuthenticated && !backgroundServicesSetup.current) {
      console.log('🔧 CognitoAuthProvider: Setting up background services (first time)');
      backgroundServicesSetup.current = true;
      
      // Set up background token refresh service with error handling
      const handleTokenRefresh = (result: TokenRefreshResult) => {
        try {
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
        } catch (error) {
          console.error('❌ Error handling token refresh:', error);
        }
      };

      // Set up session expiration service with error handling
      const handleSessionExpiration = (event: ExpirationEvent) => {
        try {
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
        } catch (error) {
          console.error('❌ Error handling session expiration:', error);
        }
      };

      // Add listeners with error handling
      try {
        if (backgroundTokenRefreshService && typeof backgroundTokenRefreshService.addRefreshListener === 'function') {
          backgroundTokenRefreshService.addRefreshListener(handleTokenRefresh);
        }
        
        if (sessionExpirationService && typeof sessionExpirationService.addExpirationListener === 'function') {
          sessionExpirationService.addExpirationListener(handleSessionExpiration);
        }
        
        // Start services
        startBackgroundServices();
        
      } catch (error) {
        console.error('❌ Error setting up background services:', error);
      }

      // Cleanup function for background services
      return () => {
        console.log('🧹 CognitoAuthProvider: Cleaning up background services');
        try {
          if (backgroundTokenRefreshService && typeof backgroundTokenRefreshService.removeRefreshListener === 'function') {
            backgroundTokenRefreshService.removeRefreshListener(handleTokenRefresh);
          }
          
          if (sessionExpirationService && typeof sessionExpirationService.removeExpirationListener === 'function') {
            sessionExpirationService.removeExpirationListener(handleSessionExpiration);
          }
          
          stopBackgroundServices();
          backgroundServicesSetup.current = false;
        } catch (error) {
          console.error('❌ Error cleaning up background services:', error);
        }
      };
    }
    
    // Stop services when user logs out
    if (!state.isAuthenticated && backgroundServicesSetup.current) {
      console.log('🛑 CognitoAuthProvider: User logged out, stopping background services');
      try {
        stopBackgroundServices();
        backgroundServicesSetup.current = false;
      } catch (error) {
        console.error('❌ Error stopping background services on logout:', error);
      }
    }
  }, [state.isAuthenticated]); // Only depend on authentication status, not user object

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
        // Check if this is a SessionRevokedError
        if (authError instanceof SessionRevokedError) {
          console.error('💀 CognitoAuth: Session revoked error detected - forcing logout');
          
          // Emergency stop all WebSocket connections immediately
          try {
            const { appSyncService } = await import('../services/appSyncService');
            appSyncService.emergencyStop('Session revoked during auth check');
          } catch (importError) {
            console.warn('⚠️ Could not emergency stop AppSync connections:', importError);
          }
          
          // Force immediate logout
          try {
            await cognitoAuthService.clearTokens();
            stopBackgroundServices();
          } catch (clearError) {
            console.error('❌ Error clearing tokens during forced logout:', clearError);
          }
          
          // Set error state to show user-friendly message
          dispatch({ type: 'SET_ERROR', payload: 'Your session has expired. Please log in again.' });
          dispatch({ type: 'SET_USER', payload: null });
          broadcastAuthState(false, null);
          return;
        }
        
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
      
      // Check if this is a SessionRevokedError that wasn't caught above
      if (error instanceof SessionRevokedError) {
        dispatch({ type: 'SET_ERROR', payload: 'Your session has expired. Please log in again.' });
        
        // Emergency stop all WebSocket connections
        try {
          const { appSyncService } = await import('../services/appSyncService');
          appSyncService.emergencyStop('Session revoked - authentication failed');
        } catch (importError) {
          console.warn('⚠️ Could not emergency stop AppSync connections:', importError);
        }
      } else {
        dispatch({ type: 'SET_ERROR', payload: 'Error verificando autenticación' });
      }
      
      dispatch({ type: 'SET_USER', payload: null });
      dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
      broadcastAuthState(false, null);
    }
  };

  // Broadcast authentication state changes to all components
  const broadcastAuthState = (isAuthenticated: boolean, user: CognitoUser | null) => {
    try {
      // Use React Native's DeviceEventEmitter instead of CustomEvent
      const authStateData = { isAuthenticated, user };
      
      console.log('📡 Broadcasting auth state:', { isAuthenticated, hasUser: !!user });
      
      // Emit event using React Native's DeviceEventEmitter
      DeviceEventEmitter.emit('authStateChange', authStateData);
      
      // Store current auth state for components that need immediate access
      (global as any).currentAuthState = authStateData;
      
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
        startBackgroundServices();
        
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
        startBackgroundServices();
        
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
      stopBackgroundServices();
      
      // Clear AppSync authentication cache
      try {
        const { appSyncService } = await import('../services/appSyncService');
        appSyncService.clearAuthCache();
      } catch (importError) {
        console.warn('⚠️ Could not clear AppSync cache:', importError);
      }
      
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
        startBackgroundServices();
        
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
          ...state.user!,
          name: attributes.name || state.user!.name,
          preferred_username: attributes.name || state.user!.preferred_username,
          picture: attributes.picture || state.user!.picture,
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