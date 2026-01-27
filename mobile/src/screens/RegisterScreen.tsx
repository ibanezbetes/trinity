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
import { RegisterData } from '../types';

const { width, height } = Dimensions.get('window');

const MOVIE_POSTERS = [
  'https://image.tmdb.org/t/p/w300/qNBAXBIQlnOThrVvA6mA2B5ber9.jpg',
  'https://image.tmdb.org/t/p/w300/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
  'https://image.tmdb.org/t/p/w300/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
  'https://image.tmdb.org/t/p/w300/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg',
  'https://image.tmdb.org/t/p/w300/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
  'https://image.tmdb.org/t/p/w300/velWPhVMQeQKcxggNEU8YmIo52R.jpg',
];

interface RegisterScreenProps {
  navigation: any;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ navigation }) => {
  const { register, isLoading, error, clearError } = useAuth();
  const [formData, setFormData] = useState<RegisterData>({
    name: '',
    email: '',
    password: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const posterScrollAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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

    Animated.loop(
      Animated.timing(posterScrollAnim, {
        toValue: 1,
        duration: 25000,
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
    const newErrors: typeof errors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (!formData.email) {
      newErrors.email = 'El email es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    if (!formData.password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Mínimo 6 caracteres';
    }

    if (confirmPassword !== formData.password) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (validate()) {
      const result = await register(formData);
      if (result?.success) {
        Alert.alert(
          'Cuenta creada',
          'Tu cuenta ha sido creada exitosamente. ' + (result.message || 'Por favor inicia sesión.'),
          [{ text: 'Ir a Login', onPress: () => navigation.navigate('Login') }]
        );
      }
    }
  };

  const handleChange = (field: keyof RegisterData | 'confirmPassword', value: string) => {
    if (field === 'confirmPassword') {
      setConfirmPassword(value);
      if (errors.confirmPassword) {
        setErrors(prev => ({ ...prev, confirmPassword: undefined }));
      }
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
      if (errors[field as keyof typeof errors]) {
        setErrors(prev => ({ ...prev, [field]: undefined }));
      }
    }
  };

  const translateX = posterScrollAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -width * 0.8],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Fondo con collage de películas */}
      <View style={styles.posterBackground}>
        <Animated.View style={[styles.posterRow, { transform: [{ translateX }] }]}>
          {[...MOVIE_POSTERS, ...MOVIE_POSTERS].map((poster, index) => (
            <Image key={index} source={{ uri: poster }} style={styles.posterImage} blurRadius={2} />
          ))}
        </Animated.View>
      </View>

      {/* Overlay gradiente */}
      <LinearGradient
        colors={['rgba(10, 10, 15, 0.4)', 'rgba(10, 10, 15, 0.9)', 'rgba(10, 10, 15, 0.98)']}
        locations={[0, 0.35, 0.6]}
        style={StyleSheet.absoluteFill}
      />

      {/* Círculos de color */}
      <View style={styles.glowCirclePurple} />
      <View style={styles.glowCircleCyan} />

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
              style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
            >
              {/* Logo - usando el logo PNG real */}
              <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
                <TrinityLogo size={90} />
              </Animated.View>

              <Text style={styles.title}>Crear cuenta</Text>
              <Text style={styles.subtitle}>Únete a Trinity y descubre qué ver 🎬</Text>

              {/* Formulario */}
              <View style={styles.formContainer}>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Nombre</Text>
                  <View style={[styles.inputContainer, errors.name && styles.inputError]}>
                    <Text style={styles.inputIcon}>👤</Text>
                    <Input
                      placeholder="Tu nombre"
                      value={formData.name}
                      onChangeText={(v) => handleChange('name', v)}
                      autoCapitalize="words"
                      style={styles.input}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Correo electrónico</Text>
                  <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                    <Text style={styles.inputIcon}>✉️</Text>
                    <Input
                      placeholder="tu@email.com"
                      value={formData.email}
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
                      placeholder="Mínimo 6 caracteres"
                      value={formData.password}
                      onChangeText={(v) => handleChange('password', v)}
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Confirmar contraseña</Text>
                  <View style={[styles.inputContainer, errors.confirmPassword && styles.inputError]}>
                    <Text style={styles.inputIcon}>🔐</Text>
                    <Input
                      placeholder="Repite tu contraseña"
                      value={confirmPassword}
                      onChangeText={(v) => handleChange('confirmPassword', v)}
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
                </View>

                {/* Botón de registro */}
                <TouchableOpacity
                  onPress={handleRegister}
                  disabled={isLoading}
                  activeOpacity={0.85}
                  style={styles.registerButtonWrapper}
                >
                  <LinearGradient
                    colors={[colors.secondary, '#3B82F6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.registerButton}
                  >
                    <Text style={styles.registerButtonText}>
                      {isLoading ? 'Creando cuenta...' : 'Crear cuenta'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                  <Text style={styles.loginLink}>Inicia sesión</Text>
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
  container: { flex: 1, backgroundColor: colors.background },
  posterBackground: {
    position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.35, overflow: 'hidden',
  },
  posterRow: { flexDirection: 'row', height: height * 0.32 },
  posterImage: { width: 90, height: height * 0.28, marginHorizontal: 4, borderRadius: 8, opacity: 0.6 },
  glowCirclePurple: {
    position: 'absolute', top: height * 0.2, right: -60, width: 180, height: 180,
    borderRadius: 90, backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  glowCircleCyan: {
    position: 'absolute', bottom: height * 0.25, left: -50, width: 140, height: 140,
    borderRadius: 70, backgroundColor: 'rgba(6, 182, 212, 0.15)',
  },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: height * 0.08, paddingBottom: spacing.xl,
  },
  content: { alignItems: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: spacing.md, position: 'relative' },
  title: { fontSize: 32, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.lg },
  formContainer: { width: '100%', gap: spacing.md },
  inputWrapper: { width: '100%' },
  inputLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs, marginLeft: spacing.xs, fontWeight: '500' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: spacing.md, height: 52,
  },
  inputError: { borderColor: colors.error },
  inputIcon: { fontSize: 16, marginRight: spacing.sm },
  input: {
    flex: 1, fontSize: fontSize.md, color: colors.textPrimary,
    backgroundColor: 'transparent', borderWidth: 0, paddingVertical: 0, paddingHorizontal: 0,
  },
  errorText: { fontSize: fontSize.xs, color: colors.error, marginTop: spacing.xs, marginLeft: spacing.xs },
  registerButtonWrapper: {
    width: '100%', marginTop: spacing.md, borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.glowCyan,
  },
  registerButton: { paddingVertical: spacing.md + 2, alignItems: 'center', justifyContent: 'center' },
  registerButtonText: { fontSize: fontSize.md, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.xl },
  footerText: { color: colors.textSecondary, fontSize: fontSize.md },
  loginLink: { color: colors.secondary, fontSize: fontSize.md, fontWeight: '600' },
});
