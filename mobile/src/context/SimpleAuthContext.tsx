/**
 * Simple Authentication Context - Minimal version for testing
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface SimpleAuthState {
  user: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface SimpleAuthContextType extends SimpleAuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const initialState: SimpleAuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

const SimpleAuthContext = createContext<SimpleAuthContextType | undefined>(undefined);

export const useSimpleAuth = () => {
  const context = useContext(SimpleAuthContext);
  if (!context) {
    throw new Error('useSimpleAuth must be used within SimpleAuthProvider');
  }
  return context;
};

export const SimpleAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SimpleAuthState>(initialState);

  const login = async (email: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Simulate login
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setState(prev => ({
        ...prev,
        user: { email, name: 'Test User' },
        isAuthenticated: true,
        isLoading: false,
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message || 'Login failed',
        isLoading: false,
      }));
    }
  };

  const logout = async () => {
    setState(initialState);
  };

  const clearError = () => {
    setState(prev => ({ ...prev, error: null }));
  };

  return (
    <SimpleAuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </SimpleAuthContext.Provider>
  );
};

export default SimpleAuthProvider;