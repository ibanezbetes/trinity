// Authentication Strategies Export
export { NativeGoogleSignIn } from './nativeGoogleSignIn';
export { WebGoogleSignIn } from './webGoogleSignIn';
export { FallbackEmailAuth } from './fallbackEmailAuth';

// Re-export types for convenience
export type {
  AuthResult,
  AuthenticationStrategy,
  GoogleSignInConfig,
  GoogleSignInError,
  GoogleUser,
  GoogleSignInCapabilities,
  SignInOptions,
} from '../types/googleSignIn';