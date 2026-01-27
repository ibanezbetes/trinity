import React from 'react';
import { Image, StyleSheet, ViewStyle, ImageStyle, View } from 'react-native';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle | ImageStyle;
}

// Tamaños predefinidos del logo (más grandes)
const sizes = {
  small: { width: 48, height: 48 },
  medium: { width: 80, height: 80 },
  large: { width: 150, height: 150 },
};

// Logo de la aplicación
const logoSource = require('../../assets/logo-trinity-v1.png');
// const logoSource = null; // Placeholder mientras no hay logo

export default function Logo({ size = 'medium', style }: LogoProps) {
  const dimensions = sizes[size];
  
  // Si no hay logo, mostrar placeholder con las barras de colores
  if (!logoSource) {
    const barWidth = dimensions.width / 5;
    return (
      <View style={[styles.placeholder, dimensions, style]}>
        <View style={[styles.bar, { width: barWidth, height: dimensions.height * 0.6, backgroundColor: '#00D4FF' }]} />
        <View style={[styles.bar, { width: barWidth, height: dimensions.height * 0.8, backgroundColor: '#6366F1' }]} />
        <View style={[styles.bar, { width: barWidth, height: dimensions.height * 0.5, backgroundColor: '#EC4899' }]} />
      </View>
    );
  }
  
  return (
    <Image
      source={logoSource}
      style={[styles.logo, dimensions, style]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    // Estilos base del logo
  },
  placeholder: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bar: {
    marginHorizontal: 1,
    borderRadius: 2,
  },
});
