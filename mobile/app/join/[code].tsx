import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useAppSync } from '../../src/services/apiClient';
import { cognitoAuthService } from '../../src/services/cognitoAuthService';
import { colors, fontSize, spacing } from '../../src/utils/theme';

const { width, height } = Dimensions.get('window');

export default function JoinRoomByCode() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const appSync = useAppSync();
  const [isJoining, setIsJoining] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<any>(null);

  useEffect(() => {
    checkAuthAndJoinRoom();
  }, [code]);

  const checkAuthAndJoinRoom = async () => {
    try {
      setIsCheckingAuth(true);
      
      // Check if user is authenticated
      const authResult = await cognitoAuthService.checkStoredAuth();
      
      if (authResult.isAuthenticated) {
        setIsAuthenticated(true);
        await attemptJoinRoom();
      } else {
        setIsAuthenticated(false);
        setError('Necesitas iniciar sesión para unirte a una sala');
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      setError('Error verificando autenticación');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const attemptJoinRoom = async () => {
    if (!code) {
      setError('Código de invitación no válido');
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      console.log('🔄 Joining room with code:', code);
      
      const result = await appSync.joinRoom(code.toUpperCase().trim());
      const room = result?.joinRoomByInvite || result;
      
      console.log('✅ Successfully joined room:', room);
      
      if (!room || !room.id) {
        throw new Error('No se pudo obtener la información de la sala');
      }

      setRoomInfo(room);
      
      // Navigate to room after successful join
      setTimeout(() => {
        router.replace(`/room/${room.id}`);
      }, 2000);
      
    } catch (error: any) {
      console.error('❌ Error joining room:', error);
      
      let errorMessage = 'Código de invitación inválido';
      
      if (error.message?.includes('not found')) {
        errorMessage = 'La sala no existe o el código es incorrecto';
      } else if (error.message?.includes('already a member')) {
        errorMessage = 'Ya eres miembro de esta sala';
      } else if (error.message?.includes('room is full')) {
        errorMessage = 'La sala está llena';
      } else if (error.message?.includes('unauthorized')) {
        errorMessage = 'Tu sesión ha expirado. Inicia sesión nuevamente';
        setIsAuthenticated(false);
      }
      
      setError(errorMessage);
    } finally {
      setIsJoining(false);
    }
  };

  const handleLogin = () => {
    router.push('/login');
  };

  const handleRetry = () => {
    setError(null);
    checkAuthAndJoinRoom();
  };

  const handleGoHome = () => {
    router.replace('/');
  };

  if (isCheckingAuth) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Verificando autenticación...</Text>
        </View>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Ionicons name="lock-closed" size={64} color={colors.primary} />
          <Text style={styles.title}>Iniciar Sesión Requerido</Text>
          <Text style={styles.subtitle}>
            Necesitas iniciar sesión para unirte a una sala
          </Text>
          <Text style={styles.codeText}>Código: {code}</Text>
          
          <TouchableOpacity style={styles.primaryButton} onPress={handleLogin}>
            <Text style={styles.primaryButtonText}>Iniciar Sesión</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.secondaryButton} onPress={handleGoHome}>
            <Text style={styles.secondaryButtonText}>Ir al Inicio</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isJoining) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Uniéndose a la sala...</Text>
          <Text style={styles.codeText}>Código: {code}</Text>
        </View>
      </View>
    );
  }

  if (roomInfo) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          <Text style={styles.title}>¡Te has unido!</Text>
          <Text style={styles.subtitle}>
            Ahora eres parte de "{roomInfo.name}"
          </Text>
          <Text style={styles.memberCount}>
            Miembros: {roomInfo.memberCount || 1}
          </Text>
          <Text style={styles.redirectText}>
            Redirigiendo a la sala...
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Ionicons name="alert-circle" size={64} color={colors.error} />
          <Text style={styles.title}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.codeText}>Código: {code}</Text>
          
          <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
            <Text style={styles.primaryButtonText}>Reintentar</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.secondaryButton} onPress={handleGoHome}>
            <Text style={styles.secondaryButtonText}>Ir al Inicio</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  content: {
    alignItems: 'center',
    maxWidth: Platform.OS === 'web' ? 400 : width - spacing.lg * 2,
    width: '100%',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  errorText: {
    fontSize: fontSize.md,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  codeText: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    letterSpacing: 2,
  },
  memberCount: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  redirectText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 25,
    marginBottom: spacing.md,
    minWidth: 200,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: colors.border,
    minWidth: 200,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
});