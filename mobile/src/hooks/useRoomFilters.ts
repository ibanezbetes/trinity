/**
 * useRoomFilters Hook
 * 
 * React hook for managing room creation with content filters.
 * Handles form state, validation, and submission logic.
 */

import { useState, useCallback, useMemo } from 'react';
import { 
  MediaType, 
  CreateRoomFormData, 
  CreateRoomWithFiltersInput,
  RoomWithFilters,
  FormValidation,
  ContentFilteringError
} from '../types/content-filtering';
import { createRoomWithFilters } from '../services/roomService';

interface UseCreateRoomWithFiltersResult {
  formData: CreateRoomFormData;
  setRoomName: (name: string) => void;
  setRoomDescription: (description: string) => void;
  setMediaType: (mediaType: MediaType) => void;
  setGenreIds: (genreIds: number[]) => void;
  setIsPrivate: (isPrivate: boolean) => void;
  setMaxMembers: (maxMembers: number) => void;
  submitForm: () => Promise<RoomWithFilters>;
  validateForm: () => FormValidation;
  resetForm: () => void;
  loading: boolean;
  error?: ContentFilteringError;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export const useCreateRoomWithFilters = (): UseCreateRoomWithFiltersResult => {
  const [formData, setFormData] = useState<CreateRoomFormData>({
    maxMembers: 6,
    isPrivate: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ContentFilteringError | undefined>();

  const setRoomName = useCallback((name: string) => {
    setFormData(prev => ({ ...prev, name }));
    setError(undefined);
  }, []);

  const setRoomDescription = useCallback((description: string) => {
    setFormData(prev => ({ ...prev, description }));
  }, []);

  const setMediaType = useCallback((mediaType: MediaType) => {
    setFormData(prev => ({ 
      ...prev, 
      mediaType,
      genreIds: [] // Reset genres when media type changes
    }));
    setError(undefined);
  }, []);

  const setGenreIds = useCallback((genreIds: number[]) => {
    setFormData(prev => ({ ...prev, genreIds }));
    setError(undefined);
  }, []);

  const setIsPrivate = useCallback((isPrivate: boolean) => {
    setFormData(prev => ({ ...prev, isPrivate }));
  }, []);

  const setMaxMembers = useCallback((maxMembers: number) => {
    setFormData(prev => ({ ...prev, maxMembers }));
  }, []);

  const validateForm = useCallback((): FormValidation => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!formData.name || formData.name.trim().length === 0) {
      errors.push('Nombre de la sala es requerido');
    }

    if (!formData.mediaType) {
      errors.push('Tipo de contenido es requerido');
    }

    // Genre validation
    if (formData.genreIds && formData.genreIds.length > 3) {
      errors.push('Máximo 3 géneros permitidos');
    }

    if (!formData.genreIds || formData.genreIds.length === 0) {
      warnings.push('Selecciona al menos un género para mejores recomendaciones');
    }

    // Name length validation
    if (formData.name && formData.name.length > 50) {
      errors.push('El nombre no puede exceder 50 caracteres');
    }

    // Description length validation
    if (formData.description && formData.description.length > 200) {
      errors.push('La descripción no puede exceder 200 caracteres');
    }

    // Max members validation
    if (formData.maxMembers && (formData.maxMembers < 2 || formData.maxMembers > 12)) {
      errors.push('El número de miembros debe estar entre 2 y 12');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }, [formData]);

  const submitForm = useCallback(async (): Promise<RoomWithFilters> => {
    // Validate form
    const validation = validateForm();
    if (!validation.valid) {
      const errorMessage = validation.errors[0];
      throw new Error(errorMessage);
    }

    // Prepare input
    const input: CreateRoomWithFiltersInput = {
      name: formData.name!.trim(),
      description: formData.description?.trim(),
      mediaType: formData.mediaType!,
      genreIds: formData.genreIds || [],
      isPrivate: formData.isPrivate || false,
      maxMembers: formData.maxMembers || 6
    };

    setLoading(true);
    setError(undefined);

    try {
      const room = await createRoomWithFilters(input);
      return room;
    } catch (err: any) {
      console.error('Error creating room with filters:', err);
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [formData, validateForm]);

  const resetForm = useCallback(() => {
    setFormData({
      maxMembers: 6,
      isPrivate: false
    });
    setError(undefined);
  }, []);

  const validation = useMemo(() => validateForm(), [validateForm]);

  return {
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
    isValid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings
  };
};