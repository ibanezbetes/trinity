"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriorityAlgorithmEngine = void 0;
class PriorityAlgorithmEngine {
    /**
     * Prioritizes content based on genre matching
     * Requirements: 3.2
     */
    prioritizeContent(content, criteria) {
        console.log(`🎯 PriorityAlgorithm: Prioritizing ${content.length} items for criteria:`, criteria);
        const results = [];
        if (criteria.genres.length === 0) {
            // No genres selected - all content gets priority 3 (popular)
            return [{
                    content: this.randomizeContent(content),
                    priority: 3,
                    randomized: true
                }];
        }
        // Priority 1: Content with ALL selected genres (AND logic)
        const priority1Content = content.filter(item => this.hasAllGenres(item, criteria.genres));
        if (priority1Content.length > 0) {
            results.push({
                content: this.randomizeContent(priority1Content),
                priority: 1,
                randomized: true
            });
        }
        // Priority 2: Content with ANY selected genre (OR logic), excluding Priority 1
        const priority2Content = content.filter(item => !this.hasAllGenres(item, criteria.genres) &&
            this.hasAnyGenre(item, criteria.genres));
        if (priority2Content.length > 0) {
            results.push({
                content: this.randomizeContent(priority2Content),
                priority: 2,
                randomized: true
            });
        }
        // Priority 3: Remaining content (popular fallback)
        const priority3Content = content.filter(item => !this.hasAnyGenre(item, criteria.genres));
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
    randomizeContent(content) {
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
    hasAllGenres(content, requiredGenres) {
        if (!content.genre_ids || requiredGenres.length === 0) {
            return false;
        }
        return requiredGenres.every(genreId => content.genre_ids.includes(genreId));
    }
    /**
     * Checks if content has ANY of the specified genres (OR logic)
     * Used for Priority 2 content
     */
    hasAnyGenre(content, requiredGenres) {
        if (!content.genre_ids || requiredGenres.length === 0) {
            return false;
        }
        return requiredGenres.some(genreId => content.genre_ids.includes(genreId));
    }
    /**
     * Calculates genre match score for debugging/analytics
     * Higher score = better match
     */
    calculateGenreMatchScore(content, requiredGenres) {
        if (!content.genre_ids || requiredGenres.length === 0) {
            return 0;
        }
        const matchingGenres = requiredGenres.filter(genreId => content.genre_ids.includes(genreId));
        // Score: (matching genres / required genres) * 100
        return (matchingGenres.length / requiredGenres.length) * 100;
    }
    /**
     * Validates that randomization is working correctly
     * Requirements: 3.3 - for testing purposes
     */
    validateRandomization(content, iterations = 5) {
        if (content.length < 2)
            return true;
        const firstItemPositions = [];
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
exports.PriorityAlgorithmEngine = PriorityAlgorithmEngine;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJpb3JpdHktYWxnb3JpdGhtLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJpb3JpdHktYWxnb3JpdGhtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7R0FXRzs7O0FBV0gsTUFBYSx1QkFBdUI7SUFFbEM7OztPQUdHO0lBQ0gsaUJBQWlCLENBQUMsT0FBc0IsRUFBRSxRQUF3QjtRQUNoRSxPQUFPLENBQUMsR0FBRyxDQUFDLHNDQUFzQyxPQUFPLENBQUMsTUFBTSxzQkFBc0IsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUVsRyxNQUFNLE9BQU8sR0FBeUIsRUFBRSxDQUFDO1FBRXpDLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDakMsNkRBQTZEO1lBQzdELE9BQU8sQ0FBQztvQkFDTixPQUFPLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQztvQkFDdkMsUUFBUSxFQUFFLENBQUM7b0JBQ1gsVUFBVSxFQUFFLElBQUk7aUJBQ2pCLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCwyREFBMkQ7UUFDM0QsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQzdDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FDekMsQ0FBQztRQUVGLElBQUksZ0JBQWdCLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2hDLE9BQU8sQ0FBQyxJQUFJLENBQUM7Z0JBQ1gsT0FBTyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDaEQsUUFBUSxFQUFFLENBQUM7Z0JBQ1gsVUFBVSxFQUFFLElBQUk7YUFDakIsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELCtFQUErRTtRQUMvRSxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMs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WUFDdkUsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3BDLENBQUM7UUFFRCx5REFBeUQ7UUFDekQsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUNwRCxNQUFNLFlBQVksR0FBRyxlQUFlLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztRQUU5QyxPQUFPLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxlQUFlLENBQUMsSUFBSSxJQUFJLFVBQVUsbUJBQW1CLENBQUMsQ0FBQztRQUV2SCxPQUFPLFlBQVksQ0FBQztJQUN0QixDQUFDO0NBQ0Y7QUExSkQsMERBMEpDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIFByaW9yaXR5QWxnb3JpdGhtRW5naW5lIC0gVGhyZWUtVGllciBDb250ZW50IFByaW9yaXRpemF0aW9uXHJcbiAqIFxyXG4gKiBJbXBsZW1lbnRzIHRoZSBwcmlvcml0eSBhbGdvcml0aG0gd2l0aCB0aHJlZSBsZXZlbHM6XHJcbiAqIC0gUHJpb3JpdHkgMTogQWxsIGdlbnJlcyBtYXRjaGluZyAoQU5EIGxvZ2ljKVxyXG4gKiAtIFByaW9yaXR5IDI6IEFueSBnZW5yZSBtYXRjaGluZyAoT1IgbG9naWMpICBcclxuICogLSBQcmlvcml0eSAzOiBQb3B1bGFyIGNvbnRlbnQgZmFsbGJhY2tcclxuICogXHJcbiAqIEVhY2ggbGV2ZWwgaW5jbHVkZXMgcmFuZG9taXphdGlvbiBmb3IgdmFyaWV0eS5cclxuICogXHJcbiAqIFJlcXVpcmVtZW50czogMy4yLCAzLjMsIDMuNFxyXG4gKi9cclxuXHJcbmltcG9ydCB7IFRNREJDb250ZW50IH0gZnJvbSAnLi9lbmhhbmNlZC10bWRiLWNsaWVudCc7XHJcbmltcG9ydCB7IEZpbHRlckNyaXRlcmlhIH0gZnJvbSAnLi9jb250ZW50LWZpbHRlci1zZXJ2aWNlJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgUHJpb3JpdGl6ZWRDb250ZW50IHtcclxuICBjb250ZW50OiBUTURCQ29udGVudFtdO1xyXG4gIHByaW9yaXR5OiAxIHwgMiB8IDM7XHJcbiAgcmFuZG9taXplZDogYm9vbGVhbjtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFByaW9yaXR5QWxnb3JpdGhtRW5naW5lIHtcclxuXHJcbiAgLyoqXHJcbiAgICogUHJpb3JpdGl6ZXMgY29udGVudCBiYXNlZCBvbiBnZW5yZSBtYXRjaGluZ1xyXG4gICAqIFJlcXVpcmVtZW50czogMy4yXHJcbiAgICovXHJcbiAgcHJpb3JpdGl6ZUNvbnRlbnQoY29udGVudDogVE1EQkNvbnRlbnRbXSwgY3JpdGVyaWE6IEZpbHRlckNyaXRlcmlhKTogUHJpb3JpdGl6ZWRDb250ZW50W10ge1xyXG4gICAgY29uc29sZS5sb2coYPCfjq8gUHJpb3JpdHlBbGdvcml0aG06IFByaW9yaXRpemluZyAke2NvbnRlbnQubGVuZ3RofSBpdGVtcyBmb3IgY3JpdGVyaWE6YCwgY3JpdGVyaWEpO1xyXG5cclxuICAgIGNvbnN0IHJlc3VsdHM6IFByaW9yaXRpemVkQ29udGVudFtdID0gW107XHJcblxyXG4gICAgaWYgKGNyaXRlcmlhLmdlbnJlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgLy8gTm8gZ2VucmVzIHNlbGVjdGVkIC0gYWxsIGNvbnRlbnQgZ2V0cyBwcmlvcml0eSAzIChwb3B1bGFyKVxyXG4gICAgICByZXR1cm4gW3tcclxuICAgICAgICBjb250ZW50OiB0aGlzLnJhbmRvbWl6ZUNvbnRlbnQoY29udGVudCksXHJcbiAgICAgICAgcHJpb3JpdHk6IDMsXHJcbiAgICAgICAgcmFuZG9taXplZDogdHJ1ZVxyXG4gICAgICB9XTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmlvcml0eSAxOiBDb250ZW50IHdpdGggQUxMIHNlbGVjdGVkIGdlbnJlcyAoQU5EIGxvZ2ljKVxyXG4gICAgY29uc3QgcHJpb3JpdHkxQ29udGVudCA9IGNvbnRlbnQuZmlsdGVyKGl0ZW0gPT4gXHJcbiAgICAgIHRoaXMuaGFzQWxsR2VucmVzKGl0ZW0sIGNyaXRlcmlhLmdlbnJlcylcclxuICAgICk7XHJcblxyXG4gICAgaWYgKHByaW9yaXR5MUNvbnRlbnQubGVuZ3RoID4gMCkge1xyXG4gICAgICByZXN1bHRzLnB1c2goe1xyXG4gICAgICAgIGNvbnRlbnQ6IHRoaXMucmFuZG9taXplQ29udGVudChwcmlvcml0eTFDb250ZW50KSxcclxuICAgICAgICBwcmlvcml0eTogMSxcclxuICAgICAgICByYW5kb21pemVkOiB0cnVlXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDI6IENvbnRlbnQgd2l0aCBBTlkgc2VsZWN0ZWQgZ2VucmUgKE9SIGxvZ2ljKSwgZXhjbHVkaW5nIFByaW9yaXR5IDFcclxuICAgIGNvbnN0IHByaW9yaXR5MkNvbnRlbnQgPSBjb250ZW50LmZpbHRlcihpdGVtID0+IFxyXG4gICAgICAhdGhpcy5oYXNBbGxHZW5yZXMoaXRlbSwgY3JpdGVyaWEuZ2VucmVzKSAmJiBcclxuICAgICAgdGhpcy5oYXNBbnlHZW5yZShpdGVtLCBjcml0ZXJpYS5nZW5yZXMpXHJcbiAgICApO1xyXG5cclxuICAgIGlmIChwcmlvcml0eTJDb250ZW50Lmxlbmd0aCA+IDApIHtcclxuICAgICAgcmVzdWx0cy5wdXNoKHtcclxuICAgICAgICBjb250ZW50OiB0aGlzLnJhbmRvbWl6ZUNvbnRlbnQocHJpb3JpdHkyQ29udGVudCksXHJcbiAgICAgICAgcHJpb3JpdHk6IDIsXHJcbiAgICAgICAgcmFuZG9taXplZDogdHJ1ZVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmlvcml0eSAzOiBSZW1haW5pbmcgY29udGVudCAocG9wdWxhciBmYWxsYmFjaylcclxuICAgIGNvbnN0IHByaW9yaXR5M0NvbnRlbnQgPSBjb250ZW50LmZpbHRlcihpdGVtID0+IFxyXG4gICAgICAhdGhpcy5oYXNBbnlHZW5yZShpdGVtLCBjcml0ZXJpYS5nZW5yZXMpXHJcbiAgICApO1xyXG5cclxuICAgIGlmIChwcmlvcml0eTNDb250ZW50Lmxlbmd0aCA+IDApIHtcclxuICAgICAgcmVzdWx0cy5wdXNoKHtcclxuICAgICAgICBjb250ZW50OiB0aGlzLnJhbmRvbWl6ZUNvbnRlbnQocHJpb3JpdHkzQ29udGVudCksXHJcbiAgICAgICAgcHJpb3JpdHk6IDMsXHJcbiAgICAgICAgcmFuZG9taXplZDogdHJ1ZVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIFByaW9yaXR5QWxnb3JpdGhtOiBDYXRlZ29yaXplZCBpbnRvICR7cmVzdWx0cy5sZW5ndGh9IHByaW9yaXR5IGxldmVsc2ApO1xyXG4gICAgcmVzdWx0cy5mb3JFYWNoKChsZXZlbCwgaW5kZXgpID0+IHtcclxuICAgICAgY29uc29sZS5sb2coYCAgIFByaW9yaXR5ICR7bGV2ZWwucHJpb3JpdHl9OiAke2xldmVsLmNvbnRlbnQubGVuZ3RofSBpdGVtc2ApO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdHM7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSYW5kb21pemVzIGNvbnRlbnQgb3JkZXIgd2l0aGluIHRoZSBzYW1lIHByaW9yaXR5IGxldmVsXHJcbiAgICogUmVxdWlyZW1lbnRzOiAzLjNcclxuICAgKi9cclxuICByYW5kb21pemVDb250ZW50KGNvbnRlbnQ6IFRNREJDb250ZW50W10pOiBUTURCQ29udGVudFtdIHtcclxuICAgIGNvbnN0IHNodWZmbGVkID0gWy4uLmNvbnRlbnRdO1xyXG4gICAgXHJcbiAgICAvLyBGaXNoZXItWWF0ZXMgc2h1ZmZsZSBhbGdvcml0aG1cclxuICAgIGZvciAobGV0IGkgPSBzaHVmZmxlZC5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XHJcbiAgICAgIGNvbnN0IGogPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAoaSArIDEpKTtcclxuICAgICAgW3NodWZmbGVkW2ldLCBzaHVmZmxlZFtqXV0gPSBbc2h1ZmZsZWRbal0sIHNodWZmbGVkW2ldXTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gc2h1ZmZsZWQ7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDaGVja3MgaWYgY29udGVudCBoYXMgQUxMIHNwZWNpZmllZCBnZW5yZXMgKEFORCBsb2dpYylcclxuICAgKiBVc2VkIGZvciBQcmlvcml0eSAxIGNvbnRlbnRcclxuICAgKi9cclxuICBwcml2YXRlIGhhc0FsbEdlbnJlcyhjb250ZW50OiBUTURCQ29udGVudCwgcmVxdWlyZWRHZW5yZXM6IG51bWJlcltdKTogYm9vbGVhbiB7XHJcbiAgICBpZiAoIWNvbnRlbnQuZ2VucmVfaWRzIHx8IHJlcXVpcmVkR2VucmVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJlcXVpcmVkR2VucmVzLmV2ZXJ5KGdlbnJlSWQgPT4gXHJcbiAgICAgIGNvbnRlbnQuZ2VucmVfaWRzLmluY2x1ZGVzKGdlbnJlSWQpXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2tzIGlmIGNvbnRlbnQgaGFzIEFOWSBvZiB0aGUgc3BlY2lmaWVkIGdlbnJlcyAoT1IgbG9naWMpXHJcbiAgICogVXNlZCBmb3IgUHJpb3JpdHkgMiBjb250ZW50XHJcbiAgICovXHJcbiAgcHJpdmF0ZSBoYXNBbnlHZW5yZShjb250ZW50OiBUTURCQ29udGVudCwgcmVxdWlyZWRHZW5yZXM6IG51bWJlcltdKTogYm9vbGVhbiB7XHJcbiAgICBpZiAoIWNvbnRlbnQuZ2VucmVfaWRzIHx8IHJlcXVpcmVkR2VucmVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJlcXVpcmVkR2VucmVzLnNvbWUoZ2VucmVJZCA9PiBcclxuICAgICAgY29udGVudC5nZW5yZV9pZHMuaW5jbHVkZXMoZ2VucmVJZClcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDYWxjdWxhdGVzIGdlbnJlIG1hdGNoIHNjb3JlIGZvciBkZWJ1Z2dpbmcvYW5hbHl0aWNzXHJcbiAgICogSGlnaGVyIHNjb3JlID0gYmV0dGVyIG1hdGNoXHJcbiAgICovXHJcbiAgY2FsY3VsYXRlR2VucmVNYXRjaFNjb3JlKGNvbnRlbnQ6IFRNREJDb250ZW50LCByZXF1aXJlZEdlbnJlczogbnVtYmVyW10pOiBudW1iZXIge1xyXG4gICAgaWYgKCFjb250ZW50LmdlbnJlX2lkcyB8fCByZXF1aXJlZEdlbnJlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgcmV0dXJuIDA7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbWF0Y2hpbmdHZW5yZXMgPSByZXF1aXJlZEdlbnJlcy5maWx0ZXIoZ2VucmVJZCA9PiBcclxuICAgICAgY29udGVudC5nZW5yZV9pZHMuaW5jbHVkZXMoZ2VucmVJZClcclxuICAgICk7XHJcblxyXG4gICAgLy8gU2NvcmU6IChtYXRjaGluZyBnZW5yZXMgLyByZXF1aXJlZCBnZW5yZXMpICogMTAwXHJcbiAgICByZXR1cm4gKG1hdGNoaW5nR2VucmVzLmxlbmd0aCAvIHJlcXVpcmVkR2VucmVzLmxlbmd0aCkgKiAxMDA7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZXMgdGhhdCByYW5kb21pemF0aW9uIGlzIHdvcmtpbmcgY29ycmVjdGx5XHJcbiAgICogUmVxdWlyZW1lbnRzOiAzLjMgLSBmb3IgdGVzdGluZyBwdXJwb3Nlc1xyXG4gICAqL1xyXG4gIHZhbGlkYXRlUmFuZG9taXphdGlvbihjb250ZW50OiBUTURCQ29udGVudFtdLCBpdGVyYXRpb25zOiBudW1iZXIgPSA1KTogYm9vbGVhbiB7XHJcbiAgICBpZiAoY29udGVudC5sZW5ndGggPCAyKSByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICBjb25zdCBmaXJzdEl0ZW1Qb3NpdGlvbnM6IG51bWJlcltdID0gW107XHJcbiAgICBjb25zdCBmaXJzdEl0ZW1JZCA9IGNvbnRlbnRbMF0uaWQ7XHJcblxyXG4gICAgLy8gUnVuIG11bHRpcGxlIHJhbmRvbWl6YXRpb25zXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGl0ZXJhdGlvbnM7IGkrKykge1xyXG4gICAgICBjb25zdCByYW5kb21pemVkID0gdGhpcy5yYW5kb21pemVDb250ZW50KGNvbnRlbnQpO1xyXG4gICAgICBjb25zdCBwb3NpdGlvbiA9IHJhbmRvbWl6ZWQuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5pZCA9PT0gZmlyc3RJdGVtSWQpO1xyXG4gICAgICBmaXJzdEl0ZW1Qb3NpdGlvbnMucHVzaChwb3NpdGlvbik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgdGhlIGZpcnN0IGl0ZW0gYXBwZWFycyBpbiBkaWZmZXJlbnQgcG9zaXRpb25zXHJcbiAgICBjb25zdCB1bmlxdWVQb3NpdGlvbnMgPSBuZXcgU2V0KGZpcnN0SXRlbVBvc2l0aW9ucyk7XHJcbiAgICBjb25zdCBpc1JhbmRvbWl6ZWQgPSB1bmlxdWVQb3NpdGlvbnMuc2l6ZSA+IDE7XHJcblxyXG4gICAgY29uc29sZS5sb2coYPCfjrIgUHJpb3JpdHlBbGdvcml0aG06IFJhbmRvbWl6YXRpb24gdmFsaWRhdGlvbiAtICR7dW5pcXVlUG9zaXRpb25zLnNpemV9LyR7aXRlcmF0aW9uc30gdW5pcXVlIHBvc2l0aW9uc2ApO1xyXG4gICAgXHJcbiAgICByZXR1cm4gaXNSYW5kb21pemVkO1xyXG4gIH1cclxufSJdfQ==