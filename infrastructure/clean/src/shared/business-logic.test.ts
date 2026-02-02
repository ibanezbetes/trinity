/**
 * Business Logic Components Test - Extracted from MONOLITH files
 * 
 * Tests for the extracted EnhancedTMDBClient and ContentFilterService
 * 
 * Requirements: 1.4, 3.1, 3.5
 */

import { EnhancedTMDBClient, GENRE_MAPPING } from './enhanced-tmdb-client';
import { ContentFilterService } from './content-filter-service';
import { BusinessLogicFactory } from './business-logic-factory';
import { BUSINESS_LOGIC_CONSTANTS } from './business-logic-types';

describe('Business Logic Components - Extracted from MONOLITH', () => {
  
  describe('EnhancedTMDBClient', () => {
    let client: EnhancedTMDBClient;

    beforeEach(() => {
      client = new EnhancedTMDBClient('test-api-key');
    });

    test('should validate media types correctly', () => {
      expect(() => client.validateMediaType('MOVIE')).not.toThrow();
      expect(() => client.validateMediaType('TV')).not.toThrow();
      expect(() => client.validateMediaType('INVALID')).toThrow('Invalid mediaType: INVALID. Must be \'MOVIE\' or \'TV\'');
    });

    test('should select correct endpoints', () => {
      expect(client.selectEndpoint('MOVIE')).toBe('/discover/movie');
      expect(client.selectEndpoint('TV')).toBe('/discover/tv');
    });

    test('should map genre IDs correctly for TV', () => {
      const movieGenres = [28, 12, 37, 10752]; // Action, Adventure, Western, War
      const expectedTVGenres = [10759, 10759, 37, 10768]; // Action & Adventure, Action & Adventure, Western, War & Politics
      
      const mappedGenres = client.mapGenreIds(movieGenres, 'TV');
      expect(mappedGenres).toEqual(expectedTVGenres);
    });

    test('should not map genre IDs for MOVIE', () => {
      const movieGenres = [28, 12, 37, 10752];
      const mappedGenres = client.mapGenreIds(movieGenres, 'MOVIE');
      expect(mappedGenres).toEqual(movieGenres);
    });

    test('should parse genre strings correctly', () => {
      expect(client.parseGenreString('28,12,37')).toEqual([28, 12, 37]);
      expect(client.parseGenreString('28|12|37')).toEqual([28, 12, 37]);
      expect(client.parseGenreString('28, 12, 37')).toEqual([28, 12, 37]);
    });

    test('should have correct western languages', () => {
      const westernLanguages = client.getWesternLanguages();
      expect(westernLanguages).toEqual(['en', 'es', 'fr', 'it', 'de', 'pt']);
      expect(westernLanguages).not.toContain('ja'); // NO Asian languages per requirements
      expect(westernLanguages).not.toContain('ko'); // NO Asian languages per requirements
    });

    test('should validate content fields with business logic', () => {
      const validMovieItem = {
        id: 123,
        title: 'Test Movie',
        release_date: '2023-01-01',
        overview: 'This is a valid movie description that is longer than 20 characters',
        poster_path: '/test-poster.jpg',
        genre_ids: [28, 12],
        vote_average: 7.5,
        vote_count: 100,
        popularity: 50.0,
        original_language: 'en',
        adult: false
      };

      expect(client.validateContentFieldsBusinessLogic(validMovieItem, 'MOVIE')).toBe(true);

      // Test invalid cases
      const invalidItem = { ...validMovieItem, original_language: 'ja' }; // Asian language
      expect(client.validateContentFieldsBusinessLogic(invalidItem, 'MOVIE')).toBe(false);

      const shortOverview = { ...validMovieItem, overview: 'Too short' };
      expect(client.validateContentFieldsBusinessLogic(shortOverview, 'MOVIE')).toBe(false);

      const adultContent = { ...validMovieItem, adult: true };
      expect(client.validateContentFieldsBusinessLogic(adultContent, 'MOVIE')).toBe(false);
    });
  });

  describe('ContentFilterService', () => {
    let service: ContentFilterService;

    beforeEach(() => {
      service = new ContentFilterService('test-api-key');
    });

    test('should have correct western languages', () => {
      const westernLanguages = service.getWesternLanguages();
      expect(westernLanguages).toEqual(['en', 'es', 'fr', 'it', 'de', 'pt']);
      expect(westernLanguages).not.toContain('ja'); // NO Asian languages per requirements
      expect(westernLanguages).not.toContain('ko'); // NO Asian languages per requirements
    });

    test('should validate western languages correctly', () => {
      expect(service.isWesternLanguage('en')).toBe(true);
      expect(service.isWesternLanguage('es')).toBe(true);
      expect(service.isWesternLanguage('fr')).toBe(true);
      expect(service.isWesternLanguage('ja')).toBe(false); // NO Asian languages per requirements
      expect(service.isWesternLanguage('ko')).toBe(false); // NO Asian languages per requirements
      expect(service.isWesternLanguage('zh')).toBe(false);
    });

    test('should validate descriptions correctly', () => {
      const validItem = {
        id: 123,
        overview: 'This is a valid description',
        poster_path: '/test.jpg',
        genre_ids: [28],
        vote_average: 7.0,
        vote_count: 100,
        popularity: 50.0,
        original_language: 'en',
        adult: false,
        title: 'Test Movie',
        release_date: '2023-01-01'
      };

      expect(service.hasValidDescription(validItem)).toBe(true);

      const emptyDescription = { ...validItem, overview: '' };
      expect(service.hasValidDescription(emptyDescription)).toBe(false);

      const unavailableDescription = { ...validItem, overview: 'Descripción no disponible' };
      expect(service.hasValidDescription(unavailableDescription)).toBe(false);
    });

    test('should validate quality gates correctly', () => {
      const validItem = {
        id: 123,
        overview: 'This is a valid description',
        poster_path: '/test.jpg',
        genre_ids: [28],
        vote_average: 7.0,
        vote_count: 100,
        popularity: 50.0,
        original_language: 'en',
        adult: false,
        title: 'Test Movie',
        release_date: '2023-01-01'
      };

      expect(service.meetsQualityGates(validItem)).toBe(true);

      // Test various failure cases
      expect(service.meetsQualityGates({ ...validItem, overview: '' })).toBe(false);
      expect(service.meetsQualityGates({ ...validItem, poster_path: '' })).toBe(false);
      expect(service.meetsQualityGates({ ...validItem, genre_ids: [] })).toBe(false);
      expect(service.meetsQualityGates({ ...validItem, original_language: 'ja' })).toBe(false);
      expect(service.meetsQualityGates({ ...validItem, adult: true })).toBe(false);
    });
  });

  describe('BusinessLogicFactory', () => {
    afterEach(() => {
      BusinessLogicFactory.reset();
    });

    test('should create singleton instance', () => {
      const factory1 = BusinessLogicFactory.getInstance();
      const factory2 = BusinessLogicFactory.getInstance();
      expect(factory1).toBe(factory2);
    });

    test('should create TMDB client', () => {
      const factory = BusinessLogicFactory.getInstance();
      const client = factory.getTMDBClient('test-key');
      expect(client).toBeInstanceOf(EnhancedTMDBClient);
    });

    test('should create content filter service', () => {
      const factory = BusinessLogicFactory.getInstance();
      const service = factory.getContentFilterService('test-key');
      expect(service).toBeInstanceOf(ContentFilterService);
    });

    test('should validate environment variables', () => {
      const factory = BusinessLogicFactory.getInstance();
      
      // Mock environment variables
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        TMDB_API_KEY: 'test-key',
        AWS_REGION: 'eu-west-1',
        ROOMS_TABLE: 'test-rooms',
        ROOM_MEMBERS_TABLE: 'test-members',
        VOTES_TABLE: 'test-votes',
        ROOM_MOVIE_CACHE_TABLE: 'test-cache'
      };

      const validation = factory.validateEnvironment();
      expect(validation.isValid).toBe(true);
      expect(validation.missingVars).toEqual([]);

      // Restore environment
      process.env = originalEnv;
    });
  });

  describe('Business Logic Constants', () => {
    test('should have correct constants', () => {
      expect(BUSINESS_LOGIC_CONSTANTS.MAX_MOVIES_PER_ROOM).toBe(50);
      expect(BUSINESS_LOGIC_CONSTANTS.MAX_GENRES_PER_ROOM).toBe(2);
      expect(BUSINESS_LOGIC_CONSTANTS.WESTERN_LANGUAGES).toEqual(['en', 'es', 'fr', 'it', 'de', 'pt']);
      expect(BUSINESS_LOGIC_CONSTANTS.WESTERN_LANGUAGES).not.toContain('ja'); // NO Asian languages per requirements
      expect(BUSINESS_LOGIC_CONSTANTS.WESTERN_LANGUAGES).not.toContain('ko'); // NO Asian languages per requirements
      expect(BUSINESS_LOGIC_CONSTANTS.BUSINESS_LOGIC_VERSION).toBe('MONOLITH-FINAL-v1.0');
    });
  });

  describe('Genre Mapping', () => {
    test('should have correct genre mappings', () => {
      expect(GENRE_MAPPING[28]).toBe(10759); // Action → Action & Adventure
      expect(GENRE_MAPPING[12]).toBe(10759); // Adventure → Action & Adventure
      expect(GENRE_MAPPING[37]).toBe(37);    // Western → Western (same)
      expect(GENRE_MAPPING[10752]).toBe(10768); // War → War & Politics
    });
  });
});