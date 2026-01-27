/**
 * useGenres Hook
 * 
 * React hook for loading and managing genre data for different media types.
 * Handles loading states, error handling, and caching.
 */

import { useState, useEffect, useCallback } from 'react';
import { Genre, MediaType } from '../types/content-filtering';
import { getAvailableGenres } from '../services/roomService';

interface UseGenresResult {
  genres: Genre[];
  loading: boolean;
  error?: string;
  refetch: () => Promise<void>;
}

export const useGenres = (mediaType?: MediaType): UseGenresResult => {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetchGenres = useCallback(async () => {
    if (!mediaType) {
      setGenres([]);
      setLoading(false);
      setError(undefined);
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const fetchedGenres = await getAvailableGenres(mediaType);
      setGenres(fetchedGenres);
    } catch (err: any) {
      console.error('Error loading genres:', err);
      setError(err.message || 'Error al cargar géneros');
      setGenres([]);
    } finally {
      setLoading(false);
    }
  }, [mediaType]);

  const refetch = useCallback(async () => {
    await fetchGenres();
  }, [fetchGenres]);

  useEffect(() => {
    fetchGenres();
  }, [fetchGenres]);

  return {
    genres,
    loading,
    error,
    refetch
  };
};