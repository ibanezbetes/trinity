import { Test, TestingModule } from '@nestjs/testing';
import { RoomChatService } from './room-chat.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import { PermissionService } from '../permission/permission.service';
import {
  ChatMessage,
  ChatMessageType,
  ChatMessageStatus,
  RoomChatConfig,
} from '../../domain/entities/room-chat.entity';
import { RoomPermission } from '../../domain/entities/room-moderation.entity';
import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as fc from 'fast-check';

describe('RoomChatService', () => {
  let service: RoomChatService;
  let dynamoDBService: jest.Mocked<DynamoDBService>;
  let realtimeService: jest.Mocked<RealtimeCompatibilityService>;
  let permissionService: jest.Mocked<PermissionService>;

  beforeEach(async () => {
    const mockDynamoDBService = {
      putItem: jest.fn(),
      getItem: jest.fn(),
      query: jest.fn(),
      deleteItem: jest.fn(),
    };

    const mockRealtimeService = {
      notifyChatMessage: jest.fn(),
      publishEvent: jest.fn(),
      subscribeToRoom: jest.fn(),
    };

    const mockPermissionService = {
      checkPermission: jest.fn(),
      hasPermission: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomChatService,
        { provide: DynamoDBService, useValue: mockDynamoDBService },
        {
          provide: RealtimeCompatibilityService,
          useValue: mockRealtimeService,
        },
        { provide: PermissionService, useValue: mockPermissionService },
      ],
    }).compile();

    service = module.get<RoomChatService>(RoomChatService);
    dynamoDBService = module.get(DynamoDBService);
    realtimeService = module.get(RealtimeCompatibilityService);
    permissionService = module.get(PermissionService);
  });

  describe('sendMessage', () => {
    it('should send a message successfully with valid data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (roomId, userId, username, content) => {
            // Arrange
            const mockConfig: RoomChatConfig = {
              roomId,
              isEnabled: true,
              maxMessageLength: 1000,
              slowModeDelay: 0,
              allowFileUploads: true,
              allowLinks: true,
              allowMentions: true,
              allowReactions: true,
              retentionDays: 30,
              moderationEnabled: true,
              profanityFilterEnabled: false,
              customBannedWords: [],
              allowedFileTypes: ['image/jpeg'],
              maxFileSize: 5242880,
              createdBy: 'system',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            permissionService.checkPermission.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['member'],
            });
            dynamoDBService.getItem.mockResolvedValue(mockConfig);
            dynamoDBService.query.mockResolvedValue({ Items: [] });
            dynamoDBService.putItem.mockResolvedValue(undefined);
            realtimeService.notifyChatMessage.mockResolvedValue(undefined);

            const sendMessageDto = {
              content,
              type: ChatMessageType.TEXT,
            };

            // Act
            const result = await service.sendMessage(
              roomId,
              userId,
              username,
              sendMessageDto,
            );

            // Assert
            expect(result).toBeDefined();
            expect(result.content).toBe(content);
            expect(result.userId).toBe(userId);
            expect(result.username).toBe(username);
            expect(result.roomId).toBe(roomId);
            expect(result.type).toBe(ChatMessageType.TEXT);
            expect(result.status).toBe(ChatMessageStatus.ACTIVE);
            expect(permissionService.checkPermission).toHaveBeenCalledWith(
              roomId,
              userId,
              RoomPermission.CHAT,
            );
            expect(dynamoDBService.putItem).toHaveBeenCalled();
            expect(realtimeService.notifyChatMessage).toHaveBeenCalled();
          },
        ),
        { numRuns: 30 },
      );
    });

    it('should reject messages that exceed max length', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1001, maxLength: 2000 }),
          async (roomId, userId, username, longContent) => {
            // Arrange
            const mockConfig: RoomChatConfig = {
              roomId,
              isEnabled: true,
              maxMessageLength: 1000,
              slowModeDelay: 0,
              allowFileUploads: true,
              allowLinks: true,
              allowMentions: true,
              allowReactions: true,
              retentionDays: 30,
              moderationEnabled: true,
              profanityFilterEnabled: false,
              customBannedWords: [],
              allowedFileTypes: ['image/jpeg'],
              maxFileSize: 5242880,
              createdBy: 'system',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            permissionService.checkPermission.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['member'],
            });
            dynamoDBService.getItem.mockResolvedValue(mockConfig);

            const sendMessageDto = {
              content: longContent,
              type: ChatMessageType.TEXT,
            };

            // Act & Assert
            await expect(
              service.sendMessage(roomId, userId, username, sendMessageDto),
            ).rejects.toThrow(BadRequestException);
          },
        ),
        { numRuns: 20 },
      );
    });

    it('should reject messages when chat is disabled', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (roomId, userId, username, content) => {
            // Arrange
            const mockConfig: RoomChatConfig = {
              roomId,
              isEnabled: false, // Chat disabled
              maxMessageLength: 1000,
              slowModeDelay: 0,
              allowFileUploads: true,
              allowLinks: true,
              allowMentions: true,
              allowReactions: true,
              retentionDays: 30,
              moderationEnabled: true,
              profanityFilterEnabled: false,
              customBannedWords: [],
              allowedFileTypes: ['image/jpeg'],
              maxFileSize: 5242880,
              createdBy: 'system',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            permissionService.checkPermission.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['member'],
            });
            dynamoDBService.getItem.mockResolvedValue(mockConfig);

            const sendMessageDto = {
              content,
              type: ChatMessageType.TEXT,
            };

            // Act & Assert
            await expect(
              service.sendMessage(roomId, userId, username, sendMessageDto),
            ).rejects.toThrow(ForbiddenException);
          },
        ),
        { numRuns: 20 },
      );
    });

    it('should reject messages when user lacks chat permission', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (roomId, userId, username, content) => {
            // Arrange
            permissionService.checkPermission.mockRejectedValue(
              new ForbiddenException(
                'No tienes permisos para realizar esta acción: CHAT',
              ),
            );

            const sendMessageDto = {
              content,
              type: ChatMessageType.TEXT,
            };

            // Act & Assert
            await expect(
              service.sendMessage(roomId, userId, username, sendMessageDto),
            ).rejects.toThrow(ForbiddenException);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe('editMessage', () => {
    it('should edit message successfully when user is the author', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (roomId, messageId, userId, originalContent, newContent) => {
            // Arrange
            const mockMessage: ChatMessage = {
              id: messageId,
              roomId,
              userId,
              username: 'testuser',
              type: ChatMessageType.TEXT,
              content: originalContent,
              status: ChatMessageStatus.ACTIVE,
              reactions: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            dynamoDBService.getItem.mockResolvedValue(mockMessage);
            dynamoDBService.putItem.mockResolvedValue(undefined);
            realtimeService.notifyChatMessage.mockResolvedValue(undefined);

            const editMessageDto = { content: newContent };

            // Act
            const result = await service.editMessage(
              roomId,
              messageId,
              userId,
              editMessageDto,
            );

            // Assert
            expect(result).toBeDefined();
            expect(result.content).toBe(newContent);
            expect(result.originalContent).toBe(originalContent);
            expect(result.status).toBe(ChatMessageStatus.EDITED);
            expect(result.editedAt).toBeDefined();
            expect(dynamoDBService.putItem).toHaveBeenCalled();
            expect(realtimeService.notifyChatMessage).toHaveBeenCalled();
          },
        ),
        { numRuns: 30 },
      );
    });

    it('should reject edit when user is not the author', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (
            roomId,
            messageId,
            authorId,
            differentUserId,
            originalContent,
            newContent,
          ) => {
            fc.pre(authorId !== differentUserId);

            // Arrange
            const mockMessage: ChatMessage = {
              id: messageId,
              roomId,
              userId: authorId,
              username: 'author',
              type: ChatMessageType.TEXT,
              content: originalContent,
              status: ChatMessageStatus.ACTIVE,
              reactions: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            dynamoDBService.getItem.mockResolvedValue(mockMessage);

            const editMessageDto = { content: newContent };

            // Act & Assert
            await expect(
              service.editMessage(
                roomId,
                messageId,
                differentUserId,
                editMessageDto,
              ),
            ).rejects.toThrow(ForbiddenException);
          },
        ),
        { numRuns: 20 },
      );
    });

    it('should reject edit when message is moderated', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (roomId, messageId, userId, originalContent, newContent) => {
            // Arrange
            const mockMessage: ChatMessage = {
              id: messageId,
              roomId,
              userId,
              username: 'testuser',
              type: ChatMessageType.TEXT,
              content: originalContent,
              status: ChatMessageStatus.MODERATED, // Message is moderated
              reactions: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            dynamoDBService.getItem.mockResolvedValue(mockMessage);

            const editMessageDto = { content: newContent };

            // Act & Assert
            await expect(
              service.editMessage(roomId, messageId, userId, editMessageDto),
            ).rejects.toThrow(ForbiddenException);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe('deleteMessage', () => {
    it('should delete message when user is the author', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (roomId, messageId, userId, content) => {
            // Arrange
            const mockMessage: ChatMessage = {
              id: messageId,
              roomId,
              userId,
              username: 'testuser',
              type: ChatMessageType.TEXT,
              content,
              status: ChatMessageStatus.ACTIVE,
              reactions: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            dynamoDBService.getItem.mockResolvedValue(mockMessage);
            dynamoDBService.putItem.mockResolvedValue(undefined);
            realtimeService.notifyChatMessage.mockResolvedValue(undefined);
            permissionService.hasPermission.mockResolvedValue(false);

            // Act
            await service.deleteMessage(roomId, messageId, userId);

            // Assert
            expect(dynamoDBService.putItem).toHaveBeenCalled();
            expect(realtimeService.notifyChatMessage).toHaveBeenCalled();
          },
        ),
        { numRuns: 30 },
      );
    });

    it('should delete message when user has moderation permissions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (roomId, messageId, authorId, moderatorId, content) => {
            fc.pre(authorId !== moderatorId);

            // Arrange
            const mockMessage: ChatMessage = {
              id: messageId,
              roomId,
              userId: authorId,
              username: 'author',
              type: ChatMessageType.TEXT,
              content,
              status: ChatMessageStatus.ACTIVE,
              reactions: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            dynamoDBService.getItem.mockResolvedValue(mockMessage);
            dynamoDBService.putItem.mockResolvedValue(undefined);
            realtimeService.notifyChatMessage.mockResolvedValue(undefined);
            permissionService.hasPermission.mockResolvedValue(true); // Has moderation permission

            // Act
            await service.deleteMessage(roomId, messageId, moderatorId);

            // Assert
            expect(dynamoDBService.putItem).toHaveBeenCalled();
            expect(realtimeService.notifyChatMessage).toHaveBeenCalled();
          },
        ),
        { numRuns: 20 },
      );
    });

    it('should reject delete when user lacks permissions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (roomId, messageId, authorId, differentUserId, content) => {
            fc.pre(authorId !== differentUserId);

            // Arrange
            const mockMessage: ChatMessage = {
              id: messageId,
              roomId,
              userId: authorId,
              username: 'author',
              type: ChatMessageType.TEXT,
              content,
              status: ChatMessageStatus.ACTIVE,
              reactions: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            dynamoDBService.getItem.mockResolvedValue(mockMessage);
            permissionService.hasPermission.mockResolvedValue(false); // No moderation permission

            // Act & Assert
            await expect(
              service.deleteMessage(roomId, messageId, differentUserId),
            ).rejects.toThrow(ForbiddenException);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe('addReaction', () => {
    it('should add reaction successfully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (roomId, messageId, userId, emoji, content) => {
            // Arrange
            const mockMessage: ChatMessage = {
              id: messageId,
              roomId,
              userId: 'author',
              username: 'author',
              type: ChatMessageType.TEXT,
              content,
              status: ChatMessageStatus.ACTIVE,
              reactions: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const mockConfig: RoomChatConfig = {
              roomId,
              isEnabled: true,
              allowReactions: true,
              maxMessageLength: 1000,
              slowModeDelay: 0,
              allowFileUploads: true,
              allowLinks: true,
              allowMentions: true,
              retentionDays: 30,
              moderationEnabled: true,
              profanityFilterEnabled: false,
              customBannedWords: [],
              allowedFileTypes: ['image/jpeg'],
              maxFileSize: 5242880,
              createdBy: 'system',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            permissionService.checkPermission.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['member'],
            });
            dynamoDBService.getItem
              .mockResolvedValueOnce(mockMessage)
              .mockResolvedValueOnce(mockConfig);
            dynamoDBService.putItem.mockResolvedValue(undefined);
            realtimeService.notifyChatMessage.mockResolvedValue(undefined);

            // Act
            const result = await service.addReaction(
              roomId,
              messageId,
              userId,
              emoji,
            );

            // Assert
            expect(result).toBeDefined();
            expect(result.reactions).toHaveLength(1);
            expect(result.reactions![0].emoji).toBe(emoji);
            expect(result.reactions![0].users).toContain(userId);
            expect(result.reactions![0].count).toBe(1);
            expect(dynamoDBService.putItem).toHaveBeenCalled();
            expect(realtimeService.notifyChatMessage).toHaveBeenCalled();
          },
        ),
        { numRuns: 30 },
      );
    });

    it('should reject reaction when reactions are disabled', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (roomId, messageId, userId, emoji, content) => {
            // Arrange
            const mockMessage: ChatMessage = {
              id: messageId,
              roomId,
              userId: 'author',
              username: 'author',
              type: ChatMessageType.TEXT,
              content,
              status: ChatMessageStatus.ACTIVE,
              reactions: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const mockConfig: RoomChatConfig = {
              roomId,
              isEnabled: true,
              allowReactions: false, // Reactions disabled
              maxMessageLength: 1000,
              slowModeDelay: 0,
              allowFileUploads: true,
              allowLinks: true,
              allowMentions: true,
              retentionDays: 30,
              moderationEnabled: true,
              profanityFilterEnabled: false,
              customBannedWords: [],
              allowedFileTypes: ['image/jpeg'],
              maxFileSize: 5242880,
              createdBy: 'system',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            permissionService.checkPermission.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['member'],
            });
            dynamoDBService.getItem
              .mockResolvedValueOnce(mockMessage)
              .mockResolvedValueOnce(mockConfig);

            // Act & Assert
            await expect(
              service.addReaction(roomId, messageId, userId, emoji),
            ).rejects.toThrow(ForbiddenException);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe('configureChatConfig', () => {
    it('should create chat configuration successfully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.boolean(),
          fc.integer({ min: 100, max: 5000 }),
          fc.integer({ min: 0, max: 300 }),
          async (
            roomId,
            userId,
            isEnabled,
            maxMessageLength,
            slowModeDelay,
          ) => {
            // Arrange
            permissionService.checkPermission.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['admin'],
            });
            dynamoDBService.putItem.mockResolvedValue(undefined);

            const configDto = {
              isEnabled,
              maxMessageLength,
              slowModeDelay,
            };

            // Act
            const result = await service.configureChatConfig(
              roomId,
              userId,
              configDto,
            );

            // Assert
            expect(result).toBeDefined();
            expect(result.roomId).toBe(roomId);
            expect(result.isEnabled).toBe(isEnabled);
            expect(result.maxMessageLength).toBe(maxMessageLength);
            expect(result.slowModeDelay).toBe(slowModeDelay);
            expect(result.createdBy).toBe(userId);
            expect(dynamoDBService.putItem).toHaveBeenCalled();
          },
        ),
        { numRuns: 30 },
      );
    });

    it('should reject configuration when user lacks permissions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          async (roomId, userId) => {
            // Arrange
            permissionService.checkPermission.mockRejectedValue(
              new ForbiddenException(
                'No tienes permisos para realizar esta acción: MODIFY_SETTINGS',
              ),
            );

            const configDto = {
              isEnabled: true,
              maxMessageLength: 1000,
            };

            // Act & Assert
            await expect(
              service.configureChatConfig(roomId, userId, configDto),
            ).rejects.toThrow(ForbiddenException);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe('getMessages', () => {
    it('should retrieve messages successfully with filters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.integer({ min: 1, max: 100 }),
          async (roomId, userId, limit) => {
            // Arrange
            const mockMessages: ChatMessage[] = Array.from(
              { length: Math.min(limit, 10) },
              (_, i) => ({
                id: `msg-${i}`,
                roomId,
                userId: `user-${i}`,
                username: `user${i}`,
                type: ChatMessageType.TEXT,
                content: `Message ${i}`,
                status: ChatMessageStatus.ACTIVE,
                reactions: [],
                createdAt: new Date(Date.now() - i * 1000),
                updatedAt: new Date(Date.now() - i * 1000),
              }),
            );

            permissionService.checkPermission.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['member'],
            });
            permissionService.hasPermission.mockResolvedValue(false);
            dynamoDBService.query.mockResolvedValue({
              Items: mockMessages,
              LastEvaluatedKey: undefined,
            });

            const filters = { limit };

            // Act
            const result = await service.getMessages(roomId, userId, filters);

            // Assert
            expect(result).toBeDefined();
            expect(result.messages).toHaveLength(mockMessages.length);
            expect(result.totalCount).toBe(mockMessages.length);
            expect(result.hasMore).toBe(false);
            expect(permissionService.checkPermission).toHaveBeenCalledWith(
              roomId,
              userId,
              RoomPermission.VIEW_ROOM,
            );
          },
        ),
        { numRuns: 30 },
      );
    });

    it('should filter out deleted messages for regular users', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          async (roomId, userId) => {
            // Arrange
            const mockMessages: ChatMessage[] = [
              {
                id: 'msg-1',
                roomId,
                userId: 'user-1',
                username: 'user1',
                type: ChatMessageType.TEXT,
                content: 'Active message',
                status: ChatMessageStatus.ACTIVE,
                reactions: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: 'msg-2',
                roomId,
                userId: 'user-2',
                username: 'user2',
                type: ChatMessageType.TEXT,
                content: 'Deleted message',
                status: ChatMessageStatus.DELETED,
                reactions: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ];

            permissionService.checkPermission.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['member'],
            });
            permissionService.hasPermission.mockResolvedValue(false); // No moderation permission
            dynamoDBService.query.mockResolvedValue({
              Items: mockMessages,
              LastEvaluatedKey: undefined,
            });

            const filters = { limit: 10 };

            // Act
            const result = await service.getMessages(roomId, userId, filters);

            // Assert
            expect(result).toBeDefined();
            expect(result.messages).toHaveLength(1); // Only active message
            expect(result.messages[0].status).toBe(ChatMessageStatus.ACTIVE);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe('getChatConfig', () => {
    it('should return existing configuration', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1 }), async (roomId) => {
          // Arrange
          const mockConfig: RoomChatConfig = {
            roomId,
            isEnabled: true,
            maxMessageLength: 1000,
            slowModeDelay: 0,
            allowFileUploads: true,
            allowLinks: true,
            allowMentions: true,
            allowReactions: true,
            retentionDays: 30,
            moderationEnabled: true,
            profanityFilterEnabled: false,
            customBannedWords: [],
            allowedFileTypes: ['image/jpeg'],
            maxFileSize: 5242880,
            createdBy: 'system',
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          dynamoDBService.getItem.mockResolvedValue(mockConfig);

          // Act
          const result = await service.getChatConfig(roomId);

          // Assert
          expect(result).toBeDefined();
          expect(result.roomId).toBe(roomId);
          expect(result.isEnabled).toBe(true);
          expect(result.maxMessageLength).toBe(1000);
        }),
        { numRuns: 30 },
      );
    });

    it('should return default configuration when none exists', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1 }), async (roomId) => {
          // Arrange
          dynamoDBService.getItem.mockResolvedValue(null);

          // Act
          const result = await service.getChatConfig(roomId);

          // Assert
          expect(result).toBeDefined();
          expect(result.roomId).toBe(roomId);
          expect(result.isEnabled).toBe(true); // Default value
          expect(result.maxMessageLength).toBe(1000); // Default value
          expect(result.createdBy).toBe('system');
        }),
        { numRuns: 20 },
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});
