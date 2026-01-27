import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components';
import { colors, spacing, fontSize } from '../utils/theme';

export const HomeScreen: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>¡Bienvenido a Trinity!</Text>
        <Text style={styles.subtitle}>Hola, {user?.name || 'Usuario'}</Text>
        
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>🎬 Próximamente:</Text>
          <Text style={styles.feature}>• Crear/Unirse a salas</Text>
          <Text style={styles.feature}>• Swipe de películas</Text>
          <Text style={styles.feature}>• Ver matches</Text>
          <Text style={styles.feature}>• Perfil de usuario</Text>
        </View>
        
        <Button
          title="Cerrar sesión"
          onPress={logout}
          variant="outline"
          style={styles.logoutButton}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
  placeholder: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
    width: '100%',
  },
  placeholderTitle: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  feature: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  logoutButton: {
    width: '100%',
  },
});
