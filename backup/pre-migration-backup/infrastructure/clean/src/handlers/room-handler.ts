/**
 * Trinity Room Handler
 * Handles room creation, management, and movie cache integration
 */

import { BaseHandler, createHandler } from './base-handler';
import { AppSyncEvent, TrinityRoom, TrinityRoomMember, FilterCriteria, CacheMetadata, ValidationError, NotFoundError, ConflictError, UnauthorizedError } from '../shared/types';
import { HandlerUtils } from './base-handler';

interface CreateRoomArgs {
  name: string;
  description?: string;
  mediaType: 'MOVIE' | 'TV';
  genreIds: number[];
  maxMembers: number;
  isPrivate?: boolean;
}

interface JoinRoomArgs {
  roomId?: string;
  inviteCode?: string;
}

interface LeaveRoomArgs {
  roomId: string;
}

interface GetRoomArgs {
  roomId: string;
}

interface UpdateRoomArgs {
  roomId: string;
  name?: string;
  description?: string;
}

class RoomHandler extends BaseHandler {
  async handle(event: AppSyncEvent): Promise<any> {
    const { fieldName } = HandlerUtils.getOperationInfo(event);
    const { userId } = HandlerUtils.getUserInfo(event);

    this.logger.info(`🏠 Room operation: ${fieldName}`, { userId, fieldName });

    switch (fieldName) {
      case 'createRoom':
        return this.createRoom(event.arguments as CreateRoomArgs, userId!);
      
      case 'createRoomDebug':
        return this.createRoomDebug(event.arguments as { name: string }, userId!);
      
      case 'createRoomSimple':
        return this.createRoomSimple(event.arguments as { name: string }, userId!);
      
      case 'joinRoom':
        return this.joinRoom(event.arguments as JoinRoomArgs, userId!);
      
      case 'leaveRoom':
        return this.leaveRoom(event.arguments as LeaveRoomArgs, userId!);
      
      case 'getRoom':
        return this.getRoom(event.arguments as GetRoomArgs, userId!);
      
      case 'getUserRooms':
        return this.getUserRooms(userId!);
      
      case 'updateRoom':
        return this.updateRoom(event.arguments as UpdateRoomArgs, userId!);
      
      case 'deleteRoom':
        return this.deleteRoom(event.arguments as { roomId: string }, userId!);
      
      default:
        throw new ValidationError(`Unknown room operation: ${fieldName}`);
    }
  }

  /**
   * Create a new room with movie cache
   */
  private async createRoom(args: CreateRoomArgs, userId: string): Promise<TrinityRoom> {
    // Validate required fields
    this.validateArgs<CreateRoomArgs>(args, ['name', 'mediaType', 'genreIds', 'maxMembers']);

    // Validate room capacity
    if (!HandlerUtils.isValidRoomCapacity(args.maxMembers)) {
      throw new ValidationError('Room capacity must be between 2 and 10');
    }

    // Validate genre selection
    if (!args.genreIds || args.genreIds.length === 0 || args.genreIds.length > this.config.app.movies.maxGenres) {
      throw new ValidationError(`Must select 1-${this.config.app.movies.maxGenres} genres`);
    }

    // Sanitize inputs
    const name = HandlerUtils.sanitizeString(args.name, 100);
    const description = args.description ? HandlerUtils.sanitizeString(args.description, 500) : undefined;

    // Generate room ID and invite code
    const roomId = HandlerUtils.generateId();
    const inviteCode = this.generateInviteCode();
    const inviteUrl = `https://trinity-app.com/invite/${inviteCode}`;

    // Map genre IDs to names (matching existing logic)
    const genreMap: Record<number, string> = {
      28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
      80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
      14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
      9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia ficción',
      10770: 'Película de TV', 53: 'Suspense', 10752: 'Bélica', 37: 'Western'
    };
    const genreNames = args.genreIds.map(id => genreMap[id] || 'Otro');

    // Create room object (matching existing structure)
    const now = new Date().toISOString();
    const room: TrinityRoom = {
      id: roomId,
      name,
      description,
      status: 'WAITING',
      hostId: userId,
      inviteCode,
      inviteUrl,
      mediaType: args.mediaType,
      genreIds: args.genreIds,
      genreNames,
      preloadedMovies: [], // Will be populated by cache service
      shownContentIds: [], // Initialize empty
      currentMovieIndex: 0, // Initialize to 0
      currentContentIndex: 0,
      totalMovies: this.config.app.movies.cacheSize,
      moviesExhausted: false,
      isActive: true,
      isPrivate: args.isPrivate || false,
      memberCount: 1, // Host is automatically a member
      maxMembers: args.maxMembers,
      matchCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      // Start transaction to create room and add host as member (matching existing DynamoDB structure)
      await this.db.transactWrite([
        {
          operation: 'PUT',
          tableName: this.config.tables.rooms,
          item: {
            PK: roomId, // Add PK for DynamoDB primary key
            SK: 'ROOM', // Add SK for DynamoDB sort key
            roomId,
            ...room,
          },
          conditionExpression: 'attribute_not_exists(PK)',
        },
        {
          operation: 'PUT',
          tableName: this.config.tables.roomMembers,
          item: {
            roomId,
            userId,
            role: 'HOST',
            joinedAt: now,
            isActive: true,
          } as TrinityRoomMember,
        },
      ]);

      // Log business metric (matching existing pattern)
      this.logger.info('📊 Business Metric: ROOM_CREATED', {
        roomId,
        userId,
        data: {
          roomStatus: 'WAITING',
          roomName: name,
          isPrivate: args.isPrivate || false,
          mediaType: args.mediaType,
          genreIds: args.genreIds,
          genreCount: args.genreIds.length,
          contentCount: 0 // Will be updated when cache is populated
        }
      });

      this.logger.info(`✅ Sala creada: ${roomId} (${name}) por ${userId} con 0 títulos pre-cargados`);
      return room;

    } catch (error) {
      this.logger.error('❌ Failed to create room', error as Error, { roomId, userId });
      throw error;
    }
  }

