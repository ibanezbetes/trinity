"use strict";
/**
 * Trinity Room Handler
 * Handles room creation, management, and movie cache integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const base_handler_1 = require("./base-handler");
const types_1 = require("../shared/types");
const base_handler_2 = require("./base-handler");
class RoomHandler extends base_handler_1.BaseHandler {
    async handle(event) {
        const { fieldName } = base_handler_2.HandlerUtils.getOperationInfo(event);
        const { userId } = base_handler_2.HandlerUtils.getUserInfo(event);
        this.logger.info(`🏠 Room operation: ${fieldName}`, { userId, fieldName });
        switch (fieldName) {
            case 'createRoom':
                return this.createRoom(event.arguments, userId);
            case 'createRoomDebug':
                return this.createRoomDebug(event.arguments, userId);
            case 'createRoomSimple':
                return this.createRoomSimple(event.arguments, userId);
            case 'joinRoom':
                return this.joinRoom(event.arguments, userId);
            case 'leaveRoom':
                return this.leaveRoom(event.arguments, userId);
            case 'getRoom':
                return this.getRoom(event.arguments, userId);
            case 'getUserRooms':
                return this.getUserRooms(userId);
            case 'updateRoom':
                return this.updateRoom(event.arguments, userId);
            case 'deleteRoom':
                return this.deleteRoom(event.arguments, userId);
            default:
                throw new types_1.ValidationError(`Unknown room operation: ${fieldName}`);
        }
    }
    /**
     * Create a new room with movie cache
     */
    async createRoom(args, userId) {
        // Validate required fields
        this.validateArgs(args, ['name', 'mediaType', 'genreIds', 'maxMembers']);
        // Validate room capacity
        if (!base_handler_2.HandlerUtils.isValidRoomCapacity(args.maxMembers)) {
            throw new types_1.ValidationError('Room capacity must be between 2 and 10');
        }
        // Validate genre selection
        if (!args.genreIds || args.genreIds.length === 0 || args.genreIds.length > this.config.app.movies.maxGenres) {
            throw new types_1.ValidationError(`Must select 1-${this.config.app.movies.maxGenres} genres`);
        }
        // Sanitize inputs
        const name = base_handler_2.HandlerUtils.sanitizeString(args.name, 100);
        const description = args.description ? base_handler_2.HandlerUtils.sanitizeString(args.description, 500) : undefined;
        // Generate room ID and invite code
        const roomId = base_handler_2.HandlerUtils.generateId();
        const inviteCode = this.generateInviteCode();
        const inviteUrl = `https://trinity-app.com/invite/${inviteCode}`;
        // Map genre IDs to names (matching existing logic)
        const genreMap = {
            28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
            80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
            14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
            9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia ficción',
            10770: 'Película de TV', 53: 'Suspense', 10752: 'Bélica', 37: 'Western'
        };
        const genreNames = args.genreIds.map(id => genreMap[id] || 'Otro');
        // Create room object (matching existing structure)
        const now = new Date().toISOString();
        const room = {
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
                    },
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
        }
        catch (error) {
            this.logger.error('❌ Failed to create room', error, { roomId, userId });
            throw error;
        }
    }
    /**
     * Join a room by ID or invite code
     */
    async joinRoom(args, userId) {
        let room = null;
        // Find room by ID or invite code
        if (args.roomId) {
            // Get room using PK/SK structure (matching existing DynamoDB structure)
            const roomResponse = await this.db.get(this.config.tables.rooms, { PK: args.roomId, SK: 'ROOM' });
            room = roomResponse ? {
                ...roomResponse,
                id: roomResponse.roomId || roomResponse.id
            } : null;
        }
        else if (args.inviteCode) {
            const roomQuery = await this.db.query(this.config.tables.rooms, 'inviteCode = :inviteCode', {
                indexName: 'InviteCodeIndex',
                expressionAttributeValues: { ':inviteCode': args.inviteCode },
                limit: 1,
            });
            room = roomQuery.items[0] || null;
        }
        else {
            throw new types_1.ValidationError('Either roomId or inviteCode must be provided');
        }
        if (!room || !room.isActive) {
            throw new types_1.NotFoundError('Sala no encontrada');
        }
        // Check room status (matching existing logic)
        if (room.status !== 'WAITING') {
            throw new types_1.ValidationError('La sala no está disponible para nuevos miembros');
        }
        // Check if room is full
        if (room.memberCount >= room.maxMembers) {
            throw new types_1.ConflictError('Room is full');
        }
        // Check if user is already a member
        const existingMember = await this.db.get(this.config.tables.roomMembers, { roomId: room.id, userId });
        if (existingMember && existingMember.isActive) {
            // User is already a member, return room
            this.logger.info(`✅ Usuario ${userId} ya está en sala ${room.id}`);
            return room;
        }
        // Add user as member or reactivate existing membership
        const now = new Date().toISOString();
        if (existingMember) {
            // Reactivate existing member
            await this.db.update(this.config.tables.roomMembers, { roomId: room.id, userId }, 'SET isActive = :active, joinedAt = :joinedAt', {
                expressionAttributeValues: {
                    ':active': true,
                    ':joinedAt': now,
                },
            });
        }
        else {
            // Add new member
            const member = {
                roomId: room.id,
                userId,
                role: 'MEMBER',
                joinedAt: now,
                isActive: true,
            };
            await this.db.put(this.config.tables.roomMembers, member);
        }
        // Update room timestamp (matching existing PK/SK structure)
        await this.db.update(this.config.tables.rooms, { PK: room.id, SK: 'ROOM' }, 'SET updatedAt = :updatedAt', {
            expressionAttributeValues: {
                ':updatedAt': now,
            },
        });
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
    async leaveRoom(args, userId) {
        this.validateArgs(args, ['roomId']);
        // Check if user is a member
        const member = await this.db.get(this.config.tables.roomMembers, { roomId: args.roomId, userId });
        if (!member || !member.isActive) {
            throw new types_1.NotFoundError('Room membership');
        }
        // Get room to check if user is host
        const room = await this.db.get(this.config.tables.rooms, { id: args.roomId });
        if (!room) {
            throw new types_1.NotFoundError('Room');
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
        }
        else {
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
    async getRoom(args, userId) {
        this.validateArgs(args, ['roomId']);
        // Validate user has access to room
        const hasAccess = await base_handler_2.HandlerUtils.validateRoomAccess(this.db, userId, args.roomId, this.config);
        if (!hasAccess) {
            throw new types_1.UnauthorizedError('Access denied to room');
        }
        const room = await this.db.get(this.config.tables.rooms, { id: args.roomId });
        if (!room || !room.isActive) {
            throw new types_1.NotFoundError('Room');
        }
        return room;
    }
    /**
     * Get user's rooms (matching existing getMyHistory logic)
     */
    async getUserRooms(userId) {
        // Get user's room memberships using GSI (matching existing logic)
        const memberships = await this.db.query(this.config.tables.roomMembers, 'userId = :userId', {
            indexName: 'UserHistoryIndex',
            expressionAttributeValues: {
                ':userId': userId,
            },
            scanIndexForward: false, // Order by joinedAt descending (most recent first)
            limit: 50, // Limit to last 50 rooms
        });
        if (memberships.count === 0) {
            return [];
        }
        // Get room details for each membership (matching existing logic)
        const rooms = [];
        for (const member of memberships.items) {
            try {
                // Use PK/SK structure to get room details
                const roomResponse = await this.db.get(this.config.tables.rooms, { PK: member.roomId, SK: 'ROOM' });
                if (roomResponse) {
                    const room = roomResponse;
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
            }
            catch (error) {
                this.logger.warn(`⚠️ Error obteniendo sala ${member.roomId}`, error);
                // Continue with other rooms
            }
        }
        this.logger.info(`📋 Historial obtenido para ${userId}: ${rooms.length} salas`);
        return rooms;
    }
    /**
     * Update room details (host only)
     */
    async updateRoom(args, userId) {
        this.validateArgs(args, ['roomId']);
        // Check if user is room host
        const isHost = await base_handler_2.HandlerUtils.isRoomHost(this.db, userId, args.roomId, this.config);
        if (!isHost) {
            throw new types_1.UnauthorizedError('Only room host can update room');
        }
        // Build update expression
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        if (args.name !== undefined) {
            updateExpressions.push('#name = :name');
            expressionAttributeNames['#name'] = 'name';
            expressionAttributeValues[':name'] = base_handler_2.HandlerUtils.sanitizeString(args.name, 100);
        }
        if (args.description !== undefined) {
            updateExpressions.push('#description = :description');
            expressionAttributeNames['#description'] = 'description';
            expressionAttributeValues[':description'] = args.description ? base_handler_2.HandlerUtils.sanitizeString(args.description, 500) : null;
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
        const updatedRoom = await this.db.update(this.config.tables.rooms, { id: args.roomId }, updateExpression, {
            expressionAttributeNames,
            expressionAttributeValues,
            returnValues: 'ALL_NEW',
        });
        this.logger.info('✅ Room updated successfully', { roomId: args.roomId, userId });
        return updatedRoom;
    }
    /**
     * Delete room (host only)
     */
    async deleteRoom(args, userId) {
        // Check if user is room host
        const isHost = await base_handler_2.HandlerUtils.isRoomHost(this.db, userId, args.roomId, this.config);
        if (!isHost) {
            throw new types_1.UnauthorizedError('Only room host can delete room');
        }
        // Soft delete room
        await this.db.update(this.config.tables.rooms, { id: args.roomId }, 'SET #isActive = :false, #updatedAt = :updatedAt', {
            expressionAttributeNames: {
                '#isActive': 'isActive',
                '#updatedAt': 'updatedAt',
            },
            expressionAttributeValues: {
                ':false': false,
                ':updatedAt': new Date().toISOString(),
            },
        });
        this.logger.info('✅ Room deleted successfully', { roomId: args.roomId, userId });
        return true;
    }
    /**
     * Generate a unique invite code
     */
    generateInviteCode() {
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
    async createRoomDebug(args, userId) {
        const roomId = base_handler_2.HandlerUtils.generateId();
        const inviteCode = this.generateInviteCode();
        const inviteUrl = `https://trinity-app.com/invite/${inviteCode}`;
        const now = new Date().toISOString();
        this.logger.info('🔍 createRoomDebug', { hostId: userId, input: args });
        const room = {
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
                    },
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
        }
        catch (error) {
            this.logger.error('❌ Failed to create debug room', error, { roomId, userId });
            throw error;
        }
    }
    /**
     * Create room simple version (matching existing createRoomSimple)
     */
    async createRoomSimple(args, userId) {
        const roomId = base_handler_2.HandlerUtils.generateId();
        const inviteCode = this.generateInviteCode();
        const inviteUrl = `https://trinity-app.com/invite/${inviteCode}`;
        const now = new Date().toISOString();
        this.logger.info('🔍 createRoomSimple', { hostId: userId, name: args.name, roomId });
        const room = {
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
                    },
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
        }
        catch (error) {
            this.logger.error('💥💥💥 createRoomSimple - EXCEPTION CAUGHT', error);
            this.logger.error('💥 Error details', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}
// Export the handler
exports.handler = (0, base_handler_1.createHandler)(RoomHandler);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm9vbS1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicm9vbS1oYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7OztBQUVILGlEQUE0RDtBQUM1RCwyQ0FBZ0w7QUFDaEwsaURBQThDO0FBOEI5QyxNQUFNLFdBQVksU0FBUSwwQkFBVztJQUNuQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQW1CO1FBQzlCLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRywyQkFBWSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNELE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRywyQkFBWSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUVuRCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsU0FBUyxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUUzRSxRQUFRLFNBQVMsRUFBRSxDQUFDO1lBQ2xCLEtBQUssWUFBWTtnQkFDZixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFNBQTJCLEVBQUUsTUFBTyxDQUFDLENBQUM7WUFFckUsS0FBSyxpQkFBaUI7Z0JBQ3BCLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsU0FBNkIsRUFBRSxNQUFPLENBQUMsQ0FBQztZQUU1RSxLQUFLLGtCQUFrQjtnQkFDckIsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLFNBQTZCLEVBQUUsTUFBTyxDQUFDLENBQUM7WUFFN0UsS0FBSyxVQUFVO2dCQUNiLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsU0FBeUIsRUFBRSxNQUFPLENBQUMsQ0FBQztZQUVqRSxLQUFLLFdBQVc7Z0JBQ2QsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxTQUEwQixFQUFFLE1BQU8sQ0FBQyxDQUFDO1lB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SUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsNkRBQTZELENBQUMsQ0FBQztZQUNoRixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyx5QkFBeUIsTUFBTSxLQUFLLElBQUksQ0FBQyxJQUFJLFNBQVMsTUFBTSxFQUFFLENBQUMsQ0FBQztZQUNqRixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyw2Q0FBNkMsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXpHLE9BQU8sSUFBSSxDQUFDO1FBRWQsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyw0Q0FBNEMsRUFBRSxLQUFjLENBQUMsQ0FBQztZQUNoRixJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsRUFBRTtnQkFDcEMsSUFBSSxFQUFHLEtBQWUsQ0FBQyxJQUFJO2dCQUMzQixPQUFPLEVBQUcsS0FBZSxDQUFDLE9BQU87Z0JBQ2pDLEtBQUssRUFBRyxLQUFlLENBQUMsS0FBSzthQUM5QixDQUFDLENBQUM7WUFDSCxNQUFNLEtBQUssQ0FBQztRQUNkLENBQUM7SUFDSCxDQUFDO0NBQ0Y7QUFFRCxxQkFBcUI7QUFDUixRQUFBLE9BQU8sR0FBRyxJQUFBLDRCQUFhLEVBQUMsV0FBVyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogVHJpbml0eSBSb29tIEhhbmRsZXJcclxuICogSGFuZGxlcyByb29tIGNyZWF0aW9uLCBtYW5hZ2VtZW50LCBhbmQgbW92aWUgY2FjaGUgaW50ZWdyYXRpb25cclxuICovXHJcblxyXG5pbXBvcnQgeyBCYXNlSGFuZGxlciwgY3JlYXRlSGFuZGxlciB9IGZyb20gJy4vYmFzZS1oYW5kbGVyJztcclxuaW1wb3J0IHsgQXBwU3luY0V2ZW50LCBUcmluaXR5Um9vbSwgVHJpbml0eVJvb21NZW1iZXIsIEZpbHRlckNyaXRlcmlhLCBDYWNoZU1ldGFkYXRhLCBWYWxpZGF0aW9uRXJyb3IsIE5vdEZvdW5kRXJyb3IsIENvbmZsaWN0RXJyb3IsIFVuYXV0aG9yaXplZEVycm9yIH0gZnJvbSAnLi4vc2hhcmVkL3R5cGVzJztcclxuaW1wb3J0IHsgSGFuZGxlclV0aWxzIH0gZnJvbSAnLi9iYXNlLWhhbmRsZXInO1xyXG5cclxuaW50ZXJmYWNlIENyZWF0ZVJvb21BcmdzIHtcclxuICBuYW1lOiBzdHJpbmc7XHJcbiAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XHJcbiAgbWVkaWFUeXBlOiAnTU9WSUUnIHwgJ1RWJztcclxuICBnZW5yZUlkczogbnVtYmVyW107XHJcbiAgbWF4TWVtYmVyczogbnVtYmVyO1xyXG4gIGlzUHJpdmF0ZT86IGJvb2xlYW47XHJcbn1cclxuXHJcbmludGVyZmFjZSBKb2luUm9vbUFyZ3Mge1xyXG4gIHJvb21JZD86IHN0cmluZztcclxuICBpbnZpdGVDb2RlPzogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTGVhdmVSb29tQXJncyB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBHZXRSb29tQXJncyB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBVcGRhdGVSb29tQXJncyB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgbmFtZT86IHN0cmluZztcclxuICBkZXNjcmlwdGlvbj86IHN0cmluZztcclxufVxyXG5cclxuY2xhc3MgUm9vbUhhbmRsZXIgZXh0ZW5kcyBCYXNlSGFuZGxlciB7XHJcbiAgYXN5bmMgaGFuZGxlKGV2ZW50OiBBcHBTeW5jRXZlbnQpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc3QgeyBmaWVsZE5hbWUgfSA9IEhhbmRsZXJVdGlscy5nZXRPcGVyYXRpb25JbmZvKGV2ZW50KTtcclxuICAgIGNvbnN0IHsgdXNlcklkIH0gPSBIYW5kbGVyVXRpbHMuZ2V0VXNlckluZm8oZXZlbnQpO1xyXG5cclxuICAgIHRoaXMubG9nZ2VyLmluZm8oYPCfj6AgUm9vbSBvcGVyYXRpb246ICR7ZmllbGROYW1lfWAsIHsgdXNlcklkLCBmaWVsZE5hbWUgfSk7XHJcblxyXG4gICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcclxuICAgICAgY2FzZSAnY3JlYXRlUm9vbSc6XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlUm9vbShldmVudC5hcmd1bWVudHMgYXMgQ3JlYXRlUm9vbUFyZ3MsIHVzZXJJZCEpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnY3JlYXRlUm9vbURlYnVnJzpcclxuICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVSb29tRGVidWcoZXZlbnQuYXJndW1lbnRzIGFzIHsgbmFtZTogc3RyaW5nIH0sIHVzZXJJZCEpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnY3JlYXRlUm9vbVNpbXBsZSc6XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlUm9vbVNpbXBsZShldmVudC5hcmd1bWVudHMgYXMgeyBuYW1lOiBzdHJpbmcgfSwgdXNlcklkISk7XHJcbiAgICAgIFxyXG4gICAgICBjYXNlICdqb2luUm9vbSc6XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuam9pblJvb20oZXZlbnQuYXJndW1lbnRzIGFzIEpvaW5Sb29tQXJncywgdXNlcklkISk7XHJcbiAgICAgIFxyXG4gICAgICBjYXNlICdsZWF2ZVJvb20nOlxyXG4gICAgICAgIHJldHVybiB0aGlzLmxlYXZlUm9vbShldmVudC5hcmd1bWVudHMgYXMgTGVhdmVSb29tQXJncywgdXNlcklkISk7XHJcbiAgICAgIFxyXG4gICAgICBjYXNlICdnZXRSb29tJzpcclxuICAgICAgICByZXR1cm4gdGhpcy5nZXRSb29tKGV2ZW50LmFyZ3VtZW50cyBhcyBHZXRSb29tQXJncywgdXNlcklkISk7XHJcbiAgICAgIFxyXG4gICAgICBjYXNlICdnZXRVc2VyUm9vbXMnOlxyXG4gICAgICAgIHJldHVybiB0aGlzLmdldFVzZXJSb29tcyh1c2VySWQhKTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ3VwZGF0ZVJvb20nOlxyXG4gICAgICAgIHJldHVybiB0aGlzLnVwZGF0ZVJvb20oZXZlbnQuYXJndW1lbnRzIGFzIFVwZGF0ZVJvb21BcmdzLCB1c2VySWQhKTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2RlbGV0ZVJvb20nOlxyXG4gICAgICAgIHJldHVybiB0aGlzLmRlbGV0ZVJvb20oZXZlbnQuYXJndW1lbnRzIGFzIHsgcm9vbUlkOiBzdHJpbmcgfSwgdXNlcklkISk7XHJcbiAgICAgIFxyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoYFVua25vd24gcm9vbSBvcGVyYXRpb246ICR7ZmllbGROYW1lfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIGEgbmV3IHJvb20gd2l0aCBtb3ZpZSBjYWNoZVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgY3JlYXRlUm9vbShhcmdzOiBDcmVhdGVSb29tQXJncywgdXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPFRyaW5pdHlSb29tPiB7XHJcbiAgICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBmaWVsZHNcclxuICAgIHRoaXMudmFsaWRhdGVBcmdzPENyZWF0ZVJvb21BcmdzPihhcmdzLCBbJ25hbWUnLCAnbWVkaWFUeXBlJywgJ2dlbnJlSWRzJywgJ21heE1lbWJlcnMnXSk7XHJcblxyXG4gICAgLy8gVmFsaWRhdGUgcm9vbSBjYXBhY2l0eVxyXG4gICAgaWYgKCFIYW5kbGVyVXRpbHMuaXNWYWxpZFJvb21DYXBhY2l0eShhcmdzLm1heE1lbWJlcnMpKSB7XHJcbiAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoJ1Jvb20gY2FwYWNpdHkgbXVzdCBiZSBiZXR3ZWVuIDIgYW5kIDEwJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVmFsaWRhdGUgZ2VucmUgc2VsZWN0aW9uXHJcbiAgICBpZiAoIWFyZ3MuZ2VucmVJZHMgfHwgYXJncy5nZW5yZUlkcy5sZW5ndGggPT09IDAgfHwgYXJncy5nZW5yZUlkcy5sZW5ndGggPiB0aGlzLmNvbmZpZy5hcHAubW92aWVzLm1heEdlbnJlcykge1xyXG4gICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKGBNdXN0IHNlbGVjdCAxLSR7dGhpcy5jb25maWcuYXBwLm1vdmllcy5tYXhHZW5yZXN9IGdlbnJlc2ApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNhbml0aXplIGlucHV0c1xyXG4gICAgY29uc3QgbmFtZSA9IEhhbmRsZXJVdGlscy5zYW5pdGl6ZVN0cmluZyhhcmdzLm5hbWUsIDEwMCk7XHJcbiAgICBjb25zdCBkZXNjcmlwdGlvbiA9IGFyZ3MuZGVzY3JpcHRpb24gPyBIYW5kbGVyVXRpbHMuc2FuaXRpemVTdHJpbmcoYXJncy5kZXNjcmlwdGlvbiwgNTAwKSA6IHVuZGVmaW5lZDtcclxuXHJcbiAgICAvLyBHZW5lcmF0ZSByb29tIElEIGFuZCBpbnZpdGUgY29kZVxyXG4gICAgY29uc3Qgcm9vbUlkID0gSGFuZGxlclV0aWxzLmdlbmVyYXRlSWQoKTtcclxuICAgIGNvbnN0IGludml0ZUNvZGUgPSB0aGlzLmdlbmVyYXRlSW52aXRlQ29kZSgpO1xyXG4gICAgY29uc3QgaW52aXRlVXJsID0gYGh0dHBzOi8vdHJpbml0eS1hcHAuY29tL2ludml0ZS8ke2ludml0ZUNvZGV9YDtcclxuXHJcbiAgICAvLyBNYXAgZ2VucmUgSURzIHRvIG5hbWVzIChtYXRjaGluZyBleGlzdGluZyBsb2dpYylcclxuICAgIGNvbnN0IGdlbnJlTWFwOiBSZWNvcmQ8bnVtYmVyLCBzdHJpbmc+ID0ge1xyXG4gICAgICAyODogJ0FjY2nDs24nLCAxMjogJ0F2ZW50dXJhJywgMTY6ICdBbmltYWNpw7NuJywgMzU6ICdDb21lZGlhJyxcclxuICAgICAgODA6ICdDcmltZW4nLCA5OTogJ0RvY3VtZW50YWwnLCAxODogJ0RyYW1hJywgMTA3NTE6ICdGYW1pbGlhJyxcclxuICAgICAgMTQ6ICdGYW50YXPDrWEnLCAzNjogJ0hpc3RvcmlhJywgMjc6ICdUZXJyb3InLCAxMDQwMjogJ03DunNpY2EnLFxyXG4gICAgICA5NjQ4OiAnTWlzdGVyaW8nLCAxMDc0OTogJ1JvbWFuY2UnLCA4Nzg6ICdDaWVuY2lhIGZpY2Npw7NuJyxcclxuICAgICAgMTA3NzA6ICdQZWzDrWN1bGEgZGUgVFYnLCA1MzogJ1N1c3BlbnNlJywgMTA3NTI6ICdCw6lsaWNhJywgMzc6ICdXZXN0ZXJuJ1xyXG4gICAgfTtcclxuICAgIGNvbnN0IGdlbnJlTmFtZXMgPSBhcmdzLmdlbnJlSWRzLm1hcChpZCA9PiBnZW5yZU1hcFtpZF0gfHwgJ090cm8nKTtcclxuXHJcbiAgICAvLyBDcmVhdGUgcm9vbSBvYmplY3QgKG1hdGNoaW5nIGV4aXN0aW5nIHN0cnVjdHVyZSlcclxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICAgIGNvbnN0IHJvb206IFRyaW5pdHlSb29tID0ge1xyXG4gICAgICBpZDogcm9vbUlkLFxyXG4gICAgICBuYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbixcclxuICAgICAgc3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgIGhvc3RJZDogdXNlcklkLFxyXG4gICAgICBpbnZpdGVDb2RlLFxyXG4gICAgICBpbnZpdGVVcmwsXHJcbiAgICAgIG1lZGlhVHlwZTogYXJncy5tZWRpYVR5cGUsXHJcbiAgICAgIGdlbnJlSWRzOiBhcmdzLmdlbnJlSWRzLFxyXG4gICAgICBnZW5yZU5hbWVzLFxyXG4gICAgICBwcmVsb2FkZWRNb3ZpZXM6IFtdLCAvLyBXaWxsIGJlIHBvcHVsYXRlZCBieSBjYWNoZSBzZXJ2aWNlXHJcbiAgICAgIHNob3duQ29udGVudElkczogW10sIC8vIEluaXRpYWxpemUgZW1wdHlcclxuICAgICAgY3VycmVudE1vdmllSW5kZXg6IDAsIC8vIEluaXRpYWxpemUgdG8gMFxyXG4gICAgICBjdXJyZW50Q29udGVudEluZGV4OiAwLFxyXG4gICAgICB0b3RhbE1vdmllczogdGhpcy5jb25maWcuYXBwLm1vdmllcy5jYWNoZVNpemUsXHJcbiAgICAgIG1vdmllc0V4aGF1c3RlZDogZmFsc2UsXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICBpc1ByaXZhdGU6IGFyZ3MuaXNQcml2YXRlIHx8IGZhbHNlLFxyXG4gICAgICBtZW1iZXJDb3VudDogMSwgLy8gSG9zdCBpcyBhdXRvbWF0aWNhbGx5IGEgbWVtYmVyXHJcbiAgICAgIG1heE1lbWJlcnM6IGFyZ3MubWF4TWVtYmVycyxcclxuICAgICAgbWF0Y2hDb3VudDogMCxcclxuICAgICAgY3JlYXRlZEF0OiBub3csXHJcbiAgICAgIHVwZGF0ZWRBdDogbm93LFxyXG4gICAgfTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBTdGFydCB0cmFuc2FjdGlvbiB0byBjcmVhdGUgcm9vbSBhbmQgYWRkIGhvc3QgYXMgbWVtYmVyIChtYXRjaGluZyBleGlzdGluZyBEeW5hbW9EQiBzdHJ1Y3R1cmUpXHJcbiAgICAgIGF3YWl0IHRoaXMuZGIudHJhbnNhY3RXcml0ZShbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgb3BlcmF0aW9uOiAnUFVUJyxcclxuICAgICAgICAgIHRhYmxlTmFtZTogdGhpcy5jb25maWcudGFibGVzLnJvb21zLFxyXG4gICAgICAgICAgaXRlbToge1xyXG4gICAgICAgICAgICBQSzogcm9vbUlkLCAvLyBBZGQgUEsgZm9yIER5bmFtb0RCIHByaW1hcnkga2V5XHJcbiAgICAgICAgICAgIFNLOiAnUk9PTScsIC8vIEFkZCBTSyBmb3IgRHluYW1vREIgc29ydCBrZXlcclxuICAgICAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgICAgICAuLi5yb29tLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIGNvbmRpdGlvbkV4cHJlc3Npb246ICdhdHRyaWJ1dGVfbm90X2V4aXN0cyhQSyknLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgb3BlcmF0aW9uOiAnUFVUJyxcclxuICAgICAgICAgIHRhYmxlTmFtZTogdGhpcy5jb25maWcudGFibGVzLnJvb21NZW1iZXJzLFxyXG4gICAgICAgICAgaXRlbToge1xyXG4gICAgICAgICAgICByb29tSWQsXHJcbiAgICAgICAgICAgIHVzZXJJZCxcclxuICAgICAgICAgICAgcm9sZTogJ0hPU1QnLFxyXG4gICAgICAgICAgICBqb2luZWRBdDogbm93LFxyXG4gICAgICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgICAgICAgIH0gYXMgVHJpbml0eVJvb21NZW1iZXIsXHJcbiAgICAgICAgfSxcclxuICAgICAgXSk7XHJcblxyXG4gICAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljIChtYXRjaGluZyBleGlzdGluZyBwYXR0ZXJuKVxyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKCfwn5OKIEJ1c2luZXNzIE1ldHJpYzogUk9PTV9DUkVBVEVEJywge1xyXG4gICAgICAgIHJvb21JZCxcclxuICAgICAgICB1c2VySWQsXHJcbiAgICAgICAgZGF0YToge1xyXG4gICAgICAgICAgcm9vbVN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICAgICAgcm9vbU5hbWU6IG5hbWUsXHJcbiAgICAgICAgICBpc1ByaXZhdGU6IGFyZ3MuaXNQcml2YXRlIHx8IGZhbHNlLFxyXG4gICAgICAgICAgbWVkaWFUeXBlOiBhcmdzLm1lZGlhVHlwZSxcclxuICAgICAgICAgIGdlbnJlSWRzOiBhcmdzLmdlbnJlSWRzLFxyXG4gICAgICAgICAgZ2VucmVDb3VudDogYXJncy5nZW5yZUlkcy5sZW5ndGgsXHJcbiAgICAgICAgICBjb250ZW50Q291bnQ6IDAgLy8gV2lsbCBiZSB1cGRhdGVkIHdoZW4gY2FjaGUgaXMgcG9wdWxhdGVkXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHRoaXMubG9nZ2VyLmluZm8oYOKchSBTYWxhIGNyZWFkYTogJHtyb29tSWR9ICgke25hbWV9KSBwb3IgJHt1c2VySWR9IGNvbiAwIHTDrXR1bG9zIHByZS1jYXJnYWRvc2ApO1xyXG4gICAgICByZXR1cm4gcm9vbTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcign4p2MIEZhaWxlZCB0byBjcmVhdGUgcm9vbScsIGVycm9yIGFzIEVycm9yLCB7IHJvb21JZCwgdXNlcklkIH0pO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEpvaW4gYSByb29tIGJ5IElEIG9yIGludml0ZSBjb2RlXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBqb2luUm9vbShhcmdzOiBKb2luUm9vbUFyZ3MsIHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxUcmluaXR5Um9vbT4ge1xyXG4gICAgbGV0IHJvb206IFRyaW5pdHlSb29tIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgLy8gRmluZCByb29tIGJ5IElEIG9yIGludml0ZSBjb2RlXHJcbiAgICBpZiAoYXJncy5yb29tSWQpIHtcclxuICAgICAgLy8gR2V0IHJvb20gdXNpbmcgUEsvU0sgc3RydWN0dXJlIChtYXRjaGluZyBleGlzdGluZyBEeW5hbW9EQiBzdHJ1Y3R1cmUpXHJcbiAgICAgIGNvbnN0IHJvb21SZXNwb25zZSA9IGF3YWl0IHRoaXMuZGIuZ2V0KHRoaXMuY29uZmlnLnRhYmxlcy5yb29tcywgeyBQSzogYXJncy5yb29tSWQsIFNLOiAnUk9PTScgfSk7XHJcbiAgICAgIHJvb20gPSByb29tUmVzcG9uc2UgPyB7XHJcbiAgICAgICAgLi4ucm9vbVJlc3BvbnNlLFxyXG4gICAgICAgIGlkOiByb29tUmVzcG9uc2Uucm9vbUlkIHx8IHJvb21SZXNwb25zZS5pZFxyXG4gICAgICB9IGFzIFRyaW5pdHlSb29tIDogbnVsbDtcclxuICAgIH0gZWxzZSBpZiAoYXJncy5pbnZpdGVDb2RlKSB7XHJcbiAgICAgIGNvbnN0IHJvb21RdWVyeSA9IGF3YWl0IHRoaXMuZGIucXVlcnk8VHJpbml0eVJvb20+KFxyXG4gICAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tcyxcclxuICAgICAgICAnaW52aXRlQ29kZSA9IDppbnZpdGVDb2RlJyxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBpbmRleE5hbWU6ICdJbnZpdGVDb2RlSW5kZXgnLFxyXG4gICAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyAnOmludml0ZUNvZGUnOiBhcmdzLmludml0ZUNvZGUgfSxcclxuICAgICAgICAgIGxpbWl0OiAxLFxyXG4gICAgICAgIH1cclxuICAgICAgKTtcclxuICAgICAgcm9vbSA9IHJvb21RdWVyeS5pdGVtc1swXSB8fCBudWxsO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcignRWl0aGVyIHJvb21JZCBvciBpbnZpdGVDb2RlIG11c3QgYmUgcHJvdmlkZWQnKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXJvb20gfHwgIXJvb20uaXNBY3RpdmUpIHtcclxuICAgICAgdGhyb3cgbmV3IE5vdEZvdW5kRXJyb3IoJ1NhbGEgbm8gZW5jb250cmFkYScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIHJvb20gc3RhdHVzIChtYXRjaGluZyBleGlzdGluZyBsb2dpYylcclxuICAgIGlmIChyb29tLnN0YXR1cyAhPT0gJ1dBSVRJTkcnKSB7XHJcbiAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoJ0xhIHNhbGEgbm8gZXN0w6EgZGlzcG9uaWJsZSBwYXJhIG51ZXZvcyBtaWVtYnJvcycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGlmIHJvb20gaXMgZnVsbFxyXG4gICAgaWYgKHJvb20ubWVtYmVyQ291bnQgPj0gcm9vbS5tYXhNZW1iZXJzKSB7XHJcbiAgICAgIHRocm93IG5ldyBDb25mbGljdEVycm9yKCdSb29tIGlzIGZ1bGwnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBpZiB1c2VyIGlzIGFscmVhZHkgYSBtZW1iZXJcclxuICAgIGNvbnN0IGV4aXN0aW5nTWVtYmVyID0gYXdhaXQgdGhpcy5kYi5nZXQ8VHJpbml0eVJvb21NZW1iZXI+KFxyXG4gICAgICB0aGlzLmNvbmZpZy50YWJsZXMucm9vbU1lbWJlcnMsXHJcbiAgICAgIHsgcm9vbUlkOiByb29tLmlkLCB1c2VySWQgfVxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoZXhpc3RpbmdNZW1iZXIgJiYgZXhpc3RpbmdNZW1iZXIuaXNBY3RpdmUpIHtcclxuICAgICAgLy8gVXNlciBpcyBhbHJlYWR5IGEgbWVtYmVyLCByZXR1cm4gcm9vbVxyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKGDinIUgVXN1YXJpbyAke3VzZXJJZH0geWEgZXN0w6EgZW4gc2FsYSAke3Jvb20uaWR9YCk7XHJcbiAgICAgIHJldHVybiByb29tO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEFkZCB1c2VyIGFzIG1lbWJlciBvciByZWFjdGl2YXRlIGV4aXN0aW5nIG1lbWJlcnNoaXBcclxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICAgIFxyXG4gICAgaWYgKGV4aXN0aW5nTWVtYmVyKSB7XHJcbiAgICAgIC8vIFJlYWN0aXZhdGUgZXhpc3RpbmcgbWVtYmVyXHJcbiAgICAgIGF3YWl0IHRoaXMuZGIudXBkYXRlKFxyXG4gICAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tTWVtYmVycyxcclxuICAgICAgICB7IHJvb21JZDogcm9vbS5pZCwgdXNlcklkIH0sXHJcbiAgICAgICAgJ1NFVCBpc0FjdGl2ZSA9IDphY3RpdmUsIGpvaW5lZEF0ID0gOmpvaW5lZEF0JyxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAgICc6YWN0aXZlJzogdHJ1ZSxcclxuICAgICAgICAgICAgJzpqb2luZWRBdCc6IG5vdyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfVxyXG4gICAgICApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gQWRkIG5ldyBtZW1iZXJcclxuICAgICAgY29uc3QgbWVtYmVyOiBUcmluaXR5Um9vbU1lbWJlciA9IHtcclxuICAgICAgICByb29tSWQ6IHJvb20uaWQsXHJcbiAgICAgICAgdXNlcklkLFxyXG4gICAgICAgIHJvbGU6ICdNRU1CRVInLFxyXG4gICAgICAgIGpvaW5lZEF0OiBub3csXHJcbiAgICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgIH07XHJcblxyXG4gICAgICBhd2FpdCB0aGlzLmRiLnB1dCh0aGlzLmNvbmZpZy50YWJsZXMucm9vbU1lbWJlcnMsIG1lbWJlcik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVXBkYXRlIHJvb20gdGltZXN0YW1wIChtYXRjaGluZyBleGlzdGluZyBQSy9TSyBzdHJ1Y3R1cmUpXHJcbiAgICBhd2FpdCB0aGlzLmRiLnVwZGF0ZShcclxuICAgICAgdGhpcy5jb25maWcudGFibGVzLnJvb21zLFxyXG4gICAgICB7IFBLOiByb29tLmlkLCBTSzogJ1JPT00nIH0sXHJcbiAgICAgICdTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgIHtcclxuICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOnVwZGF0ZWRBdCc6IG5vdyxcclxuICAgICAgICB9LFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vIExvZyBidXNpbmVzcyBtZXRyaWMgKG1hdGNoaW5nIGV4aXN0aW5nIHBhdHRlcm4pXHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKCfwn5OKIEJ1c2luZXNzIE1ldHJpYzogUk9PTV9KT0lORUQnLCB7XHJcbiAgICAgIHJvb21JZDogcm9vbS5pZCxcclxuICAgICAgdXNlcklkLFxyXG4gICAgICBkYXRhOiB7XHJcbiAgICAgICAgcm9vbVN0YXR1czogcm9vbS5zdGF0dXMsXHJcbiAgICAgICAgd2FzRXhpc3RpbmdNZW1iZXI6ICEhZXhpc3RpbmdNZW1iZXJcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5sb2dnZXIuaW5mbyhg4pyFIFVzdWFyaW8gJHt1c2VySWR9IHNlIHVuacOzIGEgc2FsYSAke3Jvb20uaWR9YCk7XHJcbiAgICBcclxuICAgIC8vIFJldHVybiByb29tIHdpdGggdXBkYXRlZCB0aW1lc3RhbXBcclxuICAgIHJldHVybiB7XHJcbiAgICAgIC4uLnJvb20sXHJcbiAgICAgIHVwZGF0ZWRBdDogbm93LFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIExlYXZlIGEgcm9vbVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgbGVhdmVSb29tKGFyZ3M6IExlYXZlUm9vbUFyZ3MsIHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICB0aGlzLnZhbGlkYXRlQXJnczxMZWF2ZVJvb21BcmdzPihhcmdzLCBbJ3Jvb21JZCddKTtcclxuXHJcbiAgICAvLyBDaGVjayBpZiB1c2VyIGlzIGEgbWVtYmVyXHJcbiAgICBjb25zdCBtZW1iZXIgPSBhd2FpdCB0aGlzLmRiLmdldDxUcmluaXR5Um9vbU1lbWJlcj4oXHJcbiAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tTWVtYmVycyxcclxuICAgICAgeyByb29tSWQ6IGFyZ3Mucm9vbUlkLCB1c2VySWQgfVxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoIW1lbWJlciB8fCAhbWVtYmVyLmlzQWN0aXZlKSB7XHJcbiAgICAgIHRocm93IG5ldyBOb3RGb3VuZEVycm9yKCdSb29tIG1lbWJlcnNoaXAnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgcm9vbSB0byBjaGVjayBpZiB1c2VyIGlzIGhvc3RcclxuICAgIGNvbnN0IHJvb20gPSBhd2FpdCB0aGlzLmRiLmdldDxUcmluaXR5Um9vbT4oXHJcbiAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tcyxcclxuICAgICAgeyBpZDogYXJncy5yb29tSWQgfVxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoIXJvb20pIHtcclxuICAgICAgdGhyb3cgbmV3IE5vdEZvdW5kRXJyb3IoJ1Jvb20nKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcblxyXG4gICAgaWYgKG1lbWJlci5yb2xlID09PSAnSE9TVCcpIHtcclxuICAgICAgLy8gSWYgaG9zdCBpcyBsZWF2aW5nLCBkZWFjdGl2YXRlIHRoZSBlbnRpcmUgcm9vbVxyXG4gICAgICBhd2FpdCB0aGlzLmRiLnRyYW5zYWN0V3JpdGUoW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIG9wZXJhdGlvbjogJ1VQREFURScsXHJcbiAgICAgICAgICB0YWJsZU5hbWU6IHRoaXMuY29uZmlnLnRhYmxlcy5yb29tTWVtYmVycyxcclxuICAgICAgICAgIGtleTogeyByb29tSWQ6IGFyZ3Mucm9vbUlkLCB1c2VySWQgfSxcclxuICAgICAgICAgIHVwZGF0ZUV4cHJlc3Npb246ICdTRVQgI2lzQWN0aXZlID0gOmZhbHNlJyxcclxuICAgICAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyAnI2lzQWN0aXZlJzogJ2lzQWN0aXZlJyB9LFxyXG4gICAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyAnOmZhbHNlJzogZmFsc2UgfSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIG9wZXJhdGlvbjogJ1VQREFURScsXHJcbiAgICAgICAgICB0YWJsZU5hbWU6IHRoaXMuY29uZmlnLnRhYmxlcy5yb29tcyxcclxuICAgICAgICAgIGtleTogeyBpZDogYXJncy5yb29tSWQgfSxcclxuICAgICAgICAgIHVwZGF0ZUV4cHJlc3Npb246ICdTRVQgI2lzQWN0aXZlID0gOmZhbHNlLCAjdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHtcclxuICAgICAgICAgICAgJyNpc0FjdGl2ZSc6ICdpc0FjdGl2ZScsXHJcbiAgICAgICAgICAgICcjdXBkYXRlZEF0JzogJ3VwZGF0ZWRBdCcsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgICAnOmZhbHNlJzogZmFsc2UsXHJcbiAgICAgICAgICAgICc6dXBkYXRlZEF0Jzogbm93LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICBdKTtcclxuXHJcbiAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ+KchSBIb3N0IGxlZnQgcm9vbSwgcm9vbSBkZWFjdGl2YXRlZCcsIHsgcm9vbUlkOiBhcmdzLnJvb21JZCwgdXNlcklkIH0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gUmVndWxhciBtZW1iZXIgbGVhdmluZ1xyXG4gICAgICBhd2FpdCB0aGlzLmRiLnRyYW5zYWN0V3JpdGUoW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIG9wZXJhdGlvbjogJ1VQREFURScsXHJcbiAgICAgICAgICB0YWJsZU5hbWU6IHRoaXMuY29uZmlnLnRhYmxlcy5yb29tTWVtYmVycyxcclxuICAgICAgICAgIGtleTogeyByb29tSWQ6IGFyZ3Mucm9vbUlkLCB1c2VySWQgfSxcclxuICAgICAgICAgIHVwZGF0ZUV4cHJlc3Npb246ICdTRVQgI2lzQWN0aXZlID0gOmZhbHNlJyxcclxuICAgICAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyAnI2lzQWN0aXZlJzogJ2lzQWN0aXZlJyB9LFxyXG4gICAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyAnOmZhbHNlJzogZmFsc2UgfSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIG9wZXJhdGlvbjogJ1VQREFURScsXHJcbiAgICAgICAgICB0YWJsZU5hbWU6IHRoaXMuY29uZmlnLnRhYmxlcy5yb29tcyxcclxuICAgICAgICAgIGtleTogeyBpZDogYXJncy5yb29tSWQgfSxcclxuICAgICAgICAgIHVwZGF0ZUV4cHJlc3Npb246ICdTRVQgI21lbWJlckNvdW50ID0gI21lbWJlckNvdW50IC0gOmRlYywgI3VwZGF0ZWRBdCA9IDp1cGRhdGVkQXQnLFxyXG4gICAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7XHJcbiAgICAgICAgICAgICcjbWVtYmVyQ291bnQnOiAnbWVtYmVyQ291bnQnLFxyXG4gICAgICAgICAgICAnI3VwZGF0ZWRBdCc6ICd1cGRhdGVkQXQnLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICAgJzpkZWMnOiAxLFxyXG4gICAgICAgICAgICAnOnVwZGF0ZWRBdCc6IG5vdyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSk7XHJcblxyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKCfinIUgVXNlciBsZWZ0IHJvb20gc3VjY2Vzc2Z1bGx5JywgeyByb29tSWQ6IGFyZ3Mucm9vbUlkLCB1c2VySWQgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgcm9vbSBkZXRhaWxzXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBnZXRSb29tKGFyZ3M6IEdldFJvb21BcmdzLCB1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8VHJpbml0eVJvb20+IHtcclxuICAgIHRoaXMudmFsaWRhdGVBcmdzPEdldFJvb21BcmdzPihhcmdzLCBbJ3Jvb21JZCddKTtcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSB1c2VyIGhhcyBhY2Nlc3MgdG8gcm9vbVxyXG4gICAgY29uc3QgaGFzQWNjZXNzID0gYXdhaXQgSGFuZGxlclV0aWxzLnZhbGlkYXRlUm9vbUFjY2VzcyhcclxuICAgICAgdGhpcy5kYixcclxuICAgICAgdXNlcklkLFxyXG4gICAgICBhcmdzLnJvb21JZCxcclxuICAgICAgdGhpcy5jb25maWdcclxuICAgICk7XHJcblxyXG4gICAgaWYgKCFoYXNBY2Nlc3MpIHtcclxuICAgICAgdGhyb3cgbmV3IFVuYXV0aG9yaXplZEVycm9yKCdBY2Nlc3MgZGVuaWVkIHRvIHJvb20nKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb29tID0gYXdhaXQgdGhpcy5kYi5nZXQ8VHJpbml0eVJvb20+KFxyXG4gICAgICB0aGlzLmNvbmZpZy50YWJsZXMucm9vbXMsXHJcbiAgICAgIHsgaWQ6IGFyZ3Mucm9vbUlkIH1cclxuICAgICk7XHJcblxyXG4gICAgaWYgKCFyb29tIHx8ICFyb29tLmlzQWN0aXZlKSB7XHJcbiAgICAgIHRocm93IG5ldyBOb3RGb3VuZEVycm9yKCdSb29tJyk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJvb207XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgdXNlcidzIHJvb21zIChtYXRjaGluZyBleGlzdGluZyBnZXRNeUhpc3RvcnkgbG9naWMpXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBnZXRVc2VyUm9vbXModXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPFRyaW5pdHlSb29tW10+IHtcclxuICAgIC8vIEdldCB1c2VyJ3Mgcm9vbSBtZW1iZXJzaGlwcyB1c2luZyBHU0kgKG1hdGNoaW5nIGV4aXN0aW5nIGxvZ2ljKVxyXG4gICAgY29uc3QgbWVtYmVyc2hpcHMgPSBhd2FpdCB0aGlzLmRiLnF1ZXJ5PFRyaW5pdHlSb29tTWVtYmVyPihcclxuICAgICAgdGhpcy5jb25maWcudGFibGVzLnJvb21NZW1iZXJzLFxyXG4gICAgICAndXNlcklkID0gOnVzZXJJZCcsXHJcbiAgICAgIHtcclxuICAgICAgICBpbmRleE5hbWU6ICdVc2VySGlzdG9yeUluZGV4JyxcclxuICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOnVzZXJJZCc6IHVzZXJJZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHNjYW5JbmRleEZvcndhcmQ6IGZhbHNlLCAvLyBPcmRlciBieSBqb2luZWRBdCBkZXNjZW5kaW5nIChtb3N0IHJlY2VudCBmaXJzdClcclxuICAgICAgICBsaW1pdDogNTAsIC8vIExpbWl0IHRvIGxhc3QgNTAgcm9vbXNcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAobWVtYmVyc2hpcHMuY291bnQgPT09IDApIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCByb29tIGRldGFpbHMgZm9yIGVhY2ggbWVtYmVyc2hpcCAobWF0Y2hpbmcgZXhpc3RpbmcgbG9naWMpXHJcbiAgICBjb25zdCByb29tczogVHJpbml0eVJvb21bXSA9IFtdO1xyXG4gICAgXHJcbiAgICBmb3IgKGNvbnN0IG1lbWJlciBvZiBtZW1iZXJzaGlwcy5pdGVtcykge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIC8vIFVzZSBQSy9TSyBzdHJ1Y3R1cmUgdG8gZ2V0IHJvb20gZGV0YWlsc1xyXG4gICAgICAgIGNvbnN0IHJvb21SZXNwb25zZSA9IGF3YWl0IHRoaXMuZGIuZ2V0KFxyXG4gICAgICAgICAgdGhpcy5jb25maWcudGFibGVzLnJvb21zLFxyXG4gICAgICAgICAgeyBQSzogbWVtYmVyLnJvb21JZCwgU0s6ICdST09NJyB9XHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgaWYgKHJvb21SZXNwb25zZSkge1xyXG4gICAgICAgICAgY29uc3Qgcm9vbSA9IHJvb21SZXNwb25zZSBhcyBhbnk7XHJcbiAgICAgICAgICByb29tcy5wdXNoKHtcclxuICAgICAgICAgICAgaWQ6IHJvb20ucm9vbUlkIHx8IHJvb20uaWQsXHJcbiAgICAgICAgICAgIG5hbWU6IHJvb20ubmFtZSB8fCAnU2FsYSBzaW4gbm9tYnJlJyxcclxuICAgICAgICAgICAgZGVzY3JpcHRpb246IHJvb20uZGVzY3JpcHRpb24sXHJcbiAgICAgICAgICAgIHN0YXR1czogcm9vbS5zdGF0dXMsXHJcbiAgICAgICAgICAgIHJlc3VsdE1vdmllSWQ6IHJvb20ucmVzdWx0TW92aWVJZCxcclxuICAgICAgICAgICAgaG9zdElkOiByb29tLmhvc3RJZCxcclxuICAgICAgICAgICAgaW52aXRlQ29kZTogcm9vbS5pbnZpdGVDb2RlLFxyXG4gICAgICAgICAgICBpbnZpdGVVcmw6IHJvb20uaW52aXRlVXJsLFxyXG4gICAgICAgICAgICBtZWRpYVR5cGU6IHJvb20ubWVkaWFUeXBlLFxyXG4gICAgICAgICAgICBnZW5yZUlkczogcm9vbS5nZW5yZUlkcyB8fCBbXSxcclxuICAgICAgICAgICAgZ2VucmVOYW1lczogcm9vbS5nZW5yZU5hbWVzIHx8IFtdLFxyXG4gICAgICAgICAgICBwcmVsb2FkZWRNb3ZpZXM6IHJvb20ucHJlbG9hZGVkTW92aWVzIHx8IFtdLFxyXG4gICAgICAgICAgICBzaG93bkNvbnRlbnRJZHM6IHJvb20uc2hvd25Db250ZW50SWRzIHx8IFtdLFxyXG4gICAgICAgICAgICBjdXJyZW50TW92aWVJbmRleDogcm9vbS5jdXJyZW50TW92aWVJbmRleCB8fCByb29tLmN1cnJlbnRDb250ZW50SW5kZXggfHwgMCwgLy8gU3VwcG9ydCBib3RoIGZpZWxkIG5hbWVzXHJcbiAgICAgICAgICAgIGN1cnJlbnRDb250ZW50SW5kZXg6IHJvb20uY3VycmVudENvbnRlbnRJbmRleCB8fCAwLFxyXG4gICAgICAgICAgICB0b3RhbE1vdmllczogcm9vbS50b3RhbE1vdmllcyB8fCA1MCxcclxuICAgICAgICAgICAgbW92aWVzRXhoYXVzdGVkOiByb29tLm1vdmllc0V4aGF1c3RlZCB8fCBmYWxzZSxcclxuICAgICAgICAgICAgaXNBY3RpdmU6IHJvb20uaXNBY3RpdmUgIT09IGZhbHNlLCAvLyBEZWZhdWx0IHRvIHRydWUgaWYgbm90IHNldFxyXG4gICAgICAgICAgICBpc1ByaXZhdGU6IHJvb20uaXNQcml2YXRlIHx8IGZhbHNlLFxyXG4gICAgICAgICAgICBtZW1iZXJDb3VudDogcm9vbS5tZW1iZXJDb3VudCB8fCAxLFxyXG4gICAgICAgICAgICBtYXhNZW1iZXJzOiByb29tLm1heE1lbWJlcnMsXHJcbiAgICAgICAgICAgIG1hdGNoQ291bnQ6IHJvb20ubWF0Y2hDb3VudCB8fCAwLFxyXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IHJvb20uY3JlYXRlZEF0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgdXBkYXRlZEF0OiByb29tLnVwZGF0ZWRBdCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgdGhpcy5sb2dnZXIud2Fybihg4pqg77iPIEVycm9yIG9idGVuaWVuZG8gc2FsYSAke21lbWJlci5yb29tSWR9YCwgZXJyb3IgYXMgRXJyb3IpO1xyXG4gICAgICAgIC8vIENvbnRpbnVlIHdpdGggb3RoZXIgcm9vbXNcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMubG9nZ2VyLmluZm8oYPCfk4sgSGlzdG9yaWFsIG9idGVuaWRvIHBhcmEgJHt1c2VySWR9OiAke3Jvb21zLmxlbmd0aH0gc2FsYXNgKTtcclxuICAgIHJldHVybiByb29tcztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFVwZGF0ZSByb29tIGRldGFpbHMgKGhvc3Qgb25seSlcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIHVwZGF0ZVJvb20oYXJnczogVXBkYXRlUm9vbUFyZ3MsIHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxUcmluaXR5Um9vbT4ge1xyXG4gICAgdGhpcy52YWxpZGF0ZUFyZ3M8VXBkYXRlUm9vbUFyZ3M+KGFyZ3MsIFsncm9vbUlkJ10pO1xyXG5cclxuICAgIC8vIENoZWNrIGlmIHVzZXIgaXMgcm9vbSBob3N0XHJcbiAgICBjb25zdCBpc0hvc3QgPSBhd2FpdCBIYW5kbGVyVXRpbHMuaXNSb29tSG9zdCh0aGlzLmRiLCB1c2VySWQsIGFyZ3Mucm9vbUlkLCB0aGlzLmNvbmZpZyk7XHJcbiAgICBpZiAoIWlzSG9zdCkge1xyXG4gICAgICB0aHJvdyBuZXcgVW5hdXRob3JpemVkRXJyb3IoJ09ubHkgcm9vbSBob3N0IGNhbiB1cGRhdGUgcm9vbScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEJ1aWxkIHVwZGF0ZSBleHByZXNzaW9uXHJcbiAgICBjb25zdCB1cGRhdGVFeHByZXNzaW9uczogc3RyaW5nW10gPSBbXTtcclxuICAgIGNvbnN0IGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xyXG4gICAgY29uc3QgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xyXG5cclxuICAgIGlmIChhcmdzLm5hbWUgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICB1cGRhdGVFeHByZXNzaW9ucy5wdXNoKCcjbmFtZSA9IDpuYW1lJyk7XHJcbiAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lc1snI25hbWUnXSA9ICduYW1lJztcclxuICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlc1snOm5hbWUnXSA9IEhhbmRsZXJVdGlscy5zYW5pdGl6ZVN0cmluZyhhcmdzLm5hbWUsIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGFyZ3MuZGVzY3JpcHRpb24gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICB1cGRhdGVFeHByZXNzaW9ucy5wdXNoKCcjZGVzY3JpcHRpb24gPSA6ZGVzY3JpcHRpb24nKTtcclxuICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzWycjZGVzY3JpcHRpb24nXSA9ICdkZXNjcmlwdGlvbic7XHJcbiAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXNbJzpkZXNjcmlwdGlvbiddID0gYXJncy5kZXNjcmlwdGlvbiA/IEhhbmRsZXJVdGlscy5zYW5pdGl6ZVN0cmluZyhhcmdzLmRlc2NyaXB0aW9uLCA1MDApIDogbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodXBkYXRlRXhwcmVzc2lvbnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIC8vIE5vIGNoYW5nZXMsIHJldHVybiBjdXJyZW50IHJvb21cclxuICAgICAgcmV0dXJuIHRoaXMuZ2V0Um9vbSh7IHJvb21JZDogYXJncy5yb29tSWQgfSwgdXNlcklkKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBBZGQgdXBkYXRlZEF0XHJcbiAgICB1cGRhdGVFeHByZXNzaW9ucy5wdXNoKCcjdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcpO1xyXG4gICAgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzWycjdXBkYXRlZEF0J10gPSAndXBkYXRlZEF0JztcclxuICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXNbJzp1cGRhdGVkQXQnXSA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuXHJcbiAgICBjb25zdCB1cGRhdGVFeHByZXNzaW9uID0gYFNFVCAke3VwZGF0ZUV4cHJlc3Npb25zLmpvaW4oJywgJyl9YDtcclxuXHJcbiAgICAvLyBVcGRhdGUgcm9vbVxyXG4gICAgY29uc3QgdXBkYXRlZFJvb20gPSBhd2FpdCB0aGlzLmRiLnVwZGF0ZTxUcmluaXR5Um9vbT4oXHJcbiAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tcyxcclxuICAgICAgeyBpZDogYXJncy5yb29tSWQgfSxcclxuICAgICAgdXBkYXRlRXhwcmVzc2lvbixcclxuICAgICAge1xyXG4gICAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcyxcclxuICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzLFxyXG4gICAgICAgIHJldHVyblZhbHVlczogJ0FMTF9ORVcnLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIHRoaXMubG9nZ2VyLmluZm8oJ+KchSBSb29tIHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5JywgeyByb29tSWQ6IGFyZ3Mucm9vbUlkLCB1c2VySWQgfSk7XHJcbiAgICByZXR1cm4gdXBkYXRlZFJvb20hO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRGVsZXRlIHJvb20gKGhvc3Qgb25seSlcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZVJvb20oYXJnczogeyByb29tSWQ6IHN0cmluZyB9LCB1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgLy8gQ2hlY2sgaWYgdXNlciBpcyByb29tIGhvc3RcclxuICAgIGNvbnN0IGlzSG9zdCA9IGF3YWl0IEhhbmRsZXJVdGlscy5pc1Jvb21Ib3N0KHRoaXMuZGIsIHVzZXJJZCwgYXJncy5yb29tSWQsIHRoaXMuY29uZmlnKTtcclxuICAgIGlmICghaXNIb3N0KSB7XHJcbiAgICAgIHRocm93IG5ldyBVbmF1dGhvcml6ZWRFcnJvcignT25seSByb29tIGhvc3QgY2FuIGRlbGV0ZSByb29tJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU29mdCBkZWxldGUgcm9vbVxyXG4gICAgYXdhaXQgdGhpcy5kYi51cGRhdGUoXHJcbiAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tcyxcclxuICAgICAgeyBpZDogYXJncy5yb29tSWQgfSxcclxuICAgICAgJ1NFVCAjaXNBY3RpdmUgPSA6ZmFsc2UsICN1cGRhdGVkQXQgPSA6dXBkYXRlZEF0JyxcclxuICAgICAge1xyXG4gICAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczoge1xyXG4gICAgICAgICAgJyNpc0FjdGl2ZSc6ICdpc0FjdGl2ZScsXHJcbiAgICAgICAgICAnI3VwZGF0ZWRBdCc6ICd1cGRhdGVkQXQnLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzpmYWxzZSc6IGZhbHNlLFxyXG4gICAgICAgICAgJzp1cGRhdGVkQXQnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKCfinIUgUm9vbSBkZWxldGVkIHN1Y2Nlc3NmdWxseScsIHsgcm9vbUlkOiBhcmdzLnJvb21JZCwgdXNlcklkIH0pO1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmF0ZSBhIHVuaXF1ZSBpbnZpdGUgY29kZVxyXG4gICAqL1xyXG4gIHByaXZhdGUgZ2VuZXJhdGVJbnZpdGVDb2RlKCk6IHN0cmluZyB7XHJcbiAgICBjb25zdCBjaGFycyA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWjAxMjM0NTY3ODknO1xyXG4gICAgbGV0IHJlc3VsdCA9ICcnO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA4OyBpKyspIHtcclxuICAgICAgcmVzdWx0ICs9IGNoYXJzLmNoYXJBdChNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBjaGFycy5sZW5ndGgpKTtcclxuICAgIH1cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDcmVhdGUgcm9vbSBkZWJ1ZyB2ZXJzaW9uIChtYXRjaGluZyBleGlzdGluZyBjcmVhdGVSb29tRGVidWcpXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBjcmVhdGVSb29tRGVidWcoYXJnczogeyBuYW1lOiBzdHJpbmcgfSwgdXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPFRyaW5pdHlSb29tPiB7XHJcbiAgICBjb25zdCByb29tSWQgPSBIYW5kbGVyVXRpbHMuZ2VuZXJhdGVJZCgpO1xyXG4gICAgY29uc3QgaW52aXRlQ29kZSA9IHRoaXMuZ2VuZXJhdGVJbnZpdGVDb2RlKCk7XHJcbiAgICBjb25zdCBpbnZpdGVVcmwgPSBgaHR0cHM6Ly90cmluaXR5LWFwcC5jb20vaW52aXRlLyR7aW52aXRlQ29kZX1gO1xyXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG5cclxuICAgIHRoaXMubG9nZ2VyLmluZm8oJ/CflI0gY3JlYXRlUm9vbURlYnVnJywgeyBob3N0SWQ6IHVzZXJJZCwgaW5wdXQ6IGFyZ3MgfSk7XHJcblxyXG4gICAgY29uc3Qgcm9vbTogVHJpbml0eVJvb20gPSB7XHJcbiAgICAgIGlkOiByb29tSWQsXHJcbiAgICAgIG5hbWU6IGFyZ3MubmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdTYWxhIGRlIGRlYnVnJyxcclxuICAgICAgc3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgIGhvc3RJZDogdXNlcklkLFxyXG4gICAgICBpbnZpdGVDb2RlLFxyXG4gICAgICBpbnZpdGVVcmwsXHJcbiAgICAgIG1lZGlhVHlwZTogJ01PVklFJywgLy8gRGVmYXVsdFxyXG4gICAgICBnZW5yZUlkczogW10sXHJcbiAgICAgIGdlbnJlTmFtZXM6IFtdLFxyXG4gICAgICBwcmVsb2FkZWRNb3ZpZXM6IFtdLFxyXG4gICAgICBzaG93bkNvbnRlbnRJZHM6IFtdLFxyXG4gICAgICBjdXJyZW50TW92aWVJbmRleDogMCwgLy8gSW5pdGlhbGl6ZSB0byAwXHJcbiAgICAgIGN1cnJlbnRDb250ZW50SW5kZXg6IDAsXHJcbiAgICAgIHRvdGFsTW92aWVzOiA1MCxcclxuICAgICAgbW92aWVzRXhoYXVzdGVkOiBmYWxzZSxcclxuICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgIG1lbWJlckNvdW50OiAxLFxyXG4gICAgICBtYXhNZW1iZXJzOiAxMCwgLy8gRGVmYXVsdCB2YWx1ZVxyXG4gICAgICBtYXRjaENvdW50OiAwLFxyXG4gICAgICBjcmVhdGVkQXQ6IG5vdyxcclxuICAgICAgdXBkYXRlZEF0OiBub3csXHJcbiAgICB9O1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuZGIudHJhbnNhY3RXcml0ZShbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgb3BlcmF0aW9uOiAnUFVUJyxcclxuICAgICAgICAgIHRhYmxlTmFtZTogdGhpcy5jb25maWcudGFibGVzLnJvb21zLFxyXG4gICAgICAgICAgaXRlbToge1xyXG4gICAgICAgICAgICBQSzogcm9vbUlkLFxyXG4gICAgICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgICAgICByb29tSWQsXHJcbiAgICAgICAgICAgIC4uLnJvb20sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgb3BlcmF0aW9uOiAnUFVUJyxcclxuICAgICAgICAgIHRhYmxlTmFtZTogdGhpcy5jb25maWcudGFibGVzLnJvb21NZW1iZXJzLFxyXG4gICAgICAgICAgaXRlbToge1xyXG4gICAgICAgICAgICByb29tSWQsXHJcbiAgICAgICAgICAgIHVzZXJJZCxcclxuICAgICAgICAgICAgcm9sZTogJ0hPU1QnLFxyXG4gICAgICAgICAgICBqb2luZWRBdDogbm93LFxyXG4gICAgICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgICAgICAgIH0gYXMgVHJpbml0eVJvb21NZW1iZXIsXHJcbiAgICAgICAgfSxcclxuICAgICAgXSk7XHJcblxyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKCfwn5OKIEJ1c2luZXNzIE1ldHJpYzogUk9PTV9DUkVBVEVEJywge1xyXG4gICAgICAgIHJvb21JZCxcclxuICAgICAgICB1c2VySWQsXHJcbiAgICAgICAgZGF0YToge1xyXG4gICAgICAgICAgcm9vbVN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICAgICAgcm9vbU5hbWU6IGFyZ3MubmFtZSxcclxuICAgICAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgICAgICBkZWJ1ZzogdHJ1ZVxyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKGDinIUgU2FsYSBkZWJ1ZyBjcmVhZGE6ICR7cm9vbUlkfSAoJHthcmdzLm5hbWV9KSBwb3IgJHt1c2VySWR9YCk7XHJcbiAgICAgIHJldHVybiByb29tO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKCfinYwgRmFpbGVkIHRvIGNyZWF0ZSBkZWJ1ZyByb29tJywgZXJyb3IgYXMgRXJyb3IsIHsgcm9vbUlkLCB1c2VySWQgfSk7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIHJvb20gc2ltcGxlIHZlcnNpb24gKG1hdGNoaW5nIGV4aXN0aW5nIGNyZWF0ZVJvb21TaW1wbGUpXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBjcmVhdGVSb29tU2ltcGxlKGFyZ3M6IHsgbmFtZTogc3RyaW5nIH0sIHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxUcmluaXR5Um9vbT4ge1xyXG4gICAgY29uc3Qgcm9vbUlkID0gSGFuZGxlclV0aWxzLmdlbmVyYXRlSWQoKTtcclxuICAgIGNvbnN0IGludml0ZUNvZGUgPSB0aGlzLmdlbmVyYXRlSW52aXRlQ29kZSgpO1xyXG4gICAgY29uc3QgaW52aXRlVXJsID0gYGh0dHBzOi8vdHJpbml0eS1hcHAuY29tL2ludml0ZS8ke2ludml0ZUNvZGV9YDtcclxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuXHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKCfwn5SNIGNyZWF0ZVJvb21TaW1wbGUnLCB7IGhvc3RJZDogdXNlcklkLCBuYW1lOiBhcmdzLm5hbWUsIHJvb21JZCB9KTtcclxuXHJcbiAgICBjb25zdCByb29tOiBUcmluaXR5Um9vbSA9IHtcclxuICAgICAgaWQ6IHJvb21JZCxcclxuICAgICAgbmFtZTogYXJncy5uYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1NhbGEgc2ltcGxlJyxcclxuICAgICAgc3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgIGhvc3RJZDogdXNlcklkLFxyXG4gICAgICBpbnZpdGVDb2RlLFxyXG4gICAgICBpbnZpdGVVcmwsXHJcbiAgICAgIG1lZGlhVHlwZTogJ01PVklFJywgLy8gRGVmYXVsdFxyXG4gICAgICBnZW5yZUlkczogW10sXHJcbiAgICAgIGdlbnJlTmFtZXM6IFtdLFxyXG4gICAgICBwcmVsb2FkZWRNb3ZpZXM6IFtdLFxyXG4gICAgICBzaG93bkNvbnRlbnRJZHM6IFtdLFxyXG4gICAgICBjdXJyZW50TW92aWVJbmRleDogMCwgLy8gSW5pdGlhbGl6ZSB0byAwXHJcbiAgICAgIGN1cnJlbnRDb250ZW50SW5kZXg6IDAsXHJcbiAgICAgIHRvdGFsTW92aWVzOiA1MCxcclxuICAgICAgbW92aWVzRXhoYXVzdGVkOiBmYWxzZSxcclxuICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgIG1lbWJlckNvdW50OiAxLFxyXG4gICAgICBtYXhNZW1iZXJzOiAxMCwgLy8gRGVmYXVsdCB2YWx1ZVxyXG4gICAgICBtYXRjaENvdW50OiAwLFxyXG4gICAgICBjcmVhdGVkQXQ6IG5vdyxcclxuICAgICAgdXBkYXRlZEF0OiBub3csXHJcbiAgICB9O1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ/CflI0gY3JlYXRlUm9vbVNpbXBsZSAtIFN0ZXAgMTogQ2FsbGluZyBnZW5lcmF0ZUludml0ZUNvZGUuLi4nKTtcclxuICAgICAgdGhpcy5sb2dnZXIuaW5mbygn4pyFIGNyZWF0ZVJvb21TaW1wbGUgLSBTdGVwIDEgU1VDQ0VTUzogSW52aXRlIGNvZGUgZ2VuZXJhdGVkJywgeyBpbnZpdGVDb2RlIH0pO1xyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKCfwn5SNIGNyZWF0ZVJvb21TaW1wbGUgLSBTdGVwIDI6IENyZWF0aW5nIHJvb20gb2JqZWN0Li4uJyk7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ+KchSBjcmVhdGVSb29tU2ltcGxlIC0gU3RlcCAyIFNVQ0NFU1M6IFJvb20gb2JqZWN0IGNyZWF0ZWQnKTtcclxuICAgICAgdGhpcy5sb2dnZXIuaW5mbygn8J+UjSBjcmVhdGVSb29tU2ltcGxlIC0gU3RlcCAzOiBTYXZpbmcgcm9vbSB0byBEeW5hbW9EQi4uLicpO1xyXG5cclxuICAgICAgYXdhaXQgdGhpcy5kYi50cmFuc2FjdFdyaXRlKFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBvcGVyYXRpb246ICdQVVQnLFxyXG4gICAgICAgICAgdGFibGVOYW1lOiB0aGlzLmNvbmZpZy50YWJsZXMucm9vbXMsXHJcbiAgICAgICAgICBpdGVtOiB7XHJcbiAgICAgICAgICAgIFBLOiByb29tSWQsXHJcbiAgICAgICAgICAgIFNLOiAnUk9PTScsXHJcbiAgICAgICAgICAgIHJvb21JZCxcclxuICAgICAgICAgICAgLi4ucm9vbSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBvcGVyYXRpb246ICdQVVQnLFxyXG4gICAgICAgICAgdGFibGVOYW1lOiB0aGlzLmNvbmZpZy50YWJsZXMucm9vbU1lbWJlcnMsXHJcbiAgICAgICAgICBpdGVtOiB7XHJcbiAgICAgICAgICAgIHJvb21JZCxcclxuICAgICAgICAgICAgdXNlcklkLFxyXG4gICAgICAgICAgICByb2xlOiAnSE9TVCcsXHJcbiAgICAgICAgICAgIGpvaW5lZEF0OiBub3csXHJcbiAgICAgICAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICAgICAgfSBhcyBUcmluaXR5Um9vbU1lbWJlcixcclxuICAgICAgICB9LFxyXG4gICAgICBdKTtcclxuXHJcbiAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ+KchSBjcmVhdGVSb29tU2ltcGxlIC0gU3RlcCAzIFNVQ0NFU1M6IFJvb20gc2F2ZWQgdG8gRHluYW1vREInKTtcclxuICAgICAgdGhpcy5sb2dnZXIuaW5mbygn8J+UjSBjcmVhdGVSb29tU2ltcGxlIC0gU3RlcCA0OiBBZGRpbmcgaG9zdCBhcyBtZW1iZXIuLi4nKTtcclxuICAgICAgdGhpcy5sb2dnZXIuaW5mbygn4pyFIGNyZWF0ZVJvb21TaW1wbGUgLSBTdGVwIDQgU1VDQ0VTUzogSG9zdCBhZGRlZCBhcyBtZW1iZXInKTtcclxuICAgICAgdGhpcy5sb2dnZXIuaW5mbygn8J+UjSBjcmVhdGVSb29tU2ltcGxlIC0gU3RlcCA1OiBMb2dnaW5nIGJ1c2luZXNzIG1ldHJpYy4uLicpO1xyXG5cclxuICAgICAgdGhpcy5sb2dnZXIuaW5mbygn8J+TiiBCdXNpbmVzcyBNZXRyaWM6IFJPT01fQ1JFQVRFRCcsIHtcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgdXNlcklkLFxyXG4gICAgICAgIGRhdGE6IHtcclxuICAgICAgICAgIHJvb21TdGF0dXM6ICdXQUlUSU5HJyxcclxuICAgICAgICAgIHJvb21OYW1lOiBhcmdzLm5hbWUsXHJcbiAgICAgICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICAgICAgc2ltcGxlOiB0cnVlXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ+KchSBjcmVhdGVSb29tU2ltcGxlIC0gU3RlcCA1IFNVQ0NFU1M6IEJ1c2luZXNzIG1ldHJpYyBsb2dnZWQnKTtcclxuICAgICAgdGhpcy5sb2dnZXIuaW5mbyhg4pyFIFNhbGEgc2ltcGxlIGNyZWFkYTogJHtyb29tSWR9ICgke2FyZ3MubmFtZX0pIHBvciAke3VzZXJJZH1gKTtcclxuICAgICAgdGhpcy5sb2dnZXIuaW5mbygn8J+UjSBjcmVhdGVSb29tU2ltcGxlIC0gUmV0dXJuaW5nIHJvb20gb2JqZWN0JywgeyByb29tOiBKU09OLnN0cmluZ2lmeShyb29tLCBudWxsLCAyKSB9KTtcclxuXHJcbiAgICAgIHJldHVybiByb29tO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKCfwn5Kl8J+SpfCfkqUgY3JlYXRlUm9vbVNpbXBsZSAtIEVYQ0VQVElPTiBDQVVHSFQnLCBlcnJvciBhcyBFcnJvcik7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKCfwn5KlIEVycm9yIGRldGFpbHMnLCB7IFxyXG4gICAgICAgIG5hbWU6IChlcnJvciBhcyBFcnJvcikubmFtZSxcclxuICAgICAgICBtZXNzYWdlOiAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UsXHJcbiAgICAgICAgc3RhY2s6IChlcnJvciBhcyBFcnJvcikuc3RhY2tcclxuICAgICAgfSk7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLy8gRXhwb3J0IHRoZSBoYW5kbGVyXHJcbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcihSb29tSGFuZGxlcik7Il19