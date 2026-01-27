import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import EnvironmentService from '../services/environmentService';
import ConfigurationValidator from '../services/configurationValidator';
import GoogleSignInManager from '../services/googleSignInManager';

interface DiagnosticResult {
  environment: any;
  configuration: any;
  googleSignIn: any;
  lastUpdated: Date;
}

const GoogleSignInDiagnostics: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingSignIn, setTestingSignIn] = useState(false);

  useEffect(() => {
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const environmentService = EnvironmentService.getInstance();
      const configValidator = ConfigurationValidator.getInstance();
      const googleSignInManager = GoogleSignInManager.getInstance();

      // Get environment info
      const environment = await environmentService.detectEnvironment();
      
      // Get configuration report
      const configuration = await configValidator.generateConfigurationReport();
      
      // Get Google Sign-In diagnostics
      await googleSignInManager.initialize();
      const googleSignIn = await googleSignInManager.getDiagnostics();

      setDiagnostics({
        environment,
        configuration,
        googleSignIn,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error('❌ Error running diagnostics:', error);
      Alert.alert('Error', `Error ejecutando diagnósticos: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const testGoogleSignIn = async () => {
    setTestingSignIn(true);
    try {
      const googleSignInManager = GoogleSignInManager.getInstance();
      const result = await googleSignInManager.signIn();
      
      if (result.success) {
        Alert.alert(
          'Google Sign-In Exitoso',
          `¡Bienvenido ${result.user?.name || result.user?.email}!`,
          [
            {
              text: 'Cerrar Sesión',
              onPress: async () => {
                await googleSignInManager.signOut();
                Alert.alert('Sesión Cerrada', 'Has cerrado sesión exitosamente');
              },
            },
            { text: 'OK' },
          ]
        );
      } else {
        Alert.alert(
          'Google Sign-In Falló',
          result.error || 'Error desconocido',
          [
            {
              text: 'Ver Detalles',
              onPress: () => {
                Alert.alert('Detalles del Error', `Código: ${result.errorCode}\nMensaje: ${result.error}`);
              },
            },
            { text: 'OK' },
          ]
        );
      }
    } catch (error) {
      Alert.alert('Error', `Error durante Google Sign-In: ${error}`);
    } finally {
      setTestingSignIn(false);
    }
  };

  const getStatusIcon = (isValid: boolean) => {
    return (
      <Ionicons
        name={isValid ? 'checkmark-circle' : 'close-circle'}
        size={20}
        color={isValid ? '#4CAF50' : '#F44336'}
      />
    );
  };

  const getEnvironmentColor = (runtime: string) => {
    switch (runtime) {
      case 'production':
        return '#4CAF50';
      case 'development-build':
        return '#2196F3';
      case 'expo-go':
        return '#FF9800';
      case 'web':
        return '#9C27B0';
      default:
        return '#757575';
    }
  };

  if (loading && !diagnostics) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Ejecutando diagnósticos...</Text>
      </View>
    );
  }

  if (!diagnostics) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="warning" size={48} color="#F44336" />
        <Text style={styles.errorText}>Error cargando diagnósticos</Text>
        <TouchableOpacity style={styles.retryButton} onPress={runDiagnostics}>
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="analytics" size={32} color="#007AFF" />
        <Text style={styles.title}>Google Sign-In Diagnostics</Text>
        <Text style={styles.subtitle}>
          Última actualización: {diagnostics.lastUpdated.toLocaleTimeString()}
        </Text>
      </View>

      {/* Environment Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔍 Entorno de Ejecución</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Plataforma:</Text>
          <Text style={styles.value}>{diagnostics.environment.platform.toUpperCase()}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Entorno:</Text>
          <View style={styles.environmentBadge}>
            <View
              style={[
                styles.environmentDot,
                { backgroundColor: getEnvironmentColor(diagnostics.environment.runtime) },
              ]}
            />
            <Text style={[styles.value, { color: getEnvironmentColor(diagnostics.environment.runtime) }]}>
              {diagnostics.environment.runtime.replace('-', ' ').toUpperCase()}
            </Text>
          </View>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Dispositivo:</Text>
          <Text style={styles.value}>
            {diagnostics.environment.deviceInfo.isDevice ? 'Físico' : 'Simulador/Emulador'}
          </Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Google Sign-In SDK:</Text>
          <View style={styles.statusRow}>
            {getStatusIcon(diagnostics.environment.googleSignInAvailable)}
            <Text style={styles.value}>
              {diagnostics.environment.googleSignInAvailable ? 'Disponible' : 'No Disponible'}
            </Text>
          </View>
        </View>
      </View>

      {/* Configuration Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚙️ Configuración</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Estado General:</Text>
          <View style={styles.statusRow}>
            {getStatusIcon(diagnostics.configuration.overall.isValid)}
            <Text style={styles.value}>
              {diagnostics.configuration.overall.isValid ? 'Válida' : 'Inválida'}
            </Text>
          </View>
        </View>

        {diagnostics.configuration.overall.errors.length > 0 && (
          <View style={styles.errorSection}>
            <Text style={styles.errorSectionTitle}>❌ Errores:</Text>
            {diagnostics.configuration.overall.errors.map((error: string, index: number) => (
              <Text key={index} style={styles.errorItem}>• {error}</Text>
            ))}
          </View>
        )}

        {diagnostics.configuration.overall.warnings.length > 0 && (
          <View style={styles.warningSection}>
            <Text style={styles.warningSectionTitle}>⚠️ Advertencias:</Text>
            {diagnostics.configuration.overall.warnings.map((warning: string, index: number) => (
              <Text key={index} style={styles.warningItem}>• {warning}</Text>
            ))}
          </View>
        )}
      </View>

      {/* Google Sign-In Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔐 Google Sign-In</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Disponible:</Text>
          <View style={styles.statusRow}>
            {getStatusIcon(diagnostics.googleSignIn.currentStrategy !== null)}
            <Text style={styles.value}>
              {diagnostics.googleSignIn.currentStrategy ? 'Sí' : 'No'}
            </Text>
          </View>
        </View>

        {diagnostics.googleSignIn.currentStrategy && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Estrategia:</Text>
            <Text style={styles.value}>{diagnostics.googleSignIn.currentStrategy}</Text>
          </View>
        )}

        <View style={styles.statusMessageContainer}>
          <Text style={styles.statusMessage}>{diagnostics.googleSignIn.status}</Text>
        </View>
      </View>

      {/* Recommendations */}
      {diagnostics.configuration.recommendations.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💡 Recomendaciones</Text>
          {diagnostics.configuration.recommendations.map((rec: string, index: number) => (
            <Text key={index} style={styles.recommendationItem}>{rec}</Text>
          ))}
        </View>
      )}

      {/* Next Steps */}
      {diagnostics.configuration.nextSteps.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 Próximos Pasos</Text>
          {diagnostics.configuration.nextSteps.map((step: string, index: number) => (
            <Text key={index} style={styles.nextStepItem}>{step}</Text>
          ))}
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionSection}>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={runDiagnostics}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="refresh" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.refreshButtonText}>
            {loading ? 'Actualizando...' : 'Actualizar Diagnósticos'}
          </Text>
        </TouchableOpacity>

        {diagnostics.googleSignIn.currentStrategy && (
          <TouchableOpacity
            style={styles.testButton}
            onPress={testGoogleSignIn}
            disabled={testingSignIn}
          >
            {testingSignIn ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="play" size={20} color="#FFFFFF" />
            )}
            <Text style={styles.testButtonText}>
              {testingSignIn ? 'Probando...' : 'Probar Google Sign-In'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    color: '#F44336',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  label: {
    fontSize: 16,
    color: '#666',
    flex: 1,
  },
  value: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  environmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  environmentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  errorSection: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
  },
  errorSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F44336',
    marginBottom: 8,
  },
  errorItem: {
    fontSize: 14,
    color: '#F44336',
    marginBottom: 4,
  },
  warningSection: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
  },
  warningSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF9800',
    marginBottom: 8,
  },
  warningItem: {
    fontSize: 14,
    color: '#FF9800',
    marginBottom: 4,
  },
  statusMessageContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  statusMessage: {
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
  recommendationItem: {
    fontSize: 14,
    color: '#4CAF50',
    marginBottom: 8,
    lineHeight: 20,
  },
  nextStepItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
    lineHeight: 20,
  },
  actionSection: {
    margin: 16,
    gap: 12,
  },
  refreshButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  testButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  testButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default GoogleSignInDiagnostics;