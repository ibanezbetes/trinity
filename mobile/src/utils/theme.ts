// 🎨 Trinity Design System - Vibrant Dark Theme
// Colores principales: Azul, Morado, Rojo (del logo Trinity)

export const colors = {
  // Fondos con profundidad
  background: '#0A0A0F',
  backgroundSecondary: '#0F0F14',
  surface: '#151520',
  surfaceElevated: '#1A1A28',
  surfaceLight: '#252535',
  surfaceGlass: 'rgba(255, 255, 255, 0.06)',
  
  // Colores principales del logo Trinity (vibrantes)
  primary: '#8B5CF6',      // Morado vibrante
  primaryLight: '#A78BFA',
  primaryDark: '#7C3AED',
  secondary: '#06B6D4',    // Azul cyan brillante
  secondaryLight: '#22D3EE',
  accent: '#EF4444',       // Rojo vibrante
  accentLight: '#F87171',
  
  // Gradientes vibrantes (usar con LinearGradient)
  gradients: {
    primary: ['#8B5CF6', '#6366F1'],           // Morado a índigo
    secondary: ['#06B6D4', '#3B82F6'],         // Cyan a azul
    accent: ['#EF4444', '#EC4899'],            // Rojo a rosa
    trinity: ['#06B6D4', '#8B5CF6', '#EF4444'], // Los 3 colores
    purpleBlue: ['#8B5CF6', '#06B6D4'],        // Morado a cyan
    redPurple: ['#EF4444', '#8B5CF6'],         // Rojo a morado
    dark: ['#1A1A28', '#0A0A0F'],
    card: ['rgba(139, 92, 246, 0.12)', 'rgba(6, 182, 212, 0.06)'],
    cardHover: ['rgba(139, 92, 246, 0.2)', 'rgba(239, 68, 68, 0.1)'],
    success: ['#10B981', '#059669'],
    glass: ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.02)'],
  },
  
  // Texto con jerarquía clara
  textPrimary: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  textDisabled: '#52525B',
  
  // Estados con colores vibrantes
  error: '#F43F5E',
  errorLight: '#FB7185',
  success: '#10B981',
  successLight: '#34D399',
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  info: '#3B82F6',
  infoLight: '#60A5FA',
  
  // Bordes sutiles
  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.12)',
  borderFocus: 'rgba(124, 58, 237, 0.5)',
  
  // Overlays
  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',
  
  // Botones sociales
  googleBg: '#FFFFFF',
  googleText: '#1F2937',
  appleBg: '#FFFFFF',
  appleText: '#1F2937',
  
  // Colores especiales para badges y tags
  badge: {
    movie: '#EF4444',    // Rojo
    tv: '#06B6D4',       // Azul
    match: '#10B981',    // Verde
    new: '#8B5CF6',      // Morado
  },
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const borderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 9999,
};

export const fontSize = {
  xxs: 10,
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  display: 48,
};

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  glowCyan: {
    shadowColor: colors.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  glowRed: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
};

// Animaciones predefinidas
export const animations = {
  fast: 150,
  normal: 300,
  slow: 500,
  spring: {
    damping: 15,
    stiffness: 150,
  },
};

// Estilos de tarjetas reutilizables
export const cardStyles = {
  glass: {
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
  },
  elevated: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.xl,
    ...shadows.md,
  },
  gradient: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden' as const,
  },
};

// Estilos de botones reutilizables
export const buttonStyles = {
  primary: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  secondary: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
};

// Estilos de inputs reutilizables
export const inputStyles = {
  default: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  focused: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceElevated,
  },
  error: {
    borderColor: colors.error,
  },
};