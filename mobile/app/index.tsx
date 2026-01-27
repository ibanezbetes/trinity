import { useRouter, useSegments } from 'expo-router';
import { useCognitoAuth } from '../src/context/CognitoAuthContext';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { colors } from '../src/utils/theme';
import { useEffect, useState } from 'react';

export default function Index() {
  const { isAuthenticated, isLoading, error } = useCognitoAuth();
  const router = useRouter();
  const segments = useSegments();
  
  // State to prevent multiple navigation attempts
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);

  // Initialize navigation readiness
  useEffect(() => {
    const timer = setTimeout(() => {
      setNavigationReady(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Handle navigation based on auth state - STRICT DEPENDENCIES
  useEffect(() => {
    // Don't navigate if:
    // - Still loading auth state
    // - Navigation not ready
    // - Already navigating
    if (isLoading || !navigationReady || isNavigating) {
      return;
    }

    console.log('🔍 Index: Navigation effect triggered', {
      isAuthenticated,
      isLoading,
      error: !!error,
      segments: segments.join('/'),
      isNavigating
    });

    // Prevent multiple navigation attempts
    setIsNavigating(true);

    // Navigation logic with timeout to prevent rapid re-triggers
    const navigateWithDelay = () => {
      setTimeout(() => {
        try {
          if (error) {
            console.log('🔍 Index: Auth error detected, navigating to login');
            router.replace('/login');
          } else if (isAuthenticated) {
            // Only navigate to tabs if not already in tabs
            const inTabs = segments[0] === '(tabs)';
            if (!inTabs) {
              console.log('🔍 Index: User authenticated, navigating to tabs');
              router.replace('/(tabs)');
            } else {
              console.log('🔍 Index: User already in tabs, no navigation needed');
            }
          } else {
            // Only navigate to login if not already in login
            const inLogin = segments[0] === 'login';
            if (!inLogin) {
              console.log('🔍 Index: User not authenticated, navigating to login');
              router.replace('/login');
            } else {
              console.log('🔍 Index: User already in login, no navigation needed');
            }
          }
        } catch (navigationError) {
          console.error('❌ Index: Navigation error:', navigationError);
        } finally {
          // Reset navigation state after a delay to allow for navigation to complete
          setTimeout(() => {
            setIsNavigating(false);
          }, 500);
        }
      }, 50); // Small delay to prevent rapid navigation
    };

    navigateWithDelay();

    // STRICT DEPENDENCIES - only trigger when these specific values change
  }, [isAuthenticated, isLoading, error, navigationReady, segments.join('/')]); // segments.join('/') to avoid array reference issues

  // Show loading while auth is being checked, navigation isn't ready, or navigating
  if (isLoading || !navigationReady || isNavigating) {
    const loadingMessage = isLoading 
      ? 'Verificando autenticación...' 
      : isNavigating 
        ? 'Navegando...' 
        : 'Cargando...';

    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{loadingMessage}</Text>
      </View>
    );
  }

  // Fallback loading state (should rarely be seen)
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>Preparando aplicación...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: 16,
    fontSize: 16,
  },
});
