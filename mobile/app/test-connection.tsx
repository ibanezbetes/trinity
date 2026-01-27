import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, spacing, fontSize, borderRadius } from '../src/utils/theme';
import { apiClient } from '../src/services/apiClient';
import { environmentDetectionService } from '../src/services/environmentDetectionService';
import { useCognitoAuth } from '../src/context/CognitoAuthContext';

interface TestResult {
  name: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  details?: any;
}

export default function TestConnectionScreen() {
  const { } = useCognitoAuth();
  const [tests, setTests] = useState<TestResult[]>([
    { name: 'Environment Detection', status: 'pending', message: 'Esperando...' },
    { name: 'Google Sign-In Availability', status: 'pending', message: 'Esperando...' },
    { name: 'Health Check', status: 'pending', message: 'Esperando...' },
    { name: 'Google Auth Backend', status: 'pending', message: 'Esperando...' },
    { name: 'Login Endpoint', status: 'pending', message: 'Esperando...' },
    { name: 'Register Endpoint', status: 'pending', message: 'Esperando...' },
  ]);
  const [isRunning, setIsRunning] = useState(false);

  const updateTest = (index: number, status: TestResult['status'], message: string, details?: any) => {
    setTests(prev => prev.map((test, i) => 
      i === index ? { ...test, status, message, details } : test
    ));
  };

  const runTests = async () => {
    setIsRunning(true);
    
    try {
      // Test 1: Environment Detection
      updateTest(0, 'pending', 'Detectando entorno...');
      try {
        const environment = environmentDetectionService.detectEnvironment();
        const capabilities = environmentDetectionService.getGoogleSignInCapabilities();
        const detailedInfo = environmentDetectionService.getDetailedEnvironmentInfo();
        
        updateTest(0, 'success', 
          `Entorno: ${environment.runtime} | Plataforma: ${environment.platform}`,
          {
            environment,
            capabilities,
            detailedInfo
          }
        );
      } catch (error: any) {
        updateTest(0, 'error', `Error: ${error.message}`);
      }

      // Test 2: Google Sign-In Availability (Disabled)
      updateTest(1, 'success', 'Google Sign-In deshabilitado - usando solo Cognito');

      // Test 3: Health Check
      updateTest(2, 'pending', 'Probando...');
      try {
        const health = await apiClient.get('/health');
        updateTest(2, 'success', `Estado: ${health.status}`, health);
      } catch (error: any) {
        updateTest(2, 'error', `Error: ${error.message}`);
      }

      // Test 4: Google Auth Backend
      updateTest(3, 'pending', 'Probando...');
      try {
        const googleAuth = await apiClient.get('/auth/google/available');
        updateTest(3, 'success', 
          `${googleAuth.available ? 'Disponible' : 'No disponible'}: ${googleAuth.message}`, 
          googleAuth
        );
      } catch (error: any) {
        updateTest(3, 'error', `Error: ${error.message}`);
      }

      // Test 5: Login Endpoint
      updateTest(4, 'pending', 'Probando...');
      try {
        await apiClient.post('/auth/login', {
          email: 'test@trinity.app',
          password: 'wrongpassword'
        });
        updateTest(4, 'error', 'No debería haber funcionado con credenciales incorrectas');
      } catch (error: any) {
        if (error.response?.status === 401) {
          updateTest(4, 'success', 'Endpoint funciona (401 esperado con credenciales incorrectas)');
        } else {
          updateTest(4, 'error', `Error inesperado: ${error.message}`);
        }
      }

      // Test 6: Register Endpoint
      updateTest(5, 'pending', 'Probando...');
      try {
        const registerResult = await apiClient.post('/auth/register', {
          email: `test${Date.now()}@trinity.app`,
          password: 'password123',
          username: 'testuser',
          displayName: 'Usuario de Prueba'
        });
        updateTest(5, 'success', 'Registro exitoso', registerResult);
      } catch (error: any) {
        // Algunos errores de registro son esperados (email ya existe, etc.)
        if (error.response?.status === 400) {
          updateTest(5, 'success', `Endpoint funciona (${error.response.data?.message || 'Error de validación esperado'})`);
        } else {
          updateTest(5, 'error', `Error: ${error.message}`);
        }
      }

    } catch (error) {
      Alert.alert('Error', 'Error general ejecutando tests');
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'pending': return '⏳';
      default: return '⏳';
    }
  };

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return colors.success || '#10B981';
      case 'error': return colors.error;
      case 'pending': return colors.textMuted;
      default: return colors.textMuted;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>🔍 Test de Conexión</Text>
        <Text style={styles.subtitle}>
          Verificando conectividad con el backend Trinity
        </Text>

        <View style={styles.testsContainer}>
          {tests.map((test, index) => (
            <View key={index} style={styles.testItem}>
              <View style={styles.testHeader}>
                <Text style={styles.testIcon}>{getStatusIcon(test.status)}</Text>
                <Text style={styles.testName}>{test.name}</Text>
              </View>
              <Text style={[styles.testMessage, { color: getStatusColor(test.status) }]}>
                {test.message}
              </Text>
              {test.details && (
                <Text style={styles.testDetails}>
                  {JSON.stringify(test.details, null, 2)}
                </Text>
              )}
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, isRunning && styles.buttonDisabled]}
          onPress={runTests}
          disabled={isRunning}
        >
          <Text style={styles.buttonText}>
            {isRunning ? 'Ejecutando Tests...' : 'Ejecutar Tests'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => router.back()}
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>
            Volver
          </Text>
        </TouchableOpacity>

        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>ℹ️ Información del Entorno</Text>
          <Text style={styles.infoText}>
            • Backend debe estar en puerto 3002{'\n'}
            • IP configurada: 192.168.0.27{'\n'}
            • Algunos errores son esperados (401, validaciones){'\n'}
            • Google Sign-In nativo requiere Development Build{'\n'}
            • En Expo Go solo funciona web fallback (si está implementado)
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  testsContainer: {
    marginBottom: spacing.xl,
  },
  testItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  testHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  testIcon: {
    fontSize: fontSize.lg,
    marginRight: spacing.sm,
  },
  testName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  testMessage: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  testDetails: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    color: colors.primary,
  },
  infoContainer: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  infoTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});