/**
 * Movie Domain Entity
 * Core business entity representing a movie in the Trinity system
 */

export class Movie {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly description: string,
    public readonly duration: number, // in minutes
    public readonly genre: string[],
    public readonly releaseYear: number,
    public readonly addedBy: string,
    public readonly posterUrl?: string,
    public readonly trailerUrl?: string,
    public readonly rating?: number, // 0-10 scale
    public readonly addedAt: Date = new Date(),
  ) {}

  /**
   * Updates the movie rating
   */
  updateRating(newRating: number): Movie {
    if (newRating < 0 || newRating > 10) {
      throw new Error('Rating must be between 0 and 10');
    }

    return new Movie(
      this.id,
      this.title,
      this.description,
      this.duration,
      this.genre,
      this.releaseYear,
      this.addedBy,
      this.posterUrl,
      this.trailerUrl,
      newRating,
      this.addedAt,
    );
  }

  /**
   * Checks if the movie is recently added (within 7 days)
   */
  isRecentlyAdded(): boolean {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return this.addedAt > sevenDaysAgo;
  }

  /**
   * Gets formatted duration string
   */
  getFormattedDuration(): string {
    const hours = Math.floor(this.duration / 60);
    const minutes = this.duration % 60;
    
    if (hours === 0) {
      return `${minutes}m`;
    }
    
    return `${hours}h ${minutes}m`;
  }

  /**
   * Checks if movie has all required metadata
   */
  hasCompleteMetadata(): boolean {
    return !!(
      this.title &&
      this.description &&
      this.duration > 0 &&
      this.genre.length > 0 &&
      this.releaseYear > 1800 &&
      this.releaseYear <= new Date().getFullYear() + 5
    );
  }
}