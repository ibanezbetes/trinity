/**
 * PriorityAlgorithmEngine - Content Prioritization System (JavaScript version)
 * 
 * Implements the 3-tier priority algorithm for content selection:
 * - Priority 1: Content matching ALL selected criteria
 * - Priority 2: Content matching ANY selected criteria  
 * - Priority 3: Popular fallback content
 */

class PriorityAlgorithmEngine {
  constructor() {
    console.log('🎯 PriorityAlgorithmEngine initialized');
  }

  /**
   * Randomizes content array using Fisher-Yates shuffle
   * @param {Array} content - Content array to randomize
   * @returns {Array} Randomized content array
   */
  randomizeContent(content) {
    if (!Array.isArray(content)) {
      console.warn('⚠️ PriorityAlgorithmEngine: Invalid content array provided');
      return [];
    }

    const shuffled = [...content];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    console.log(`🎲 PriorityAlgorithmEngine: Randomized ${shuffled.length} items`);
    return shuffled;
  }

  /**
   * Applies priority-based selection to content
   * @param {Array} content - Content array with priority information
   * @param {number} maxItems - Maximum items to select
   * @returns {Array} Priority-selected content
   */
  selectByPriority(content, maxItems = 30) {
    if (!Array.isArray(content)) {
      console.warn('⚠️ PriorityAlgorithmEngine: Invalid content array provided');
      return [];
    }

    // Group by priority
    const priority1 = content.filter(item => item.priority === 1);
    const priority2 = content.filter(item => item.priority === 2);
    const priority3 = content.filter(item => item.priority === 3);

    console.log(`🎯 PriorityAlgorithmEngine: Priority distribution - P1: ${priority1.length}, P2: ${priority2.length}, P3: ${priority3.length}`);

    // Randomize each priority group
    const shuffledP1 = this.randomizeContent(priority1);
    const shuffledP2 = this.randomizeContent(priority2);
    const shuffledP3 = this.randomizeContent(priority3);

    // Select items prioritizing higher priority groups
    const selected = [];
    
    // Take as many as possible from priority 1 (up to 50% of total)
    const maxFromP1 = Math.min(shuffledP1.length, Math.floor(maxItems * 0.5));
    selected.push(...shuffledP1.slice(0, maxFromP1));
    
    // Fill remaining from priority 2 (up to 35% of total)
    const remaining = maxItems - selected.length;
    if (remaining > 0) {
      const maxFromP2 = Math.min(shuffledP2.length, Math.floor(maxItems * 0.35));
      const fromP2 = Math.min(maxFromP2, remaining);
      selected.push(...shuffledP2.slice(0, fromP2));
    }
    
    // Fill any remaining from priority 3
    const stillRemaining = maxItems - selected.length;
    if (stillRemaining > 0) {
      const fromP3 = Math.min(shuffledP3.length, stillRemaining);
      selected.push(...shuffledP3.slice(0, fromP3));
    }

    console.log(`✅ PriorityAlgorithmEngine: Selected ${selected.length} items from ${content.length} total`);
    return selected;
  }

  /**
   * Calculates content priority based on genre matching
   * @param {Object} item - Content item
   * @param {Array} selectedGenres - Selected genre IDs
   * @returns {number} Priority level (1-3)
   */
  calculateGenrePriority(item, selectedGenres) {
    if (!selectedGenres || selectedGenres.length === 0) {
      return 1; // All items have equal priority when no genres specified
    }

    const itemGenres = item.genre_ids || item.genreIds || [];
    
    // Check if item has ALL selected genres (highest priority)
    const hasAllGenres = selectedGenres.every(genreId => itemGenres.includes(genreId));
    
    // Check if item has ANY selected genres (medium priority)
    const hasAnyGenre = selectedGenres.some(genreId => itemGenres.includes(genreId));
    
    if (hasAllGenres) {
      return 1; // Highest priority - has all genres
    } else if (hasAnyGenre) {
      return 2; // Medium priority - has some genres
    } else {
      return 3; // Lowest priority - no matching genres (fallback)
    }
  }

  /**
   * Applies genre-based prioritization to content array
   * @param {Array} content - Content array
   * @param {Array} selectedGenres - Selected genre IDs
   * @returns {Array} Content with priority assignments
   */
  applyGenrePrioritization(content, selectedGenres) {
    if (!Array.isArray(content)) {
      console.warn('⚠️ PriorityAlgorithmEngine: Invalid content array provided');
      return [];
    }

    const contentWithPriority = content.map(item => ({
      ...item,
      priority: this.calculateGenrePriority(item, selectedGenres)
    }));

    // Sort by priority (1 = highest, 3 = lowest)
    const sorted = contentWithPriority.sort((a, b) => a.priority - b.priority);
    
    const priorityCounts = {
      1: sorted.filter(item => item.priority === 1).length,
      2: sorted.filter(item => item.priority === 2).length,
      3: sorted.filter(item => item.priority === 3).length
    };
    
    console.log(`🎯 PriorityAlgorithmEngine: Applied genre prioritization - P1: ${priorityCounts[1]}, P2: ${priorityCounts[2]}, P3: ${priorityCounts[3]}`);
    
    return sorted;
  }
}

module.exports = { PriorityAlgorithmEngine };