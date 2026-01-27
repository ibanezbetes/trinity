import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useReducer } from 'react';
import { setOnUnauthorizedCallback } from '../services/apiClient';
import { authService } from '../services/authService';
import { environmentDetectionService } from '../services/environmentDetectionService';
import { googleSignInService, GoogleSignInStatus } from '../services/googleSignInService';
import { AuthState, LoginCredentials, RegisterData, User } from '../types';

// Flag para usar mock o backend real
const USE_MOCK = false; // Cambiar a false para usar el backend real

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<{ success: boolean; message?: string } | undefined>;
  logout: () => Promise<void>;
  clearError: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  linkGoogleAccount: () => Promise<void>;
  unlinkGoogleAccount: () => Promise<void>;
  // Nuevos métodos para manejo de Google Sign-In
  getGoogleSignInAvailability: () => Promise<{
    available: boolean;
    status: GoogleSignInStatus;
    message: string;
    method: 'native' | 'web' | 'none';
  }>;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_ERROR' }
  | { type: 'LOGOUT' };

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    checkAuthStatus();
    
    // Registrar callback para logout automático en caso de 401
    setOnUnauthorizedCallback(() => {
      logout();
    });
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Verificar tokens de Cognito primero
      const cognitoTokens = await AsyncStorage.getItem('cognitoTokens');
      let token = null;
      
      if (cognitoTokens) {
        const tokens = JSON.parse(cognitoTokens);
        token = tokens.accessToken || tokens.idToken;
      } else {
        // Fallback al token legacy
        token = await AsyncStorage.getItem('authToken');
      }
      
      if (token) {
        // Si es un token mock, limpiar automáticamente
        if (token.startsWith('mock-token-')) {
          await AsyncStorage.removeItem('authToken');
          await AsyncStorage.removeItem('cognitoTokens');
          await AsyncStorage.removeItem('userData');
          dispatch({ type: 'SET_USER', payload: null });
          return;
        }
        
        const savedUser = await AsyncStorage.getItem('userData');
        if (savedUser) {
          // Verificar si el token es válido haciendo una petición de prueba
          try {
            await authService.getProfile();
            dispatch({ type: 'SET_USER', payload: JSON.parse(savedUser) });
          } catch (error: any) {
            // Si el token es inválido, limpiar todo
            await AsyncStorage.removeItem('authToken');
            await AsyncStorage.removeItem('cognitoTokens');
            await AsyncStorage.removeItem('userData');
            dispatch({ type: 'SET_USER', payload: null });
          }
        } else {
          await AsyncStorage.removeItem('authToken');
          await AsyncStorage.removeItem('cognitoTokens');
          dispatch({ type: 'SET_USER', payload: null });
        }
      } else {
        dispatch({ type: 'SET_USER', payload: null });
      }
    } catch {
      // En caso de error, limpiar todo
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('cognitoTokens');
      await AsyncStorage.removeItem('userData');
      dispatch({ type: 'SET_USER', payload: null });
    }
  };

  const login = async (credentials: LoginCredentials) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      if (USE_MOCK) {
        // Mock login para desarrollo sin backend
        if (credentials.email && credentials.password.length >= 6) {
          const mockUser: User = {
            id: 'mock-user-email',
            email: credentials.email,
            name: credentials.email.split('@')[0],
            avatar: 'https://i.pravatar.cc/150?img=1',
          };
          await AsyncStorage.setItem('authToken', 'mock-token-email');
          await AsyncStorage.setItem('userData', JSON.stringify(mockUser));
          dispatch({ type: 'SET_USER', payload: mockUser });
        } else {
          dispatch({ type: 'SET_ERROR', payload: 'Credenciales inválidas' });
        }
      } else {
        // Login real con backend
        const response = await authService.login(credentials);
        if (response.success && response.data) {
          const { accessToken, idToken, user } = response.data;
          
          // Guardar todos los tokens de Cognito
          const tokens = {
            accessToken: accessToken || '',
            idToken: idToken || '',
            refreshToken: response.data.refreshToken || '',
            expiresAt: Math.floor(Date.now() / 1000) + 3600 // 1 hora por defecto
          };
          
          // Usar accessToken preferentemente, luego idToken para compatibilidad
          let tokenToSave = '';
          if (accessToken && accessToken.length > 0) {
            tokenToSave = accessToken;
          } else if (idToken && idToken.length > 0) {
            tokenToSave = idToken;
          } else {
            dispatch({ type: 'SET_ERROR', payload: 'No se recibieron tokens válidos' });
            return;
          }
          
          // Verificar que el token tenga formato JWT válido
          const tokenParts = tokenToSave.split('.');
          if (tokenParts.length !== 3) {
            dispatch({ type: 'SET_ERROR', payload: 'Token recibido no es válido' });
            return;
          }
          
          // ✅ NUEVO: Guardar tokens usando secureTokenStorage (funciona en web y móvil)
          try {
            await secureTokenStorage.storeTokens(tokens);
            console.log('✅ Tokens guardados en secureTokenStorage');
          } catch (error) {
            console.error('❌ Error guardando tokens en secureTokenStorage:', error);
          }
          
          // Guardar tokens de Cognito para el apiClient (compatibilidad)
          await AsyncStorage.setItem('cognitoTokens', JSON.stringify(tokens));
          
          // Obtener datos locales previos para preservar cambios no sincronizados
          const savedUserData = await AsyncStorage.getItem('userData');
          const localUser = savedUserData ? JSON.parse(savedUserData) : null;
          
          // Asegurar que el usuario tenga los campos correctos, preservando cambios locales
          const userWithAvatar = {
            ...user,
            name: localUser?.displayName || user.displayName || user.username || user.email?.split('@')[0],
            displayName: localUser?.displayName || user.displayName || user.username,
            avatar: localUser?.avatarUrl || localUser?.avatar || user.avatarUrl || user.avatar || undefined,
            avatarUrl: localUser?.avatarUrl || localUser?.avatar || user.avatarUrl || user.avatar || undefined,
          };
          
          await AsyncStorage.setItem('authToken', tokenToSave);
          await AsyncStorage.setItem('userData', JSON.stringify(userWithAvatar));
          dispatch({ type: 'SET_USER', payload: userWithAvatar });
        } else {
          dispatch({ type: 'SET_ERROR', payload: response.error || 'Error al iniciar sesión' });
        }
      }
    } catch (error: any) {
      console.error('Login error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
    }
  };

  const register = async (data: RegisterData) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      if (USE_MOCK) {
        const mockUser: User = {
          id: 'mock-user-new',
          email: data.email,
          name: data.name,
          avatar: undefined, // Cambiar null por undefined
        };
        await AsyncStorage.setItem('authToken', 'mock-token-register');
        await AsyncStorage.setItem('userData', JSON.stringify(mockUser));
        dispatch({ type: 'SET_USER', payload: mockUser });
      } else {
        const response = await authService.register(data);
        if (response.success) {
          // Registro exitoso - el usuario puede hacer login directamente
          // (Cognito está configurado para no requerir confirmación por email)
          dispatch({ type: 'SET_LOADING', payload: false });
          return { success: true, message: 'Cuenta creada exitosamente. Ya puedes iniciar sesión.' };
        } else {
          dispatch({ type: 'SET_ERROR', payload: response.error || 'Error al registrarse' });
          return { success: false };
        }
      }
    } catch (error: any) {
      console.error('Register error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
      return { success: false };
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('cognitoTokens');
    await AsyncStorage.removeItem('userData');
    // ✅ NUEVO: Limpiar tokens de secureTokenStorage también
    await secureTokenStorage.clearAllTokens();
    dispatch({ type: 'LOGOUT' });
  };

  const clearError = () => dispatch({ type: 'CLEAR_ERROR' });

  const loginWithGoogle = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      if (USE_MOCK) {
        // Mock para desarrollo
        const mockUser: User = {
          id: 'mock-user-123',
          email: 'usuario@trinity.app',
          name: 'Usuario Demo',
          avatar: 'https://i.pravatar.cc/150?img=3',
        };
        await AsyncStorage.setItem('authToken', 'mock-token-google');
        await AsyncStorage.setItem('userData', JSON.stringify(mockUser));
        dispatch({ type: 'SET_USER', payload: mockUser });
      } else {
        // Verificar disponibilidad de Google Sign-In
        const availability = await googleSignInService.getAvailabilityStatus();
        
        if (!availability.canSignIn) {
          let errorMessage = availability.message;
          
          // Proporcionar mensajes más específicos según el entorno
          if (availability.status === GoogleSignInStatus.NOT_AVAILABLE) {
            const env = environmentDetectionService.detectEnvironment();
            if (env.runtime === 'expo-go') {
              errorMessage = 'Google Sign-In no está disponible en Expo Go. Usa un Development Build o prueba en el navegador web.';
            } else {
              errorMessage = 'Google Sign-In no está configurado correctamente. Revisa la configuración de Google Services.';
            }
          } else if (availability.status === GoogleSignInStatus.CONFIGURATION_ERROR) {
            errorMessage = 'Google Sign-In no está configurado. Revisa los archivos google-services.json y GoogleService-Info.plist.';
          }
          
          dispatch({ type: 'SET_ERROR', payload: errorMessage });
          return;
        }

        // Verificar si Google Auth está disponible en el backend
        const backendAvailability = await authService.checkGoogleAuthAvailability();
        if (!backendAvailability.success || !backendAvailability.data?.available) {
          dispatch({ type: 'SET_ERROR', payload: 'Google Sign-In no está configurado en el servidor' });
          return;
        }

        // Configurar Google Sign-In si es necesario
        if (availability.method === 'native') {
          await googleSignInService.configure();
        }

        // Realizar Google Sign-In
        const googleUser = await googleSignInService.signIn();
        
        // Autenticar con el backend usando el ID token
        const response = await authService.loginWithGoogle(googleUser.idToken);
        
        if (response.success && response.data) {
          const { accessToken, idToken, user } = response.data;
          
          // Usar accessToken preferentemente, luego idToken
          let tokenToSave = '';
          if (accessToken && accessToken.length > 0) {
            tokenToSave = accessToken;
          } else if (idToken && idToken.length > 0) {
            tokenToSave = idToken;
          } else {
            dispatch({ type: 'SET_ERROR', payload: 'No se recibieron tokens válidos del servidor' });
            return;
          }
          
          // Asegurar que el usuario tenga los campos correctos
          const userWithAvatar = {
            ...user,
            name: user.displayName || user.username || user.email?.split('@')[0],
            displayName: user.displayName || user.username,
            avatar: user.avatarUrl || user.avatar || googleUser.photo || undefined,
            avatarUrl: user.avatarUrl || user.avatar || googleUser.photo || undefined,
          };
          
          await AsyncStorage.setItem('authToken', tokenToSave);
          await AsyncStorage.setItem('userData', JSON.stringify(userWithAvatar));
          dispatch({ type: 'SET_USER', payload: userWithAvatar });
        } else {
          dispatch({ type: 'SET_ERROR', payload: response.error || 'Error al autenticar con Google' });
        }
      }
    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      
      // Manejar errores específicos de Google Sign-In con mensajes más informativos
      if (error.message?.includes('cancelado')) {
        dispatch({ type: 'SET_ERROR', payload: 'Inicio de sesión cancelado' });
      } else if (error.message?.includes('Play Services')) {
        dispatch({ type: 'SET_ERROR', payload: 'Google Play Services no está disponible en este dispositivo' });
      } else if (error.message?.includes('no implementado')) {
        const env = environmentDetectionService.detectEnvironment();
        if (env.runtime === 'expo-go') {
          dispatch({ type: 'SET_ERROR', payload: 'Google Sign-In requiere un Development Build. Usa email y contraseña en Expo Go.' });
        } else {
          dispatch({ type: 'SET_ERROR', payload: 'Google Sign-In web no está implementado aún. Usa email y contraseña.' });
        }
      } else if (error.message?.includes('SDK no está disponible')) {
        dispatch({ type: 'SET_ERROR', payload: 'Google Sign-In no está disponible en este entorno. Usa email y contraseña.' });
      } else {
        dispatch({ type: 'SET_ERROR', payload: error.message || 'Error con Google Sign-In' });
      }
    }
  };

  const loginWithApple = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      if (USE_MOCK) {
        // Mock para desarrollo
        const mockUser: User = {
          id: 'mock-user-456',
          email: 'apple@trinity.app',
          name: 'Usuario Apple',
          avatar: 'https://i.pravatar.cc/150?img=5',
        };
        await AsyncStorage.setItem('authToken', 'mock-token-apple');
        await AsyncStorage.setItem('userData', JSON.stringify(mockUser));
        dispatch({ type: 'SET_USER', payload: mockUser });
      } else {
        // Apple Sign-In no está implementado aún - usar login normal
        dispatch({ type: 'SET_ERROR', payload: 'Apple Sign-In no está disponible. Usa email y contraseña.' });
      }
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: 'Error con Apple' });
    }
  };

  const linkGoogleAccount = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      if (USE_MOCK) {
        // Mock para desarrollo
        const currentUser = state.user;
        if (currentUser) {
          const updatedUser = {
            ...currentUser,
            isGoogleLinked: true,
            authProviders: ['email', 'google'],
          };
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
          dispatch({ type: 'SET_USER', payload: updatedUser });
        }
      } else {
        // Verificar disponibilidad de Google Sign-In
        const availability = await googleSignInService.getAvailabilityStatus();
        
        if (!availability.canSignIn) {
          let errorMessage = availability.message;
          
          if (availability.status === GoogleSignInStatus.NOT_AVAILABLE) {
            const env = environmentDetectionService.detectEnvironment();
            if (env.runtime === 'expo-go') {
              errorMessage = 'No se puede vincular Google en Expo Go. Usa un Development Build.';
            }
          }
          
          dispatch({ type: 'SET_ERROR', payload: errorMessage });
          return;
        }

        // Verificar si Google Auth está disponible en el backend
        const backendAvailability = await authService.checkGoogleAuthAvailability();
        if (!backendAvailability.success || !backendAvailability.data?.available) {
          dispatch({ type: 'SET_ERROR', payload: 'Google Sign-In no está configurado en el servidor' });
          return;
        }

        // Configurar Google Sign-In si es necesario
        if (availability.method === 'native') {
          await googleSignInService.configure();
        }

        // Realizar Google Sign-In para obtener el token
        const googleUser = await googleSignInService.signIn();
        
        // Vincular cuenta con el backend
        const response = await authService.linkGoogleAccount(googleUser.idToken);
        
        if (response.success && response.data) {
          const updatedUser = {
            ...response.data,
            name: response.data.displayName || response.data.username || response.data.email?.split('@')[0],
            displayName: response.data.displayName || response.data.username,
            avatar: response.data.avatarUrl || response.data.avatar || googleUser.photo || undefined,
            avatarUrl: response.data.avatarUrl || response.data.avatar || googleUser.photo || undefined,
          };
          
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
          dispatch({ type: 'SET_USER', payload: updatedUser });
        } else {
          dispatch({ type: 'SET_ERROR', payload: response.error || 'Error al vincular cuenta de Google' });
        }
      }
    } catch (error: any) {
      console.error('Link Google Account error:', error);
      
      if (error.message?.includes('cancelado')) {
        dispatch({ type: 'SET_ERROR', payload: 'Vinculación cancelada' });
      } else if (error.message?.includes('ya está vinculada')) {
        dispatch({ type: 'SET_ERROR', payload: 'Esta cuenta de Google ya está vinculada a otro usuario' });
      } else if (error.message?.includes('no implementado')) {
        const env = environmentDetectionService.detectEnvironment();
        if (env.runtime === 'expo-go') {
          dispatch({ type: 'SET_ERROR', payload: 'Vinculación de Google requiere un Development Build.' });
        } else {
          dispatch({ type: 'SET_ERROR', payload: 'Vinculación de Google web no está implementada aún.' });
        }
      } else {
        dispatch({ type: 'SET_ERROR', payload: error.message || 'Error al vincular cuenta de Google' });
      }
    }
  };

  const unlinkGoogleAccount = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      if (USE_MOCK) {
        // Mock para desarrollo
        const currentUser = state.user;
        if (currentUser) {
          const updatedUser = {
            ...currentUser,
            isGoogleLinked: false,
            authProviders: ['email'],
            googleId: undefined,
          };
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
          dispatch({ type: 'SET_USER', payload: updatedUser });
        }
      } else {
        // Desvincular cuenta con el backend
        const response = await authService.unlinkGoogleAccount();
        
        if (response.success && response.data) {
          const updatedUser = {
            ...response.data,
            name: response.data.displayName || response.data.username || response.data.email?.split('@')[0],
            displayName: response.data.displayName || response.data.username,
            avatar: response.data.avatarUrl || response.data.avatar || undefined,
            avatarUrl: response.data.avatarUrl || response.data.avatar || undefined,
          };
          
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
          dispatch({ type: 'SET_USER', payload: updatedUser });
          
          // Cerrar sesión de Google en el dispositivo
          await googleSignInService.signOut();
        } else {
          dispatch({ type: 'SET_ERROR', payload: response.error || 'Error al desvincular cuenta de Google' });
        }
      }
    } catch (error: any) {
      console.error('Unlink Google Account error:', error);
      
      if (error.message?.includes('único método')) {
        dispatch({ type: 'SET_ERROR', payload: 'No puedes desvincular Google: es tu único método de autenticación' });
      } else {
        dispatch({ type: 'SET_ERROR', payload: error.message || 'Error al desvincular cuenta de Google' });
      }
    }
  };

  const updateUser = async (updatedUser: User) => {
    // Guardar localmente primero
    await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
    dispatch({ type: 'SET_USER', payload: updatedUser });
    
    // Intentar sincronizar con el backend en segundo plano
    try {
      await authService.updateProfile({
        displayName: updatedUser.displayName || updatedUser.name,
        avatarUrl: updatedUser.avatarUrl || updatedUser.avatar,
      });
    } catch (error) {
      // Si falla la sincronización, mantener los datos locales
      console.log('No se pudo sincronizar con el backend, manteniendo cambios locales');
    }
  };

  const getGoogleSignInAvailability = async () => {
    try {
      const availability = await googleSignInService.getAvailabilityStatus();
      
      return {
        available: availability.canSignIn,
        status: availability.status,
        message: availability.message,
        method: availability.method,
      };
    } catch (error: any) {
      return {
        available: false,
        status: GoogleSignInStatus.NOT_AVAILABLE,
        message: error.message || 'Error al verificar disponibilidad de Google Sign-In',
        method: 'none' as const,
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        clearError,
        loginWithGoogle,
        loginWithApple,
        updateUser,
        linkGoogleAccount,
        unlinkGoogleAccount,
        getGoogleSignInAvailability,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
