import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAWSConfig } from '../config/aws-config';
import { appSyncService } from './appSyncService';

// Detectar si estamos en desarrollo o producción
const getApiUrl = () => {
  // Use AppSync GraphQL for all operations
  // Fallback REST API only for legacy compatibility
  const PROD_API_URL = 'https://api.trinity.app/api'; // URL de producción (fallback)
  
  // In development, prefer AppSync over local REST API
  return PROD_API_URL;
};

const API_BASE_URL = getApiUrl();

// AWS Configuration
const AWS_CONFIG = getAWSConfig();

interface RequestConfig {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

// Callback para manejar logout automático en caso de 401
let onUnauthorizedCallback: (() => void) | null = null;

export const setOnUnauthorizedCallback = (callback: () => void) => {
  onUnauthorizedCallback = callback;
};

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Try to get Cognito tokens first (new format)
    try {
      const storedTokens = await AsyncStorage.getItem('cognitoTokens');
      if (storedTokens) {
        const tokens = JSON.parse(storedTokens);
        if (tokens.accessToken) {
          headers.Authorization = `Bearer ${tokens.accessToken}`;
          return headers;
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not load Cognito tokens:', error);
    }
    
    // Fallback to legacy authToken format
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn('⚠️ Could not load auth token:', error);
    }
    
    return headers;
  }

