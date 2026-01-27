/**
 * JWT Utilities for React Native
 * Handles base64 decoding with fallbacks for React Native environment
 */

/**
 * Safely decode base64 string with fallback for React Native
 */
function safeAtob(str: string): string {
  try {
    // Try using global atob (should be available via polyfill)
    return atob(str);
  } catch (error) {
    console.warn('atob not available, using Buffer fallback');
    // Fallback to Buffer-based decoding
    return Buffer.from(str, 'base64').toString('binary');
  }
}

/**
 * Safely encode to base64 string with fallback for React Native
 */
function safeBtoa(str: string): string {
  try {
    // Try using global btoa (should be available via polyfill)
    return btoa(str);
  } catch (error) {
    console.warn('btoa not available, using Buffer fallback');
    // Fallback to Buffer-based encoding
    return Buffer.from(str, 'binary').toString('base64');
  }
}

/**
 * Parse JWT token payload safely
 */
export function parseJWTPayload(token: string): any {
  try {
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // Get the payload part (second part)
    const base64Url = tokenParts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Decode the base64 payload
    const jsonPayload = decodeURIComponent(
      safeAtob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error parsing JWT payload:', error);
    return null;
  }
}

/**
 * Parse JWT token payload (simple version without URL decoding)
 */
export function parseJWTPayloadSimple(token: string): any {
  try {
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // Get the payload part (second part) and decode
    const base64Url = tokenParts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    return JSON.parse(safeAtob(base64));
  } catch (error) {
    console.error('Error parsing JWT payload (simple):', error);
    return null;
  }
}

/**
 * Check if JWT token is expired
 */
export function isJWTExpired(token: string): boolean {
  try {
    const payload = parseJWTPayloadSimple(token);
    if (!payload || !payload.exp) {
      return true; // Assume expired if we can't parse or no expiration
    }
    
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  } catch (error) {
    console.error('Error checking JWT expiration:', error);
    return true; // Assume expired on error
  }
}

/**
 * Get JWT token expiration time
 */
export function getJWTExpiration(token: string): number | null {
  try {
    const payload = parseJWTPayloadSimple(token);
    return payload?.exp || null;
  } catch (error) {
    console.error('Error getting JWT expiration:', error);
    return null;
  }
}

/**
 * Create base64 encoded header for AppSync WebSocket
 */
export function createAppSyncHeader(authToken: string, host: string): string {
  const header = {
    Authorization: authToken,
    host: host
  };
  
  return safeBtoa(JSON.stringify(header));
}

/**
 * Create base64 encoded payload for AppSync WebSocket
 */
export function createAppSyncPayload(payload: any = {}): string {
  return safeBtoa(JSON.stringify(payload));
}

export { safeAtob, safeBtoa };