/**
 * Alternative Base64 Polyfill using react-native-base64
 * This is a backup approach if the manual polyfill doesn't work
 */

import { encode, decode } from 'react-native-base64';

console.log('🔧 Loading Alternative Base64 polyfill using react-native-base64...');

// Install the polyfill globally using react-native-base64
if (typeof global.btoa === 'undefined') {
  console.log('📦 Installing btoa polyfill using react-native-base64...');
  global.btoa = function(str: string): string {
    try {
      return encode(str);
    } catch (error) {
      console.error('❌ btoa polyfill error:', error);
      throw new Error(`btoa failed: ${error.message}`);
    }
  };
  console.log('✅ btoa polyfill installed using react-native-base64');
}

if (typeof global.atob === 'undefined') {
  console.log('📦 Installing atob polyfill using react-native-base64...');
  global.atob = function(str: string): string {
    try {
      return decode(str);
    } catch (error) {
      console.error('❌ atob polyfill error:', error);
      throw new Error(`atob failed: ${error.message}`);
    }
  };
  console.log('✅ atob polyfill installed using react-native-base64');
}

// Test the polyfills
try {
  const testString = 'Hello Trinity Alternative';
  const encoded = global.btoa(testString);
  const decoded = global.atob(encoded);
  
  if (decoded === testString) {
    console.log('✅ Alternative Base64 polyfill test passed:', { testString, encoded, decoded });
  } else {
    console.error('❌ Alternative Base64 polyfill test failed:', { testString, encoded, decoded });
  }
} catch (error) {
  console.error('❌ Alternative Base64 polyfill test error:', error);
}

console.log('✅ Alternative Base64 polyfill loaded successfully');