  private async request<T>(endpoint: string, config: RequestConfig): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        // Si es 401 y no es un endpoint de auth, hacer logout automático
        if (response.status === 401 && !endpoint.startsWith('/auth/')) {
          if (onUnauthorizedCallback) {
            onUnauthorizedCallback();
          }
        }
        throw { response: { data, status: response.status } };
      }
      
      return data;
    } catch (error) {
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, {
      method: 'POST',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, {
      method: 'PUT',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, { method: 'DELETE', headers });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

// AWS AppSync Integration with enhanced error handling
export const useAppSync = () => {
  console.log('🔗 Using AWS AppSync for GraphQL operations');
  console.log('📍 Region:', AWS_CONFIG.region);
  console.log('🔗 GraphQL Endpoint:', AWS_CONFIG.graphqlEndpoint);
  
  // Defensive check: ensure appSyncService exists
  if (!appSyncService) {
    console.error('❌ AppSync service is not initialized');
    
    // Return dummy functions that provide fallback behavior instead of crashing
    const createFallbackFunction = (operationName: string) => {
      return async (...args: any[]) => {
        console.warn(`⚠️ AppSync service not available for ${operationName}. Returning fallback response.`);
        
        // Return appropriate fallback responses based on operation type
        switch (operationName) {
          case 'getUserRooms':
            return { getUserRooms: [] };
          case 'getMovies':
            return { getMovies: [] };
          case 'getRoom':
            return { getRoom: null };
          case 'healthCheck':
            return { status: 'unavailable', timestamp: new Date().toISOString() };
          case 'subscribeToVoteUpdates':
          case 'subscribeToMatchFound':
            return () => {}; // Return mock cleanup function
          default:
            throw new Error(`AppSync service is not available. Cannot perform ${operationName}. Please check your authentication status and try again.`);
        }
      };
    };
    
    return {
      // Room operations - fallback functions
      createRoom: createFallbackFunction('createRoom'),
      createRoomDebug: createFallbackFunction('createRoomDebug'),
      createRoomSimple: createFallbackFunction('createRoomSimple'),
      joinRoom: createFallbackFunction('joinRoom'),
      getRoom: createFallbackFunction('getRoom'),
      getUserRooms: createFallbackFunction('getUserRooms'),
      
      // Voting operations - fallback functions
      vote: createFallbackFunction('vote'),
      
      // Movie operations - fallback functions
      getMovies: createFallbackFunction('getMovies'),
      getMovieDetails: createFallbackFunction('getMovieDetails'),
      
      // AI operations - fallback functions
      getAIRecommendations: createFallbackFunction('getAIRecommendations'),
      
      // Real-time subscriptions - fallback functions
      subscribeToVoteUpdates: createFallbackFunction('subscribeToVoteUpdates'),
      subscribeToMatchFound: createFallbackFunction('subscribeToMatchFound'),
      
      // Health check - fallback function
      healthCheck: createFallbackFunction('healthCheck'),
    };
  }
  
  // Defensive binding: check each method exists before binding with enhanced error handling
  const safeBindMethod = (methodName: string) => {
    if (appSyncService && typeof (appSyncService as any)[methodName] === 'function') {
      return async (...args: any[]) => {
        try {
          return await (appSyncService as any)[methodName](...args);
        } catch (error: any) {
          console.error(`❌ AppSync ${methodName} error:`, error);
          
          // Check for authentication errors that indicate session issues
          if (error.message?.includes('Authentication') || 
              error.message?.includes('not authenticated') ||
              error.message?.includes('Unauthorized') ||
              error.message?.includes('session') ||
              error.name === 'SessionRevokedError') {
            
            console.error(`💀 Authentication error in ${methodName} - user may need to re-login`);
            
            // For authentication errors, provide user-friendly fallbacks
            switch (methodName) {
              case 'getUserRooms':
                console.warn(`⚠️ ${methodName} failed due to auth error, returning empty array`);
                return { getUserRooms: [] };
              case 'getMovies':
                console.warn(`⚠️ ${methodName} failed due to auth error, returning empty array`);
                return { getMovies: [] };
              case 'getRoom':
                console.warn(`⚠️ ${methodName} failed due to auth error, returning null`);
                return { getRoom: null };
              case 'healthCheck':
                console.warn(`⚠️ ${methodName} failed due to auth error, returning unhealthy status`);
                return { status: 'unauthenticated', timestamp: new Date().toISOString() };
              case 'subscribeToVoteUpdates':
              case 'subscribeToMatchFound':
                console.warn(`⚠️ ${methodName} failed due to auth error, returning mock subscription`);
                return () => {}; // Return mock cleanup function
              default:
                // For critical operations like createRoom, vote, re-throw with user-friendly message
                throw new Error('Your session has expired. Please log in again to continue.');
            }
          }
          
          // Provide fallback responses for common operations (non-auth errors)
          switch (methodName) {
            case 'getUserRooms':
              console.warn(`⚠️ ${methodName} failed, returning empty array`);
              return { getUserRooms: [] };
            case 'getMovies':
              console.warn(`⚠️ ${methodName} failed, returning empty array`);
              return { getMovies: [] };
            case 'getRoom':
              console.warn(`⚠️ ${methodName} failed, returning null`);
              return { getRoom: null };
            case 'healthCheck':
              console.warn(`⚠️ ${methodName} failed, returning unhealthy status`);
              return { status: 'unhealthy', timestamp: new Date().toISOString() };
            case 'subscribeToVoteUpdates':
            case 'subscribeToMatchFound':
              console.warn(`⚠️ ${methodName} failed, returning mock subscription`);
              return () => {}; // Return mock cleanup function
            default:
              // For operations that should fail (like createRoom, vote), re-throw the error
              throw error;
          }
        }
      };
    } else {
      console.warn(`⚠️ AppSync method ${methodName} is not available`);
      return async (...args: any[]) => {
        throw new Error(`AppSync method ${methodName} is not available. Service may not be fully initialized.`);
      };
    }
  };
  
  return {
    // Room operations via AppSync
    createRoom: safeBindMethod('createRoom'),
    createRoomDebug: safeBindMethod('createRoomDebug'),
    createRoomSimple: safeBindMethod('createRoomSimple'),
    joinRoom: safeBindMethod('joinRoomByInvite'), // Map joinRoom to joinRoomByInvite
    joinRoomByInvite: safeBindMethod('joinRoomByInvite'),
    getRoom: safeBindMethod('getRoom'),
    getUserRooms: safeBindMethod('getUserRooms'),
    
    // Voting operations via AppSync
    vote: safeBindMethod('vote'),
    
    // Movie operations via AppSync
    getMovies: safeBindMethod('getMovies'),
    getMovieDetails: safeBindMethod('getMovieDetails'),
    
    // AI operations via AppSync
    getAIRecommendations: safeBindMethod('getAIRecommendations'),
    
    // Real-time subscriptions
    subscribeToVoteUpdates: safeBindMethod('subscribeToVoteUpdates'),
    subscribeToMatchFound: safeBindMethod('subscribeToMatchFound'),
    
    // Health check
    healthCheck: safeBindMethod('healthCheck'),
  };
};
