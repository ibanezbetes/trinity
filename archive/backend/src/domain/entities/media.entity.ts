export interface MediaItem {
  tmdbId: string;
  title: string;
  overview: string;
  posterPath: string;
  backdropPath?: string;
  releaseDate: string;
  genres: string[];
  popularity: number;
  voteAverage: number;
  voteCount: number;
  adult: boolean;
  originalLanguage: string;
  mediaType: 'movie' | 'tv';
  // Campos adicionales para caché
  cachedAt: Date;
  isPopular: boolean;
}

export interface TMDBSearchFilters {
  query?: string;
  genres?: string[];
  releaseYearFrom?: number;
  releaseYearTo?: number;
  minRating?: number;
  page?: number;
  sortBy?: 'popularity.desc' | 'release_date.desc' | 'vote_average.desc';
}

export interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  genre_ids: number[];
  popularity: number;
  vote_average: number;
  vote_count: number;
  adult: boolean;
  original_language: string;
}

export interface TMDBGenre {
  id: number;
  name: string;
}
