/**
 * MediaTypeSelector Component
 * 
 * A reusable component for selecting media type (MOVIE or TV) in room creation.
 * Provides visual indicators, state management, and integrates with genre loading.
 * 
 * Requirements: 1.1, 1.2, 8.1
 * Property 1: Media Type Selection Flow
 */

import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../utils/theme';

export type MediaType = 'MOVIE' | 'TV';

interface MediaTypeOption {
  value: MediaType;
  label: string;
  icon: string;
  description: string;
}

interface MediaTypeSelectorProps {
  selectedType?: MediaType;
  onSelect: (type: MediaType) => void;
  disabled?: boolean;
  style?: any;
}

const MEDIA_TYPE_OPTIONS: MediaTypeOption[] = [
  {
    value: 'MOVIE',
    label: 'Películas',
    icon: '🎬',
    description: 'Largometrajes y documentales'
  },
  {
    value: 'TV',
    label: 'Series',
    icon: '📺',
    description: 'Series de TV y miniseries'
  }
];

export default function MediaTypeSelector({ 
  selectedType, 
  onSelect, 
  disabled = false,
  style 
}: MediaTypeSelectorProps) {
  
  const handleSelection = (type: MediaType) => {
    if (disabled) return;
    
    // Store the selection and trigger callback
    onSelect(type);
  };

  const getGradientColors = (type: MediaType, isSelected: boolean) => {
    if (!isSelected) {
      return ['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)'];
    }
    
    return type === 'MOVIE' 
      ? ['rgba(139, 92, 246, 0.3)', 'rgba(139, 92, 246, 0.1)']
      : ['rgba(6, 182, 212, 0.3)', 'rgba(6, 182, 212, 0.1)'];
  };

  const getBorderColor = (type: MediaType, isSelected: boolean) => {
    if (!isSelected) {
      return 'rgba(255, 255, 255, 0.08)';
    }
    
    return type === 'MOVIE' 
      ? 'rgba(139, 92, 246, 0.4)'
      : 'rgba(6, 182, 212, 0.4)';
  };

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>🎬 Tipo de Contenido</Text>
      <Text style={styles.subtitle}>
        Selecciona el tipo de contenido para tu sala
      </Text>
      
      <View style={styles.optionsContainer}>
        {MEDIA_TYPE_OPTIONS.map((option) => {
          const isSelected = selectedType === option.value;
          const gradientColors = getGradientColors(option.value, isSelected);
          const borderColor = getBorderColor(option.value, isSelected);
          
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                { borderColor },
                disabled && styles.optionButtonDisabled
              ]}
              onPress={() => handleSelection(option.value)}
              activeOpacity={disabled ? 1 : 0.7}
              testID={`media-type-${option.value.toLowerCase()}`}
            >
              {isSelected && (
                <LinearGradient
                  colors={gradientColors}
                  style={StyleSheet.absoluteFill}
                />
              )}
              
              <View style={styles.optionContent}>
                <Text style={styles.optionIcon}>{option.icon}</Text>
                <View style={styles.optionTextContainer}>
                  <Text style={[
                    styles.optionLabel,
                    isSelected && styles.optionLabelSelected
                  ]}>
                    {option.label}
                  </Text>
                  <Text style={[
                    styles.optionDescription,
                    isSelected && styles.optionDescriptionSelected
                  ]}>
                    {option.description}
                  </Text>
                </View>
                
                {isSelected && (
                  <View style={styles.selectedIndicator}>
                    <Text style={styles.checkmark}>✓</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      
      {selectedType && (
        <View style={styles.selectionFeedback}>
          <Text style={styles.feedbackText}>
            ✨ Perfecto! Ahora selecciona los géneros para {selectedType === 'MOVIE' ? 'películas' : 'series'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  optionsContainer: {
    gap: spacing.md,
  },
  optionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 80,
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  optionIcon: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textMuted,
    marginBottom: 2,
  },
  optionLabelSelected: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  optionDescription: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    opacity: 0.7,
  },
  optionDescriptionSelected: {
    color: colors.textPrimary,
    opacity: 0.8,
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: 'bold',
  },
  selectionFeedback: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  feedbackText: {
    fontSize: fontSize.sm,
    color: colors.success,
    textAlign: 'center',
    fontWeight: '500',
  },
});