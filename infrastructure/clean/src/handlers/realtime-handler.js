"use strict";
/**
 * Trinity Realtime Handler
 * Handles real-time notifications through AppSync subscriptions
 * Migrated from JavaScript lambdas/trinity-realtime-dev/
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const base_handler_1 = require("./base-handler");
const types_1 = require("../shared/types");
const base_handler_2 = require("./base-handler");
class RealtimeHandler extends base_handler_1.BaseHandler {
    async handle(event) {
        const { fieldName } = base_handler_2.HandlerUtils.getOperationInfo(event);
        const { userId } = base_handler_2.HandlerUtils.getUserInfo(event);
        this.logger.info(`📡 Realtime operation: ${fieldName}`, { userId, fieldName });
        switch (fieldName) {
            case 'connect':
                return this.connect(event.arguments);
            case 'disconnect':
                return this.disconnect(event.arguments);
            case 'sendNotification':
                return this.sendNotification(event.arguments);
            case 'joinRoom':
                return this.joinRoom(event.arguments);
            case 'leaveRoom':
                return this.leaveRoom(event.arguments);
            case 'getActiveConnections':
                return this.getActiveConnections(event.arguments);
            case 'pingConnection':
                return this.pingConnection(event.arguments);
            // Core AppSync subscription publishing methods
            case 'publishMatchFound':
                return this.publishMatchFound(event.arguments);
            case 'publishVoteUpdate':
                return this.publishVoteUpdate(event.arguments);
            default:
                throw new types_1.ValidationError(`Unknown realtime operation: ${fieldName}`);
        }
    }
    /**
     * Publish Match Found event to AppSync subscriptions
     * Migrated from JavaScript appsyncPublisher.publishMatchFoundEvent
     */
    async publishMatchFound(input) {
        this.validateArgs(input, ['roomId', 'movieId', 'movieTitle', 'participants']);
        try {
            this.logger.info(`📡 Publishing ENHANCED match found event for room ${input.roomId}`, {
                movieId: input.movieId,
                movieTitle: input.movieTitle,
                participantCount: input.participants.length
            });
            // IMPORTANTE: Solo notificar a usuarios que votaron LIKE
            const likingParticipants = input.participants || [];
            const allParticipants = input.allParticipants || [];
            this.logger.info(`🎯 Notificando MATCH a ${likingParticipants.length} usuarios que votaron LIKE de ${allParticipants.length} total`);
            // Publish to AppSync subscription for ENHANCED match display
            const mutation = `
        mutation PublishMatchFound($input: MatchFoundInput!) {
          publishMatchFound(input: $input) {
            roomId
            movieId
            movieTitle
            participants
            allParticipants
            showFullScreen
            matchType
            timestamp
          }
        }
      `;
            const variables = {
                input: {
                    roomId: input.roomId,
                    movieId: input.movieId,
                    movieTitle: input.movieTitle,
                    participants: likingParticipants, // Solo usuarios que votaron LIKE
                    allParticipants: allParticipants, // Todos los participantes para contexto
                    showFullScreen: true, // Mostrar pantalla completa del match
                    matchType: 'CONSENSUS', // Tipo de match
                    voteCount: input.voteCount,
                    requiredVotes: input.requiredVotes,
                    timestamp: input.timestamp
                }
            };
            // Execute AppSync mutation to trigger subscriptions
            await this.executeAppSyncMutation(mutation, variables);
            // CRÍTICO: Solo notificar a usuarios que votaron LIKE
            for (const userId of likingParticipants) {
                this.logger.info(`🎉 Notificando MATCH COMPLETO a usuario ${userId} que votó LIKE en room ${input.roomId}`);
                this.logger.info(`📺 Usuario ${userId} verá pantalla completa de match para película "${input.movieTitle}"`);
            }
            // Notificar a otros usuarios (que no votaron LIKE) sobre el match pero sin pantalla completa
            const nonLikingUsers = allParticipants.filter(userId => !likingParticipants.includes(userId));
            for (const userId of nonLikingUsers) {
                this.logger.info(`📢 Notificando match (sin pantalla completa) a usuario ${userId} que NO votó LIKE en room ${input.roomId}`);
            }
            this.logger.info(`✅ Match notification sent: ${likingParticipants.length} FULL SCREEN, ${nonLikingUsers.length} notification only`);
            return true;
        }
        catch (error) {
            this.logger.error(`❌ Error publishing enhanced match event for room ${input.roomId}`, error);
            // Don't throw - notification failure shouldn't break the match logic
            return false;
        }
    }
    /**
     * Publish Vote Update event to AppSync subscriptions
     * Migrated from JavaScript appsyncPublisher.publishVoteUpdateEvent
     */
    async publishVoteUpdate(input) {
        this.validateArgs(input, ['roomId', 'userId', 'movieId', 'voteType']);
        try {
            this.logger.info(`📡 Publishing vote update event for room ${input.roomId}`, {
                userId: input.userId,
                movieId: input.movieId,
                voteType: input.voteType,
                currentVotes: input.currentVotes,
                totalMembers: input.totalMembers
            });
            // Get all room members to notify
            const members = await this.getRoomMembers(input.roomId);
            // Broadcast vote update to all room members
            for (const member of members) {
                if (member.userId !== input.userId) { // Don't notify the voter
                    this.logger.info(`📡 Notifying user ${member.userId} of vote update in room ${input.roomId}`);
                }
            }
            // Prepare AppSync mutation for vote update
            const mutation = `
        mutation PublishVoteUpdate($input: VoteUpdateInput!) {
          publishVoteUpdate(input: $input) {
            roomId
            userId
            movieId
            voteType
            currentVotes
            totalMembers
            timestamp
          }
        }
      `;
            const variables = {
                input: {
                    ...input,
                    timestamp: new Date().toISOString()
                }
            };
            // Execute AppSync mutation to trigger subscriptions
            await this.executeAppSyncMutation(mutation, variables);
            return true;
        }
        catch (error) {
            this.logger.error(`❌ Error publishing vote update for room ${input.roomId}`, error);
            return false;
        }
    }
    /**
     * Execute AppSync mutation to trigger subscriptions
     * Migrated from JavaScript publishToRoomSubscribers function
     */
    async executeAppSyncMutation(mutation, variables) {
        const endpoint = this.config.appSync?.endpoint;
        const apiKey = this.config.appSync?.apiKey;
        if (!endpoint) {
            this.logger.warn('⚠️ APPSYNC_ENDPOINT not defined, cannot publish event');
            return;
        }
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey || '',
                },
                body: JSON.stringify({
                    query: mutation,
                    variables
                })
            });
            if (!response.ok) {
                throw new Error(`AppSync request failed: ${response.status} ${response.statusText}`);
            }
            const result = await response.json();
            if (result.errors) {
                this.logger.error('❌ AppSync Publish Error:', new Error(JSON.stringify(result.errors)));
            }
            else {
                this.logger.info(`✅ Event published successfully to ${endpoint}`);
            }
        }
        catch (error) {
            this.logger.error('❌ Error publishing to AppSync:', error);
            throw error;
        }
    }
    /**
     * Get all active members of a room
     * Migrated from JavaScript getRoomMembers function
     */
    async getRoomMembers(roomId) {
        try {
            const result = await this.db.query(this.config.tables.roomMembers, 'roomId = :roomId', {
                filterExpression: 'isActive = :active',
                expressionAttributeValues: {
                    ':roomId': roomId,
                    ':active': true
                }
            });
            return result.items;
        }
        catch (error) {
            this.logger.error(`❌ Error getting room members for ${roomId}`, error);
            return [];
        }
    }
    /**
     * Get movie title for notifications
     * Migrated from JavaScript appsyncPublisher.getMovieTitle
     */
    async getMovieTitle(movieId) {
        try {
            this.logger.info(`🎬 Getting movie title for ${movieId}`);
            // Try to get from cache first
            const cachedMovie = await this.db.get(this.config.tables.moviesCache, { tmdbId: `movie_details_${movieId}` });
            if (cachedMovie?.movieDetails?.title) {
                return cachedMovie.movieDetails.title;
            }
            // Fallback to generic title
            return `Movie ${movieId}`;
        }
        catch (error) {
            this.logger.warn(`⚠️ Error getting movie title for ${movieId}`, { error: error.message });
            return `Movie ${movieId}`;
        }
    }
    /**
     * Handle user connection to real-time subscriptions
     * Manages connection state in DynamoDB for subscription targeting
     */
    async connect(args) {
        this.validateArgs(args, ['userId']);
        const connectionId = base_handler_2.HandlerUtils.generateId();
        const now = new Date().toISOString();
        const connection = {
            connectionId,
            userId: args.userId,
            roomId: args.roomId,
            connectedAt: now,
            lastPingAt: now,
            isActive: true,
        };
        // Store connection for subscription targeting
        await this.db.put(this.config.tables.connections, connection);
        this.logger.info('✅ Real-time connection established', {
            connectionId,
            userId: args.userId,
            roomId: args.roomId
        });
        // If joining a room, notify other room members via AppSync subscription
        if (args.roomId) {
            await this.publishVoteUpdate({
                roomId: args.roomId,
                userId: args.userId,
                movieId: 'connection_event',
                voteType: 'LIKE', // Dummy value for connection event
                currentVotes: 0,
                totalMembers: 0
            });
        }
        return connection;
    }
    /**
     * Handle user disconnection from real-time subscriptions
     */
    async disconnect(args) {
        this.validateArgs(args, ['connectionId']);
        // Get connection details
        const connection = await this.db.get(this.config.tables.connections, { connectionId: args.connectionId });
        if (!connection) {
            this.logger.warn('⚠️ Connection not found for disconnect', { connectionId: args.connectionId });
            return false;
        }
        // Mark connection as inactive
        await this.db.update(this.config.tables.connections, { connectionId: args.connectionId }, 'SET #isActive = :false, #lastPingAt = :timestamp', {
            expressionAttributeNames: {
                '#isActive': 'isActive',
                '#lastPingAt': 'lastPingAt',
            },
            expressionAttributeValues: {
                ':false': false,
                ':timestamp': new Date().toISOString(),
            },
        });
        this.logger.info('✅ Real-time connection disconnected', {
            connectionId: args.connectionId,
            userId: connection.userId,
            roomId: connection.roomId
        });
        // If user was in a room, notify other room members via AppSync subscription
        if (connection.roomId) {
            await this.publishVoteUpdate({
                roomId: connection.roomId,
                userId: connection.userId,
                movieId: 'disconnection_event',
                voteType: 'LIKE', // Dummy value for disconnection event
                currentVotes: 0,
                totalMembers: 0
            });
        }
        return true;
    }
    /**
     * Send notification to room members via AppSync subscriptions
     */
    async sendNotification(args) {
        this.validateArgs(args, ['roomId', 'type', 'data']);
        const notification = {
            type: args.type,
            roomId: args.roomId,
            data: args.data,
            timestamp: new Date().toISOString(),
        };
        // Use AppSync subscription publishing based on notification type
        if (args.type === 'MATCH_FOUND' && args.data.movieId && args.data.movieTitle) {
            await this.publishMatchFound({
                roomId: args.roomId,
                movieId: args.data.movieId,
                movieTitle: args.data.movieTitle,
                participants: args.data.participants || [],
                allParticipants: args.data.allParticipants || [],
                showFullScreen: true,
                matchType: 'CONSENSUS',
                voteCount: args.data.voteCount,
                requiredVotes: args.data.requiredVotes,
                timestamp: notification.timestamp
            });
        }
        else if (args.type === 'VOTE_CAST' && args.data.userId && args.data.movieId) {
            await this.publishVoteUpdate({
                roomId: args.roomId,
                userId: args.data.userId,
                movieId: args.data.movieId,
                voteType: args.data.voteType || 'LIKE',
                currentVotes: args.data.currentVotes || 0,
                totalMembers: args.data.totalMembers || 0
            });
        }
        this.logger.info('✅ Notification sent to room via AppSync', {
            roomId: args.roomId,
            type: args.type,
            excludeUserId: args.excludeUserId
        });
        return true;
    }
    /**
     * Join a room (update existing connection)
     */
    async joinRoom(args) {
        this.validateArgs(args, ['connectionId', 'roomId']);
        // Update connection with room ID
        const updatedConnection = await this.db.update(this.config.tables.connections, { connectionId: args.connectionId }, 'SET #roomId = :roomId, #lastPingAt = :timestamp', {
            expressionAttributeNames: {
                '#roomId': 'roomId',
                '#lastPingAt': 'lastPingAt',
            },
            expressionAttributeValues: {
                ':roomId': args.roomId,
                ':timestamp': new Date().toISOString(),
            },
            returnValues: 'ALL_NEW',
        });
        if (!updatedConnection) {
            throw new types_1.ValidationError('Connection not found');
        }
        this.logger.info('✅ Connection joined room', {
            connectionId: args.connectionId,
            roomId: args.roomId,
            userId: updatedConnection.userId
        });
        // Notify other room members via AppSync subscription
        await this.publishVoteUpdate({
            roomId: args.roomId,
            userId: updatedConnection.userId,
            movieId: 'user_joined_event',
            voteType: 'LIKE', // Dummy value for join event
            currentVotes: 0,
            totalMembers: 0
        });
        return true;
    }
    /**
     * Leave a room (update existing connection)
     */
    async leaveRoom(args) {
        this.validateArgs(args, ['connectionId', 'roomId']);
        // Get connection details before update
        const connection = await this.db.get(this.config.tables.connections, { connectionId: args.connectionId });
        if (!connection) {
            throw new types_1.ValidationError('Connection not found');
        }
        // Remove room ID from connection
        await this.db.update(this.config.tables.connections, { connectionId: args.connectionId }, 'REMOVE #roomId SET #lastPingAt = :timestamp', {
            expressionAttributeNames: {
                '#roomId': 'roomId',
                '#lastPingAt': 'lastPingAt',
            },
            expressionAttributeValues: {
                ':timestamp': new Date().toISOString(),
            },
        });
        this.logger.info('✅ Connection left room', {
            connectionId: args.connectionId,
            roomId: args.roomId,
            userId: connection.userId
        });
        // Notify other room members via AppSync subscription
        await this.publishVoteUpdate({
            roomId: args.roomId,
            userId: connection.userId,
            movieId: 'user_left_event',
            voteType: 'LIKE', // Dummy value for leave event
            currentVotes: 0,
            totalMembers: 0
        });
        return true;
    }
    /**
     * Get active connections (optionally filtered by room)
     */
    async getActiveConnections(args) {
        if (args.roomId) {
            // Get connections for specific room
            const result = await this.db.query(this.config.tables.connections, 'roomId = :roomId', {
                indexName: 'RoomIdIndex',
                filterExpression: 'isActive = :active',
                expressionAttributeValues: {
                    ':roomId': args.roomId,
                    ':active': true,
                },
            });
            return result.items;
        }
        else {
            // Get all active connections
            const result = await this.db.scan(this.config.tables.connections, 'isActive = :active', { ':active': 'true' } // Use string instead of boolean for DynamoDB
            );
            return result.items;
        }
    }
    /**
     * Ping connection to keep it alive
     */
    async pingConnection(args) {
        this.validateArgs(args, ['connectionId']);
        try {
            await this.db.update(this.config.tables.connections, { connectionId: args.connectionId }, 'SET #lastPingAt = :timestamp', {
                expressionAttributeNames: {
                    '#lastPingAt': 'lastPingAt',
                },
                expressionAttributeValues: {
                    ':timestamp': new Date().toISOString(),
                },
            });
            return true;
        }
        catch (error) {
            this.logger.warn('⚠️ Failed to ping connection', { connectionId: args.connectionId });
            return false;
        }
    }
}
// Export the handler
exports.handler = (0, base_handler_1.createHandler)(RealtimeHandler);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVhbHRpbWUtaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJlYWx0aW1lLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7O0dBSUc7OztBQUVILGlEQUE0RDtBQUM1RCwyQ0FBOEU7QUFDOUUsaURBQThDO0FBa0U5QyxNQUFNLGVBQWdCLFNBQVEsMEJBQVc7SUFDdkMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFtQjtRQUM5QixNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsMkJBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzRCxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsMkJBQVksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFbkQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsMEJBQTBCLFNBQVMsRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFL0UsUUFBUSxTQUFTLEVBQUUsQ0FBQztZQUNsQixLQUFLLFNBQVM7Z0JBQ1osT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxTQUF3QixDQUFDLENBQUM7WUFFdEQsS0FBSyxZQUFZO2dCQUNmLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsU0FBMkIsQ0FBQyxDQUFDO1lBRTVELEtBQUssa0JBQWtCO2dCQUNyQixPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsU0FBaUMsQ0FBQyxDQUFDO1lBRXhFLEtBQUssVUFBVTtnQkFDYixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLFNBQXlCLENBQUMsQ0FBQztZQUV4RCxLQUFLLFdBQVc7Z0JBQ2QsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxTQUEwQixDQUFDLENBQUM7WUFFMUQsS0FBSyxzQkFBc0I7Z0JBQ3pCLE9BQU8sSUFBSSxDQUFDLG9CQUFv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TSxFQUFFLENBQUMsNkNBQTZDO2FBQ3BFLENBQUM7WUFFRixPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDdEIsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNLLEtBQUssQ0FBQyxjQUFjLENBQUMsSUFBOEI7UUFDekQsSUFBSSxDQUFDLFlBQVksQ0FBMkIsSUFBSSxFQUFFLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUVwRSxJQUFJLENBQUM7WUFDSCxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUNsQixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQzlCLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFDbkMsOEJBQThCLEVBQzlCO2dCQUNFLHdCQUF3QixFQUFFO29CQUN4QixhQUFhLEVBQUUsWUFBWTtpQkFDNUI7Z0JBQ0QseUJBQXlCLEVBQUU7b0JBQ3pCLFlBQVksRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtpQkFDdkM7YUFDRixDQUNGLENBQUM7WUFFRixPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsOEJBQThCLEVBQUUsRUFBRSxZQUFZLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUM7WUFDdEYsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBRUQscUJBQXFCO0FBQ1IsUUFBQSxPQUFPLEdBQUcsSUFBQSw0QkFBYSxFQUFDLGVBQWUsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIFRyaW5pdHkgUmVhbHRpbWUgSGFuZGxlclxyXG4gKiBIYW5kbGVzIHJlYWwtdGltZSBub3RpZmljYXRpb25zIHRocm91Z2ggQXBwU3luYyBzdWJzY3JpcHRpb25zXHJcbiAqIE1pZ3JhdGVkIGZyb20gSmF2YVNjcmlwdCBsYW1iZGFzL3RyaW5pdHktcmVhbHRpbWUtZGV2L1xyXG4gKi9cclxuXHJcbmltcG9ydCB7IEJhc2VIYW5kbGVyLCBjcmVhdGVIYW5kbGVyIH0gZnJvbSAnLi9iYXNlLWhhbmRsZXInO1xyXG5pbXBvcnQgeyBBcHBTeW5jRXZlbnQsIFZhbGlkYXRpb25FcnJvciwgVHJpbml0eUVycm9yIH0gZnJvbSAnLi4vc2hhcmVkL3R5cGVzJztcclxuaW1wb3J0IHsgSGFuZGxlclV0aWxzIH0gZnJvbSAnLi9iYXNlLWhhbmRsZXInO1xyXG5cclxuaW50ZXJmYWNlIENvbm5lY3Rpb24ge1xyXG4gIGNvbm5lY3Rpb25JZDogc3RyaW5nO1xyXG4gIHVzZXJJZDogc3RyaW5nO1xyXG4gIHJvb21JZD86IHN0cmluZztcclxuICBjb25uZWN0ZWRBdDogc3RyaW5nO1xyXG4gIGxhc3RQaW5nQXQ6IHN0cmluZztcclxuICBpc0FjdGl2ZTogYm9vbGVhbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIE1hdGNoRm91bmRJbnB1dCB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgbW92aWVJZDogc3RyaW5nO1xyXG4gIG1vdmllVGl0bGU6IHN0cmluZztcclxuICBwYXJ0aWNpcGFudHM6IHN0cmluZ1tdO1xyXG4gIGFsbFBhcnRpY2lwYW50czogc3RyaW5nW107XHJcbiAgc2hvd0Z1bGxTY3JlZW46IGJvb2xlYW47XHJcbiAgbWF0Y2hUeXBlOiBzdHJpbmc7XHJcbiAgdm90ZUNvdW50PzogbnVtYmVyO1xyXG4gIHJlcXVpcmVkVm90ZXM/OiBudW1iZXI7XHJcbiAgdGltZXN0YW1wOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBWb3RlVXBkYXRlSW5wdXQge1xyXG4gIHJvb21JZDogc3RyaW5nO1xyXG4gIHVzZXJJZDogc3RyaW5nO1xyXG4gIG1vdmllSWQ6IHN0cmluZztcclxuICB2b3RlVHlwZTogJ0xJS0UnIHwgJ0RJU0xJS0UnIHwgJ1NLSVAnO1xyXG4gIGN1cnJlbnRWb3RlczogbnVtYmVyO1xyXG4gIHRvdGFsTWVtYmVyczogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTm90aWZpY2F0aW9uUGF5bG9hZCB7XHJcbiAgdHlwZTogJ01BVENIX0ZPVU5EJyB8ICdVU0VSX0pPSU5FRCcgfCAnVVNFUl9MRUZUJyB8ICdWT1RFX0NBU1QnIHwgJ1JPT01fVVBEQVRFRCc7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgZGF0YTogYW55O1xyXG4gIHRpbWVzdGFtcDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ29ubmVjdEFyZ3Mge1xyXG4gIHVzZXJJZDogc3RyaW5nO1xyXG4gIHJvb21JZD86IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIERpc2Nvbm5lY3RBcmdzIHtcclxuICBjb25uZWN0aW9uSWQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFNlbmROb3RpZmljYXRpb25BcmdzIHtcclxuICByb29tSWQ6IHN0cmluZztcclxuICB0eXBlOiBzdHJpbmc7XHJcbiAgZGF0YTogYW55O1xyXG4gIGV4Y2x1ZGVVc2VySWQ/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBKb2luUm9vbUFyZ3Mge1xyXG4gIGNvbm5lY3Rpb25JZDogc3RyaW5nO1xyXG4gIHJvb21JZDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTGVhdmVSb29tQXJncyB7XHJcbiAgY29ubmVjdGlvbklkOiBzdHJpbmc7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbn1cclxuXHJcbmNsYXNzIFJlYWx0aW1lSGFuZGxlciBleHRlbmRzIEJhc2VIYW5kbGVyIHtcclxuICBhc3luYyBoYW5kbGUoZXZlbnQ6IEFwcFN5bmNFdmVudCk6IFByb21pc2U8YW55PiB7XHJcbiAgICBjb25zdCB7IGZpZWxkTmFtZSB9ID0gSGFuZGxlclV0aWxzLmdldE9wZXJhdGlvbkluZm8oZXZlbnQpO1xyXG4gICAgY29uc3QgeyB1c2VySWQgfSA9IEhhbmRsZXJVdGlscy5nZXRVc2VySW5mbyhldmVudCk7XHJcblxyXG4gICAgdGhpcy5sb2dnZXIuaW5mbyhg8J+ToSBSZWFsdGltZSBvcGVyYXRpb246ICR7ZmllbGROYW1lfWAsIHsgdXNlcklkLCBmaWVsZE5hbWUgfSk7XHJcblxyXG4gICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcclxuICAgICAgY2FzZSAnY29ubmVjdCc6XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29ubmVjdChldmVudC5hcmd1bWVudHMgYXMgQ29ubmVjdEFyZ3MpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnZGlzY29ubmVjdCc6XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGlzY29ubmVjdChldmVudC5hcmd1bWVudHMgYXMgRGlzY29ubmVjdEFyZ3MpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnc2VuZE5vdGlmaWNhdGlvbic6XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VuZE5vdGlmaWNhdGlvbihldmVudC5hcmd1bWVudHMgYXMgU2VuZE5vdGlmaWNhdGlvbkFyZ3MpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnam9pblJvb20nOlxyXG4gICAgICAgIHJldHVybiB0aGlzLmpvaW5Sb29tKGV2ZW50LmFyZ3VtZW50cyBhcyBKb2luUm9vbUFyZ3MpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnbGVhdmVSb29tJzpcclxuICAgICAgICByZXR1cm4gdGhpcy5sZWF2ZVJvb20oZXZlbnQuYXJndW1lbnRzIGFzIExlYXZlUm9vbUFyZ3MpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnZ2V0QWN0aXZlQ29ubmVjdGlvbnMnOlxyXG4gICAgICAgIHJldHVybiB0aGlzLmdldEFjdGl2ZUNvbm5lY3Rpb25zKGV2ZW50LmFyZ3VtZW50cyBhcyB7IHJvb21JZD86IHN0cmluZyB9KTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ3BpbmdDb25uZWN0aW9uJzpcclxuICAgICAgICByZXR1cm4gdGhpcy5waW5nQ29ubmVjdGlvbihldmVudC5hcmd1bWVudHMgYXMgeyBjb25uZWN0aW9uSWQ6IHN0cmluZyB9KTtcclxuXHJcbiAgICAgIC8vIENvcmUgQXBwU3luYyBzdWJzY3JpcHRpb24gcHVibGlzaGluZyBtZXRob2RzXHJcbiAgICAgIGNhc2UgJ3B1Ymxpc2hNYXRjaEZvdW5kJzpcclxuICAgICAgICByZXR1cm4gdGhpcy5wdWJsaXNoTWF0Y2hGb3VuZChldmVudC5hcmd1bWVudHMgYXMgTWF0Y2hGb3VuZElucHV0KTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ3B1Ymxpc2hWb3RlVXBkYXRlJzpcclxuICAgICAgICByZXR1cm4gdGhpcy5wdWJsaXNoVm90ZVVwZGF0ZShldmVudC5hcmd1bWVudHMgYXMgVm90ZVVwZGF0ZUlucHV0KTtcclxuICAgICAgXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcihgVW5rbm93biByZWFsdGltZSBvcGVyYXRpb246ICR7ZmllbGROYW1lfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUHVibGlzaCBNYXRjaCBGb3VuZCBldmVudCB0byBBcHBTeW5jIHN1YnNjcmlwdGlvbnNcclxuICAgKiBNaWdyYXRlZCBmcm9tIEphdmFTY3JpcHQgYXBwc3luY1B1Ymxpc2hlci5wdWJsaXNoTWF0Y2hGb3VuZEV2ZW50XHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBwdWJsaXNoTWF0Y2hGb3VuZChpbnB1dDogTWF0Y2hGb3VuZElucHV0KTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICB0aGlzLnZhbGlkYXRlQXJnczxNYXRjaEZvdW5kSW5wdXQ+KGlucHV0LCBbJ3Jvb21JZCcsICdtb3ZpZUlkJywgJ21vdmllVGl0bGUnLCAncGFydGljaXBhbnRzJ10pO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmluZm8oYPCfk6EgUHVibGlzaGluZyBFTkhBTkNFRCBtYXRjaCBmb3VuZCBldmVudCBmb3Igcm9vbSAke2lucHV0LnJvb21JZH1gLCB7XHJcbiAgICAgICAgbW92aWVJZDogaW5wdXQubW92aWVJZCxcclxuICAgICAgICBtb3ZpZVRpdGxlOiBpbnB1dC5tb3ZpZVRpdGxlLFxyXG4gICAgICAgIHBhcnRpY2lwYW50Q291bnQ6IGlucHV0LnBhcnRpY2lwYW50cy5sZW5ndGhcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBJTVBPUlRBTlRFOiBTb2xvIG5vdGlmaWNhciBhIHVzdWFyaW9zIHF1ZSB2b3Rhcm9uIExJS0VcclxuICAgICAgY29uc3QgbGlraW5nUGFydGljaXBhbnRzID0gaW5wdXQucGFydGljaXBhbnRzIHx8IFtdO1xyXG4gICAgICBjb25zdCBhbGxQYXJ0aWNpcGFudHMgPSBpbnB1dC5hbGxQYXJ0aWNpcGFudHMgfHwgW107XHJcbiAgICAgIFxyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKGDwn46vIE5vdGlmaWNhbmRvIE1BVENIIGEgJHtsaWtpbmdQYXJ0aWNpcGFudHMubGVuZ3RofSB1c3VhcmlvcyBxdWUgdm90YXJvbiBMSUtFIGRlICR7YWxsUGFydGljaXBhbnRzLmxlbmd0aH0gdG90YWxgKTtcclxuXHJcbiAgICAgIC8vIFB1Ymxpc2ggdG8gQXBwU3luYyBzdWJzY3JpcHRpb24gZm9yIEVOSEFOQ0VEIG1hdGNoIGRpc3BsYXlcclxuICAgICAgY29uc3QgbXV0YXRpb24gPSBgXHJcbiAgICAgICAgbXV0YXRpb24gUHVibGlzaE1hdGNoRm91bmQoJGlucHV0OiBNYXRjaEZvdW5kSW5wdXQhKSB7XHJcbiAgICAgICAgICBwdWJsaXNoTWF0Y2hGb3VuZChpbnB1dDogJGlucHV0KSB7XHJcbiAgICAgICAgICAgIHJvb21JZFxyXG4gICAgICAgICAgICBtb3ZpZUlkXHJcbiAgICAgICAgICAgIG1vdmllVGl0bGVcclxuICAgICAgICAgICAgcGFydGljaXBhbnRzXHJcbiAgICAgICAgICAgIGFsbFBhcnRpY2lwYW50c1xyXG4gICAgICAgICAgICBzaG93RnVsbFNjcmVlblxyXG4gICAgICAgICAgICBtYXRjaFR5cGVcclxuICAgICAgICAgICAgdGltZXN0YW1wXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICBgO1xyXG5cclxuICAgICAgY29uc3QgdmFyaWFibGVzID0ge1xyXG4gICAgICAgIGlucHV0OiB7XHJcbiAgICAgICAgICByb29tSWQ6IGlucHV0LnJvb21JZCxcclxuICAgICAgICAgIG1vdmllSWQ6IGlucHV0Lm1vdmllSWQsXHJcbiAgICAgICAgICBtb3ZpZVRpdGxlOiBpbnB1dC5tb3ZpZVRpdGxlLFxyXG4gICAgICAgICAgcGFydGljaXBhbnRzOiBsaWtpbmdQYXJ0aWNpcGFudHMsIC8vIFNvbG8gdXN1YXJpb3MgcXVlIHZvdGFyb24gTElLRVxyXG4gICAgICAgICAgYWxsUGFydGljaXBhbnRzOiBhbGxQYXJ0aWNpcGFudHMsIC8vIFRvZG9zIGxvcyBwYXJ0aWNpcGFudGVzIHBhcmEgY29udGV4dG9cclxuICAgICAgICAgIHNob3dGdWxsU2NyZWVuOiB0cnVlLCAvLyBNb3N0cmFyIHBhbnRhbGxhIGNvbXBsZXRhIGRlbCBtYXRjaFxyXG4gICAgICAgICAgbWF0Y2hUeXBlOiAnQ09OU0VOU1VTJywgLy8gVGlwbyBkZSBtYXRjaFxyXG4gICAgICAgICAgdm90ZUNvdW50OiBpbnB1dC52b3RlQ291bnQsXHJcbiAgICAgICAgICByZXF1aXJlZFZvdGVzOiBpbnB1dC5yZXF1aXJlZFZvdGVzLFxyXG4gICAgICAgICAgdGltZXN0YW1wOiBpbnB1dC50aW1lc3RhbXBcclxuICAgICAgICB9XHJcbiAgICAgIH07XHJcblxyXG4gICAgICAvLyBFeGVjdXRlIEFwcFN5bmMgbXV0YXRpb24gdG8gdHJpZ2dlciBzdWJzY3JpcHRpb25zXHJcbiAgICAgIGF3YWl0IHRoaXMuZXhlY3V0ZUFwcFN5bmNNdXRhdGlvbihtdXRhdGlvbiwgdmFyaWFibGVzKTtcclxuXHJcbiAgICAgIC8vIENSw41USUNPOiBTb2xvIG5vdGlmaWNhciBhIHVzdWFyaW9zIHF1ZSB2b3Rhcm9uIExJS0VcclxuICAgICAgZm9yIChjb25zdCB1c2VySWQgb2YgbGlraW5nUGFydGljaXBhbnRzKSB7XHJcbiAgICAgICAgdGhpcy5sb2dnZXIuaW5mbyhg8J+OiSBOb3RpZmljYW5kbyBNQVRDSCBDT01QTEVUTyBhIHVzdWFyaW8gJHt1c2VySWR9IHF1ZSB2b3TDsyBMSUtFIGVuIHJvb20gJHtpbnB1dC5yb29tSWR9YCk7XHJcbiAgICAgICAgdGhpcy5sb2dnZXIuaW5mbyhg8J+TuiBVc3VhcmlvICR7dXNlcklkfSB2ZXLDoSBwYW50YWxsYSBjb21wbGV0YSBkZSBtYXRjaCBwYXJhIHBlbMOtY3VsYSBcIiR7aW5wdXQubW92aWVUaXRsZX1cImApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBOb3RpZmljYXIgYSBvdHJvcyB1c3VhcmlvcyAocXVlIG5vIHZvdGFyb24gTElLRSkgc29icmUgZWwgbWF0Y2ggcGVybyBzaW4gcGFudGFsbGEgY29tcGxldGFcclxuICAgICAgY29uc3Qgbm9uTGlraW5nVXNlcnMgPSBhbGxQYXJ0aWNpcGFudHMuZmlsdGVyKHVzZXJJZCA9PiAhbGlraW5nUGFydGljaXBhbnRzLmluY2x1ZGVzKHVzZXJJZCkpO1xyXG4gICAgICBmb3IgKGNvbnN0IHVzZXJJZCBvZiBub25MaWtpbmdVc2Vycykge1xyXG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oYPCfk6IgTm90aWZpY2FuZG8gbWF0Y2ggKHNpbiBwYW50YWxsYSBjb21wbGV0YSkgYSB1c3VhcmlvICR7dXNlcklkfSBxdWUgTk8gdm90w7MgTElLRSBlbiByb29tICR7aW5wdXQucm9vbUlkfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKGDinIUgTWF0Y2ggbm90aWZpY2F0aW9uIHNlbnQ6ICR7bGlraW5nUGFydGljaXBhbnRzLmxlbmd0aH0gRlVMTCBTQ1JFRU4sICR7bm9uTGlraW5nVXNlcnMubGVuZ3RofSBub3RpZmljYXRpb24gb25seWApO1xyXG5cclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihg4p2MIEVycm9yIHB1Ymxpc2hpbmcgZW5oYW5jZWQgbWF0Y2ggZXZlbnQgZm9yIHJvb20gJHtpbnB1dC5yb29tSWR9YCwgZXJyb3IgYXMgRXJyb3IpO1xyXG4gICAgICAvLyBEb24ndCB0aHJvdyAtIG5vdGlmaWNhdGlvbiBmYWlsdXJlIHNob3VsZG4ndCBicmVhayB0aGUgbWF0Y2ggbG9naWNcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUHVibGlzaCBWb3RlIFVwZGF0ZSBldmVudCB0byBBcHBTeW5jIHN1YnNjcmlwdGlvbnNcclxuICAgKiBNaWdyYXRlZCBmcm9tIEphdmFTY3JpcHQgYXBwc3luY1B1Ymxpc2hlci5wdWJsaXNoVm90ZVVwZGF0ZUV2ZW50XHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBwdWJsaXNoVm90ZVVwZGF0ZShpbnB1dDogVm90ZVVwZGF0ZUlucHV0KTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICB0aGlzLnZhbGlkYXRlQXJnczxWb3RlVXBkYXRlSW5wdXQ+KGlucHV0LCBbJ3Jvb21JZCcsICd1c2VySWQnLCAnbW92aWVJZCcsICd2b3RlVHlwZSddKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKGDwn5OhIFB1Ymxpc2hpbmcgdm90ZSB1cGRhdGUgZXZlbnQgZm9yIHJvb20gJHtpbnB1dC5yb29tSWR9YCwge1xyXG4gICAgICAgIHVzZXJJZDogaW5wdXQudXNlcklkLFxyXG4gICAgICAgIG1vdmllSWQ6IGlucHV0Lm1vdmllSWQsXHJcbiAgICAgICAgdm90ZVR5cGU6IGlucHV0LnZvdGVUeXBlLFxyXG4gICAgICAgIGN1cnJlbnRWb3RlczogaW5wdXQuY3VycmVudFZvdGVzLFxyXG4gICAgICAgIHRvdGFsTWVtYmVyczogaW5wdXQudG90YWxNZW1iZXJzXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gR2V0IGFsbCByb29tIG1lbWJlcnMgdG8gbm90aWZ5XHJcbiAgICAgIGNvbnN0IG1lbWJlcnMgPSBhd2FpdCB0aGlzLmdldFJvb21NZW1iZXJzKGlucHV0LnJvb21JZCk7XHJcblxyXG4gICAgICAvLyBCcm9hZGNhc3Qgdm90ZSB1cGRhdGUgdG8gYWxsIHJvb20gbWVtYmVyc1xyXG4gICAgICBmb3IgKGNvbnN0IG1lbWJlciBvZiBtZW1iZXJzKSB7XHJcbiAgICAgICAgaWYgKG1lbWJlci51c2VySWQgIT09IGlucHV0LnVzZXJJZCkgeyAvLyBEb24ndCBub3RpZnkgdGhlIHZvdGVyXHJcbiAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKGDwn5OhIE5vdGlmeWluZyB1c2VyICR7bWVtYmVyLnVzZXJJZH0gb2Ygdm90ZSB1cGRhdGUgaW4gcm9vbSAke2lucHV0LnJvb21JZH1gKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFByZXBhcmUgQXBwU3luYyBtdXRhdGlvbiBmb3Igdm90ZSB1cGRhdGVcclxuICAgICAgY29uc3QgbXV0YXRpb24gPSBgXHJcbiAgICAgICAgbXV0YXRpb24gUHVibGlzaFZvdGVVcGRhdGUoJGlucHV0OiBWb3RlVXBkYXRlSW5wdXQhKSB7XHJcbiAgICAgICAgICBwdWJsaXNoVm90ZVVwZGF0ZShpbnB1dDogJGlucHV0KSB7XHJcbiAgICAgICAgICAgIHJvb21JZFxyXG4gICAgICAgICAgICB1c2VySWRcclxuICAgICAgICAgICAgbW92aWVJZFxyXG4gICAgICAgICAgICB2b3RlVHlwZVxyXG4gICAgICAgICAgICBjdXJyZW50Vm90ZXNcclxuICAgICAgICAgICAgdG90YWxNZW1iZXJzXHJcbiAgICAgICAgICAgIHRpbWVzdGFtcFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgYDtcclxuXHJcbiAgICAgIGNvbnN0IHZhcmlhYmxlcyA9IHtcclxuICAgICAgICBpbnB1dDoge1xyXG4gICAgICAgICAgLi4uaW5wdXQsXHJcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxyXG4gICAgICAgIH1cclxuICAgICAgfTtcclxuXHJcbiAgICAgIC8vIEV4ZWN1dGUgQXBwU3luYyBtdXRhdGlvbiB0byB0cmlnZ2VyIHN1YnNjcmlwdGlvbnNcclxuICAgICAgYXdhaXQgdGhpcy5leGVjdXRlQXBwU3luY011dGF0aW9uKG11dGF0aW9uLCB2YXJpYWJsZXMpO1xyXG5cclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihg4p2MIEVycm9yIHB1Ymxpc2hpbmcgdm90ZSB1cGRhdGUgZm9yIHJvb20gJHtpbnB1dC5yb29tSWR9YCwgZXJyb3IgYXMgRXJyb3IpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFeGVjdXRlIEFwcFN5bmMgbXV0YXRpb24gdG8gdHJpZ2dlciBzdWJzY3JpcHRpb25zXHJcbiAgICogTWlncmF0ZWQgZnJvbSBKYXZhU2NyaXB0IHB1Ymxpc2hUb1Jvb21TdWJzY3JpYmVycyBmdW5jdGlvblxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUFwcFN5bmNNdXRhdGlvbihtdXRhdGlvbjogc3RyaW5nLCB2YXJpYWJsZXM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgZW5kcG9pbnQgPSB0aGlzLmNvbmZpZy5hcHBTeW5jPy5lbmRwb2ludDtcclxuICAgIGNvbnN0IGFwaUtleSA9IHRoaXMuY29uZmlnLmFwcFN5bmM/LmFwaUtleTtcclxuXHJcbiAgICBpZiAoIWVuZHBvaW50KSB7XHJcbiAgICAgIHRoaXMubG9nZ2VyLndhcm4oJ+KaoO+4jyBBUFBTWU5DX0VORFBPSU5UIG5vdCBkZWZpbmVkLCBjYW5ub3QgcHVibGlzaCBldmVudCcpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChlbmRwb2ludCwge1xyXG4gICAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgICAneC1hcGkta2V5JzogYXBpS2V5IHx8ICcnLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgcXVlcnk6IG11dGF0aW9uLFxyXG4gICAgICAgICAgdmFyaWFibGVzXHJcbiAgICAgICAgfSlcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBcHBTeW5jIHJlcXVlc3QgZmFpbGVkOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCByZXN1bHQ6IGFueSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcclxuICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcign4p2MIEFwcFN5bmMgUHVibGlzaCBFcnJvcjonLCBuZXcgRXJyb3IoSlNPTi5zdHJpbmdpZnkocmVzdWx0LmVycm9ycykpKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKGDinIUgRXZlbnQgcHVibGlzaGVkIHN1Y2Nlc3NmdWxseSB0byAke2VuZHBvaW50fWApO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcign4p2MIEVycm9yIHB1Ymxpc2hpbmcgdG8gQXBwU3luYzonLCBlcnJvciBhcyBFcnJvcik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGFsbCBhY3RpdmUgbWVtYmVycyBvZiBhIHJvb21cclxuICAgKiBNaWdyYXRlZCBmcm9tIEphdmFTY3JpcHQgZ2V0Um9vbU1lbWJlcnMgZnVuY3Rpb25cclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGdldFJvb21NZW1iZXJzKHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTxBcnJheTx7IHVzZXJJZDogc3RyaW5nOyBpc0FjdGl2ZTogYm9vbGVhbiB9Pj4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYi5xdWVyeTx7IHVzZXJJZDogc3RyaW5nOyBpc0FjdGl2ZTogYm9vbGVhbiB9PihcclxuICAgICAgICB0aGlzLmNvbmZpZy50YWJsZXMucm9vbU1lbWJlcnMsXHJcbiAgICAgICAgJ3Jvb21JZCA9IDpyb29tSWQnLFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGZpbHRlckV4cHJlc3Npb246ICdpc0FjdGl2ZSA9IDphY3RpdmUnLFxyXG4gICAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgICAnOnJvb21JZCc6IHJvb21JZCxcclxuICAgICAgICAgICAgJzphY3RpdmUnOiB0cnVlXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICApO1xyXG5cclxuICAgICAgcmV0dXJuIHJlc3VsdC5pdGVtcztcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGDinYwgRXJyb3IgZ2V0dGluZyByb29tIG1lbWJlcnMgZm9yICR7cm9vbUlkfWAsIGVycm9yIGFzIEVycm9yKTtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IG1vdmllIHRpdGxlIGZvciBub3RpZmljYXRpb25zXHJcbiAgICogTWlncmF0ZWQgZnJvbSBKYXZhU2NyaXB0IGFwcHN5bmNQdWJsaXNoZXIuZ2V0TW92aWVUaXRsZVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZ2V0TW92aWVUaXRsZShtb3ZpZUlkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgdGhpcy5sb2dnZXIuaW5mbyhg8J+OrCBHZXR0aW5nIG1vdmllIHRpdGxlIGZvciAke21vdmllSWR9YCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBUcnkgdG8gZ2V0IGZyb20gY2FjaGUgZmlyc3RcclxuICAgICAgY29uc3QgY2FjaGVkTW92aWUgPSBhd2FpdCB0aGlzLmRiLmdldChcclxuICAgICAgICB0aGlzLmNvbmZpZy50YWJsZXMubW92aWVzQ2FjaGUsXHJcbiAgICAgICAgeyB0bWRiSWQ6IGBtb3ZpZV9kZXRhaWxzXyR7bW92aWVJZH1gIH1cclxuICAgICAgKTtcclxuXHJcbiAgICAgIGlmIChjYWNoZWRNb3ZpZT8ubW92aWVEZXRhaWxzPy50aXRsZSkge1xyXG4gICAgICAgIHJldHVybiBjYWNoZWRNb3ZpZS5tb3ZpZURldGFpbHMudGl0bGU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEZhbGxiYWNrIHRvIGdlbmVyaWMgdGl0bGVcclxuICAgICAgcmV0dXJuIGBNb3ZpZSAke21vdmllSWR9YDtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nZ2VyLndhcm4oYOKaoO+4jyBFcnJvciBnZXR0aW5nIG1vdmllIHRpdGxlIGZvciAke21vdmllSWR9YCwgeyBlcnJvcjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pO1xyXG4gICAgICByZXR1cm4gYE1vdmllICR7bW92aWVJZH1gO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSGFuZGxlIHVzZXIgY29ubmVjdGlvbiB0byByZWFsLXRpbWUgc3Vic2NyaXB0aW9uc1xyXG4gICAqIE1hbmFnZXMgY29ubmVjdGlvbiBzdGF0ZSBpbiBEeW5hbW9EQiBmb3Igc3Vic2NyaXB0aW9uIHRhcmdldGluZ1xyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgY29ubmVjdChhcmdzOiBDb25uZWN0QXJncyk6IFByb21pc2U8Q29ubmVjdGlvbj4ge1xyXG4gICAgdGhpcy52YWxpZGF0ZUFyZ3M8Q29ubmVjdEFyZ3M+KGFyZ3MsIFsndXNlcklkJ10pO1xyXG5cclxuICAgIGNvbnN0IGNvbm5lY3Rpb25JZCA9IEhhbmRsZXJVdGlscy5nZW5lcmF0ZUlkKCk7XHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcblxyXG4gICAgY29uc3QgY29ubmVjdGlvbjogQ29ubmVjdGlvbiA9IHtcclxuICAgICAgY29ubmVjdGlvbklkLFxyXG4gICAgICB1c2VySWQ6IGFyZ3MudXNlcklkLFxyXG4gICAgICByb29tSWQ6IGFyZ3Mucm9vbUlkLFxyXG4gICAgICBjb25uZWN0ZWRBdDogbm93LFxyXG4gICAgICBsYXN0UGluZ0F0OiBub3csXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBTdG9yZSBjb25uZWN0aW9uIGZvciBzdWJzY3JpcHRpb24gdGFyZ2V0aW5nXHJcbiAgICBhd2FpdCB0aGlzLmRiLnB1dCh0aGlzLmNvbmZpZy50YWJsZXMuY29ubmVjdGlvbnMsIGNvbm5lY3Rpb24pO1xyXG5cclxuICAgIHRoaXMubG9nZ2VyLmluZm8oJ+KchSBSZWFsLXRpbWUgY29ubmVjdGlvbiBlc3RhYmxpc2hlZCcsIHsgXHJcbiAgICAgIGNvbm5lY3Rpb25JZCwgXHJcbiAgICAgIHVzZXJJZDogYXJncy51c2VySWQsXHJcbiAgICAgIHJvb21JZDogYXJncy5yb29tSWQgXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBJZiBqb2luaW5nIGEgcm9vbSwgbm90aWZ5IG90aGVyIHJvb20gbWVtYmVycyB2aWEgQXBwU3luYyBzdWJzY3JpcHRpb25cclxuICAgIGlmIChhcmdzLnJvb21JZCkge1xyXG4gICAgICBhd2FpdCB0aGlzLnB1Ymxpc2hWb3RlVXBkYXRlKHtcclxuICAgICAgICByb29tSWQ6IGFyZ3Mucm9vbUlkLFxyXG4gICAgICAgIHVzZXJJZDogYXJncy51c2VySWQsXHJcbiAgICAgICAgbW92aWVJZDogJ2Nvbm5lY3Rpb25fZXZlbnQnLFxyXG4gICAgICAgIHZvdGVUeXBlOiAnTElLRScsIC8vIER1bW15IHZhbHVlIGZvciBjb25uZWN0aW9uIGV2ZW50XHJcbiAgICAgICAgY3VycmVudFZvdGVzOiAwLFxyXG4gICAgICAgIHRvdGFsTWVtYmVyczogMFxyXG4gICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gY29ubmVjdGlvbjtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEhhbmRsZSB1c2VyIGRpc2Nvbm5lY3Rpb24gZnJvbSByZWFsLXRpbWUgc3Vic2NyaXB0aW9uc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZGlzY29ubmVjdChhcmdzOiBEaXNjb25uZWN0QXJncyk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgdGhpcy52YWxpZGF0ZUFyZ3M8RGlzY29ubmVjdEFyZ3M+KGFyZ3MsIFsnY29ubmVjdGlvbklkJ10pO1xyXG5cclxuICAgIC8vIEdldCBjb25uZWN0aW9uIGRldGFpbHNcclxuICAgIGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLmRiLmdldDxDb25uZWN0aW9uPihcclxuICAgICAgdGhpcy5jb25maWcudGFibGVzLmNvbm5lY3Rpb25zLFxyXG4gICAgICB7IGNvbm5lY3Rpb25JZDogYXJncy5jb25uZWN0aW9uSWQgfVxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoIWNvbm5lY3Rpb24pIHtcclxuICAgICAgdGhpcy5sb2dnZXIud2Fybign4pqg77iPIENvbm5lY3Rpb24gbm90IGZvdW5kIGZvciBkaXNjb25uZWN0JywgeyBjb25uZWN0aW9uSWQ6IGFyZ3MuY29ubmVjdGlvbklkIH0pO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gTWFyayBjb25uZWN0aW9uIGFzIGluYWN0aXZlXHJcbiAgICBhd2FpdCB0aGlzLmRiLnVwZGF0ZShcclxuICAgICAgdGhpcy5jb25maWcudGFibGVzLmNvbm5lY3Rpb25zLFxyXG4gICAgICB7IGNvbm5lY3Rpb25JZDogYXJncy5jb25uZWN0aW9uSWQgfSxcclxuICAgICAgJ1NFVCAjaXNBY3RpdmUgPSA6ZmFsc2UsICNsYXN0UGluZ0F0ID0gOnRpbWVzdGFtcCcsXHJcbiAgICAgIHtcclxuICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHtcclxuICAgICAgICAgICcjaXNBY3RpdmUnOiAnaXNBY3RpdmUnLFxyXG4gICAgICAgICAgJyNsYXN0UGluZ0F0JzogJ2xhc3RQaW5nQXQnLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzpmYWxzZSc6IGZhbHNlLFxyXG4gICAgICAgICAgJzp0aW1lc3RhbXAnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKCfinIUgUmVhbC10aW1lIGNvbm5lY3Rpb24gZGlzY29ubmVjdGVkJywgeyBcclxuICAgICAgY29ubmVjdGlvbklkOiBhcmdzLmNvbm5lY3Rpb25JZCxcclxuICAgICAgdXNlcklkOiBjb25uZWN0aW9uLnVzZXJJZCxcclxuICAgICAgcm9vbUlkOiBjb25uZWN0aW9uLnJvb21JZCBcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIElmIHVzZXIgd2FzIGluIGEgcm9vbSwgbm90aWZ5IG90aGVyIHJvb20gbWVtYmVycyB2aWEgQXBwU3luYyBzdWJzY3JpcHRpb25cclxuICAgIGlmIChjb25uZWN0aW9uLnJvb21JZCkge1xyXG4gICAgICBhd2FpdCB0aGlzLnB1Ymxpc2hWb3RlVXBkYXRlKHtcclxuICAgICAgICByb29tSWQ6IGNvbm5lY3Rpb24ucm9vbUlkLFxyXG4gICAgICAgIHVzZXJJZDogY29ubmVjdGlvbi51c2VySWQsXHJcbiAgICAgICAgbW92aWVJZDogJ2Rpc2Nvbm5lY3Rpb25fZXZlbnQnLFxyXG4gICAgICAgIHZvdGVUeXBlOiAnTElLRScsIC8vIER1bW15IHZhbHVlIGZvciBkaXNjb25uZWN0aW9uIGV2ZW50XHJcbiAgICAgICAgY3VycmVudFZvdGVzOiAwLFxyXG4gICAgICAgIHRvdGFsTWVtYmVyczogMFxyXG4gICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNlbmQgbm90aWZpY2F0aW9uIHRvIHJvb20gbWVtYmVycyB2aWEgQXBwU3luYyBzdWJzY3JpcHRpb25zXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBzZW5kTm90aWZpY2F0aW9uKGFyZ3M6IFNlbmROb3RpZmljYXRpb25BcmdzKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICB0aGlzLnZhbGlkYXRlQXJnczxTZW5kTm90aWZpY2F0aW9uQXJncz4oYXJncywgWydyb29tSWQnLCAndHlwZScsICdkYXRhJ10pO1xyXG5cclxuICAgIGNvbnN0IG5vdGlmaWNhdGlvbjogTm90aWZpY2F0aW9uUGF5bG9hZCA9IHtcclxuICAgICAgdHlwZTogYXJncy50eXBlIGFzIGFueSxcclxuICAgICAgcm9vbUlkOiBhcmdzLnJvb21JZCxcclxuICAgICAgZGF0YTogYXJncy5kYXRhLFxyXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgIH07XHJcblxyXG4gICAgLy8gVXNlIEFwcFN5bmMgc3Vic2NyaXB0aW9uIHB1Ymxpc2hpbmcgYmFzZWQgb24gbm90aWZpY2F0aW9uIHR5cGVcclxuICAgIGlmIChhcmdzLnR5cGUgPT09ICdNQVRDSF9GT1VORCcgJiYgYXJncy5kYXRhLm1vdmllSWQgJiYgYXJncy5kYXRhLm1vdmllVGl0bGUpIHtcclxuICAgICAgYXdhaXQgdGhpcy5wdWJsaXNoTWF0Y2hGb3VuZCh7XHJcbiAgICAgICAgcm9vbUlkOiBhcmdzLnJvb21JZCxcclxuICAgICAgICBtb3ZpZUlkOiBhcmdzLmRhdGEubW92aWVJZCxcclxuICAgICAgICBtb3ZpZVRpdGxlOiBhcmdzLmRhdGEubW92aWVUaXRsZSxcclxuICAgICAgICBwYXJ0aWNpcGFudHM6IGFyZ3MuZGF0YS5wYXJ0aWNpcGFudHMgfHwgW10sXHJcbiAgICAgICAgYWxsUGFydGljaXBhbnRzOiBhcmdzLmRhdGEuYWxsUGFydGljaXBhbnRzIHx8IFtdLFxyXG4gICAgICAgIHNob3dGdWxsU2NyZWVuOiB0cnVlLFxyXG4gICAgICAgIG1hdGNoVHlwZTogJ0NPTlNFTlNVUycsXHJcbiAgICAgICAgdm90ZUNvdW50OiBhcmdzLmRhdGEudm90ZUNvdW50LFxyXG4gICAgICAgIHJlcXVpcmVkVm90ZXM6IGFyZ3MuZGF0YS5yZXF1aXJlZFZvdGVzLFxyXG4gICAgICAgIHRpbWVzdGFtcDogbm90aWZpY2F0aW9uLnRpbWVzdGFtcFxyXG4gICAgICB9KTtcclxuICAgIH0gZWxzZSBpZiAoYXJncy50eXBlID09PSAnVk9URV9DQVNUJyAmJiBhcmdzLmRhdGEudXNlcklkICYmIGFyZ3MuZGF0YS5tb3ZpZUlkKSB7XHJcbiAgICAgIGF3YWl0IHRoaXMucHVibGlzaFZvdGVVcGRhdGUoe1xyXG4gICAgICAgIHJvb21JZDogYXJncy5yb29tSWQsXHJcbiAgICAgICAgdXNlcklkOiBhcmdzLmRhdGEudXNlcklkLFxyXG4gICAgICAgIG1vdmllSWQ6IGFyZ3MuZGF0YS5tb3ZpZUlkLFxyXG4gICAgICAgIHZvdGVUeXBlOiBhcmdzLmRhdGEudm90ZVR5cGUgfHwgJ0xJS0UnLFxyXG4gICAgICAgIGN1cnJlbnRWb3RlczogYXJncy5kYXRhLmN1cnJlbnRWb3RlcyB8fCAwLFxyXG4gICAgICAgIHRvdGFsTWVtYmVyczogYXJncy5kYXRhLnRvdGFsTWVtYmVycyB8fCAwXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMubG9nZ2VyLmluZm8oJ+KchSBOb3RpZmljYXRpb24gc2VudCB0byByb29tIHZpYSBBcHBTeW5jJywgeyBcclxuICAgICAgcm9vbUlkOiBhcmdzLnJvb21JZCwgXHJcbiAgICAgIHR5cGU6IGFyZ3MudHlwZSxcclxuICAgICAgZXhjbHVkZVVzZXJJZDogYXJncy5leGNsdWRlVXNlcklkIFxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBKb2luIGEgcm9vbSAodXBkYXRlIGV4aXN0aW5nIGNvbm5lY3Rpb24pXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBqb2luUm9vbShhcmdzOiBKb2luUm9vbUFyZ3MpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIHRoaXMudmFsaWRhdGVBcmdzPEpvaW5Sb29tQXJncz4oYXJncywgWydjb25uZWN0aW9uSWQnLCAncm9vbUlkJ10pO1xyXG5cclxuICAgIC8vIFVwZGF0ZSBjb25uZWN0aW9uIHdpdGggcm9vbSBJRFxyXG4gICAgY29uc3QgdXBkYXRlZENvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLmRiLnVwZGF0ZTxDb25uZWN0aW9uPihcclxuICAgICAgdGhpcy5jb25maWcudGFibGVzLmNvbm5lY3Rpb25zLFxyXG4gICAgICB7IGNvbm5lY3Rpb25JZDogYXJncy5jb25uZWN0aW9uSWQgfSxcclxuICAgICAgJ1NFVCAjcm9vbUlkID0gOnJvb21JZCwgI2xhc3RQaW5nQXQgPSA6dGltZXN0YW1wJyxcclxuICAgICAge1xyXG4gICAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczoge1xyXG4gICAgICAgICAgJyNyb29tSWQnOiAncm9vbUlkJyxcclxuICAgICAgICAgICcjbGFzdFBpbmdBdCc6ICdsYXN0UGluZ0F0JyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICc6cm9vbUlkJzogYXJncy5yb29tSWQsXHJcbiAgICAgICAgICAnOnRpbWVzdGFtcCc6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHJldHVyblZhbHVlczogJ0FMTF9ORVcnLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIGlmICghdXBkYXRlZENvbm5lY3Rpb24pIHtcclxuICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcignQ29ubmVjdGlvbiBub3QgZm91bmQnKTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKCfinIUgQ29ubmVjdGlvbiBqb2luZWQgcm9vbScsIHsgXHJcbiAgICAgIGNvbm5lY3Rpb25JZDogYXJncy5jb25uZWN0aW9uSWQsXHJcbiAgICAgIHJvb21JZDogYXJncy5yb29tSWQsXHJcbiAgICAgIHVzZXJJZDogdXBkYXRlZENvbm5lY3Rpb24udXNlcklkIFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gTm90aWZ5IG90aGVyIHJvb20gbWVtYmVycyB2aWEgQXBwU3luYyBzdWJzY3JpcHRpb25cclxuICAgIGF3YWl0IHRoaXMucHVibGlzaFZvdGVVcGRhdGUoe1xyXG4gICAgICByb29tSWQ6IGFyZ3Mucm9vbUlkLFxyXG4gICAgICB1c2VySWQ6IHVwZGF0ZWRDb25uZWN0aW9uLnVzZXJJZCxcclxuICAgICAgbW92aWVJZDogJ3VzZXJfam9pbmVkX2V2ZW50JyxcclxuICAgICAgdm90ZVR5cGU6ICdMSUtFJywgLy8gRHVtbXkgdmFsdWUgZm9yIGpvaW4gZXZlbnRcclxuICAgICAgY3VycmVudFZvdGVzOiAwLFxyXG4gICAgICB0b3RhbE1lbWJlcnM6IDBcclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTGVhdmUgYSByb29tICh1cGRhdGUgZXhpc3RpbmcgY29ubmVjdGlvbilcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGxlYXZlUm9vbShhcmdzOiBMZWF2ZVJvb21BcmdzKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICB0aGlzLnZhbGlkYXRlQXJnczxMZWF2ZVJvb21BcmdzPihhcmdzLCBbJ2Nvbm5lY3Rpb25JZCcsICdyb29tSWQnXSk7XHJcblxyXG4gICAgLy8gR2V0IGNvbm5lY3Rpb24gZGV0YWlscyBiZWZvcmUgdXBkYXRlXHJcbiAgICBjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy5kYi5nZXQ8Q29ubmVjdGlvbj4oXHJcbiAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5jb25uZWN0aW9ucyxcclxuICAgICAgeyBjb25uZWN0aW9uSWQ6IGFyZ3MuY29ubmVjdGlvbklkIH1cclxuICAgICk7XHJcblxyXG4gICAgaWYgKCFjb25uZWN0aW9uKSB7XHJcbiAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoJ0Nvbm5lY3Rpb24gbm90IGZvdW5kJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmVtb3ZlIHJvb20gSUQgZnJvbSBjb25uZWN0aW9uXHJcbiAgICBhd2FpdCB0aGlzLmRiLnVwZGF0ZShcclxuICAgICAgdGhpcy5jb25maWcudGFibGVzLmNvbm5lY3Rpb25zLFxyXG4gICAgICB7IGNvbm5lY3Rpb25JZDogYXJncy5jb25uZWN0aW9uSWQgfSxcclxuICAgICAgJ1JFTU9WRSAjcm9vbUlkIFNFVCAjbGFzdFBpbmdBdCA9IDp0aW1lc3RhbXAnLFxyXG4gICAgICB7XHJcbiAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7XHJcbiAgICAgICAgICAnI3Jvb21JZCc6ICdyb29tSWQnLFxyXG4gICAgICAgICAgJyNsYXN0UGluZ0F0JzogJ2xhc3RQaW5nQXQnLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzp0aW1lc3RhbXAnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKCfinIUgQ29ubmVjdGlvbiBsZWZ0IHJvb20nLCB7IFxyXG4gICAgICBjb25uZWN0aW9uSWQ6IGFyZ3MuY29ubmVjdGlvbklkLFxyXG4gICAgICByb29tSWQ6IGFyZ3Mucm9vbUlkLFxyXG4gICAgICB1c2VySWQ6IGNvbm5lY3Rpb24udXNlcklkIFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gTm90aWZ5IG90aGVyIHJvb20gbWVtYmVycyB2aWEgQXBwU3luYyBzdWJzY3JpcHRpb25cclxuICAgIGF3YWl0IHRoaXMucHVibGlzaFZvdGVVcGRhdGUoe1xyXG4gICAgICByb29tSWQ6IGFyZ3Mucm9vbUlkLFxyXG4gICAgICB1c2VySWQ6IGNvbm5lY3Rpb24udXNlcklkLFxyXG4gICAgICBtb3ZpZUlkOiAndXNlcl9sZWZ0X2V2ZW50JyxcclxuICAgICAgdm90ZVR5cGU6ICdMSUtFJywgLy8gRHVtbXkgdmFsdWUgZm9yIGxlYXZlIGV2ZW50XHJcbiAgICAgIGN1cnJlbnRWb3RlczogMCxcclxuICAgICAgdG90YWxNZW1iZXJzOiAwXHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBhY3RpdmUgY29ubmVjdGlvbnMgKG9wdGlvbmFsbHkgZmlsdGVyZWQgYnkgcm9vbSlcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGdldEFjdGl2ZUNvbm5lY3Rpb25zKGFyZ3M6IHsgcm9vbUlkPzogc3RyaW5nIH0pOiBQcm9taXNlPENvbm5lY3Rpb25bXT4ge1xyXG4gICAgaWYgKGFyZ3Mucm9vbUlkKSB7XHJcbiAgICAgIC8vIEdldCBjb25uZWN0aW9ucyBmb3Igc3BlY2lmaWMgcm9vbVxyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRiLnF1ZXJ5PENvbm5lY3Rpb24+KFxyXG4gICAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5jb25uZWN0aW9ucyxcclxuICAgICAgICAncm9vbUlkID0gOnJvb21JZCcsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaW5kZXhOYW1lOiAnUm9vbUlkSW5kZXgnLFxyXG4gICAgICAgICAgZmlsdGVyRXhwcmVzc2lvbjogJ2lzQWN0aXZlID0gOmFjdGl2ZScsXHJcbiAgICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAgICc6cm9vbUlkJzogYXJncy5yb29tSWQsXHJcbiAgICAgICAgICAgICc6YWN0aXZlJzogdHJ1ZSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfVxyXG4gICAgICApO1xyXG5cclxuICAgICAgcmV0dXJuIHJlc3VsdC5pdGVtcztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIEdldCBhbGwgYWN0aXZlIGNvbm5lY3Rpb25zXHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGIuc2NhbjxDb25uZWN0aW9uPihcclxuICAgICAgICB0aGlzLmNvbmZpZy50YWJsZXMuY29ubmVjdGlvbnMsXHJcbiAgICAgICAgJ2lzQWN0aXZlID0gOmFjdGl2ZScsXHJcbiAgICAgICAgeyAnOmFjdGl2ZSc6ICd0cnVlJyB9IC8vIFVzZSBzdHJpbmcgaW5zdGVhZCBvZiBib29sZWFuIGZvciBEeW5hbW9EQlxyXG4gICAgICApO1xyXG5cclxuICAgICAgcmV0dXJuIHJlc3VsdC5pdGVtcztcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFBpbmcgY29ubmVjdGlvbiB0byBrZWVwIGl0IGFsaXZlXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBwaW5nQ29ubmVjdGlvbihhcmdzOiB7IGNvbm5lY3Rpb25JZDogc3RyaW5nIH0pOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIHRoaXMudmFsaWRhdGVBcmdzPHsgY29ubmVjdGlvbklkOiBzdHJpbmcgfT4oYXJncywgWydjb25uZWN0aW9uSWQnXSk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5kYi51cGRhdGUoXHJcbiAgICAgICAgdGhpcy5jb25maWcudGFibGVzLmNvbm5lY3Rpb25zLFxyXG4gICAgICAgIHsgY29ubmVjdGlvbklkOiBhcmdzLmNvbm5lY3Rpb25JZCB9LFxyXG4gICAgICAgICdTRVQgI2xhc3RQaW5nQXQgPSA6dGltZXN0YW1wJyxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHtcclxuICAgICAgICAgICAgJyNsYXN0UGluZ0F0JzogJ2xhc3RQaW5nQXQnLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICAgJzp0aW1lc3RhbXAnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH1cclxuICAgICAgKTtcclxuXHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5sb2dnZXIud2Fybign4pqg77iPIEZhaWxlZCB0byBwaW5nIGNvbm5lY3Rpb24nLCB7IGNvbm5lY3Rpb25JZDogYXJncy5jb25uZWN0aW9uSWQgfSk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIEV4cG9ydCB0aGUgaGFuZGxlclxyXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoUmVhbHRpbWVIYW5kbGVyKTsiXX0=