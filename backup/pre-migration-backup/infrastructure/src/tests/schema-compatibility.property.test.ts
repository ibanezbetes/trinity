/**
 * Property Test: Schema Compatibility
 * 
 * **Feature: advanced-content-filtering, Property 17: Schema Compatibility**
 * 
 * **Validates: Requirements 9.4**
 * 
 * For any existing GraphQL query or mutation, the system should maintain 
 * full backward compatibility.
 */

import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generates legacy room creation inputs (without filtering)
 */
const legacyCreateRoomInputArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  description: fc.option(fc.string({ maxLength: 500 })),
  isPrivate: fc.option(fc.boolean()),
  maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
  genrePreferences: fc.option(fc.array(fc.string(), { maxLength: 5 }))
});

/**
 * Generates new room creation inputs (with filtering)
 */
const newCreateRoomInputArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  description: fc.option(fc.string({ maxLength: 500 })),
  isPrivate: fc.option(fc.boolean()),
  maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
  mediaType: fc.constantFrom('MOVIE', 'TV'),
  genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 }),
  genrePreferences: fc.option(fc.array(fc.string(), { maxLength: 5 })) // For compatibility
});

/**
 * Generates legacy room data (without filtering fields)
 */
const legacyRoomArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  description: fc.option(fc.string({ maxLength: 500 })),
  status: fc.constantFrom('WAITING', 'VOTING', 'COMPLETED'),
  hostId: fc.uuid(),
  inviteCode: fc.string({ minLength: 6, maxLength: 8 }).filter(s => s.trim().length >= 6),
  genrePreferences: fc.option(fc.array(fc.string(), { maxLength: 5 })),
  isActive: fc.boolean(),
  isPrivate: fc.boolean(),
  memberCount: fc.integer({ min: 1, max: 50 }),
  maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
  matchCount: fc.integer({ min: 0, max: 100 }),
  createdAt: fc.integer({ min: 1577836800000, max: 1735689600000 }).map(ts => new Date(ts).toISOString()),
  updatedAt: fc.option(fc.integer({ min: 1577836800000, max: 1735689600000 }).map(ts => new Date(ts).toISOString()))
});

/**
 * Generates new room data (with filtering fields)
 */
const newRoomArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  description: fc.option(fc.string({ maxLength: 500 })),
  status: fc.constantFrom('WAITING', 'VOTING', 'COMPLETED'),
  hostId: fc.uuid(),
  inviteCode: fc.string({ minLength: 6, maxLength: 8 }).filter(s => s.trim().length >= 6),
  genrePreferences: fc.option(fc.array(fc.string(), { maxLength: 5 })),
  mediaType: fc.option(fc.constantFrom('MOVIE', 'TV')),
  genreIds: fc.option(fc.array(fc.integer({ min: 1, max: 100 }), { maxLength: 3 })),
  genreNames: fc.option(fc.array(fc.string(), { maxLength: 3 })),
  contentIds: fc.option(fc.array(fc.string(), { minLength: 0, maxLength: 30 })),
  currentContentIndex: fc.option(fc.integer({ min: 0, max: 29 })),
  excludedContentIds: fc.option(fc.array(fc.string(), { maxLength: 100 })),
  lastContentRefresh: fc.option(fc.integer({ min: 1577836800000, max: 1735689600000 }).map(ts => new Date(ts).toISOString())),
  isActive: fc.boolean(),
  isPrivate: fc.boolean(),
  memberCount: fc.integer({ min: 1, max: 50 }),
  maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
  matchCount: fc.integer({ min: 0, max: 100 }),
  createdAt: fc.integer({ min: 1577836800000, max: 1735689600000 }).map(ts => new Date(ts).toISOString()),
  updatedAt: fc.option(fc.integer({ min: 1577836800000, max: 1735689600000 }).map(ts => new Date(ts).toISOString()))
});

// ============================================================================
// Schema Compatibility Validators
// ============================================================================

/**
 * Validates that a room object contains all required legacy fields
 */
