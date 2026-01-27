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

export class PriorityAlgorithmEngine {

  /**
   * Prioritizes content based on genre matching
   * Requirements: 3.2
   */
  prioritizeContent(content: TMDBContent[], criteria: FilterCriteria): PrioritizedContent[] {
    console.log(`🎯 PriorityAlgorithm: Prioritizing ${content.length} items for criteria:`, criteria);

    const results: PrioritizedContent[] = [];

    if (criteria.genres.length === 0) {
      // No genres selected - all content gets priority 3 (popular)
      return [{
        content: this.randomizeContent(content),
        priority: 3,
        randomized: true
      }];
    }

    // Priority 1: Content with ALL selected genres (AND logic)
    const priority1Content = content.filter(item => 
      this.hasAllGenres(item, criteria.genres)
    );

    if (priority1Content.length > 0) {
      results.push({
        content: this.randomizeContent(priority1Content),
        priority: 1,
        randomized: true
      });
    }

    // Priority 2: Content with ANY selected genre (OR logic), excluding Priority 1
    const priority2Content = content.filter(item => 
      !this.hasAllGenres(item, criteria.genres) && 
      this.hasAnyGenre(item, criteria.genres)
    );

    if (priority2Content.length > 0) {
      results.push({
        content: this.randomizeContent(priority2Content),
        priority: 2,
        randomized: true
      });
    }

    // Priority 3: Remaining content (popular fallback)
    const priority3Content = content.filter(item => 
      !this.hasAnyGenre(item, criteria.genres)
    );

    if (priority3Content.length > 0) {
      results.push({
        content: this.randomizeContent(priority3Content),
        priority: 3,
        randomized: true
      });
    }

    console.log(`✅ PriorityAlgorithm: Categorized into ${results.length} priority levels`);
    results.forEach((level, index) => {
      console.log(`   Priority ${level.priority}: ${level.content.length} items`);
    });

    return results;
  }

  /**
   * Randomizes content order within the same priority level
   * Requirements: 3.3
   */
  randomizeContent(content: TMDBContent[]): TMDBContent[] {
    const shuffled = [...content];
    
    // Fisher-Yates shuffle algorithm
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Checks if content has ALL specified genres (AND logic)
   * Used for Priority 1 content
   */
  private hasAllGenres(content: TMDBContent, requiredGenres: number[]): boolean {
    if (!content.genre_ids || requiredGenres.length === 0) {
      return false;
    }

    return requiredGenres.every(genreId => 
      content.genre_ids.includes(genreId)
    );
  }

  /**
   * Checks if content has ANY of the specified genres (OR logic)
   * Used for Priority 2 content
   */
  private hasAnyGenre(content: TMDBContent, requiredGenres: number[]): boolean {
    if (!content.genre_ids || requiredGenres.length === 0) {
      return false;
    }

    return requiredGenres.some(genreId => 
      content.genre_ids.includes(genreId)
    );
  }

  /**
   * Calculates genre match score for debugging/analytics
   * Higher score = better match
   */
  calculateGenreMatchScore(content: TMDBContent, requiredGenres: number[]): number {
    if (!content.genre_ids || requiredGenres.length === 0) {
      return 0;
    }

    const matchingGenres = requiredGenres.filter(genreId => 
      content.genre_ids.includes(genreId)
    );

    // Score: (matching genres / required genres) * 100
    return (matchingGenres.length / requiredGenres.length) * 100;
  }

  /**
   * Validates that randomization is working correctly
   * Requirements: 3.3 - for testing purposes
   */
  validateRandomization(content: TMDBContent[], iterations: number = 5): boolean {
    if (content.length < 2) return true;

    const firstItemPositions: number[] = [];
    const firstItemId = content[0].id;

    // Run multiple randomizations
    for (let i = 0; i < iterations; i++) {
      const randomized = this.randomizeContent(content);
      const position = randomized.findIndex(item => item.id === firstItemId);
      firstItemPositions.push(position);
    }

    // Check if the first item appears in different positions
    const uniquePositions = new Set(firstItemPositions);
    const isRandomized = uniquePositions.size > 1;

    console.log(`🎲 PriorityAlgorithm: Randomization validation - ${uniquePositions.size}/${iterations} unique positions`);
    
    return isRandomized;
  }
}