  /**
   * Join a room by ID or invite code
   */
  private async joinRoom(args: JoinRoomArgs, userId: string): Promise<TrinityRoom> {
    let room: TrinityRoom | null = null;

    // Find room by ID or invite code
    if (args.roomId) {
      // Get room using PK/SK structure (matching existing DynamoDB structure)
      const roomResponse = await this.db.get(this.config.tables.rooms, { PK: args.roomId, SK: 'ROOM' });
      room = roomResponse ? {
        ...roomResponse,
        id: roomResponse.roomId || roomResponse.id
      } as TrinityRoom : null;
    } else if (args.inviteCode) {
      const roomQuery = await this.db.query<TrinityRoom>(
        this.config.tables.rooms,
        'inviteCode = :inviteCode',
        {
          indexName: 'InviteCodeIndex',
          expressionAttributeValues: { ':inviteCode': args.inviteCode },
          limit: 1,
        }
      );
      room = roomQuery.items[0] || null;
    } else {
      throw new ValidationError('Either roomId or inviteCode must be provided');
    }

    if (!room || !room.isActive) {
      throw new NotFoundError('Sala no encontrada');
    }

    // Check room status (matching existing logic)
    if (room.status !== 'WAITING') {
      throw new ValidationError('La sala no está disponible para nuevos miembros');
    }

    // Check if room is full
    if (room.memberCount >= room.maxMembers) {
      throw new ConflictError('Room is full');
    }

    // Check if user is already a member
    const existingMember = await this.db.get<TrinityRoomMember>(
      this.config.tables.roomMembers,
      { roomId: room.id, userId }
    );

    if (existingMember && existingMember.isActive) {
      // User is already a member, return room
      this.logger.info(`✅ Usuario ${userId} ya está en sala ${room.id}`);
      return room;
    }

    // Add user as member or reactivate existing membership
    const now = new Date().toISOString();
    
    if (existingMember) {
      // Reactivate existing member
      await this.db.update(
        this.config.tables.roomMembers,
        { roomId: room.id, userId },
        'SET isActive = :active, joinedAt = :joinedAt',
        {
          expressionAttributeValues: {
            ':active': true,
            ':joinedAt': now,
          },
        }
      );
    } else {
      // Add new member
      const member: TrinityRoomMember = {
        roomId: room.id,
        userId,
        role: 'MEMBER',
        joinedAt: now,
        isActive: true,
      };

      await this.db.put(this.config.tables.roomMembers, member);
    }

    // Update room timestamp (matching existing PK/SK structure)
    await this.db.update(
      this.config.tables.rooms,
      { PK: room.id, SK: 'ROOM' },
      'SET updatedAt = :updatedAt',
      {
        expressionAttributeValues: {
          ':updatedAt': now,
        },
      }
    );

    // Log business metric (matching existing pattern)
    this.logger.info('📊 Business Metric: ROOM_JOINED', {
      roomId: room.id,
      userId,
      data: {
        roomStatus: room.status,
        wasExistingMember: !!existingMember
      }
    });

    this.logger.info(`✅ Usuario ${userId} se unió a sala ${room.id}`);
    
    // Return room with updated timestamp
    return {
      ...room,
      updatedAt: now,
    };
  }

