/**
 * Base64 Polyfill for React Native
 * btoa and atob are not available in React Native, so we need to polyfill them
 * This MUST be imported before any other code that uses btoa/atob
 */

console.log('🔧 Loading Base64 polyfill for React Native...');

// Check if btoa/atob already exist
const hasBtoa = typeof global.btoa !== 'undefined';
const hasAtob = typeof global.atob !== 'undefined';

console.log('🔍 Base64 functions availability:', { hasBtoa, hasAtob });

// Polyfill btoa (binary to ASCII)
if (!hasBtoa) {
  console.log('📦 Installing btoa polyfill...');
  global.btoa = function(str: string): string {
    try {
      // Method 1: Try Buffer (Node.js style)
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(str, 'binary').toString('base64');
      }
      
      // Method 2: Manual implementation
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      let i = 0;
      
      while (i < str.length) {
        const a = str.charCodeAt(i++);
        const b = i < str.length ? str.charCodeAt(i++) : 0;
        const c = i < str.length ? str.charCodeAt(i++) : 0;
        
        const bitmap = (a << 16) | (b << 8) | c;
        
        result += chars.charAt((bitmap >> 18) & 63);
        result += chars.charAt((bitmap >> 12) & 63);
        result += i - 2 < str.length ? chars.charAt((bitmap >> 6) & 63) : '=';
        result += i - 1 < str.length ? chars.charAt(bitmap & 63) : '=';
      }
      
      return result;
    } catch (error) {
      console.error('❌ btoa polyfill error:', error);
      throw new Error(`btoa failed: ${error.message}`);
    }
  };
  console.log('✅ btoa polyfill installed');
} else {
  console.log('✅ btoa already available');
}

// Polyfill atob (ASCII to binary)
if (!hasAtob) {
  console.log('📦 Installing atob polyfill...');
  global.atob = function(str: string): string {
    try {
      // Method 1: Try Buffer (Node.js style)
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(str, 'base64').toString('binary');
      }
      
      // Method 2: Manual implementation
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      
      // Remove padding and validate
      str = str.replace(/=+$/, '');
      
      if (str.length % 4 === 1) {
        throw new Error('Invalid base64 string');
      }
      
      for (let i = 0; i < str.length; i += 4) {
        const encoded1 = chars.indexOf(str[i]);
        const encoded2 = chars.indexOf(str[i + 1]);
        const encoded3 = chars.indexOf(str[i + 2]);
        const encoded4 = chars.indexOf(str[i + 3]);
        
        if (encoded1 === -1 || encoded2 === -1) {
          throw new Error('Invalid base64 character');
        }
        
        const bitmap = (encoded1 << 18) | (encoded2 << 12) | 
                      ((encoded3 !== -1 ? encoded3 : 0) << 6) | 
                      (encoded4 !== -1 ? encoded4 : 0);
        
        result += String.fromCharCode((bitmap >> 16) & 255);
        if (encoded3 !== -1) result += String.fromCharCode((bitmap >> 8) & 255);
        if (encoded4 !== -1) result += String.fromCharCode(bitmap & 255);
      }
      
      return result;
    } catch (error) {
      console.error('❌ atob polyfill error:', error);
      throw new Error(`atob failed: ${error.message}`);
    }
  };
  console.log('✅ atob polyfill installed');
} else {
  console.log('✅ atob already available');
}

// Test the polyfills
try {
  const testString = 'Hello World';
  const encoded = global.btoa(testString);
  const decoded = global.atob(encoded);
  
  if (decoded === testString) {
    console.log('✅ Base64 polyfill test passed:', { testString, encoded, decoded });
  } else {
    console.error('❌ Base64 polyfill test failed:', { testString, encoded, decoded });
  }
} catch (error) {
  console.error('❌ Base64 polyfill test error:', error);
}

// Also make them available as regular functions for explicit imports
export function btoa(str: string): string {
  return global.btoa(str);
}

export function atob(str: string): string {
  return global.atob(str);
}

// Alternative safe functions with error handling
export function safeBtoa(str: string): string {
  try {
    return global.btoa(str);
  } catch (error) {
    console.error('❌ safeBtoa error:', error);
    throw new Error(`Base64 encoding failed: ${error.message}`);
  }
}

export function safeAtob(str: string): string {
  try {
    return global.atob(str);
  } catch (error) {
    console.error('❌ safeAtob error:', error);
    throw new Error(`Base64 decoding failed: ${error.message}`);
  }
}

console.log('✅ Base64 polyfill loaded successfully for React Native');