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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCognitoAuth } from '../src/context/CognitoAuthContext';
import { colors, spacing, fontSize, borderRadius } from '../src/utils/theme';
import TrinityLogo from '../src/components/TrinityLogo';

const { width, height } = Dimensions.get('window');

const MOVIE_POSTERS = [
  'https://image.tmdb.org/t/p/w300/qNBAXBIQlnOThrVvA6mA2B5ber9.jpg',
  'https://image.tmdb.org/t/p/w300/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
  'https://image.tmdb.org/t/p/w300/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
  'https://image.tmdb.org/t/p/w300/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg',
  'https://image.tmdb.org/t/p/w300/velWPhVMQeQKcxggNEU8YmIo52R.jpg',
  'https://image.tmdb.org/t/p/w300/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
];

export default function RegisterScreen() {
  const { register, signInWithGoogle, isLoading, error, clearError } = useCognitoAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirmPassword?: string }>({});

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const posterScrollAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
    ]).start();
    Animated.loop(Animated.timing(posterScrollAnim, { toValue: 1, duration: 25000, useNativeDriver: true })).start();
  }, []);

  useEffect(() => {
    if (error) Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
  }, [error]);

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (!name.trim()) newErrors.name = 'El nombre es requerido';
    else if (name.trim().length < 2) newErrors.name = 'Minimo 2 caracteres';
    if (!email) newErrors.email = 'El email es requerido';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Email invalido';
    if (!password) newErrors.password = 'La contrasena es requerida';
    else if (password.length < 8) newErrors.password = 'Minimo 8 caracteres';
    if (confirmPassword !== password) newErrors.confirmPassword = 'No coinciden';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (validate()) {
      try {
        const result = await register(email, password, name);
        if (result?.success) {
          Alert.alert('Cuenta creada', 'Ya puedes iniciar sesion.', [{ text: 'Ir a Login', onPress: () => router.replace('/login') }]);
        }
      } catch (err) {
        console.error('Register error:', err);
      }
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Google Sign-Up error:', err);
    }
  };

  const handleGoogleSignUpError = (error: string) => {
    // Google Sign-In removed - using Cognito only
    console.log('Google Sign-In not available - using Cognito authentication only');
  };

  const translateX = posterScrollAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -width * 0.8] });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.posterBackground}>
        <Animated.View style={[styles.posterRow, { transform: [{ translateX }] }]}>
          {[...MOVIE_POSTERS, ...MOVIE_POSTERS].map((poster, index) => (
            <Image key={index} source={{ uri: poster }} style={styles.posterImage} blurRadius={2} />
          ))}
        </Animated.View>
      </View>
      <LinearGradient colors={['rgba(10,10,15,0.4)', 'rgba(10,10,15,0.9)', 'rgba(10,10,15,0.98)']} locations={[0, 0.3, 0.6]} style={StyleSheet.absoluteFill} />
      <View style={styles.glowCircleCyan} />
      <View style={styles.glowCirclePurple} />
      <View style={styles.glowCircleRed} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>

            <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              {/* Logo */}
              <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
                <LinearGradient colors={['rgba(139,92,246,0.4)', 'rgba(6,182,212,0.3)']} style={styles.logoGlow} />
                <TrinityLogo size={100} />
              </Animated.View>

              <Text style={styles.title}>Crear cuenta</Text>
              <Text style={styles.subtitle}>Unete a Trinity</Text>

              <View style={styles.form}>
                {/* Nombre completo */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Nombre completo</Text>
                  <View style={[styles.inputContainer, errors.name && styles.inputError]}>
                    <Ionicons name="person-outline" size={20} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                    <TextInput
                      placeholder="Tu nombre"
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      style={styles.input}
                      placeholderTextColor="rgba(255,255,255,0.4)"
                    />
                  </View>
                  {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
                </View>

                {/* Email */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                    <Ionicons name="mail-outline" size={20} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                    <TextInput
                      placeholder="tu@email.com"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                      placeholderTextColor="rgba(255,255,255,0.4)"
                    />
                  </View>
                  {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
                </View>

                {/* Contrasena */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Contrasena</Text>
                  <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                    <Ionicons name="lock-closed-outline" size={20} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                    <TextInput
                      placeholder="Min. 8 caracteres"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      style={styles.input}
                      placeholderTextColor="rgba(255,255,255,0.4)"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                      <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                  {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
                </View>

                {/* Confirmar */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Confirmar</Text>
                  <View style={[styles.inputContainer, errors.confirmPassword && styles.inputError]}>
                    <Ionicons name="shield-checkmark-outline" size={20} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                    <TextInput
                      placeholder="Repite contrasena"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      style={styles.input}
                      placeholderTextColor="rgba(255,255,255,0.4)"
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                      <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                  {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
                </View>

                <TouchableOpacity onPress={handleRegister} disabled={isLoading} activeOpacity={0.85} style={styles.registerButtonWrapper}>
                  <LinearGradient colors={[colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.registerButton}>
                    <Text style={styles.registerButtonText}>{isLoading ? 'Creando...' : 'Crear cuenta'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
                
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>o continúa con</Text>
                  <View style={styles.dividerLine} />
                </View>
                
                <TouchableOpacity onPress={handleGoogleSignUp} disabled={isLoading} activeOpacity={0.85} style={styles.googleButton}>
                  <View style={[styles.socialButton, isLoading && styles.socialButtonDisabled]}>
                    <Text style={[styles.socialIcon, isLoading && styles.socialIconDisabled]}>G</Text>
                    <Text style={[styles.socialButtonText, isLoading && styles.socialButtonTextDisabled]}>
                      {isLoading ? 'Conectando...' : 'Google'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
              
              <View style={styles.footer}>
                <Text style={styles.footerText}>Ya tienes cuenta? </Text>
                <TouchableOpacity onPress={() => router.push('/login')}>
                  <Text style={styles.loginLink}>Inicia sesion</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  posterBackground: { position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.35, overflow: 'hidden' },
  posterRow: { flexDirection: 'row', height: height * 0.32 },
  posterImage: { width: 90, height: height * 0.3, marginHorizontal: 4, borderRadius: 10, opacity: 0.6 },
  glowCircleCyan: { position: 'absolute', top: height * 0.1, right: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(6,182,212,0.2)' },
  glowCirclePurple: { position: 'absolute', top: height * 0.25, left: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(139,92,246,0.15)' },
  glowCircleRed: { position: 'absolute', bottom: height * 0.15, right: width * 0.2, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(239,68,68,0.12)' },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm },
  content: { alignItems: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: spacing.md, position: 'relative' },
  logoGlow: { position: 'absolute', width: 120, height: 120, borderRadius: 60, opacity: 0.6 },
  title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.lg },
  form: { width: '100%', gap: spacing.sm },
  inputWrapper: { width: '100%' },
  inputLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: 4, marginLeft: 4, fontWeight: '500' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: borderRadius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', paddingHorizontal: spacing.md, height: 50 },
  inputError: { borderColor: colors.error },
  inputIcon: { marginRight: spacing.sm },
  input: { flex: 1, fontSize: fontSize.md, color: colors.textPrimary, height: '100%' },
  errorText: { fontSize: fontSize.xs, color: colors.error, marginTop: 2, marginLeft: 4 },
  registerButtonWrapper: { width: '100%', marginTop: spacing.md, borderRadius: borderRadius.lg, overflow: 'hidden' },
  registerButton: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  registerButtonText: { fontSize: fontSize.md, fontWeight: '700', color: '#FFFFFF' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg, width: '100%' },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { color: colors.textMuted, fontSize: fontSize.sm, paddingHorizontal: spacing.md },
  socialButtons: { flexDirection: 'row', gap: spacing.md, width: '100%' },
  socialButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: borderRadius.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', gap: spacing.sm },
  socialButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.05)' },
  socialIcon: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary },
  socialIconDisabled: { color: colors.textMuted },
  socialButtonText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  socialButtonTextDisabled: { color: 'rgba(255,255,255,0.3)' },
  googleButton: { width: '100%' },
  googleButtonFallback: { width: '100%' },
  expoGoMessageContainer: { marginTop: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center', backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: borderRadius.md, padding: spacing.sm },
  expoGoMessageText: { fontSize: fontSize.xs, color: '#FF9800', textAlign: 'center', lineHeight: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.lg },
  footerText: { color: colors.textSecondary, fontSize: fontSize.md },
  loginLink: { color: colors.secondary, fontSize: fontSize.md, fontWeight: '600' },
});
