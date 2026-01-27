/**
 * @format
 */

// CRITICAL: Install base64 polyfill IMMEDIATELY before any other imports
// This must be the very first thing that runs in the app
console.log('🚀 Trinity Mobile App starting...');

// Install base64 polyfill using multiple methods for maximum compatibility
try {
  // Method 1: Try react-native-base64 library
  const { encode, decode } = require('react-native-base64');
  
  if (typeof global.btoa === 'undefined') {
    global.btoa = function(str) {
      try {
        return encode(str);
      } catch (error) {
        console.error('❌ btoa (react-native-base64) error:', error);
        // Fallback to manual implementation
        return manualBtoa(str);
      }
    };
    console.log('✅ btoa installed using react-native-base64');
  }
  
  if (typeof global.atob === 'undefined') {
    global.atob = function(str) {
      try {
        return decode(str);
      } catch (error) {
        console.error('❌ atob (react-native-base64) error:', error);
        // Fallback to manual implementation
        return manualAtob(str);
      }
    };
    console.log('✅ atob installed using react-native-base64');
  }
  
} catch (libraryError) {
  console.warn('⚠️ react-native-base64 not available, using manual implementation:', libraryError);
  
  // Fallback: Manual implementation
  if (typeof global.btoa === 'undefined') {
    global.btoa = manualBtoa;
    console.log('✅ btoa installed using manual implementation');
  }
  
  if (typeof global.atob === 'undefined') {
    global.atob = manualAtob;
    console.log('✅ atob installed using manual implementation');
  }
}

// Manual base64 implementations as fallback
function manualBtoa(str) {
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
}

function manualAtob(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  
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
}

// Test the polyfill immediately
try {
  const testStr = 'Trinity Test';
  const encoded = global.btoa(testStr);
  const decoded = global.atob(encoded);
  
  if (decoded === testStr) {
    console.log('✅ Base64 polyfill test PASSED in index.js:', { testStr, encoded, decoded });
  } else {
    console.error('❌ Base64 polyfill test FAILED in index.js:', { testStr, encoded, decoded });
  }
} catch (error) {
  console.error('❌ Base64 polyfill test ERROR in index.js:', error);
}

import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';

// For Expo Router, we need to register the Expo entry point
import 'expo-router/entry';
