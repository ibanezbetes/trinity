import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { useCognitoAuth } from '../context/CognitoAuthContext';
import { cognitoAuthService } from '../services/cognitoAuthService';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';

interface GoogleAccountLinkingProps {
  style?: any;
}

const GoogleAccountLinking: React.FC<GoogleAccountLinkingProps> = ({ style }) => {
  const { user, isAuthenticated } = useCognitoAuth();
  const { 
    isAvailable: googleAvailable, 
    currentUser: googleUser, 
    signIn: googleSignIn,
    signOut: googleSignOut,
    capabilities,
  } = useGoogleSignIn();

  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadLinkedProviders();
    }
  }, [isAuthenticated, user]);

  const loadLinkedProviders = async () => {
    if (!user) return;

    setLoadingProviders(true);
    try {
      const storedTokens = await cognitoAuthService.checkStoredAuth();
      if (storedTokens.isAuthenticated && storedTokens.tokens) {
        const result = await cognitoAuthService.getLinkedIdentityProviders(storedTokens.tokens.accessToken);
        if (result.success && result.providers) {
          setLinkedProviders(result.providers);
        }
      }
    } catch (error) {
      console.error('Error loading linked providers:', error);
    } finally {
      setLoadingProviders(false);
    }
  };

  const handleLinkGoogleAccount = async () => {
    if (!isAuthenticated || !user) {
      Alert.alert('Error', 'Debes estar autenticado para vincular una cuenta de Google');
      return;
    }

    if (!googleAvailable) {
      showGoogleUnavailableAlert();
      return;
    }

    setIsLinking(true);
    try {
      // First, sign in with Google
      const googleResult = await googleSignIn();
      
      if (googleResult.success && googleResult.user && googleResult.idToken) {
        // Try to link the account
        const storedTokens = await cognitoAuthService.checkStoredAuth();
        if (storedTokens.isAuthenticated && storedTokens.tokens) {
          const linkResult = await cognitoAuthService.linkGoogleAccount(
            storedTokens.tokens.accessToken,
            googleResult.user,
            googleResult.idToken
          );

          if (linkResult.success) {
            Alert.alert(
              'Cuenta Vinculada',
              'Tu cuenta de Google ha sido vinculada exitosamente.',
              [{ text: 'OK', onPress: loadLinkedProviders }]
            );
          } else {
            Alert.alert(
              'Integración Pendiente',
              linkResult.message || 'La vinculación de cuentas requiere integración con el backend.',
              [
                {
                  text: 'Entendido',
                  onPress: () => {
                    // Sign out from Google since linking failed
                    googleSignOut().catch(console.error);
                  },
                },
              ]
            );
          }
        }
      } else {
        // Google Sign-In failed or was cancelled
        if (googleResult.error && !googleResult.error.includes('cancelado')) {
          Alert.alert('Error', googleResult.error);
        }
      }
    } catch (error: any) {
      console.error('Error linking Google account:', error);
      Alert.alert('Error', `Error vinculando cuenta de Google: ${error.message || error}`);
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkGoogleAccount = () => {
    Alert.alert(
      'Desvincular Cuenta de Google',
      '¿Estás seguro de que quieres desvincular tu cuenta de Google? Podrás volver a vincularla más tarde.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desvincular', style: 'destructive', onPress: performUnlink },
      ]
    );
  };

  const performUnlink = async () => {
    if (!user) return;

    setIsUnlinking(true);
    try {
      // Sign out from Google first
      if (googleUser) {
        await googleSignOut();
      }

      // Unlink from Cognito
      const storedTokens = await cognitoAuthService.checkStoredAuth();
      if (storedTokens.isAuthenticated && storedTokens.tokens) {
        const unlinkResult = await cognitoAuthService.unlinkGoogleAccount(storedTokens.tokens.accessToken);

        if (unlinkResult.success) {
          Alert.alert(
            'Cuenta Desvinculada',
            'Tu cuenta de Google ha sido desvinculada exitosamente.',
            [{ text: 'OK', onPress: loadLinkedProviders }]
          );
        } else {
          Alert.alert(
            'Integración Pendiente',
            unlinkResult.message || 'La desvinculación de cuentas requiere integración con el backend.',
            [{ text: 'Entendido' }]
          );
        }
      }
    } catch (error: any) {
      console.error('Error unlinking Google account:', error);
      Alert.alert('Error', `Error desvinculando cuenta de Google: ${error.message || error}`);
    } finally {
      setIsUnlinking(false);
    }
  };

  const showGoogleUnavailableAlert = () => {
    const isExpoGo = capabilities?.environment === 'expo-go';
    
    Alert.alert(
      'Google Sign-In No Disponible',
      isExpoGo
        ? '🔄 Google Sign-In no está disponible en Expo Go.\n\n' +
          'Para vincular tu cuenta de Google, necesitas usar un Development Build.\n\n' +
          '📱 Crea un Development Build con:\n' +
          'npx eas build --profile development'
        : '⚠️  Google Sign-In no está configurado correctamente.\n\n' +
          'Verifica la configuración de Google Services y dependencias.',
      [{ text: 'Entendido' }]
    );
  };

  const isGoogleLinked = linkedProviders.includes('Google');

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Ionicons name="link" size={24} color={colors.primary} />
        <Text style={styles.title}>Cuentas Vinculadas</Text>
      </View>

      {loadingProviders ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando proveedores...</Text>
        </View>
      ) : (
        <View style={styles.providersContainer}>
          {/* Cognito Account (always present) */}
          <View style={styles.providerItem}>
            <View style={styles.providerInfo}>
              <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
              <Text style={styles.providerName}>Trinity Account</Text>
              <Text style={styles.providerEmail}>{user.email}</Text>
            </View>
            <View style={styles.providerStatus}>
              <Text style={styles.statusConnected}>Conectado</Text>
            </View>
          </View>

          {/* Google Account */}
          <View style={styles.providerItem}>
            <View style={styles.providerInfo}>
              <Ionicons 
                name="logo-google" 
                size={20} 
                color={isGoogleLinked ? '#4285F4' : colors.textMuted} 
              />
              <Text style={[
                styles.providerName,
                !isGoogleLinked && styles.providerNameDisabled,
              ]}>
                Google
              </Text>
              {isGoogleLinked && googleUser && (
                <Text style={styles.providerEmail}>{googleUser.email}</Text>
              )}
            </View>
            
            <View style={styles.providerActions}>
              {isGoogleLinked ? (
                <TouchableOpacity
                  style={styles.unlinkButton}
                  onPress={handleUnlinkGoogleAccount}
                  disabled={isUnlinking}
                >
                  {isUnlinking ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="unlink" size={16} color="#FFFFFF" />
                      <Text style={styles.unlinkButtonText}>Desvincular</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.linkButton,
                    !googleAvailable && styles.linkButtonDisabled,
                  ]}
                  onPress={handleLinkGoogleAccount}
                  disabled={isLinking || !googleAvailable}
                >
                  {isLinking ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="link" size={16} color="#FFFFFF" />
                      <Text style={styles.linkButtonText}>
                        {googleAvailable ? 'Vincular' : 'No Disponible'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Information about Google Sign-In availability */}
          {!googleAvailable && (
            <View style={styles.infoContainer}>
              <Ionicons name="information-circle" size={16} color={colors.textMuted} />
              <Text style={styles.infoText}>
                {capabilities?.environment === 'expo-go'
                  ? 'Google Sign-In requiere Development Build'
                  : 'Google Sign-In no está configurado'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Integration Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusTitle}>Estado de Integración</Text>
        <Text style={styles.statusText}>
          La vinculación completa de cuentas de Google requiere integración con el backend. 
          Actualmente puedes probar Google Sign-In, pero la vinculación permanente estará 
          disponible cuando se implemente la integración completa.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginVertical: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  providersContainer: {
    gap: spacing.md,
  },
  providerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  providerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  providerName: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  providerNameDisabled: {
    color: colors.textMuted,
  },
  providerEmail: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  providerStatus: {
    alignItems: 'flex-end',
  },
  providerActions: {
    alignItems: 'flex-end',
  },
  statusConnected: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: '500',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  linkButtonDisabled: {
    backgroundColor: colors.textMuted,
  },
  linkButtonText: {
    fontSize: fontSize.sm,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  unlinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  unlinkButtonText: {
    fontSize: fontSize.sm,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  infoText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    flex: 1,
  },
  statusContainer: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  statusTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});

export default GoogleAccountLinking;