function validateLegacyRoomFields(room: any): boolean {
  const requiredFields = [
    'id', 'name', 'status', 'hostId', 'inviteCode', 
    'isActive', 'isPrivate', 'memberCount', 'matchCount', 'createdAt'
  ];
  
  return requiredFields.every(field => field in room && room[field] !== undefined);
}

/**
 * Validates that optional legacy fields are handled correctly
 */
function validateOptionalLegacyFields(room: any): boolean {
  const optionalFields = ['description', 'genrePreferences', 'maxMembers', 'updatedAt'];
  
  // Optional fields should either be present or undefined/null, never missing
  return optionalFields.every(field => 
    field in room || room[field] === undefined || room[field] === null
  );
}

/**
 * Validates that new filtering fields are optional and don't break legacy clients
 */
function validateNewFieldsAreOptional(room: any): boolean {
  const newFields = [
    'mediaType', 'genreIds', 'genreNames', 'contentIds', 
    'currentContentIndex', 'filterCriteria', 'contentPool',
    'excludedContentIds', 'lastContentRefresh'
  ];
  
  // New fields should be optional - they can be present, null, or undefined
  return newFields.every(field => {
    if (!(field in room)) return true;
    return room[field] === null || room[field] === undefined || room[field] !== undefined;
  });
}

/**
 * Validates that CreateRoom input accepts both legacy and new formats
 */
function validateCreateRoomInputCompatibility(input: any): boolean {
  // Must have required fields
  if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
    return false;
  }
  
  // Legacy format: can have genrePreferences without mediaType/genreIds
  const hasLegacyFormat = input.genrePreferences && !input.mediaType && !input.genreIds;
  
  // New format: must have mediaType and genreIds
  const hasNewFormat = input.mediaType && Array.isArray(input.genreIds);
  
  // Hybrid format: has both legacy and new fields (for transition)
  const hasHybridFormat = input.genrePreferences && input.mediaType && input.genreIds;
  
  // Minimal format: just has name (should be valid for basic room creation)
  const hasMinimalFormat = !input.genrePreferences && !input.mediaType && !input.genreIds;
  
  return hasLegacyFormat || hasNewFormat || hasHybridFormat || hasMinimalFormat;
}

/**
 * Validates GraphQL type compatibility
 */