  /**
   * Leave a room
   */
  private async leaveRoom(args: LeaveRoomArgs, userId: string): Promise<boolean> {
    this.validateArgs<LeaveRoomArgs>(args, ['roomId']);

    // Check if user is a member
    const member = await this.db.get<TrinityRoomMember>(
      this.config.tables.roomMembers,
      { roomId: args.roomId, userId }
    );

    if (!member || !member.isActive) {
      throw new NotFoundError('Room membership');
    }

    // Get room to check if user is host
    const room = await this.db.get<TrinityRoom>(
      this.config.tables.rooms,
      { id: args.roomId }
    );

    if (!room) {
      throw new NotFoundError('Room');
    }

    const now = new Date().toISOString();

    if (member.role === 'HOST') {
      // If host is leaving, deactivate the entire room
      await this.db.transactWrite([
        {
          operation: 'UPDATE',
          tableName: this.config.tables.roomMembers,
          key: { roomId: args.roomId, userId },
          updateExpression: 'SET #isActive = :false',
          expressionAttributeNames: { '#isActive': 'isActive' },
          expressionAttributeValues: { ':false': false },
        },
        {
          operation: 'UPDATE',
          tableName: this.config.tables.rooms,
          key: { id: args.roomId },
          updateExpression: 'SET #isActive = :false, #updatedAt = :updatedAt',
          expressionAttributeNames: {
            '#isActive': 'isActive',
            '#updatedAt': 'updatedAt',
          },
          expressionAttributeValues: {
            ':false': false,
            ':updatedAt': now,
          },
        },
      ]);

      this.logger.info('✅ Host left room, room deactivated', { roomId: args.roomId, userId });
    } else {
      // Regular member leaving
      await this.db.transactWrite([
        {
          operation: 'UPDATE',
          tableName: this.config.tables.roomMembers,
          key: { roomId: args.roomId, userId },
          updateExpression: 'SET #isActive = :false',
          expressionAttributeNames: { '#isActive': 'isActive' },
          expressionAttributeValues: { ':false': false },
        },
        {
          operation: 'UPDATE',
          tableName: this.config.tables.rooms,
          key: { id: args.roomId },
          updateExpression: 'SET #memberCount = #memberCount - :dec, #updatedAt = :updatedAt',
          expressionAttributeNames: {
            '#memberCount': 'memberCount',
            '#updatedAt': 'updatedAt',
          },
          expressionAttributeValues: {
            ':dec': 1,
            ':updatedAt': now,
          },
        },
      ]);

      this.logger.info('✅ User left room successfully', { roomId: args.roomId, userId });
    }

    return true;
  }

  /**
   * Get room details
   */
  private async getRoom(args: GetRoomArgs, userId: string): Promise<TrinityRoom> {
    this.validateArgs<GetRoomArgs>(args, ['roomId']);

    // Validate user has access to room
    const hasAccess = await HandlerUtils.validateRoomAccess(
      this.db,
      userId,
      args.roomId,
      this.config
    );

    if (!hasAccess) {
      throw new UnauthorizedError('Access denied to room');
    }

    const room = await this.db.get<TrinityRoom>(
      this.config.tables.rooms,
      { id: args.roomId }
    );

    if (!room || !room.isActive) {
      throw new NotFoundError('Room');
    }

    return room;
  }

