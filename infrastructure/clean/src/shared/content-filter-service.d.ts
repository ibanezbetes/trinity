/**
 * Content Filter Service - Extracted from MONOLITH-TRINITY-CACHE-FINAL.js
 * CRITICAL BUSINESS LOGIC: 50-movie room creation with genre prioritization
 * CRITICAL FIX: Includes JA/KO language support and "The Matrix" detection
 */
export interface FilterCriteria {
    mediaType: 'TV' | 'MOVIE';
    genres: number[];
    roomId?: string;
}
export interface ValidatedItem {
    tmdbId: string;
    mediaType: string;
    title: string;
    posterPath: string;
    overview: string;
    genreIds: number[];
    voteAverage: number;
    voteCount: number;
    popularity: number;
    releaseDate: string;
    priority: number;
    addedAt: string;
}
export declare class ContentFilterService {
    private apiKey;
    private baseUrl;
    constructor(apiKey?: string);
    createFilteredRoom(criteria: FilterCriteria): Promise<ValidatedItem[]>;
    private validateInput;
    private configureExclusiveEndpoint;
    private fetchAndFilterLoop;
    private fetchBatchWithGenres;
    private fetchTMDBBatch;
    /**
     * CRITICAL BUSINESS LOGIC: Quality Gate with "The Matrix" Detection
     * This prevents movies from appearing in TV rooms and vice versa
     */
    private applyQualityGate;
    getAvailableGenres(mediaType: string): Promise<{
        id: number;
        name: string;
    }[]>;
}
