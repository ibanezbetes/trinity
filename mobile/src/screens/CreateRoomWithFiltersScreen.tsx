/**
 * CreateRoomWithFiltersScreen
 * 
 * Screen for creating rooms with advanced content filtering.
 * Integrates MediaTypeSelector, GenreSelector, and FilterSummary components
 * with the room creation flow.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MediaType } from '../types/content-filtering';
import { useCreateRoomWithFilters } from '../hooks/useRoomFilters';
import MediaTypeSelector from '../components/MediaTypeSelector';
import GenreSelector from '../components/GenreSelector';
import FilterSummary from '../components/FilterSummary';

const CreateRoomWithFiltersScreen: React.FC = () => {
  const navigation = useNavigation();
  const {
    formData,
    setRoomName,
    setRoomDescription,
    setMediaType,
    setGenreIds,
    setIsPrivate,
    setMaxMembers,
    submitForm,
    validateForm,
    resetForm,
    loading,
    error,
    isValid,
    errors,
    warnings
  } = useCreateRoomWithFilters();

  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleCreateRoom = async () => {
    try {
      console.log('🎬 Creating room with filters...');\n      
      // Validate form
      const validation = validateForm();
      if (!validation.valid) {
        Alert.alert('Error de Validación', validation.errors.join('\\n'));
        return;
      }

      // Submit form
      const room = await submitForm();
      console.log('✅ Room created successfully:', room.id);

      // Navigate to room
      Alert.alert(
        'Sala Creada',
        `Tu sala "${room.name}" ha sido creada con filtros personalizados.`,
        [
          {
            text: 'Ir a la Sala',
            onPress: () => {
              // Navigate to room screen
              navigation.navigate('Room' as never, { roomId: room.id } as never);
            }
          }
        ]
      );

    } catch (err: any) {
      console.error('❌ Error creating room:', err);
      
      // Handle content filtering errors with suggestions
      if (err.suggestion) {
        Alert.alert(
          'Filtros No Disponibles',
          `${err.message}\\n\\n${err.suggestion.message}`,
          [
            {
              text: 'Entendido',
              style: 'default'
            },
            {
              text: err.suggestion.action,
              onPress: () => {
                // Handle suggestion action
                if (err.suggestion.currentFilters) {
                  setMediaType(err.suggestion.currentFilters.mediaType);
                  setGenreIds(err.suggestion.currentFilters.genreIds || []);
                }
              }
            }
          ]
        );
      } else {
        Alert.alert('Error', err.message || 'Error al crear la sala');
      }
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Limpiar Formulario',
      '¿Estás seguro de que quieres limpiar todos los campos?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Limpiar', 
          style: 'destructive',
          onPress: resetForm
        }
      ]
    );
  };

  const canCreateRoom = formData.name && formData.mediaType && formData.genreIds && formData.genreIds.length > 0;

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>🎬 Crear Sala con Filtros</Text>
            <Text style={styles.subtitle}>
              Personaliza tu experiencia seleccionando el tipo de contenido y géneros favoritos
            </Text>
          </View>

          {/* Room Name */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Nombre de la Sala *</Text>
            <TextInput
              style={[styles.textInput, !formData.name && styles.textInputError]}
              placeholder="Ej: Noche de Películas de Acción"
              value={formData.name || ''}
              onChangeText={setRoomName}
              maxLength={50}
              autoCapitalize="words"
              returnKeyType="next"
            />
            {!formData.name && (
              <Text style={styles.errorText}>El nombre es requerido</Text>
            )}
          </View>

          {/* Media Type Selection */}
          <View style={styles.section}>
            <MediaTypeSelector
              selectedMediaType={formData.mediaType}
              onMediaTypeChange={setMediaType}
              disabled={loading}
              error={errors.find(e => e.includes('contenido'))}
            />
          </View>

          {/* Genre Selection */}
          <View style={styles.section}>
            <GenreSelector
              mediaType={formData.mediaType}
              selectedGenreIds={formData.genreIds || []}
              onGenreSelectionChange={setGenreIds}
              disabled={loading}
              error={errors.find(e => e.includes('género'))}
            />
          </View>

          {/* Filter Summary */}
          {(formData.mediaType || (formData.genreIds && formData.genreIds.length > 0)) && (
            <View style={styles.section}>
              <FilterSummary
                mediaType={formData.mediaType}
                genreIds={formData.genreIds}
                onClear={() => {
                  setMediaType(undefined as any);
                  setGenreIds([]);
                }}
                showClearButton={true}
              />
            </View>
          )}

          {/* Advanced Options */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              <Text style={styles.advancedToggleText}>
                {showAdvanced ? '▼' : '▶'} Opciones Avanzadas
              </Text>
            </TouchableOpacity>

            {showAdvanced && (
              <View style={styles.advancedOptions}>
                {/* Room Description */}
                <View style={styles.advancedOption}>
                  <Text style={styles.sectionLabel}>Descripción (Opcional)</Text>
                  <TextInput
                    style={[styles.textInput, styles.textArea]}
                    placeholder="Describe tu sala..."
                    value={formData.description || ''}
                    onChangeText={setRoomDescription}
                    maxLength={200}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                {/* Privacy Setting */}
                <View style={styles.advancedOption}>
                  <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => setIsPrivate(!formData.isPrivate)}
                  >
                    <View style={[styles.checkbox, formData.isPrivate && styles.checkboxChecked]}>
                      {formData.isPrivate && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>Sala Privada</Text>
                  </TouchableOpacity>
                  <Text style={styles.helpText}>
                    Las salas privadas requieren código de invitación para unirse
                  </Text>
                </View>

                {/* Max Members */}
                <View style={styles.advancedOption}>
                  <Text style={styles.sectionLabel}>Máximo de Miembros</Text>
                  <View style={styles.memberSelector}>
                    {[4, 6, 8, 10, 12].map(count => (
                      <TouchableOpacity
                        key={count}
                        style={[
                          styles.memberOption,
                          formData.maxMembers === count && styles.memberOptionSelected
                        ]}
                        onPress={() => setMaxMembers(count)}
                      >
                        <Text style={[
                          styles.memberOptionText,
                          formData.maxMembers === count && styles.memberOptionTextSelected
                        ]}>
                          {count}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Validation Messages */}
          {errors.length > 0 && (
            <View style={styles.validationContainer}>
              <Text style={styles.validationTitle}>❌ Errores:</Text>
              {errors.map((error, index) => (
                <Text key={index} style={styles.validationError}>• {error}</Text>
              ))}
            </View>
          )}

          {warnings.length > 0 && (
            <View style={styles.validationContainer}>
              <Text style={styles.validationTitle}>⚠️ Advertencias:</Text>
              {warnings.map((warning, index) => (
                <Text key={index} style={styles.validationWarning}>• {warning}</Text>
              ))}
            </View>
          )}

          {/* Error Display */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>Error:</Text>
              <Text style={styles.errorMessage}>{error.message}</Text>
              {error.suggestion && (
                <View style={styles.suggestionContainer}>
                  <Text style={styles.suggestionTitle}>Sugerencia:</Text>
                  <Text style={styles.suggestionMessage}>{error.suggestion.message}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleReset}
          disabled={loading}
        >
          <Text style={styles.resetButtonText}>Limpiar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.createButton,
            (!canCreateRoom || loading) && styles.createButtonDisabled
          ]}
          onPress={handleCreateRoom}
          disabled={!canCreateRoom || loading}
        >
          <Text style={[
            styles.createButtonText,
            (!canCreateRoom || loading) && styles.createButtonTextDisabled
          ]}>
            {loading ? 'Creando...' : 'Crear Sala'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  textInputError: {
    borderColor: '#EF4444',
  },
  textArea: {
    height: 80,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
  helpText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  advancedToggle: {
    paddingVertical: 12,
  },
  advancedToggleText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#3B82F6',
  },
  advancedOptions: {
    marginTop: 16,
  },
  advancedOption: {
    marginBottom: 16,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  memberSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  memberOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  memberOptionSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  memberOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  memberOptionTextSelected: {
    color: '#FFFFFF',
  },
  validationContainer: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  validationTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  validationError: {
    fontSize: 12,
    color: '#EF4444',
    marginBottom: 2,
  },
  validationWarning: {
    fontSize: 12,
    color: '#F59E0B',
    marginBottom: 2,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#DC2626',
    marginBottom: 8,
  },
  suggestionContainer: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  suggestionMessage: {
    fontSize: 12,
    color: '#B45309',
  },
  actionContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  resetButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  createButton: {
    flex: 2,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  createButtonTextDisabled: {
    color: '#D1D5DB',
  },
});

export default CreateRoomWithFiltersScreen;