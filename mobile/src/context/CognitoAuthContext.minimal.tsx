/**
 * Minimal AWS Cognito Authentication Context for testing imports
 */

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';

// Import services one by one to identify the problematic import
import { cognitoAuthService, CognitoUser, CognitoTokens } from '../services/cognitoAuthService';
// import { dualAuthFlowService, AuthenticationResult } from '../services/dualAuthFlowService';
// import { backgroundTokenRefreshService, TokenRefreshResult } from '../services/backgroundTokenRefreshService';
// import { sessionExpirationService, ExpirationEvent } from '../services/sessionExpirationService';
// import { migrationService } from '../services/migrationService';

interface AuthState {
  user: CognitoUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  migrationStatus: 'checking' | 'completed' | 'relogin_required' | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: { user: CognitoUser; tokens: CognitoTokens } | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_ERROR' }
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
    // Minimal auth check
    dispatch({ type: 'SET_LOADING', payload: false });
  }, []);

  const login = async (email: string, password: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      // Minimal login implementation
      console.log('Minimal login attempt');
      dispatch({ type: 'SET_ERROR', payload: 'Login not implemented in minimal version' });
    } catch (error: any) {
      console.error('Login error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
    }
  };

  const logout = async () => {
    dispatch({ type: 'LOGOUT' });
  };

  const clearError = () => dispatch({ type: 'CLEAR_ERROR' });

  return (
    <CognitoAuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </CognitoAuthContext.Provider>
  );
};

export default CognitoAuthProvider;