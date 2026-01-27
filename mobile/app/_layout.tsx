import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CognitoAuthProvider } from '../src/context/CognitoAuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ErrorBoundary from '../src/components/ErrorBoundary';
import { useEffect } from 'react';
import { deepLinkService } from '../src/services/deepLinkService';

export default function RootLayout() {
  useEffect(() => {
    // Verify base64 functions are available (should be installed in index.js)
    console.log('🧪 Verifying base64 functions in RootLayout...');
    
    const hasBtoa = typeof global.btoa === 'function';
    const hasAtob = typeof global.atob === 'function';
    
    console.log('🔍 Base64 availability check:', { hasBtoa, hasAtob });
    
    if (!hasBtoa || !hasAtob) {
      console.error('❌ CRITICAL: Base64 functions not available in RootLayout!');
      console.error('This will cause Google Sign-In to fail with "undefined is not a function"');
    } else {
      // Test the functions
      try {
        const testStr = 'RootLayout Test';
        const encoded = global.btoa(testStr);
        const decoded = global.atob(encoded);
        
        if (decoded === testStr) {
          console.log('✅ Base64 functions working correctly in RootLayout:', { testStr, encoded, decoded });
        } else {
          console.error('❌ Base64 functions not working correctly in RootLayout:', { testStr, encoded, decoded });
        }
      } catch (error) {
        console.error('❌ Base64 function test failed in RootLayout:', error);
      }
    }

    // Initialize deep link service when app starts
    deepLinkService.initialize();

    // Cleanup on unmount
    return () => {
      deepLinkService.cleanup();
    };
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <CognitoAuthProvider>
            <StatusBar style="light" backgroundColor="#0D0D0F" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#0D0D0F' },
                animation: 'slide_from_right',
              }}
            />
          </CognitoAuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
