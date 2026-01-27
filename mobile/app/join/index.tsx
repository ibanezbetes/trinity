import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { colors, fontSize, spacing } from '../../src/utils/theme';

const { width } = Dimensions.get('window');

export default function JoinRoomIndex() {
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleJoin = () => {
    const code = inviteCode.trim().toUpperCase();
    
    if (!code) {
      setError('Introduce un código de invitación');
      return;
    }
    
    if (code.length !== 6) {
      setError('El código debe tener 6 caracteres');
      return;
    }
    
    // Navigate to the join page with the code
    router.push(`/join/${code}`);
  };

  const handleCodeChange = (text: string) => {
    // Only allow alphanumeric characters and convert to uppercase
    const cleanText = text.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (cleanText.length <= 6) {
      setInviteCode(cleanText);
      setError(null);
    }
  };

  const handleGoHome = () => {
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="people" size={64} color={colors.primary} />
          <Text style={styles.title}>Unirse a una Sala</Text>
          <Text style={styles.subtitle}>
            Introduce el código de invitación de 6 caracteres para unirte a una sala de votación
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Código de Invitación</Text>
          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={inviteCode}
            onChangeText={handleCodeChange}
            placeholder="ABC123"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            textAlign="center"
            fontSize={24}
            letterSpacing={4}
          />
          
          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity 
            style={[styles.joinButton, !inviteCode.trim() && styles.joinButtonDisabled]} 
            onPress={handleJoin}
            disabled={!inviteCode.trim()}
          >
            <Text style={[styles.joinButtonText, !inviteCode.trim() && styles.joinButtonTextDisabled]}>
              Unirse a la Sala
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            ¿No tienes un código? Descarga la app Trinity para crear tu propia sala
          </Text>
          
          <TouchableOpacity style={styles.homeButton} onPress={handleGoHome}>
            <Text style={styles.homeButtonText}>Ir al Inicio</Text>
          </TouchableOpacity>
        </View>

        {Platform.OS === 'web' && (
          <View style={styles.webInfo}>
            <Text style={styles.webInfoText}>
              💡 Consejo: También puedes usar enlaces directos como trinity.app/join/ABC123
            </Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    maxWidth: Platform.OS === 'web' ? 500 : width,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl * 2,
  },
  title: {
    fontSize: fontSize.xxl,
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
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  form: {
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.xl * 2,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  input: {
    width: '100%',
    height: 60,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
    marginLeft: spacing.xs,
  },
  joinButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: 25,
    width: '100%',
    marginTop: spacing.md,
  },
  joinButtonDisabled: {
    backgroundColor: colors.border,
  },
  joinButtonText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  joinButtonTextDisabled: {
    color: colors.textSecondary,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  homeButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: colors.border,
  },
  homeButtonText: {
    color: colors.text,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  webInfo: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  webInfoText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});