import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Animated,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components';
import TrinityLogo from '../components/TrinityLogo';
import { colors, spacing, fontSize, borderRadius, shadows } from '../utils/theme';
import { LoginCredentials } from '../types';

const { width, height } = Dimensions.get('window');

// Posters de películas populares para el fondo
const MOVIE_POSTERS = [
  'https://image.tmdb.org/t/p/w300/qNBAXBIQlnOThrVvA6mA2B5ber9.jpg', // The Matrix
  'https://image.tmdb.org/t/p/w300/d5NXSklXo0qyIYkgV94XAgMIckC.jpg', // Dune
  'https://image.tmdb.org/t/p/w300/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', // Interstellar
  'https://image.tmdb.org/t/p/w300/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg', // The Dark Knight
  'https://image.tmdb.org/t/p/w300/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', // Fight Club
  'https://image.tmdb.org/t/p/w300/velWPhVMQeQKcxggNEU8YmIo52R.jpg', // Inception
  'https://image.tmdb.org/t/p/w300/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', // Pulp Fiction
  'https://image.tmdb.org/t/p/w300/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', // The Godfather
  'https://image.tmdb.org/t/p/w300/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', // Parasite
  'https://image.tmdb.org/t/p/w300/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg', // Joker
  'https://image.tmdb.org/t/p/w300/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg', // Avengers
  'https://image.tmdb.org/t/p/w300/aKuFiU82s5ISJpGZp7YkIr3kCUd.jpg', // Blade Runner
];

interface LoginScreenProps {
  navigation: any;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { login, isLoading, error, clearError, loginWithGoogle, loginWithApple } = useAuth();
  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  
  // Animaciones
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const posterScrollAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animación de entrada
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Animación continua del fondo de posters
    Animated.loop(
      Animated.timing(posterScrollAnim, {
        toValue: 1,
        duration: 30000,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error]);

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};

    if (!credentials.email) {
      newErrors.email = 'El email es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email)) {
      newErrors.email = 'Email inválido';
    }

    if (!credentials.password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (credentials.password.length < 6) {
      newErrors.password = 'Mínimo 6 caracteres';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (validate()) {
      await login(credentials);
    }
  };

  const handleChange = (field: keyof LoginCredentials, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const translateX = posterScrollAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -width],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Fondo con collage de películas */}
      <View style={styles.posterBackground}>
        <Animated.View style={[styles.posterRow, { transform: [{ translateX }] }]}>
          {[...MOVIE_POSTERS, ...MOVIE_POSTERS].map((poster, index) => (
            <Image
              key={index}
              source={{ uri: poster }}
              style={styles.posterImage}
              blurRadius={1}
            />
          ))}
        </Animated.View>
        <Animated.View style={[styles.posterRow, styles.posterRowOffset, { transform: [{ translateX: Animated.multiply(translateX, -0.7) }] }]}>
          {[...MOVIE_POSTERS.slice(6), ...MOVIE_POSTERS.slice(0, 6), ...MOVIE_POSTERS].map((poster, index) => (
            <Image
              key={index}
              source={{ uri: poster }}
              style={styles.posterImage}
              blurRadius={1}
            />
          ))}
        </Animated.View>
      </View>

      {/* Overlay gradiente */}
      <LinearGradient
        colors={['rgba(10, 10, 15, 0.3)', 'rgba(10, 10, 15, 0.85)', 'rgba(10, 10, 15, 0.98)']}
        locations={[0, 0.4, 0.7]}
        style={StyleSheet.absoluteFill}
      />

      {/* Círculos de color decorativos */}
      <View style={styles.glowCirclePurple} />
      <View style={styles.glowCircleCyan} />
      <View style={styles.glowCircleRed} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View 
              style={[
                styles.content,
                { 
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }]
                }
              ]}
            >
              {/* Logo animado - usando el logo PNG real */}
              <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
                <TrinityLogo size={120} />
              </Animated.View>

              {/* Título */}
              <Text style={styles.welcomeText}>Bienvenido a</Text>
              <Text style={styles.brandName}>Trinity</Text>
              <Text style={styles.subtitle}>Descubre qué ver juntos ✨</Text>

              {/* Formulario con efecto glass */}
              <View style={styles.formContainer}>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Correo electrónico</Text>
                  <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                    <Text style={styles.inputIcon}>✉️</Text>
                    <Input
                      placeholder="tu@email.com"
                      value={credentials.email}
                      onChangeText={(v) => handleChange('email', v)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Contraseña</Text>
                  <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                    <Text style={styles.inputIcon}>🔒</Text>
                    <Input
                      placeholder="••••••••"
                      value={credentials.password}
                      onChangeText={(v) => handleChange('password', v)}
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
                </View>

                {/* Botón principal con gradiente */}
                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={isLoading}
                  activeOpacity={0.85}
                  style={styles.loginButtonWrapper}
                >
                  <LinearGradient
                    colors={[colors.primary, '#6366F1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.loginButton}
                  >
                    <Text style={styles.loginButtonText}>
                      {isLoading ? 'Entrando...' : 'Iniciar sesión'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Separador */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>o continúa con</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Botones sociales */}
              <View style={styles.socialButtons}>
                <TouchableOpacity 
                  style={styles.socialButton}
                  onPress={loginWithGoogle}
                  activeOpacity={0.8}
                >
                  <Text style={styles.socialIcon}>G</Text>
                  <Text style={styles.socialButtonText}>Google</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.socialButton}
                  onPress={loginWithApple}
                  activeOpacity={0.8}
                >
                  <Text style={styles.socialIcon}></Text>
                  <Text style={styles.socialButtonText}>Apple</Text>
                </TouchableOpacity>
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>¿No tienes cuenta? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                  <Text style={styles.registerLink}>Regístrate aquí</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Fondo de posters
  posterBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.5,
    overflow: 'hidden',
  },
  posterRow: {
    flexDirection: 'row',
    height: height * 0.25,
  },
  posterRowOffset: {
    marginLeft: -50,
  },
  posterImage: {
    width: 100,
    height: height * 0.22,
    marginHorizontal: 4,
    borderRadius: 8,
    opacity: 0.7,
  },
  // Círculos de glow
  glowCirclePurple: {
    position: 'absolute',
    top: height * 0.15,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
  },
  glowCircleCyan: {
    position: 'absolute',
    top: height * 0.3,
    right: -60,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
  },
  glowCircleRed: {
    position: 'absolute',
    bottom: height * 0.2,
    left: width * 0.3,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: height * 0.12,
    paddingBottom: spacing.xl,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    position: 'relative',
  },
  // Títulos
  welcomeText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  brandName: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
  // Formulario
  formContainer: {
    width: '100%',
    gap: spacing.md,
  },
  inputWrapper: {
    width: '100%',
  },
  inputLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: spacing.md,
    height: 56,
  },
  inputError: {
    borderColor: colors.error,
  },
  inputIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.error,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
  // Botón de login
  loginButtonWrapper: {
    width: '100%',
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.glow,
  },
  loginButton: {
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  // Separador
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xl,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.md,
  },
  // Botones sociales
  socialButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: spacing.sm,
  },
  socialIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  socialButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  registerLink: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