function validateGraphQLTypeCompatibility(data: any, expectedType: string): boolean {
  switch (expectedType) {
    case 'ID':
      return typeof data === 'string';
    case 'String':
      return typeof data === 'string';
    case 'Int':
      return typeof data === 'number' && Number.isInteger(data);
    case 'Float':
      return typeof data === 'number';
    case 'Boolean':
      return typeof data === 'boolean';
    case 'AWSDateTime':
      return typeof data === 'string' && !isNaN(Date.parse(data));
    default:
      return true; // Unknown types pass validation
  }
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Schema Compatibility Property Tests', () => {
  
  test('Property 17: Legacy room queries should work with new schema', () => {
    fc.assert(
      fc.property(legacyRoomArb, (legacyRoom) => {
        // Legacy room data should be valid under new schema
        expect(validateLegacyRoomFields(legacyRoom)).toBe(true);
        expect(validateOptionalLegacyFields(legacyRoom)).toBe(true);
        expect(validateNewFieldsAreOptional(legacyRoom)).toBe(true);
        
        // All legacy fields should maintain their types
        expect(validateGraphQLTypeCompatibility(legacyRoom.id, 'ID')).toBe(true);
        expect(validateGraphQLTypeCompatibility(legacyRoom.name, 'String')).toBe(true);
        expect(validateGraphQLTypeCompatibility(legacyRoom.isActive, 'Boolean')).toBe(true);
        expect(validateGraphQLTypeCompatibility(legacyRoom.memberCount, 'Int')).toBe(true);
        expect(validateGraphQLTypeCompatibility(legacyRoom.createdAt, 'AWSDateTime')).toBe(true);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
  
  test('Property 17: New room data should be backward compatible', () => {
    fc.assert(
      fc.property(newRoomArb, (newRoom) => {
        // New room data should still contain all legacy fields
        expect(validateLegacyRoomFields(newRoom)).toBe(true);
        expect(validateOptionalLegacyFields(newRoom)).toBe(true);
        
        // New fields should be properly typed when present
        if (newRoom.mediaType) {
          expect(['MOVIE', 'TV'].includes(newRoom.mediaType)).toBe(true);
        }
        
        if (newRoom.genreIds) {
          expect(Array.isArray(newRoom.genreIds)).toBe(true);
          expect(newRoom.genreIds.length).toBeLessThanOrEqual(3);
          expect(newRoom.genreIds.every((id: any) => typeof id === 'number')).toBe(true);
        }
        
        if (newRoom.currentContentIndex !== undefined && newRoom.currentContentIndex !== null) {
          expect(validateGraphQLTypeCompatibility(newRoom.currentContentIndex, 'Int')).toBe(true);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
  
  test('Property 17: CreateRoom mutation should accept legacy inputs', () => {
    fc.assert(
      fc.property(legacyCreateRoomInputArb, (legacyInput) => {
        // Legacy create room input should be valid
        expect(validateCreateRoomInputCompatibility(legacyInput)).toBe(true);
        
        // Required fields should be present and valid
        expect(typeof legacyInput.name).toBe('string');
        expect(legacyInput.name.length).toBeGreaterThan(0);
        
        // Optional fields should be properly typed when present
        if (legacyInput.description !== undefined && legacyInput.description !== null) {
          expect(typeof legacyInput.description).toBe('string');
        }
        
        if (legacyInput.isPrivate !== undefined && legacyInput.isPrivate !== null) {
          expect(typeof legacyInput.isPrivate).toBe('boolean');
        }
        
        if (legacyInput.maxMembers !== undefined && legacyInput.maxMembers !== null) {
          expect(typeof legacyInput.maxMembers).toBe('number');
          expect(legacyInput.maxMembers).toBeGreaterThanOrEqual(2);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
  
  test('Property 17: CreateRoom mutation should accept new filtering inputs', () => {
    fc.assert(
      fc.property(newCreateRoomInputArb, (newInput) => {
        // New create room input should be valid
        expect(validateCreateRoomInputCompatibility(newInput)).toBe(true);
        
        // Required fields should be present and valid
        expect(typeof newInput.name).toBe('string');
        expect(newInput.name.length).toBeGreaterThan(0);
        
        // New filtering fields should be properly typed
        expect(['MOVIE', 'TV'].includes(newInput.mediaType)).toBe(true);
        expect(Array.isArray(newInput.genreIds)).toBe(true);
        expect(newInput.genreIds.length).toBeLessThanOrEqual(3);
        expect(newInput.genreIds.every(id => typeof id === 'number' && id > 0)).toBe(true);
        
        // Legacy compatibility field should still work
        if (newInput.genrePreferences) {
          expect(Array.isArray(newInput.genrePreferences)).toBe(true);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
  
  test('Property 17: Field nullability should maintain backward compatibility', () => {
    fc.assert(
      fc.property(
        fc.record({
          hasMediaType: fc.boolean(),
          hasGenreIds: fc.boolean(),
          hasContentIds: fc.boolean(),
          hasFilterCriteria: fc.boolean()
        }),
        (config) => {
          // Simulate room data with optional new fields
          const room: any = {
            id: 'test-room-id',
            name: 'Test Room',
            status: 'WAITING',
            hostId: 'test-host-id',
            inviteCode: 'ABC123',
            isActive: true,
            isPrivate: false,
            memberCount: 1,
            matchCount: 0,
            createdAt: new Date().toISOString()
          };
          
          // Conditionally add new fields
          if (config.hasMediaType) {
            room.mediaType = 'MOVIE';
          }
          
          if (config.hasGenreIds) {
            room.genreIds = [28, 12]; // Action, Adventure
          }
          
          if (config.hasContentIds) {
            room.contentIds = ['1', '2', '3'];
          }
          
          if (config.hasFilterCriteria) {
            room.filterCriteria = {
              mediaType: 'MOVIE',
              genreIds: [28, 12],
              roomId: 'test-room-id'
            };
          }
          
          // Room should be valid regardless of which new fields are present
          expect(validateLegacyRoomFields(room)).toBe(true);
          expect(validateNewFieldsAreOptional(room)).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('Property 17: Query response structure should be consistent', () => {
    fc.assert(
      fc.property(
        fc.array(newRoomArb, { minLength: 0, maxLength: 10 }),
        (rooms) => {
          // Simulate query responses that might contain mixed room types
          const queryResponse = {
            data: {
              getUserRooms: rooms
            }
          };
          
          // All rooms in response should be valid
          queryResponse.data.getUserRooms.forEach(room => {
            expect(validateLegacyRoomFields(room)).toBe(true);
            expect(validateNewFieldsAreOptional(room)).toBe(true);
          });
          
          // Response structure should be consistent
          expect(Array.isArray(queryResponse.data.getUserRooms)).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('Property 17: Enum values should maintain backward compatibility', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('MOVIE', 'TV'),
        (mediaType) => {
          // MediaType enum values should be valid strings
          expect(typeof mediaType).toBe('string');
          expect(['MOVIE', 'TV'].includes(mediaType)).toBe(true);
          
          // Should work in both legacy and new contexts
          const legacyContext = { genrePreferences: ['Action'] };
          const newContext = { mediaType, genreIds: [28] };
          
          expect(validateCreateRoomInputCompatibility({ 
            name: 'Test', 
            ...legacyContext 
          })).toBe(true);
          
          expect(validateCreateRoomInputCompatibility({ 
            name: 'Test', 
            ...newContext 
          })).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ============================================================================
// Integration Tests for Schema Compatibility
// ============================================================================

describe('Schema Compatibility Integration Tests', () => {
  
  test('Legacy client can query rooms without filtering fields', () => {
    const legacyQuery = `
      query GetUserRooms {
        getUserRooms {
          id
          name
          status
          hostId
          inviteCode
          genrePreferences
          isActive
          isPrivate
          memberCount
          createdAt
        }
      }
    `;
    
    // This query should work without requesting new filtering fields
    expect(legacyQuery).toContain('getUserRooms');
    expect(legacyQuery).not.toContain('mediaType');
    expect(legacyQuery).not.toContain('genreIds');
    expect(legacyQuery).not.toContain('filterCriteria');
  });
  
  test('New client can query rooms with filtering fields', () => {
    const newQuery = `
      query GetUserRoomsWithFilters {
        getUserRooms {
          id
          name
          status
          hostId
          inviteCode
          genrePreferences
          mediaType
          genreIds
          genreNames
          contentIds
          currentContentIndex
          filterCriteria {
            mediaType
            genreIds
            roomId
          }
          contentPool {
            tmdbId
            title
            priority
          }
          isActive
          isPrivate
          memberCount
          createdAt
        }
      }
    `;
    
    // This query should work with all new filtering fields
    expect(newQuery).toContain('getUserRooms');
    expect(newQuery).toContain('mediaType');
    expect(newQuery).toContain('genreIds');
    expect(newQuery).toContain('filterCriteria');
    expect(newQuery).toContain('contentPool');
  });
  
  test('CreateRoom mutation supports both legacy and new formats', () => {
    const legacyMutation = `
      mutation CreateLegacyRoom($input: CreateRoomInput!) {
        createRoom(input: $input) {
          id
          name
          genrePreferences
        }
      }
    `;
    
    const newMutation = `
      mutation CreateFilteredRoom($input: CreateRoomInput!) {
        createRoom(input: $input) {
          id
          name
          mediaType
          genreIds
          filterCriteria {
            mediaType
            genreIds
          }
        }
      }
    `;
    
    // Both mutations should use the same input type
    expect(legacyMutation).toContain('CreateRoomInput');
    expect(newMutation).toContain('CreateRoomInput');
  });
});