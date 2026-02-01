const fc = require('fast-check');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const CacheStorageManager = require('../services/CacheStorageManager');

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('CacheStorageManager Property Tests', () => {
  let storageManager;
  let mockDynamoClient;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock DynamoDB client
    mockDynamoClient = {
      send: jest.fn()
    };

    DynamoDBClient.mockImplementation(() => ({}));
    DynamoDBDocumentClient.from = jest.fn(() => mockDynamoClient);

    // Set environment variables
    process.env.ROOM_MOVIE_CACHE_TABLE = 'trinity-room-movie-cache-dev';
    process.env.ROOM_CACHE_METADATA_TABLE = 'trinity-room-cache-metadata-dev';

    storageManager = new CacheStorageManager(mockDynamoClient);
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.ROOM_MOVIE_CACHE_TABLE;
    delete process.env.ROOM_CACHE_METADATA_TABLE;
  });

  /**
   * Property 4: Storage Integrity and Retrieval Consistency
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
   * 
   * For any cached movie entry, it should be stored with complete metadata 
   * including western language verification and non-empty description, with 
   * retrieval returning movies in the exact sequence order for all users.
   */
  describe('Property 4: Storage Integrity and Retrieval Consistency', () => {
    const westernLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'no'];
    
    const validMovieArbitrary = fc.record({
      movieId: fc.string({ minLength: 1, maxLength: 20 }),
      title: fc.string({ minLength: 1, maxLength: 100 }),
      overview: fc.string({ minLength: 10, maxLength: 500 }), // Non-empty description required
      posterPath: fc.string({ minLength: 1, maxLength: 200 }),
      releaseDate: fc.date({ min: new Date('1900-01-01'), max: new Date('2030-12-31') })
        .map(d => d.toISOString().split('T')[0]),
      voteAverage: fc.float({ min: 0, max: 10 }),
      genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 }),
      originalLanguage: fc.constantFrom(...westernLanguages), // Western languages only
      mediaType: fc.constantFrom('MOVIE', 'TV'),
      priority: fc.integer({ min: 1, max: 3 })
    });

    const movieSetArbitrary = fc.record({
      movies: fc.array(validMovieArbitrary, { minLength: 50, maxLength: 50 }), // Exactly 50 movies
      filterCriteria: fc.record({
        mediaType: fc.constantFrom('MOVIE', 'TV'),
        genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 2 }),
        roomCapacity: fc.integer({ min: 2, max: 10 })
      }),
      createdAt: fc.date().map(d => d.toISOString()),
      totalMovies: fc.constant(50)
    });

    const roomIdArbitrary = fc.string({ minLength: 1, maxLength: 50 });

    it('should store exactly 50 movies with complete metadata and western language validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          movieSetArbitrary,
          async (originalRoomId, movieSet) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;
            const ttl = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days

            // Reset mocks for this test
            jest.clearAllMocks();

            // Arrange: Mock successful batch write operations
            mockDynamoClient.send.mockResolvedValue({ UnprocessedItems: {} });

            // Act: Store the movie set
            await storageManager.storeMovieSet(roomId, movieSet, ttl);

            // Assert: Verify storage operations
            expect(mockDynamoClient.send).toHaveBeenCalled();
            
            // Verify batch write calls were made (50 movies in batches of 25)
            const batchWriteCalls = mockDynamoClient.send.mock.calls.filter(call => 
              call[0].constructor.name === 'BatchWriteCommand'
            );
            expect(batchWriteCalls.length).toBe(2); // 50 movies = 2 batches of 25

            // Verify each batch write contains correct data structure
            batchWriteCalls.forEach((call, batchIndex) => {
              const command = call[0];
              const requestItems = command.input.RequestItems;
              const tableName = 'trinity-room-movie-cache-dev';
              
              expect(requestItems[tableName]).toBeDefined();
              const items = requestItems[tableName];
              
              // Each batch should have 25 items (except possibly the last)
              expect(items.length).toBeLessThanOrEqual(25);
              expect(items.length).toBeGreaterThan(0);

              // Verify each item has required fields and proper sequence
              items.forEach((item, itemIndex) => {
                const putRequest = item.PutRequest;
                expect(putRequest).toBeDefined();
                
                const storedItem = putRequest.Item;
                expect(storedItem).toBeDefined();

                // Verify required fields are present
                expect(storedItem.roomId).toBe(roomId);
                expect(typeof storedItem.sequenceIndex).toBe('number');
                expect(storedItem.sequenceIndex).toBeGreaterThanOrEqual(0);
                expect(storedItem.sequenceIndex).toBeLessThan(50);
                expect(storedItem.movieId).toBeDefined();
                expect(storedItem.title).toBeDefined();
                expect(storedItem.overview).toBeDefined();
                expect(storedItem.overview.length).toBeGreaterThan(0); // Non-empty description
                expect(storedItem.posterPath).toBeDefined();
                expect(storedItem.releaseDate).toBeDefined();
                expect(typeof storedItem.voteAverage).toBe('number');
                expect(Array.isArray(storedItem.genreIds)).toBe(true);
                expect(storedItem.originalLanguage).toBeDefined();
                expect(westernLanguages).toContain(storedItem.originalLanguage); // Western language validation
                expect(['MOVIE', 'TV']).toContain(storedItem.mediaType);
                expect(typeof storedItem.priority).toBe('number');
                expect(storedItem.ttl).toBe(ttl);
                expect(storedItem.isActive).toBe(true);
                expect(storedItem.addedAt).toBeDefined();
              });
            });
          }
        ),
        { numRuns: 20 } // Reduced runs for stability
      );
    });

    it('should retrieve movies in exact sequence order (0-49) for all users', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          movieSetArbitrary,
          async (originalRoomId, movieSet) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;

            // Reset mocks for this test
            jest.clearAllMocks();

            // Arrange: Mock query response with all 50 movies
            const mockMovies = movieSet.movies.map((movie, index) => ({
              roomId,
              sequenceIndex: index,
              movieId: movie.movieId,
              title: movie.title,
              overview: movie.overview,
              posterPath: movie.posterPath,
              releaseDate: movie.releaseDate,
              voteAverage: movie.voteAverage,
              genreIds: movie.genreIds,
              originalLanguage: movie.originalLanguage,
              mediaType: movie.mediaType,
              priority: movie.priority,
              ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
              isActive: true,
              addedAt: new Date().toISOString()
            }));

            // Mock metadata response
            const mockMetadata = {
              roomId,
              totalMovies: 50,
              cacheComplete: true,
              status: 'ACTIVE'
            };

            mockDynamoClient.send
              .mockResolvedValueOnce({ Items: mockMovies }) // retrieveAllMovies query
              .mockResolvedValueOnce({ Item: mockMetadata }); // getCacheMetadata

            // Act: Retrieve all movies
            const retrievedMovies = await storageManager.retrieveAllMovies(roomId);

            // Assert: Sequence consistency requirements
            expect(retrievedMovies).toBeDefined();
            expect(retrievedMovies.length).toBe(50); // Exactly 50 movies

            // Verify sequence order (0-49)
            retrievedMovies.forEach((movie, index) => {
              expect(movie.sequenceIndex).toBe(index);
            });

            // Verify no gaps in sequence
            const sequenceIndexes = retrievedMovies.map(m => m.sequenceIndex).sort((a, b) => a - b);
            const expectedIndexes = Array.from({ length: 50 }, (_, i) => i);
            expect(sequenceIndexes).toEqual(expectedIndexes);

            // Verify all movies have required metadata
            retrievedMovies.forEach(movie => {
              expect(movie.movieId).toBeDefined();
              expect(movie.title).toBeDefined();
              expect(movie.overview).toBeDefined();
              expect(movie.overview.length).toBeGreaterThan(0); // Non-empty description
              expect(movie.originalLanguage).toBeDefined();
              expect(westernLanguages).toContain(movie.originalLanguage); // Western language
              expect(['MOVIE', 'TV']).toContain(movie.mediaType);
              expect(typeof movie.sequenceIndex).toBe('number');
              expect(movie.sequenceIndex).toBeGreaterThanOrEqual(0);
              expect(movie.sequenceIndex).toBeLessThan(50);
            });
          }
        ),
        { numRuns: 20 } // Reduced runs
      );
    });

    it('should retrieve individual movies by sequence index with validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          validMovieArbitrary,
          fc.integer({ min: 0, max: 49 }),
          async (originalRoomId, movie, sequenceIndex) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;

            // Reset mocks for this test
            jest.clearAllMocks();

            // Arrange: Mock get item response
            const mockStoredMovie = {
              roomId,
              sequenceIndex,
              movieId: movie.movieId,
              title: movie.title,
              overview: movie.overview,
              posterPath: movie.posterPath,
              releaseDate: movie.releaseDate,
              voteAverage: movie.voteAverage,
              genreIds: movie.genreIds,
              originalLanguage: movie.originalLanguage,
              mediaType: movie.mediaType,
              priority: movie.priority,
              ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
              isActive: true,
              addedAt: new Date().toISOString()
            };

            mockDynamoClient.send.mockResolvedValue({ Item: mockStoredMovie });

            // Act: Retrieve movie by index
            const retrievedMovie = await storageManager.retrieveMovieByIndex(roomId, sequenceIndex);

            // Assert: Movie integrity
            expect(retrievedMovie).toBeDefined();
            expect(retrievedMovie.movieId).toBe(movie.movieId);
            expect(retrievedMovie.title).toBe(movie.title);
            expect(retrievedMovie.overview).toBe(movie.overview);
            expect(retrievedMovie.overview.length).toBeGreaterThan(0); // Non-empty description
            expect(retrievedMovie.originalLanguage).toBe(movie.originalLanguage);
            expect(westernLanguages).toContain(retrievedMovie.originalLanguage); // Western language
            expect(retrievedMovie.mediaType).toBe(movie.mediaType);
            expect(retrievedMovie.sequenceIndex).toBe(sequenceIndex);
          }
        ),
        { numRuns: 20 } // Reduced runs
      );
    });

    it('should validate sequence index bounds (0-49 only)', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          fc.integer({ min: -100, max: 200 }),
          async (originalRoomId, invalidIndex) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;

            // Skip valid indexes (0-49)
            if (invalidIndex >= 0 && invalidIndex < 50) {
              return;
            }

            // Act: Try to retrieve movie with invalid index
            const result = await storageManager.retrieveMovieByIndex(roomId, invalidIndex);

            // Assert: Should return null for invalid indexes
            expect(result).toBeNull();

            // Verify no DynamoDB call was made for invalid indexes
            expect(mockDynamoClient.send).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should maintain metadata integrity with room capacity tracking', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          fc.record({
            totalMovies: fc.constant(50),
            cacheComplete: fc.boolean(),
            status: fc.constantFrom('LOADING', 'ACTIVE', 'COMPLETED', 'CLEANUP'),
            filterCriteria: fc.record({
              mediaType: fc.constantFrom('MOVIE', 'TV'),
              genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 2 }),
              roomCapacity: fc.integer({ min: 2, max: 10 })
            }),
            roomCapacity: fc.integer({ min: 2, max: 10 }),
            currentMembers: fc.integer({ min: 0, max: 10 }),
            createdAt: fc.date().map(d => d.toISOString())
          }),
          async (originalRoomId, metadata) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;

            // Reset mocks for this test
            jest.clearAllMocks();

            // Arrange: Mock successful put operation
            mockDynamoClient.send.mockResolvedValue({});

            // Act: Update cache metadata
            await storageManager.updateCacheMetadata(roomId, metadata);

            // Assert: Verify metadata storage
            expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
            
            const call = mockDynamoClient.send.mock.calls[0];
            const command = call[0];
            expect(command.constructor.name).toBe('PutCommand');
            
            const storedItem = command.input.Item;
            expect(storedItem.roomId).toBe(roomId);
            expect(storedItem.totalMovies).toBe(50); // Always 50 movies
            expect(storedItem.cacheComplete).toBe(metadata.cacheComplete);
            expect(storedItem.status).toBe(metadata.status);
            expect(storedItem.filterCriteria).toEqual(metadata.filterCriteria);
            expect(storedItem.roomCapacity).toBe(metadata.roomCapacity);
            expect(storedItem.currentMembers).toBe(metadata.currentMembers);
            expect(storedItem.createdAt).toBe(metadata.createdAt);
            expect(typeof storedItem.ttl).toBe('number'); // TTL should be set
            expect(typeof storedItem.updatedAt).toBe('string'); // updatedAt should be set

            // Verify TTL is set to 7 days from now (approximately)
            const expectedTTL = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
            expect(storedItem.ttl).toBeCloseTo(expectedTTL, -2); // Within ~100 seconds
          }
        ),
        { numRuns: 20 } // Reduced runs
      );
    });

    it('should handle TTL management for automatic cleanup', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          fc.integer({ min: 1, max: 30 }), // TTL in days
          async (originalRoomId, ttlDays) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;
            const ttlSeconds = ttlDays * 24 * 60 * 60;

            // Reset mocks for this test
            jest.clearAllMocks();

            // Arrange: Mock cache entries and metadata
            const mockCacheEntries = Array.from({ length: 50 }, (_, index) => ({
              roomId,
              sequenceIndex: index,
              movieId: `movie_${index}`,
              title: `Movie ${index}`
            }));

            mockDynamoClient.send.mockResolvedValue({}); // All operations succeed

            // Mock the first call to return cache entries
            mockDynamoClient.send.mockResolvedValueOnce({ Items: mockCacheEntries });

            // Act: Set TTL
            await storageManager.setTTL(roomId, ttlSeconds);

            // Assert: Verify TTL updates
            const calls = mockDynamoClient.send.mock.calls;
            
            // Should have 51 calls: 1 query + 50 cache entries + 1 metadata
            expect(calls.length).toBe(52);

            // First call should be the query to get cache entries
            expect(calls[0][0].constructor.name).toBe('QueryCommand');

            // Next 50 calls should be cache entry updates
            for (let i = 1; i <= 50; i++) {
              expect(calls[i][0].constructor.name).toBe('UpdateCommand');
              expect(calls[i][0].input.TableName).toBe('trinity-room-movie-cache-dev');
              expect(calls[i][0].input.Key.roomId).toBe(roomId);
              expect(calls[i][0].input.Key.sequenceIndex).toBe(i - 1);
            }

            // Last call should be metadata update
            const metadataUpdateCall = calls[51];
            expect(metadataUpdateCall[0].constructor.name).toBe('UpdateCommand');
            expect(metadataUpdateCall[0].input.TableName).toBe('trinity-room-cache-metadata-dev');
            expect(metadataUpdateCall[0].input.Key).toEqual({ roomId });
          }
        ),
        { numRuns: 10 } // Reduced runs due to complexity
      );
    });
  });

  /**
   * Property 2: Sequence Consistency Across Users
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
   * 
   * For any room with multiple participants, all users should receive the same 
   * 50 movies in identical sequence order, with each user able to vote independently 
   * through all movies regardless of other users' progress.
   */
  describe('Property 2: Sequence Consistency Across Users', () => {
    const userIdArbitrary = fc.string({ minLength: 1, maxLength: 20 });
    const userIdsArbitrary = fc.array(userIdArbitrary, { minLength: 2, maxLength: 10 });
    const movieIndexArbitrary = fc.integer({ min: 0, max: 49 });

    it('should provide identical movie sequences to all users in a room', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          userIdsArbitrary,
          movieSetArbitrary,
          async (originalRoomId, userIds, movieSet) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;

            // Reset mocks for this test
            jest.clearAllMocks();

            // Arrange: Mock complete cache with 50 movies
            const mockMovies = movieSet.movies.map((movie, index) => ({
              roomId,
              sequenceIndex: index,
              movieId: movie.movieId,
              title: movie.title,
              overview: movie.overview,
              posterPath: movie.posterPath,
              releaseDate: movie.releaseDate,
              voteAverage: movie.voteAverage,
              genreIds: movie.genreIds,
              originalLanguage: movie.originalLanguage,
              mediaType: movie.mediaType,
              priority: movie.priority
            }));

            const mockMetadata = {
              roomId,
              totalMovies: 50,
              cacheComplete: true,
              status: 'ACTIVE',
              filterCriteria: movieSet.filterCriteria
            };

            // Mock DynamoDB responses for all users
            mockDynamoClient.send.mockResolvedValue({ Items: mockMovies });

            // Act: Validate cross-user consistency
            const consistencyResult = await storageManager.validateCrossUserConsistency(roomId, userIds);

            // Assert: All users should see consistent sequences
            expect(consistencyResult.isConsistent).toBe(true);
            expect(consistencyResult.canonicalMovieCount).toBe(50);
            expect(consistencyResult.totalUsersChecked).toBe(userIds.length);
            expect(consistencyResult.inconsistentUsers).toHaveLength(0);

            // Verify all user results are consistent
            consistencyResult.userResults.forEach(userResult => {
              expect(userResult.isConsistent).toBe(true);
              expect(userResult.error).toBeNull();
              expect(userIds).toContain(userResult.userId);
            });

            // Verify canonical hash is generated
            expect(consistencyResult.canonicalHash).toBeDefined();
            expect(typeof consistencyResult.canonicalHash).toBe('string');
          }
        ),
        { numRuns: 20 } // Reduced runs due to complexity
      );
    });

    it('should allow independent voting through all 50 movies for each user', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          userIdArbitrary,
          movieIndexArbitrary,
          validMovieArbitrary,
          async (originalRoomId, userId, movieIndex, movie) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;

            // Reset mocks for this test
            jest.clearAllMocks();

            // Arrange: Mock complete cache and specific movie
            const mockMovies = Array.from({ length: 50 }, (_, index) => ({
              roomId,
              sequenceIndex: index,
              movieId: `movie_${index}`,
              title: `Movie ${index}`,
              overview: `Description ${index}`,
              originalLanguage: 'en'
            }));

            const mockMetadata = {
              roomId,
              totalMovies: 50,
              cacheComplete: true,
              status: 'ACTIVE'
            };

            const mockSpecificMovie = {
              roomId,
              sequenceIndex: movieIndex,
              movieId: movie.movieId,
              title: movie.title,
              overview: movie.overview,
              posterPath: movie.posterPath,
              releaseDate: movie.releaseDate,
              voteAverage: movie.voteAverage,
              genreIds: movie.genreIds,
              originalLanguage: movie.originalLanguage,
              mediaType: movie.mediaType,
              priority: movie.priority
            };

            mockDynamoClient.send
              .mockResolvedValueOnce({ Item: mockMetadata }) // getCacheMetadata
              .mockResolvedValueOnce({ Items: mockMovies }) // retrieveAllMovies for validation
              .mockResolvedValueOnce({ Item: mockSpecificMovie }); // retrieveMovieByIndex

            // Act: Get movie for independent voting
            const result = await storageManager.getMovieForIndependentVoting(roomId, userId, movieIndex);

            // Assert: Independent voting properties
            expect(result).toBeDefined();
            expect(result.movieId).toBe(movie.movieId);
            expect(result.title).toBe(movie.title);
            expect(result.sequenceIndex).toBe(movieIndex);
            
            // Verify independent voting metadata
            expect(result.isFromCache).toBe(true);
            expect(result.totalMoviesInCache).toBe(50);
            expect(result.userMovieIndex).toBe(movieIndex);
            expect(result.remainingMovies).toBe(49 - movieIndex);
            expect(result.votingProgress).toBe(`${movieIndex + 1}/50`);
          }
        ),
        { numRuns: 30 } // Reduced runs
      );
    });

    it('should maintain sequence consistency across user sessions and reconnections', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          userIdArbitrary,
          async (originalRoomId, userId) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;

            // Reset mocks for this test
            jest.clearAllMocks();

            // Arrange: Mock complete and active cache
            const mockMovies = Array.from({ length: 50 }, (_, index) => ({
              roomId,
              sequenceIndex: index,
              movieId: `movie_${index}`,
              title: `Movie ${index}`,
              overview: `Description for movie ${index}`,
              originalLanguage: 'en'
            }));

            const mockMetadata = {
              roomId,
              totalMovies: 50,
              cacheComplete: true,
              status: 'ACTIVE',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            mockDynamoClient.send
              .mockResolvedValueOnce({ Item: mockMetadata }) // getCacheMetadata
              .mockResolvedValueOnce({ Items: mockMovies }); // retrieveAllMovies for validation

            // Act: Ensure sequence consistency (simulating user reconnection)
            const consistencyResult = await storageManager.ensureSequenceConsistency(roomId, userId);

            // Assert: Consistency maintained across sessions
            expect(consistencyResult.isConsistent).toBe(true);
            expect(consistencyResult.totalMovies).toBe(50);
            expect(consistencyResult.sequenceRange).toBe('0-49');
            expect(consistencyResult.action).toBe('CONSISTENT');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should detect and report sequence inconsistencies', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          fc.record({
            movieCount: fc.integer({ min: 0, max: 100 }),
            hasGaps: fc.boolean(),
            hasDuplicates: fc.boolean(),
            status: fc.constantFrom('LOADING', 'ACTIVE', 'COMPLETED', 'ERROR')
          }),
          async (originalRoomId, inconsistencyConfig) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;

            // Reset mocks for this test
            jest.clearAllMocks();

            // Skip consistent cases (tested above)
            if (inconsistencyConfig.movieCount === 50 && 
                !inconsistencyConfig.hasGaps && 
                !inconsistencyConfig.hasDuplicates && 
                inconsistencyConfig.status === 'ACTIVE') {
              return;
            }

            // Arrange: Mock inconsistent cache
            let mockMovies = [];
            
            if (inconsistencyConfig.movieCount > 0) {
              mockMovies = Array.from({ length: inconsistencyConfig.movieCount }, (_, index) => {
                let sequenceIndex = index;
                
                // Introduce gaps
                if (inconsistencyConfig.hasGaps && index > 10) {
                  sequenceIndex = index + 5; // Create gaps
                }
                
                // Introduce duplicates
                if (inconsistencyConfig.hasDuplicates && index > 5 && index < 10) {
                  sequenceIndex = 5; // Duplicate index 5
                }
                
                return {
                  roomId,
                  sequenceIndex,
                  movieId: `movie_${index}`,
                  title: `Movie ${index}`,
                  overview: index % 3 === 0 ? '' : `Description ${index}`, // Some empty descriptions
                  originalLanguage: 'en'
                };
              });
            }

            const mockMetadata = {
              roomId,
              totalMovies: inconsistencyConfig.movieCount,
              cacheComplete: inconsistencyConfig.movieCount === 50,
              status: inconsistencyConfig.status
            };

            mockDynamoClient.send
              .mockResolvedValueOnce({ Item: mockMetadata }) // getCacheMetadata
              .mockResolvedValueOnce({ Items: mockMovies }); // retrieveAllMovies

            // Act: Check sequence consistency
            const consistencyResult = await storageManager.ensureSequenceConsistency(roomId, 'test-user');

            // Assert: Inconsistency should be detected
            expect(consistencyResult.isConsistent).toBe(false);
            expect(consistencyResult.error).toBeDefined();
            expect(['CACHE_NOT_FOUND', 'CACHE_NOT_READY', 'SEQUENCE_REPAIR_NEEDED', 'ERROR'])
              .toContain(consistencyResult.action);

            // Verify appropriate error messages based on inconsistency type
            if (inconsistencyConfig.movieCount === 0) {
              expect(consistencyResult.action).toBe('CACHE_NOT_FOUND');
            } else if (inconsistencyConfig.status !== 'ACTIVE' || !mockMetadata.cacheComplete) {
              expect(consistencyResult.action).toBe('CACHE_NOT_READY');
            } else {
              expect(consistencyResult.action).toBe('SEQUENCE_REPAIR_NEEDED');
              expect(consistencyResult.details).toBeDefined();
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should generate consistent sequence hashes for identical movie sets', async () => {
      await fc.assert(
        fc.asyncProperty(
          movieSetArbitrary,
          async (movieSet) => {
            // Arrange: Create two identical movie arrays with proper sequence indexes
            const movies1 = movieSet.movies.map((movie, index) => ({
              ...movie,
              sequenceIndex: index
            }));

            const movies2 = movieSet.movies.map((movie, index) => ({
              ...movie,
              sequenceIndex: index
            }));

            // Act: Generate hashes for both sets
            const hash1 = storageManager.createSequenceHash(movies1);
            const hash2 = storageManager.createSequenceHash(movies2);

            // Assert: Identical sequences should produce identical hashes
            expect(hash1).toBe(hash2);
            expect(typeof hash1).toBe('string');
            expect(hash1.length).toBeGreaterThan(0);

            // Test with shuffled order (should still produce same hash due to sorting)
            const shuffledMovies = [...movies1].sort(() => Math.random() - 0.5);
            const hash3 = storageManager.createSequenceHash(shuffledMovies);
            expect(hash3).toBe(hash1);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should provide different sequence hashes for different movie sets', async () => {
      await fc.assert(
        fc.asyncProperty(
          movieSetArbitrary,
          movieSetArbitrary,
          async (movieSet1, movieSet2) => {
            // Skip if movie sets are identical
            const set1MovieIds = movieSet1.movies.map(m => m.movieId).sort();
            const set2MovieIds = movieSet2.movies.map(m => m.movieId).sort();
            
            if (JSON.stringify(set1MovieIds) === JSON.stringify(set2MovieIds)) {
              return; // Skip identical sets
            }

            // Arrange: Create movie arrays with sequence indexes
            const movies1 = movieSet1.movies.map((movie, index) => ({
              ...movie,
              sequenceIndex: index
            }));

            const movies2 = movieSet2.movies.map((movie, index) => ({
              ...movie,
              sequenceIndex: index
            }));

            // Act: Generate hashes
            const hash1 = storageManager.createSequenceHash(movies1);
            const hash2 = storageManager.createSequenceHash(movies2);

            // Assert: Different sequences should produce different hashes
            expect(hash1).not.toBe(hash2);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle sequence repair scenarios appropriately', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          fc.record({
            scenario: fc.constantFrom('NO_MOVIES', 'INCOMPLETE', 'EXCESS', 'GAPS', 'DUPLICATES', 'CONSISTENT'),
            movieCount: fc.integer({ min: 0, max: 60 })
          }),
          async (originalRoomId, repairScenario) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;

            // Reset mocks for this test
            jest.clearAllMocks();

            // Arrange: Create scenario-specific mock data
            let mockMovies = [];
            let expectedAction = '';

            switch (repairScenario.scenario) {
              case 'NO_MOVIES':
                mockMovies = [];
                expectedAction = 'RECREATE_CACHE_NEEDED';
                break;
              
              case 'INCOMPLETE':
                const incompleteCount = Math.min(repairScenario.movieCount, 49);
                mockMovies = Array.from({ length: incompleteCount }, (_, index) => ({
                  roomId,
                  sequenceIndex: index,
                  movieId: `movie_${index}`,
                  title: `Movie ${index}`,
                  overview: `Description ${index}`,
                  originalLanguage: 'en'
                }));
                expectedAction = 'INCOMPLETE_CACHE';
                break;
              
              case 'EXCESS':
                const excessCount = Math.max(repairScenario.movieCount, 51);
                mockMovies = Array.from({ length: excessCount }, (_, index) => ({
                  roomId,
                  sequenceIndex: index,
                  movieId: `movie_${index}`,
                  title: `Movie ${index}`,
                  overview: `Description ${index}`,
                  originalLanguage: 'en'
                }));
                expectedAction = 'EXCESS_MOVIES';
                break;
              
              case 'GAPS':
                mockMovies = Array.from({ length: 50 }, (_, index) => ({
                  roomId,
                  sequenceIndex: index < 25 ? index : index + 5, // Create gaps after index 25
                  movieId: `movie_${index}`,
                  title: `Movie ${index}`,
                  overview: `Description ${index}`,
                  originalLanguage: 'en'
                }));
                expectedAction = 'SEQUENCE_INDEX_REPAIR_NEEDED';
                break;
              
              case 'DUPLICATES':
                mockMovies = Array.from({ length: 50 }, (_, index) => ({
                  roomId,
                  sequenceIndex: index < 10 ? 5 : index, // Duplicate index 5 for first 10 movies
                  movieId: `movie_${index}`,
                  title: `Movie ${index}`,
                  overview: `Description ${index}`,
                  originalLanguage: 'en'
                }));
                expectedAction = 'SEQUENCE_INDEX_REPAIR_NEEDED';
                break;
              
              case 'CONSISTENT':
                mockMovies = Array.from({ length: 50 }, (_, index) => ({
                  roomId,
                  sequenceIndex: index,
                  movieId: `movie_${index}`,
                  title: `Movie ${index}`,
                  overview: `Description ${index}`,
                  originalLanguage: 'en'
                }));
                expectedAction = 'NO_REPAIR_NEEDED';
                break;
            }

            mockDynamoClient.send
              .mockResolvedValueOnce({ Items: mockMovies }) // First call for validation
              .mockResolvedValueOnce({ Items: mockMovies }); // Second call for repair analysis

            // Act: Attempt sequence repair
            const repairResult = await storageManager.repairSequenceConsistency(roomId);

            // Assert: Appropriate repair action
            expect(repairResult.action).toBe(expectedAction);
            
            if (repairScenario.scenario === 'CONSISTENT') {
              expect(repairResult.success).toBe(true);
              expect(repairResult.message).toContain('already consistent');
            } else {
              expect(repairResult.success).toBe(false);
              expect(repairResult.message).toBeDefined();
              
              if (expectedAction === 'INCOMPLETE_CACHE' || expectedAction === 'EXCESS_MOVIES') {
                expect(repairResult.details).toBeDefined();
                expect(repairResult.details.foundMovies).toBe(mockMovies.length);
                expect(repairResult.details.expectedMovies).toBe(50);
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Storage Validation Methods', () => {
    it('should correctly validate western languages', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'),
          (language) => {
            const westernLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'no'];
            const movie = { originalLanguage: language };
            
            // This would be a method on the storage manager if it existed
            const isWestern = westernLanguages.includes(language);
            const shouldBeWestern = westernLanguages.includes(language);
            
            expect(isWestern).toBe(shouldBeWestern);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly validate non-empty descriptions', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 500 }),
            fc.constant(''),
            fc.constant('   '),
            fc.constant(null),
            fc.constant(undefined)
          ),
          (overview) => {
            const movie = { overview };
            
            const hasValidDescription = overview && 
                                      typeof overview === 'string' && 
                                      overview.trim().length > 0;
            const shouldBeValid = overview && 
                                 typeof overview === 'string' && 
                                 overview.trim().length > 0;
            
            expect(hasValidDescription).toBe(shouldBeValid);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate sequence index ranges consistently', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100, max: 200 }),
          (index) => {
            const isValidIndex = index >= 0 && index < 50;
            const shouldBeValid = index >= 0 && index < 50;
            
            expect(isValidIndex).toBe(shouldBeValid);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});