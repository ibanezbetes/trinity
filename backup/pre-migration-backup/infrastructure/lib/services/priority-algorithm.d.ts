/**
 * PriorityAlgorithmEngine - Three-Tier Content Prioritization
 *
 * Implements the priority algorithm with three levels:
 * - Priority 1: All genres matching (AND logic)
 * - Priority 2: Any genre matching (OR logic)
 * - Priority 3: Popular content fallback
 *
 * Each level includes randomization for variety.
 *
 * Requirements: 3.2, 3.3, 3.4
 */
import { TMDBContent } from './enhanced-tmdb-client';
import { FilterCriteria } from './content-filter-service';
export interface PrioritizedContent {
    content: TMDBContent[];
    priority: 1 | 2 | 3;
    randomized: boolean;
}
export declare class PriorityAlgorithmEngine {
    /**
     * Prioritizes content based on genre matching
     * Requirements: 3.2
     */
    prioritizeContent(content: TMDBContent[], criteria: FilterCriteria): PrioritizedContent[];
    /**
     * Randomizes content order within the same priority level
     * Requirements: 3.3
     */
    randomizeContent(content: TMDBContent[]): TMDBContent[];
    /**
     * Checks if content has ALL specified genres (AND logic)
     * Used for Priority 1 content
     */
    private hasAllGenres;
    /**
     * Checks if content has ANY of the specified genres (OR logic)
     * Used for Priority 2 content
     */
    private hasAnyGenre;
    /**
     * Calculates genre match score for debugging/analytics
     * Higher score = better match
     */
    calculateGenreMatchScore(content: TMDBContent, requiredGenres: number[]): number;
    /**
     * Validates that randomization is working correctly
     * Requirements: 3.3 - for testing purposes
     */
    validateRandomization(content: TMDBContent[], iterations?: number): boolean;
}
