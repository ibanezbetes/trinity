import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../utils/theme';

// Importar el logo directamente
const trinityLogoSource = require('../assets/logo-trinity-v1.png');

interface TrinityLogoProps {
  size?: number;
}

const TrinityLogo: React.FC<TrinityLogoProps> = ({ size = 120 }) => {
  const [imageError, setImageError] = useState(false);

  console.log('🔄 TrinityLogo rendering, size:', size, 'error:', imageError);

  // Si hay error, mostrar fallback
  if (imageError) {
    console.log('⚠️ Showing fallback due to error');
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
          <LinearGradient 
            colors={[colors.primary, colors.secondary]} 
            style={styles.fallbackGradient}
          >
            <Text style={[styles.fallbackText, { fontSize: size * 0.4 }]}>T</Text>
          </LinearGradient>
        </View>
      </View>
    );
  }

  // Mostrar imagen del logo
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Image 
        source={trinityLogoSource}
        style={[styles.logo, { width: size, height: size }]} 
        resizeMode="contain"
        onLoadStart={() => {
          console.log('🔄 Logo loading started...');
        }}
        onLoad={() => {
          console.log('✅ Trinity logo loaded successfully!');
        }}
        onError={(e) => {
          console.log('❌ Error loading Trinity logo:', e.nativeEvent?.error || 'Unknown error');
          setImageError(true);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    // Sin position absolute para que se muestre normalmente
  },
  fallback: {
    overflow: 'hidden',
  },
  fallbackGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});

export default TrinityLogo;