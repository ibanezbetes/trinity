/**
 * Movie Repository Interface (Port)
 * Defines the contract for movie data persistence
 */

import { Movie } from '../entities/movie.entity';

export interface IMovieRepository {
  /**
   * Finds a movie by its unique ID
   */
  findById(id: string): Promise<Movie | null>;

  /**
   * Creates a new movie
   */
  create(movie: Movie): Promise<Movie>;

  /**
   * Updates an existing movie
   */
  update(movie: Movie): Promise<Movie>;

  /**
   * Deletes a movie by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Finds all movies with pagination
   */
  findAll(offset: number, limit: number): Promise<Movie[]>;

  /**
   * Searches movies by title (case-insensitive)
   */
  searchByTitle(title: string, offset: number, limit: number): Promise<Movie[]>;

  /**
   * Finds movies by genre
   */
  findByGenre(genre: string, offset: number, limit: number): Promise<Movie[]>;

  /**
   * Finds movies by release year range
   */
  findByYearRange(startYear: number, endYear: number): Promise<Movie[]>;

  /**
   * Finds movies added by a specific user
   */
  findByAddedBy(userId: string): Promise<Movie[]>;

  /**
   * Finds recently added movies (within specified days)
   */
  findRecentlyAdded(days: number): Promise<Movie[]>;

  /**
   * Finds top-rated movies
   */
  findTopRated(limit: number): Promise<Movie[]>;

  /**
   * Counts total number of movies
   */
  count(): Promise<number>;

  /**
   * Counts movies by genre
   */
  countByGenre(genre: string): Promise<number>;
}