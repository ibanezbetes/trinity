/**
 * Componente de Google Sign-In que integra con AWS Cognito
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { finalGoogleCognitoAuth } from '../services/finalGoogleCognitoAuth';

interface GoogleSignInButtonProps {
  onSignInSuccess?: (user: any) => void;
  onSignInError?: (error: string) => void;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onSignInSuccess,
  onSignInError,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    
    try {
      console.log('🚀 Iniciando Google Sign-In...');
      
      const result = await finalGoogleCognitoAuth.signInWithGoogle();
      
      if (result.success && result.user) {
        console.log('✅ Sign-In exitoso:', result.user.email);
        
        Alert.alert(
          'Bienvenido',
          `Hola ${result.user.name}!\nTu cuenta se creó en AWS Cognito.`,
          [{ text: 'OK' }]
        );
        
        onSignInSuccess?.(result.user);
      } else {
        console.error('❌ Sign-In falló:', result.error);
        
        Alert.alert(
          'Error de Autenticación',
          result.error || 'Error desconocido',
          [
            { text: 'OK' },
            ...(result.canRetry ? [{ text: 'Reintentar', onPress: handleGoogleSignIn }] : [])
          ]
        );
        
        onSignInError?.(result.error || 'Error desconocido');
      }
      
    } catch (error: any) {
      console.error('❌ Error inesperado:', error);
      
      Alert.alert(
        'Error',
        'Error inesperado durante el inicio de sesión',
        [{ text: 'OK' }]
      );
      
      onSignInError?.(error.message || 'Error inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await finalGoogleCognitoAuth.signOut();
      Alert.alert('Sesión Cerrada', 'Has cerrado sesión correctamente');
    } catch (error) {
      console.error('Error cerrando sesión:', error);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleGoogleSignIn}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Iniciar sesión con Google</Text>
        )}
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.button, styles.signOutButton]}
        onPress={handleSignOut}
      >
        <Text style={[styles.buttonText, styles.signOutText]}>Cerrar Sesión</Text>
      </TouchableOpacity>
      
      <Text style={styles.infoText}>
        Los usuarios se crean automáticamente en AWS Cognito
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginVertical: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  signOutButton: {
    backgroundColor: '#dc3545',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signOutText: {
    color: '#fff',
  },
  infoText: {
    marginTop: 16,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});