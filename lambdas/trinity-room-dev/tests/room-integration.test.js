const { handler } = require('../room');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient } = require('@aws-sdk/client-lambda');

// Mock AWS SDK
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-lambda');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-room-id-123')
}));

/**
 * Unit tests for room integration with 50-movie cache system
 * Tests cache creation, capacity management, and filter immutability
 */

describe('Room Integration with Cache System', () => {
  let mockDocClient;
  let mockLambdaClient;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock DynamoDB Document Client
    mockDocClient = {
      send: jest.fn()
    };
    DynamoDBDocumentClient.from = jest.fn().mockReturnValue(mockDocClient);

    // Mock Lambda Client
    mockLambdaClient = {
      send: jest.fn()
    };
    LambdaClient.mockImplementation(() => mockLambdaClient);

    // Mock environment variables
    process.env.ROOMS_TABLE = 'trinity-rooms-dev-v2';
    process.env.ROOM_MEMBERS_TABLE = 'trinity-room-members-dev';
    process.env.AWS_REGION = 'eu-west-1';
  });

  /**
   * Test: Cache creation during room setup with 50-movie limit
   */
  describe('Cache Creation During Room Setup', () => {
    test('should create 50-movie cache when room is created with filter criteria', async () => {
      // Mock successful cache creation
      const mockCacheResponse = {
        Payload: new TextEncoder().encode(JSON.stringify({
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            result: {
              movieCount: 50,
              metadata: {
                roomId: 'test-room-id-123',
                totalMovies: 50,
                cacheComplete: true
              }
            }
          })
        }))
      };

      mockLambdaClient.send.mockResolvedValue(mockCacheResponse);

      // Mock DynamoDB operations
      mockDocClient.send
        .mockResolvedValueOnce({}) // PutCommand for room
        .mockResolvedValueOnce({}); // PutCommand for host member

      const event = {
        info: { fieldName: 'createRoom' },
        identity: { sub: 'host-user-123' },
        arguments: {
          input: {
            name: 'Test Room',
            description: 'Test room with cache',
            mediaType: 'MOVIE',
            genreIds: [28, 35], // Action and Comedy
            maxMembers: 3,
            isPrivate: false
          }
        }
      };

      const result = await handler(event);

      // Verify cache creation was called
      expect(mockLambdaClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          FunctionName: 'trinity-cache-dev',
          Payload: expect.stringContaining('createCache')
        })
      );

      // Verify room was created successfully
      expect(result).toBeDefined();
      expect(result.id).toBe('test-room-id-123');
      expect(result.name).toBe('Test Room');
      expect(result.mediaType).toBe('MOVIE');
      expect(result.genreIds).toEqual([28, 35]);
      expect(result.maxMembers).toBe(3);

      // Verify room was saved to DynamoDB
      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'trinity-rooms-dev-v2',
            Item: expect.objectContaining({
              PK: 'test-room-id-123',
              SK: 'ROOM',
              roomId: 'test-room-id-123',
              name: 'Test Room',
              mediaType: 'MOVIE',
              genreIds: [28, 35],
              maxMembers: 3
            })
          })
        })
      );
    });

    test('should handle cache creation failure gracefully', async () => {
      // Mock cache creation failure
      const mockCacheResponse = {
        Payload: new TextEncoder().encode(JSON.stringify({
          statusCode: 500,
          body: JSON.stringify({
            success: false,
            error: 'Cache creation failed'
          })
        }))
      };

      mockLambdaClient.send.mockResolvedValue(mockCacheResponse);

      // Mock DynamoDB operations
      mockDocClient.send
        .mockResolvedValueOnce({}) // PutCommand for room
        .mockResolvedValueOnce({}); // PutCommand for host member

      const event = {
        info: { fieldName: 'createRoom' },
        identity: { sub: 'host-user-123' },
        arguments: {
          input: {
            name: 'Test Room',
            mediaType: 'MOVIE',
            genreIds: [28],
            maxMembers: 2
          }
        }
      };

      // Should not throw error even if cache creation fails
      const result = await handler(event);

      expect(result).toBeDefined();
      expect(result.id).toBe('test-room-id-123');
      expect(result.name).toBe('Test Room');

      // Verify cache creation was attempted
      expect(mockLambdaClient.send).toHaveBeenCalled();
    });

    test('should validate filter criteria according to business requirements', async () => {
      const event = {
        info: { fieldName: 'createRoom' },
        identity: { sub: 'host-user-123' },
        arguments: {
          input: {
            name: 'Invalid Room',
            mediaType: 'INVALID_TYPE', // Invalid media type
            genreIds: [28, 35, 14], // Too many genres (max 2)
            maxMembers: 2
          }
        }
      };

      // Should throw validation error
      await expect(handler(event)).rejects.toThrow();

      // Verify cache creation was not called
      expect(mockLambdaClient.send).not.toHaveBeenCalled();
    });
  });

  /**
   * Test: Room capacity enforcement
   */
  describe('Room Capacity Enforcement', () => {
    test('should prevent joining when room is full', async () => {
      // Mock room data
      const mockRoom = {
        Item: {
          id: 'test-room-id-123',
          name: 'Full Room',
          status: 'WAITING',
          maxMembers: 2,
          hostId: 'host-user-123'
        }
      };

      // Mock current members (room is full)
      const mockMembers = {
        Items: [
          { roomId: 'test-room-id-123', userId: 'host-user-123', isActive: true },
          { roomId: 'test-room-id-123', userId: 'member-user-456', isActive: true }
        ]
      };

      mockDocClient.send
        .mockResolvedValueOnce(mockRoom) // GetCommand for room
        .mockResolvedValueOnce(mockMembers) // QueryCommand for members
        .mockResolvedValueOnce({ Item: null }); // GetCommand for existing member

      const event = {
        info: { fieldName: 'joinRoom' },
        identity: { sub: 'new-user-789' },
        arguments: {
          roomId: 'test-room-id-123'
        }
      };

      // Should throw error when room is full
      await expect(handler(event)).rejects.toThrow('La sala está llena');

      // Verify no member was added
      expect(mockDocClient.send).not.toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'trinity-room-members-dev'
          })
        })
      );
    });

    test('should allow joining when room has space', async () => {
      // Mock room data
      const mockRoom = {
        Item: {
          id: 'test-room-id-123',
          name: 'Available Room',
          status: 'WAITING',
          maxMembers: 3,
          hostId: 'host-user-123'
        }
      };

      // Mock current members (room has space)
      const mockMembers = {
        Items: [
          { roomId: 'test-room-id-123', userId: 'host-user-123', isActive: true }
        ]
      };

      mockDocClient.send
        .mockResolvedValueOnce(mockRoom) // GetCommand for room
        .mockResolvedValueOnce(mockMembers) // QueryCommand for members
        .mockResolvedValueOnce({ Item: null }) // GetCommand for existing member
        .mockResolvedValueOnce({}) // PutCommand for new member
        .mockResolvedValueOnce({}); // UpdateCommand for room

      const event = {
        info: { fieldName: 'joinRoom' },
        identity: { sub: 'new-user-789' },
        arguments: {
          roomId: 'test-room-id-123'
        }
      };

      const result = await handler(event);

      expect(result).toBeDefined();
      expect(result.id).toBe('test-room-id-123');

      // Verify member was added
      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'trinity-room-members-dev',
            Item: expect.objectContaining({
              roomId: 'test-room-id-123',
              userId: 'new-user-789',
              role: 'MEMBER',
              isActive: true
            })
          })
        })
      );
    });
  });

  /**
   * Test: Filter immutability enforcement
   */
  describe('Filter Immutability Enforcement', () => {
    test('should reject filter update attempts after room creation', async () => {
      // Mock room with existing filters
      const mockRoom = {
        Item: {
          id: 'test-room-id-123',
          hostId: 'host-user-123',
          mediaType: 'MOVIE',
          genreIds: [28, 35],
          filterCriteria: {
            mediaType: 'MOVIE',
            genreIds: [28, 35]
          }
        }
      };

      mockDocClient.send.mockResolvedValueOnce(mockRoom);

      const event = {
        info: { fieldName: 'updateRoomFilters' },
        identity: { sub: 'host-user-123' },
        arguments: {
          roomId: 'test-room-id-123',
          input: {
            mediaType: 'TV', // Trying to change media type
            genreIds: [18] // Trying to change genres
          }
        }
      };

      // Should throw immutability error
      await expect(handler(event)).rejects.toThrow('Room filters cannot be modified after creation');

      // Verify no update was performed
      expect(mockDocClient.send).toHaveBeenCalledTimes(1); // Only the GetCommand
    });

    test('should reject filter updates from non-host users', async () => {
      // Mock room
      const mockRoom = {
        Item: {
          id: 'test-room-id-123',
          hostId: 'host-user-123', // Different from requesting user
          mediaType: 'MOVIE',
          genreIds: [28]
        }
      };

      mockDocClient.send.mockResolvedValueOnce(mockRoom);

      const event = {
        info: { fieldName: 'updateRoomFilters' },
        identity: { sub: 'other-user-456' }, // Not the host
        arguments: {
          roomId: 'test-room-id-123',
          input: {
            mediaType: 'TV',
            genreIds: [18]
          }
        }
      };

      // Should throw authorization error
      await expect(handler(event)).rejects.toThrow('Only room host can update filters');
    });
  });

  /**
   * Test: Cache cleanup scheduling for matched rooms
   */
  describe('Cache Cleanup Scheduling', () => {
    test('should schedule cleanup when room reaches MATCHED status', async () => {
      // Mock successful cleanup scheduling
      const mockCleanupResponse = {
        Payload: new TextEncoder().encode(JSON.stringify({
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            message: 'Cleanup scheduled successfully'
          })
        }))
      };

      mockLambdaClient.send.mockResolvedValue(mockCleanupResponse);

      // Mock room update
      mockDocClient.send.mockResolvedValueOnce({});

      // Simulate updating room to MATCHED status
      const updateRoomToMatched = require('../room').updateRoomToMatched;
      
      if (updateRoomToMatched) {
        await updateRoomToMatched('test-room-id-123', 'movie-456');

        // Verify room status was updated
        expect(mockDocClient.send).toHaveBeenCalledWith(
          expect.objectContaining({
            input: expect.objectContaining({
              TableName: 'trinity-rooms-dev-v2',
              Key: { PK: 'test-room-id-123', SK: 'ROOM' },
              UpdateExpression: expect.stringContaining('SET #status = :status'),
              ExpressionAttributeValues: expect.objectContaining({
                ':status': 'MATCHED',
                ':movieId': 'movie-456'
              })
            })
          })
        );

        // Verify cleanup was scheduled
        expect(mockLambdaClient.send).toHaveBeenCalledWith(
          expect.objectContaining({
            FunctionName: 'trinity-cache-dev',
            Payload: expect.stringContaining('scheduleCleanup')
          })
        );
      }
    });

    test('should handle cleanup scheduling failure gracefully', async () => {
      // Mock cleanup scheduling failure
      const mockCleanupResponse = {
        Payload: new TextEncoder().encode(JSON.stringify({
          statusCode: 500,
          body: JSON.stringify({
            success: false,
            error: 'Cleanup scheduling failed'
          })
        }))
      };

      mockLambdaClient.send.mockResolvedValue(mockCleanupResponse);
      mockDocClient.send.mockResolvedValueOnce({});

      const updateRoomToMatched = require('../room').updateRoomToMatched;
      
      if (updateRoomToMatched) {
        // Should not throw error even if cleanup scheduling fails
        await expect(updateRoomToMatched('test-room-id-123', 'movie-456')).resolves.not.toThrow();

        // Verify room status was still updated
        expect(mockDocClient.send).toHaveBeenCalled();
      }
    });
  });

  /**
   * Test: Business logic validation
   */
  describe('Business Logic Validation', () => {
    test('should enforce exactly 1 or 2 genres requirement', async () => {
      const testCases = [
        { genreIds: [], shouldFail: true }, // No genres
        { genreIds: [28], shouldFail: false }, // 1 genre (valid)
        { genreIds: [28, 35], shouldFail: false }, // 2 genres (valid)
        { genreIds: [28, 35, 14], shouldFail: true }, // 3 genres (invalid)
        { genreIds: [28, 35, 14, 18], shouldFail: true } // 4 genres (invalid)
      ];

      for (const testCase of testCases) {
        const event = {
          info: { fieldName: 'createRoom' },
          identity: { sub: 'host-user-123' },
          arguments: {
            input: {
              name: 'Test Room',
              mediaType: 'MOVIE',
              genreIds: testCase.genreIds,
              maxMembers: 2
            }
          }
        };

        if (testCase.shouldFail) {
          await expect(handler(event)).rejects.toThrow();
        } else {
          // Mock successful responses for valid cases
          mockLambdaClient.send.mockResolvedValue({
            Payload: new TextEncoder().encode(JSON.stringify({
              statusCode: 200,
              body: JSON.stringify({ success: true, result: { movieCount: 50 } })
            }))
          });
          mockDocClient.send
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});

          const result = await handler(event);
          expect(result).toBeDefined();
          expect(result.genreIds).toEqual(testCase.genreIds);
        }

        // Reset mocks for next iteration
        jest.clearAllMocks();
      }
    });

    test('should enforce exclusive media type selection', async () => {
      const validMediaTypes = ['MOVIE', 'TV'];
      const invalidMediaTypes = ['BOTH', 'ALL', 'MIXED', ''];

      for (const mediaType of validMediaTypes) {
        const event = {
          info: { fieldName: 'createRoom' },
          identity: { sub: 'host-user-123' },
          arguments: {
            input: {
              name: 'Test Room',
              mediaType: mediaType,
              genreIds: [28],
              maxMembers: 2
            }
          }
        };

        // Mock successful responses for valid media types
        mockLambdaClient.send.mockResolvedValue({
          Payload: new TextEncoder().encode(JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ success: true, result: { movieCount: 50 } })
          }))
        });
        mockDocClient.send
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({});

        const result = await handler(event);
        expect(result).toBeDefined();
        expect(result.mediaType).toBe(mediaType);

        jest.clearAllMocks();
      }

      for (const mediaType of invalidMediaTypes) {
        const event = {
          info: { fieldName: 'createRoom' },
          identity: { sub: 'host-user-123' },
          arguments: {
            input: {
              name: 'Test Room',
              mediaType: mediaType,
              genreIds: [28],
              maxMembers: 2
            }
          }
        };

        await expect(handler(event)).rejects.toThrow();
      }
    });
  });
});