  /**
   * Get user's rooms (matching existing getMyHistory logic)
   */
  private async getUserRooms(userId: string): Promise<TrinityRoom[]> {
    // Get user's room memberships using GSI (matching existing logic)
    const memberships = await this.db.query<TrinityRoomMember>(
      this.config.tables.roomMembers,
      'userId = :userId',
      {
        indexName: 'UserHistoryIndex',
        expressionAttributeValues: {
          ':userId': userId,
        },
        scanIndexForward: false, // Order by joinedAt descending (most recent first)
        limit: 50, // Limit to last 50 rooms
      }
    );

    if (memberships.count === 0) {
      return [];
    }

    // Get room details for each membership (matching existing logic)
    const rooms: TrinityRoom[] = [];
    
    for (const member of memberships.items) {
      try {
        // Use PK/SK structure to get room details
        const roomResponse = await this.db.get(
          this.config.tables.rooms,
          { PK: member.roomId, SK: 'ROOM' }
        );

        if (roomResponse) {
          const room = roomResponse as any;
          rooms.push({
            id: room.roomId || room.id,
            name: room.name || 'Sala sin nombre',
            description: room.description,
            status: room.status,
            resultMovieId: room.resultMovieId,
            hostId: room.hostId,
            inviteCode: room.inviteCode,
            inviteUrl: room.inviteUrl,
            mediaType: room.mediaType,
            genreIds: room.genreIds || [],
            genreNames: room.genreNames || [],
            preloadedMovies: room.preloadedMovies || [],
            shownContentIds: room.shownContentIds || [],
            currentMovieIndex: room.currentMovieIndex || room.currentContentIndex || 0, // Support both field names
            currentContentIndex: room.currentContentIndex || 0,
            totalMovies: room.totalMovies || 50,
            moviesExhausted: room.moviesExhausted || false,
            isActive: room.isActive !== false, // Default to true if not set
            isPrivate: room.isPrivate || false,
            memberCount: room.memberCount || 1,
            maxMembers: room.maxMembers,
            matchCount: room.matchCount || 0,
            createdAt: room.createdAt || new Date().toISOString(),
            updatedAt: room.updatedAt || new Date().toISOString(),
          });
        }
      } catch (error) {
        this.logger.warn(`⚠️ Error obteniendo sala ${member.roomId}`, error as Error);
        // Continue with other rooms
      }
    }

    this.logger.info(`📋 Historial obtenido para ${userId}: ${rooms.length} salas`);
    return rooms;
  }

  /**
   * Update room details (host only)
   */
  private async updateRoom(args: UpdateRoomArgs, userId: string): Promise<TrinityRoom> {
    this.validateArgs<UpdateRoomArgs>(args, ['roomId']);

    // Check if user is room host
    const isHost = await HandlerUtils.isRoomHost(this.db, userId, args.roomId, this.config);
    if (!isHost) {
      throw new UnauthorizedError('Only room host can update room');
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (args.name !== undefined) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = HandlerUtils.sanitizeString(args.name, 100);
    }

    if (args.description !== undefined) {
      updateExpressions.push('#description = :description');
      expressionAttributeNames['#description'] = 'description';
      expressionAttributeValues[':description'] = args.description ? HandlerUtils.sanitizeString(args.description, 500) : null;
    }

    if (updateExpressions.length === 0) {
      // No changes, return current room
      return this.getRoom({ roomId: args.roomId }, userId);
    }

    // Add updatedAt
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const updateExpression = `SET ${updateExpressions.join(', ')}`;

    // Update room
    const updatedRoom = await this.db.update<TrinityRoom>(
      this.config.tables.rooms,
      { id: args.roomId },
      updateExpression,
      {
        expressionAttributeNames,
        expressionAttributeValues,
        returnValues: 'ALL_NEW',
      }
    );

    this.logger.info('✅ Room updated successfully', { roomId: args.roomId, userId });
    return updatedRoom!;
  }

  /**
   * Delete room (host only)
   */
  private async deleteRoom(args: { roomId: string }, userId: string): Promise<boolean> {
    // Check if user is room host
    const isHost = await HandlerUtils.isRoomHost(this.db, userId, args.roomId, this.config);
    if (!isHost) {
      throw new UnauthorizedError('Only room host can delete room');
    }

    // Soft delete room
    await this.db.update(
      this.config.tables.rooms,
      { id: args.roomId },
      'SET #isActive = :false, #updatedAt = :updatedAt',
      {
        expressionAttributeNames: {
          '#isActive': 'isActive',
          '#updatedAt': 'updatedAt',
        },
        expressionAttributeValues: {
          ':false': false,
          ':updatedAt': new Date().toISOString(),
        },
      }
    );

    this.logger.info('✅ Room deleted successfully', { roomId: args.roomId, userId });
    return true;
  }

