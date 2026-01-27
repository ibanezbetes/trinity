/**
 * Unit Tests for Validate Invite Handler
 * Feature: trinity-voting-fixes
 * 
 * Tests the web landing page invite validation API endpoint
 */

// Mock dependencies
jest.mock('../services/deepLinkService');
jest.mock('../utils/metrics');

import { handler } from '../handlers/validateInvite';
import { deepLinkService } from '../services/deepLinkService';
import { APIGatewayProxyEvent } from 'aws-lambda';

describe('Validate Invite Handler', () => {
  const mockValidateInviteCode = deepLinkService.validateInviteCode as jest.MockedFunction<typeof deepLinkService.validateInviteCode>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockEvent = (body: string, method: string = 'POST'): APIGatewayProxyEvent => ({
    httpMethod: method,
    body,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/validate-invite',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
  });

  describe('CORS Handling', () => {
    it('should handle OPTIONS preflight requests', async () => {
      const event = createMockEvent('', 'OPTIONS');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(result.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      });
      expect(result.body).toBe('');
    });

    it('should include CORS headers in all responses', async () => {
      const event = createMockEvent(JSON.stringify({ inviteCode: 'ABC123' }));
      mockValidateInviteCode.mockResolvedValue(null);

      const result = await handler(event);

      expect(result.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
      });
    });
  });

  describe('Request Validation', () => {
    it('should return 400 for missing request body', async () => {
      const event = createMockEvent('');
      event.body = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.valid).toBe(false);
      expect(body.error).toBe('Request body is required');
    });

    it('should return 400 for missing invite code', async () => {
      const event = createMockEvent(JSON.stringify({}));

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.valid).toBe(false);
      expect(body.error).toBe('Invite code is required');
    });

    it('should return 400 for invalid invite code format', async () => {
      const invalidCodes = ['ABC12', 'TOOLONG123', 'ABC-123'];

      for (const code of invalidCodes) {
        const event = createMockEvent(JSON.stringify({ inviteCode: code }));
        const result = await handler(event);

        expect(result.statusCode).toBe(400);
        const body = JSON.parse(result.body);
        expect(body.valid).toBe(false);
        expect(body.error).toBe('Invalid invite code format');
      }

      // Test empty string separately as it should be "required" error
      const emptyEvent = createMockEvent(JSON.stringify({ inviteCode: '' }));
      const emptyResult = await handler(emptyEvent);
      
      expect(emptyResult.statusCode).toBe(400);
      const emptyBody = JSON.parse(emptyResult.body);
      expect(emptyBody.valid).toBe(false);
      expect(emptyBody.error).toBe('Invite code is required');
    });
  });

  describe('Invite Code Validation', () => {
    it('should return valid response for existing invite code', async () => {
      const mockRoomInfo = {
        roomId: 'room-123',
        name: 'Test Room',
        hostId: 'user-456',
        status: 'ACTIVE',
        memberCount: 3,
        isPrivate: false,
        createdAt: '2026-01-10T12:00:00Z',
      };

      mockValidateInviteCode.mockResolvedValue(mockRoomInfo);

      const event = createMockEvent(JSON.stringify({ inviteCode: 'ABC123' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.valid).toBe(true);
      expect(body.room).toEqual(mockRoomInfo);
      expect(body.inviteCode).toBe('ABC123');
      expect(mockValidateInviteCode).toHaveBeenCalledWith('ABC123');
    });

    it('should return invalid response for non-existent invite code', async () => {
      mockValidateInviteCode.mockResolvedValue(null);

      const event = createMockEvent(JSON.stringify({ inviteCode: 'NOTFND' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.valid).toBe(false);
      expect(body.error).toBe('Invalid or expired invite code');
      expect(body.inviteCode).toBe('NOTFND');
    });

    it('should normalize invite code to uppercase', async () => {
      const mockRoomInfo = {
        roomId: 'room-123',
        name: 'Test Room',
        hostId: 'user-456',
        status: 'ACTIVE',
        memberCount: 1,
        isPrivate: false,
        createdAt: '2026-01-10T12:00:00Z',
      };

      mockValidateInviteCode.mockResolvedValue(mockRoomInfo);

      const event = createMockEvent(JSON.stringify({ inviteCode: 'abc123' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockValidateInviteCode).toHaveBeenCalledWith('ABC123');
      
      const body = JSON.parse(result.body);
      expect(body.inviteCode).toBe('ABC123');
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockValidateInviteCode.mockRejectedValue(new Error('Database connection failed'));

      const event = createMockEvent(JSON.stringify({ inviteCode: 'ABC123' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.valid).toBe(false);
      expect(body.error).toBe('Internal server error');
    });

    it('should handle malformed JSON in request body', async () => {
      const event = createMockEvent('invalid json');

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.valid).toBe(false);
      expect(body.error).toBe('Internal server error');
    });
  });

  describe('Response Format', () => {
    it('should return consistent response structure for valid invites', async () => {
      const mockRoomInfo = {
        roomId: 'room-123',
        name: 'Movie Night',
        hostId: 'user-456',
        status: 'ACTIVE',
        memberCount: 5,
        isPrivate: true,
        createdAt: '2026-01-10T12:00:00Z',
      };

      mockValidateInviteCode.mockResolvedValue(mockRoomInfo);

      const event = createMockEvent(JSON.stringify({ inviteCode: 'XYZ789' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      // Check response structure
      expect(body).toHaveProperty('valid', true);
      expect(body).toHaveProperty('room');
      expect(body).toHaveProperty('inviteCode', 'XYZ789');
      
      // Check room structure
      expect(body.room).toHaveProperty('roomId');
      expect(body.room).toHaveProperty('name');
      expect(body.room).toHaveProperty('hostId');
      expect(body.room).toHaveProperty('status');
      expect(body.room).toHaveProperty('memberCount');
      expect(body.room).toHaveProperty('isPrivate');
      expect(body.room).toHaveProperty('createdAt');
    });

    it('should return consistent response structure for invalid invites', async () => {
      mockValidateInviteCode.mockResolvedValue(null);

      const event = createMockEvent(JSON.stringify({ inviteCode: 'EXPIRE' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      // Check response structure
      expect(body).toHaveProperty('valid', false);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('inviteCode', 'EXPIRE');
      expect(body).not.toHaveProperty('room');
    });
  });

  describe('Edge Cases', () => {
    it('should handle room with minimal information', async () => {
      const mockRoomInfo = {
        roomId: 'room-minimal',
        name: '',
        hostId: '',
        status: 'UNKNOWN',
        memberCount: 0,
        isPrivate: false,
        createdAt: '',
      };

      mockValidateInviteCode.mockResolvedValue(mockRoomInfo);

      const event = createMockEvent(JSON.stringify({ inviteCode: 'MIN123' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.valid).toBe(true);
      expect(body.room).toEqual(mockRoomInfo);
    });

    it('should handle very long room names', async () => {
      const longName = 'A'.repeat(1000);
      const mockRoomInfo = {
        roomId: 'room-long',
        name: longName,
        hostId: 'user-123',
        status: 'ACTIVE',
        memberCount: 1,
        isPrivate: false,
        createdAt: '2026-01-10T12:00:00Z',
      };

      mockValidateInviteCode.mockResolvedValue(mockRoomInfo);

      const event = createMockEvent(JSON.stringify({ inviteCode: 'LONG12' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.valid).toBe(true);
      expect(body.room.name).toBe(longName);
    });
  });
});
