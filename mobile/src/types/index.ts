// Tipos de usuario
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  displayName?: string;
  avatarUrl?: string;
  username?: string;
}

// Tipos de autenticación
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string; // username
  fullName?: string; // nombre completo (opcional)
}

// Tipos de navegación
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Login: undefined;
  Register: undefined;
  Home: undefined;
};

// Tipos de respuesta de API
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