  /**
   * Generate a unique invite code
   */
  private generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Create room debug version (matching existing createRoomDebug)
   */
  private async createRoomDebug(args: { name: string }, userId: string): Promise<TrinityRoom> {
    const roomId = HandlerUtils.generateId();
    const inviteCode = this.generateInviteCode();
    const inviteUrl = `https://trinity-app.com/invite/${inviteCode}`;
    const now = new Date().toISOString();

    this.logger.info('🔍 createRoomDebug', { hostId: userId, input: args });

    const room: TrinityRoom = {
      id: roomId,
      name: args.name,
      description: 'Sala de debug',
      status: 'WAITING',
      hostId: userId,
      inviteCode,
      inviteUrl,
      mediaType: 'MOVIE', // Default
      genreIds: [],
      genreNames: [],
      preloadedMovies: [],
      shownContentIds: [],
      currentMovieIndex: 0, // Initialize to 0
      currentContentIndex: 0,
      totalMovies: 50,
      moviesExhausted: false,
      isActive: true,
      isPrivate: false,
      memberCount: 1,
      maxMembers: 10, // Default value
      matchCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.db.transactWrite([
        {
          operation: 'PUT',
          tableName: this.config.tables.rooms,
          item: {
            PK: roomId,
            SK: 'ROOM',
            roomId,
            ...room,
          },
        },
        {
          operation: 'PUT',
          tableName: this.config.tables.roomMembers,
          item: {
            roomId,
            userId,
            role: 'HOST',
            joinedAt: now,
            isActive: true,
          } as TrinityRoomMember,
        },
      ]);

      this.logger.info('📊 Business Metric: ROOM_CREATED', {
        roomId,
        userId,
        data: {
          roomStatus: 'WAITING',
          roomName: args.name,
          isPrivate: false,
          debug: true
        }
      });

      this.logger.info(`✅ Sala debug creada: ${roomId} (${args.name}) por ${userId}`);
      return room;

    } catch (error) {
      this.logger.error('❌ Failed to create debug room', error as Error, { roomId, userId });
      throw error;
    }
  }

  /**
   * Create room simple version (matching existing createRoomSimple)
   */
  private async createRoomSimple(args: { name: string }, userId: string): Promise<TrinityRoom> {
    const roomId = HandlerUtils.generateId();
    const inviteCode = this.generateInviteCode();
    const inviteUrl = `https://trinity-app.com/invite/${inviteCode}`;
    const now = new Date().toISOString();

    this.logger.info('🔍 createRoomSimple', { hostId: userId, name: args.name, roomId });

    const room: TrinityRoom = {
      id: roomId,
      name: args.name,
      description: 'Sala simple',
      status: 'WAITING',
      hostId: userId,
      inviteCode,
      inviteUrl,
      mediaType: 'MOVIE', // Default
      genreIds: [],
      genreNames: [],
      preloadedMovies: [],
      shownContentIds: [],
      currentMovieIndex: 0, // Initialize to 0
      currentContentIndex: 0,
      totalMovies: 50,
      moviesExhausted: false,
      isActive: true,
      isPrivate: false,
      memberCount: 1,
      maxMembers: 10, // Default value
      matchCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      this.logger.info('🔍 createRoomSimple - Step 1: Calling generateInviteCode...');
      this.logger.info('✅ createRoomSimple - Step 1 SUCCESS: Invite code generated', { inviteCode });
      this.logger.info('🔍 createRoomSimple - Step 2: Creating room object...');
      this.logger.info('✅ createRoomSimple - Step 2 SUCCESS: Room object created');
      this.logger.info('🔍 createRoomSimple - Step 3: Saving room to DynamoDB...');

      await this.db.transactWrite([
        {
          operation: 'PUT',
          tableName: this.config.tables.rooms,
          item: {
            PK: roomId,
            SK: 'ROOM',
            roomId,
            ...room,
          },
        },
        {
          operation: 'PUT',
          tableName: this.config.tables.roomMembers,
          item: {
            roomId,
            userId,
            role: 'HOST',
            joinedAt: now,
            isActive: true,
          } as TrinityRoomMember,
        },
      ]);

      this.logger.info('✅ createRoomSimple - Step 3 SUCCESS: Room saved to DynamoDB');
      this.logger.info('🔍 createRoomSimple - Step 4: Adding host as member...');
      this.logger.info('✅ createRoomSimple - Step 4 SUCCESS: Host added as member');
      this.logger.info('🔍 createRoomSimple - Step 5: Logging business metric...');

      this.logger.info('📊 Business Metric: ROOM_CREATED', {
        roomId,
        userId,
        data: {
          roomStatus: 'WAITING',
          roomName: args.name,
          isPrivate: false,
          simple: true
        }
      });

      this.logger.info('✅ createRoomSimple - Step 5 SUCCESS: Business metric logged');
      this.logger.info(`✅ Sala simple creada: ${roomId} (${args.name}) por ${userId}`);
      this.logger.info('🔍 createRoomSimple - Returning room object', { room: JSON.stringify(room, null, 2) });

      return room;

    } catch (error) {
      this.logger.error('💥💥💥 createRoomSimple - EXCEPTION CAUGHT', error as Error);
      this.logger.error('💥 Error details', { 
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack
      });
      throw error;
    }
  }
}

// Export the handler
export const handler = createHandler(RoomHandler);