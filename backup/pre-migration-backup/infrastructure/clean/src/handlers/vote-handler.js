"use strict";
/**
 * Trinity Vote Handler
 * Handles individual voting and match detection logic
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const base_handler_1 = require("./base-handler");
const types_1 = require("../shared/types");
const base_handler_2 = require("./base-handler");
class VoteHandler extends base_handler_1.BaseHandler {
    async handle(event) {
        const { fieldName } = base_handler_2.HandlerUtils.getOperationInfo(event);
        const { userId } = base_handler_2.HandlerUtils.getUserInfo(event);
        this.logger.info(`🗳️ Vote operation: ${fieldName}`, { userId, fieldName });
        switch (fieldName) {
            case 'vote':
                return this.voteForMovie(event.arguments, userId);
            case 'getUserVotes':
                return this.getUserVotes(event.arguments, userId);
            case 'getRoomVotes':
                return this.getRoomVotes(event.arguments, userId);
            case 'checkMatch':
                return this.checkMatch(event.arguments, userId);
            case 'getUserVoteProgress':
                return this.getUserVoteProgress(event.arguments, userId);
            default:
                throw new types_1.ValidationError(`Unknown vote operation: ${fieldName}`);
        }
    }
    /**
     * Vote for a movie and check for matches (matching existing processVote logic)
     */
    async voteForMovie(args, userId) {
        // Validate required fields
        this.validateArgs(args, ['roomId', 'movieId', 'voteType']);
        this.logger.info(`🗳️ Procesando voto: Usuario ${userId}, Sala ${args.roomId}, Película ${args.movieId}, Tipo: ${args.voteType}`);
        // 1. Verificar que la sala existe y está ACTIVE/WAITING
        const room = await this.getRoomAndValidate(args.roomId);
        // 2. Verificar que el usuario es miembro de la sala
        await this.validateUserMembership(userId, args.roomId);
        // 3. Registrar que la película ha sido mostrada (INDIFERENTE del tipo de voto)
        await this.trackShownMovie(args.roomId, args.movieId);
        // 4. Solo procesar votos LIKE - ignorar DISLIKE según algoritmo Stop-on-Match
        if (args.voteType !== 'LIKE') {
            this.logger.info(`⏭️ Ignorando voto ${args.voteType} según algoritmo Stop-on-Match`);
            return {
                vote: {
                    roomId: args.roomId,
                    userId,
                    movieId: args.movieId,
                    voteType: args.voteType,
                    votedAt: new Date().toISOString(),
                },
            };
        }
        // 5. Prevenir votos duplicados del mismo usuario para la misma película
        await this.preventDuplicateVote(userId, args.roomId, args.movieId);
        // 6. Incrementar contador atómico en VotesTable
        const currentVotes = await this.incrementVoteCount(args.roomId, args.movieId);
        // 7. Obtener maxMembers de la sala (no miembros activos actuales)
        const totalMembers = room.maxMembers || 2; // Fallback a 2 si no está definido
        this.logger.info(`📊 Votos actuales: ${currentVotes}, Miembros requeridos: ${totalMembers}`);
        // Create vote object
        const now = new Date().toISOString();
        const vote = {
            roomId: args.roomId,
            userId,
            movieId: args.movieId,
            voteType: args.voteType,
            votedAt: now,
        };
        // 8. Verificar si se alcanzó el consenso (Stop-on-Match)
        let match;
        if (currentVotes >= totalMembers) {
            this.logger.info('🎉 ¡Match encontrado! Actualizando sala y notificando...');
            // Actualizar sala con resultado
            await this.updateRoomWithMatch(args.roomId, args.movieId);
            // Create match record
            match = {
                roomId: args.roomId,
                movieId: args.movieId,
                votes: currentVotes,
                matchedAt: now,
                createdAt: now,
                updatedAt: now,
            };
            await this.db.put(this.config.tables.roomMatches, match);
            this.logger.info('🎯 New match created', { roomId: args.roomId, movieId: args.movieId, votes: currentVotes });
        }
        return { vote, match };
    }
    /**
     * Get user's votes for a room
     */
    async getUserVotes(args, userId) {
        this.validateArgs(args, ['roomId']);
        // Validate user has access to room
        const hasAccess = await base_handler_2.HandlerUtils.validateRoomAccess(this.db, userId, args.roomId, this.config);
        if (!hasAccess) {
            throw new types_1.UnauthorizedError('Access denied to room');
        }
        // Get user's votes for this room
        const votes = await this.db.query(this.config.tables.votes, 'roomId = :roomId AND userId = :userId', {
            indexName: 'RoomUserIndex',
            expressionAttributeValues: {
                ':roomId': args.roomId,
                ':userId': userId,
            },
        });
        return votes.items;
    }
    /**
     * Get all votes for a room (or specific movie)
     */
    async getRoomVotes(args, userId) {
        this.validateArgs(args, ['roomId']);
        // Validate user has access to room
        const hasAccess = await base_handler_2.HandlerUtils.validateRoomAccess(this.db, userId, args.roomId, this.config);
        if (!hasAccess) {
            throw new types_1.UnauthorizedError('Access denied to room');
        }
        let votes;
        if (args.movieId) {
            // Get votes for specific movie
            votes = await this.db.query(this.config.tables.votes, 'roomId = :roomId AND movieId = :movieId', {
                indexName: 'RoomMovieIndex',
                expressionAttributeValues: {
                    ':roomId': args.roomId,
                    ':movieId': args.movieId,
                },
            });
        }
        else {
            // Get all votes for room
            votes = await this.db.query(this.config.tables.votes, 'roomId = :roomId', {
                expressionAttributeValues: {
                    ':roomId': args.roomId,
                },
            });
        }
        return votes.items;
    }
    /**
     * Check for matches in a room
     */
    async checkMatch(args, userId) {
        this.validateArgs(args, ['roomId']);
        // Validate user has access to room
        const hasAccess = await base_handler_2.HandlerUtils.validateRoomAccess(this.db, userId, args.roomId, this.config);
        if (!hasAccess) {
            throw new types_1.UnauthorizedError('Access denied to room');
        }
        // Get room details
        const room = await this.db.get(this.config.tables.rooms, { id: args.roomId });
        if (!room || !room.isActive) {
            throw new types_1.NotFoundError('Room');
        }
        // Check if room already has a match
        if (room.status === 'MATCHED' && room.resultMovieId) {
            const existingMatch = await this.db.get(this.config.tables.roomMatches, { roomId: args.roomId, movieId: room.resultMovieId });
            return existingMatch;
        }
        // Check all movies for potential matches
        const roomMovies = await this.db.query(this.config.tables.roomMovieCache, 'roomId = :roomId', {
            expressionAttributeValues: { ':roomId': args.roomId },
        });
        for (const movie of roomMovies.items) {
            const match = await this.checkForMatch(args.roomId, movie.movieId, room.maxMembers);
            if (match) {
                return match;
            }
        }
        return null;
    }
    /**
     * Get user's voting progress in a room
     */
    async getUserVoteProgress(args, userId) {
        // Validate user has access to room
        const hasAccess = await base_handler_2.HandlerUtils.validateRoomAccess(this.db, userId, args.roomId, this.config);
        if (!hasAccess) {
            throw new types_1.UnauthorizedError('Access denied to room');
        }
        // Get total movies in room cache
        const roomMovies = await this.db.query(this.config.tables.roomMovieCache, 'roomId = :roomId', {
            expressionAttributeValues: { ':roomId': args.roomId },
        });
        const totalMovies = roomMovies.count;
        // Get user's votes for this room
        const userVotes = await this.getUserVotes({ roomId: args.roomId }, userId);
        const votedMovies = userVotes.length;
        const remainingMovies = Math.max(0, totalMovies - votedMovies);
        const completionPercentage = totalMovies > 0 ? Math.round((votedMovies / totalMovies) * 100) : 0;
        const hasVotedAll = votedMovies >= totalMovies;
        return {
            totalMovies,
            votedMovies,
            remainingMovies,
            completionPercentage,
            hasVotedAll,
        };
    }
    /**
     * Check if a specific movie has enough votes for a match
     */
    async checkForMatch(roomId, movieId, requiredVotes) {
        // Get all LIKE votes for this movie in this room
        const likeVotes = await this.db.query(this.config.tables.votes, 'roomId = :roomId AND movieId = :movieId', {
            indexName: 'RoomMovieIndex',
            filterExpression: 'voteType = :voteType',
            expressionAttributeValues: {
                ':roomId': roomId,
                ':movieId': movieId,
                ':voteType': 'LIKE',
            },
        });
        // Check if we have enough votes for a match
        if (likeVotes.count >= requiredVotes) {
            // Check if match already exists
            let existingMatch = await this.db.get(this.config.tables.roomMatches, { roomId, movieId });
            if (!existingMatch) {
                // Create new match record
                const now = new Date().toISOString();
                const match = {
                    roomId,
                    movieId,
                    votes: likeVotes.count,
                    matchedAt: now,
                    createdAt: now,
                    updatedAt: now,
                };
                await this.db.put(this.config.tables.roomMatches, match);
                existingMatch = match;
                this.logger.info('🎯 New match created', { roomId, movieId, votes: likeVotes.count });
            }
            return existingMatch;
        }
        return null;
    }
    /**
     * Get and validate room (matching existing getRoomAndValidate)
     */
    async getRoomAndValidate(roomId) {
        this.logger.info('🔍 DEBUG: getRoomAndValidate usando clave:', { PK: roomId, SK: 'ROOM' });
        const response = await this.db.get(this.config.tables.rooms, { PK: roomId, SK: 'ROOM' });
        if (!response) {
            throw new types_1.NotFoundError('Sala no encontrada');
        }
        const room = response;
        this.logger.info(`🔍 Room Status Check: ID=${room.id || room.roomId}, Status=${room.status}, Type=${typeof room.status}`);
        if (room.status !== 'ACTIVE' && room.status !== 'WAITING') {
            throw new types_1.ValidationError(`La sala no está disponible para votar. Estado actual: ${room.status}`);
        }
        return {
            ...room,
            id: room.roomId || room.id,
        };
    }
    /**
     * Validate user membership (matching existing validateUserMembership)
     */
    async validateUserMembership(userId, roomId) {
        const response = await this.db.get(this.config.tables.roomMembers, { roomId, userId });
        if (!response || !response.isActive) {
            throw new types_1.UnauthorizedError('Usuario no es miembro activo de la sala');
        }
    }
    /**
     * Prevent duplicate votes (matching existing preventDuplicateVote)
     */
    async preventDuplicateVote(userId, roomId, movieId) {
        const userMovieKey = `${userId}#${movieId}`;
        // Check if user already voted for this movie in this room
        const existingVote = await this.db.get(this.config.tables.votes, {
            roomId,
            'userId#movieId': userMovieKey
        });
        if (existingVote) {
            throw new types_1.ConflictError(`Usuario ${userId} ya votó por la película ${movieId} en la sala ${roomId}`);
        }
        // Register the vote to prevent duplicates
        await this.db.put(this.config.tables.votes, {
            roomId,
            'userId#movieId': userMovieKey,
            userId,
            movieId,
            votedAt: new Date().toISOString(),
            voteType: 'LIKE'
        });
        this.logger.info(`✅ Voto registrado: Usuario ${userId}, Sala ${roomId}, Película ${movieId}`);
    }
    /**
     * Increment vote count atomically (matching existing incrementVoteCount)
     */
    async incrementVoteCount(roomId, movieId) {
        try {
            // Try to update existing vote count atomically
            const response = await this.db.update(this.config.tables.roomMatches, { roomId, movieId }, 'ADD votes :increment SET updatedAt = :updatedAt', {
                expressionAttributeValues: {
                    ':increment': 1,
                    ':updatedAt': new Date().toISOString(),
                },
                returnValues: 'ALL_NEW',
            });
            const voteCount = response?.votes || 1;
            this.logger.info(`✅ Voto incrementado: Sala ${roomId}, Película ${movieId}, Total: ${voteCount}`);
            return voteCount;
        }
        catch (error) {
            // If item doesn't exist, create it
            try {
                const newVote = {
                    roomId,
                    movieId,
                    votes: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                await this.db.put(this.config.tables.roomMatches, newVote);
                this.logger.info(`✅ Nuevo voto creado: Sala ${roomId}, Película ${movieId}, Total: 1`);
                return 1;
            }
            catch (putError) {
                this.logger.error('❌ Error incrementando voto', putError);
                throw putError;
            }
        }
    }
    /**
     * Update room with match result (matching existing updateRoomWithMatch)
     */
    async updateRoomWithMatch(roomId, movieId) {
        this.logger.info('🔍 DEBUG: updateRoomWithMatch usando clave:', { PK: roomId, SK: 'ROOM' });
        await this.db.update(this.config.tables.rooms, { PK: roomId, SK: 'ROOM' }, 'SET #status = :status, resultMovieId = :movieId, updatedAt = :updatedAt', {
            expressionAttributeNames: {
                '#status': 'status', // 'status' is a reserved word in DynamoDB
            },
            expressionAttributeValues: {
                ':status': 'MATCHED',
                ':movieId': movieId,
                ':updatedAt': new Date().toISOString(),
            },
        });
        this.logger.info(`✅ Sala ${roomId} actualizada con match: película ${movieId}`);
    }
    /**
     * Track shown movie (matching existing trackShownMovie)
     */
    async trackShownMovie(roomId, movieId) {
        try {
            await this.db.update(this.config.tables.rooms, { PK: roomId, SK: 'ROOM' }, 'ADD shownMovieIds :movieSet', {
                expressionAttributeValues: {
                    ':movieSet': new Set([movieId]),
                },
            });
        }
        catch (error) {
            this.logger.error(`⚠️ Error al registrar película mostrada ${movieId}`, error);
            // Don't fail the vote if this fails, it's secondary
        }
    }
}
// Export the handler
exports.handler = (0, base_handler_1.createHandler)(VoteHandler);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm90ZS1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidm90ZS1oYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7OztBQUVILGlEQUE0RDtBQUM1RCwyQ0FBZ0w7QUFDaEwsaURBQThDO0FBcUI5QyxNQUFNLFdBQVksU0FBUSwwQkFBVztJQUNuQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQW1CO1FBQzlCLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRywyQkFBWSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNELE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRywyQkFBWSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUVuRCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsU0FBUyxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUU1RSxRQUFRLFNBQVMsRUFBRSxDQUFDO1lBQ2xCLEtBQUssTUFBTTtnQkFDVCxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLFNBQTZCLEVBQUUsTUFBTyxDQUFDLENBQUM7WUFFekUsS0FBSyxjQUFjO2dCQUNqQixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLFNBQTZCLEVBQUUsTUFBTyxDQUFDLENBQUM7WUFFekUsS0FBSyxjQUFjO2dCQUNqQixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLFNBQTZCLEVBQUUsTUFBTyxDQUFDLENBQUM7WUFFekUsS0FBSyxZQUFZO2dCQUNmLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsU0FBMkIsRUFBRSxNQUFPLENBQUMsQ0FBQztZQUVyRSxLQUFLLHFCQUFxQjtnQkFDeEIsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLFNBQStCLEVBQUUsTUFBTyxDQUFDLENBQUM7WUFF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RUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsRUFDMUIsNkJBQTZCLEVBQzdCO2dCQUNFLHlCQUF5QixFQUFFO29CQUN6QixXQUFXLEVBQUUsSUFBSSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztpQkFDaEM7YUFDRixDQUNGLENBQUM7UUFDSixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxPQUFPLEVBQUUsRUFBRSxLQUFjLENBQUMsQ0FBQztZQUN4RixvREFBb0Q7UUFDdEQsQ0FBQztJQUNILENBQUM7Q0FDRjtBQUVELHFCQUFxQjtBQUNSLFFBQUEsT0FBTyxHQUFHLElBQUEsNEJBQWEsRUFBQyxXQUFXLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBUcmluaXR5IFZvdGUgSGFuZGxlclxyXG4gKiBIYW5kbGVzIGluZGl2aWR1YWwgdm90aW5nIGFuZCBtYXRjaCBkZXRlY3Rpb24gbG9naWNcclxuICovXHJcblxyXG5pbXBvcnQgeyBCYXNlSGFuZGxlciwgY3JlYXRlSGFuZGxlciB9IGZyb20gJy4vYmFzZS1oYW5kbGVyJztcclxuaW1wb3J0IHsgQXBwU3luY0V2ZW50LCBUcmluaXR5Vm90ZSwgVHJpbml0eVJvb20sIFRyaW5pdHlSb29tTWF0Y2gsIFRyaW5pdHlSb29tTWVtYmVyLCBWYWxpZGF0aW9uRXJyb3IsIE5vdEZvdW5kRXJyb3IsIFVuYXV0aG9yaXplZEVycm9yLCBDb25mbGljdEVycm9yIH0gZnJvbSAnLi4vc2hhcmVkL3R5cGVzJztcclxuaW1wb3J0IHsgSGFuZGxlclV0aWxzIH0gZnJvbSAnLi9iYXNlLWhhbmRsZXInO1xyXG5cclxuaW50ZXJmYWNlIFZvdGVGb3JNb3ZpZUFyZ3Mge1xyXG4gIHJvb21JZDogc3RyaW5nO1xyXG4gIG1vdmllSWQ6IHN0cmluZztcclxuICB2b3RlVHlwZTogJ0xJS0UnIHwgJ0RJU0xJS0UnO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2V0VXNlclZvdGVzQXJncyB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBHZXRSb29tVm90ZXNBcmdzIHtcclxuICByb29tSWQ6IHN0cmluZztcclxuICBtb3ZpZUlkPzogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ2hlY2tNYXRjaEFyZ3Mge1xyXG4gIHJvb21JZDogc3RyaW5nO1xyXG59XHJcblxyXG5jbGFzcyBWb3RlSGFuZGxlciBleHRlbmRzIEJhc2VIYW5kbGVyIHtcclxuICBhc3luYyBoYW5kbGUoZXZlbnQ6IEFwcFN5bmNFdmVudCk6IFByb21pc2U8YW55PiB7XHJcbiAgICBjb25zdCB7IGZpZWxkTmFtZSB9ID0gSGFuZGxlclV0aWxzLmdldE9wZXJhdGlvbkluZm8oZXZlbnQpO1xyXG4gICAgY29uc3QgeyB1c2VySWQgfSA9IEhhbmRsZXJVdGlscy5nZXRVc2VySW5mbyhldmVudCk7XHJcblxyXG4gICAgdGhpcy5sb2dnZXIuaW5mbyhg8J+Xs++4jyBWb3RlIG9wZXJhdGlvbjogJHtmaWVsZE5hbWV9YCwgeyB1c2VySWQsIGZpZWxkTmFtZSB9KTtcclxuXHJcbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xyXG4gICAgICBjYXNlICd2b3RlJzpcclxuICAgICAgICByZXR1cm4gdGhpcy52b3RlRm9yTW92aWUoZXZlbnQuYXJndW1lbnRzIGFzIFZvdGVGb3JNb3ZpZUFyZ3MsIHVzZXJJZCEpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnZ2V0VXNlclZvdGVzJzpcclxuICAgICAgICByZXR1cm4gdGhpcy5nZXRVc2VyVm90ZXMoZXZlbnQuYXJndW1lbnRzIGFzIEdldFVzZXJWb3Rlc0FyZ3MsIHVzZXJJZCEpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnZ2V0Um9vbVZvdGVzJzpcclxuICAgICAgICByZXR1cm4gdGhpcy5nZXRSb29tVm90ZXMoZXZlbnQuYXJndW1lbnRzIGFzIEdldFJvb21Wb3Rlc0FyZ3MsIHVzZXJJZCEpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnY2hlY2tNYXRjaCc6XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY2hlY2tNYXRjaChldmVudC5hcmd1bWVudHMgYXMgQ2hlY2tNYXRjaEFyZ3MsIHVzZXJJZCEpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnZ2V0VXNlclZvdGVQcm9ncmVzcyc6XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlclZvdGVQcm9ncmVzcyhldmVudC5hcmd1bWVudHMgYXMgeyByb29tSWQ6IHN0cmluZyB9LCB1c2VySWQhKTtcclxuICAgICAgXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcihgVW5rbm93biB2b3RlIG9wZXJhdGlvbjogJHtmaWVsZE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWb3RlIGZvciBhIG1vdmllIGFuZCBjaGVjayBmb3IgbWF0Y2hlcyAobWF0Y2hpbmcgZXhpc3RpbmcgcHJvY2Vzc1ZvdGUgbG9naWMpXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyB2b3RlRm9yTW92aWUoYXJnczogVm90ZUZvck1vdmllQXJncywgdXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPHsgdm90ZTogVHJpbml0eVZvdGU7IG1hdGNoPzogVHJpbml0eVJvb21NYXRjaCB9PiB7XHJcbiAgICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBmaWVsZHNcclxuICAgIHRoaXMudmFsaWRhdGVBcmdzPFZvdGVGb3JNb3ZpZUFyZ3M+KGFyZ3MsIFsncm9vbUlkJywgJ21vdmllSWQnLCAndm90ZVR5cGUnXSk7XHJcblxyXG4gICAgdGhpcy5sb2dnZXIuaW5mbyhg8J+Xs++4jyBQcm9jZXNhbmRvIHZvdG86IFVzdWFyaW8gJHt1c2VySWR9LCBTYWxhICR7YXJncy5yb29tSWR9LCBQZWzDrWN1bGEgJHthcmdzLm1vdmllSWR9LCBUaXBvOiAke2FyZ3Mudm90ZVR5cGV9YCk7XHJcblxyXG4gICAgLy8gMS4gVmVyaWZpY2FyIHF1ZSBsYSBzYWxhIGV4aXN0ZSB5IGVzdMOhIEFDVElWRS9XQUlUSU5HXHJcbiAgICBjb25zdCByb29tID0gYXdhaXQgdGhpcy5nZXRSb29tQW5kVmFsaWRhdGUoYXJncy5yb29tSWQpO1xyXG5cclxuICAgIC8vIDIuIFZlcmlmaWNhciBxdWUgZWwgdXN1YXJpbyBlcyBtaWVtYnJvIGRlIGxhIHNhbGFcclxuICAgIGF3YWl0IHRoaXMudmFsaWRhdGVVc2VyTWVtYmVyc2hpcCh1c2VySWQsIGFyZ3Mucm9vbUlkKTtcclxuXHJcbiAgICAvLyAzLiBSZWdpc3RyYXIgcXVlIGxhIHBlbMOtY3VsYSBoYSBzaWRvIG1vc3RyYWRhIChJTkRJRkVSRU5URSBkZWwgdGlwbyBkZSB2b3RvKVxyXG4gICAgYXdhaXQgdGhpcy50cmFja1Nob3duTW92aWUoYXJncy5yb29tSWQsIGFyZ3MubW92aWVJZCk7XHJcblxyXG4gICAgLy8gNC4gU29sbyBwcm9jZXNhciB2b3RvcyBMSUtFIC0gaWdub3JhciBESVNMSUtFIHNlZ8O6biBhbGdvcml0bW8gU3RvcC1vbi1NYXRjaFxyXG4gICAgaWYgKGFyZ3Mudm90ZVR5cGUgIT09ICdMSUtFJykge1xyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKGDij63vuI8gSWdub3JhbmRvIHZvdG8gJHthcmdzLnZvdGVUeXBlfSBzZWfDum4gYWxnb3JpdG1vIFN0b3Atb24tTWF0Y2hgKTtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICB2b3RlOiB7XHJcbiAgICAgICAgICByb29tSWQ6IGFyZ3Mucm9vbUlkLFxyXG4gICAgICAgICAgdXNlcklkLFxyXG4gICAgICAgICAgbW92aWVJZDogYXJncy5tb3ZpZUlkLFxyXG4gICAgICAgICAgdm90ZVR5cGU6IGFyZ3Mudm90ZVR5cGUsXHJcbiAgICAgICAgICB2b3RlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyA1LiBQcmV2ZW5pciB2b3RvcyBkdXBsaWNhZG9zIGRlbCBtaXNtbyB1c3VhcmlvIHBhcmEgbGEgbWlzbWEgcGVsw61jdWxhXHJcbiAgICBhd2FpdCB0aGlzLnByZXZlbnREdXBsaWNhdGVWb3RlKHVzZXJJZCwgYXJncy5yb29tSWQsIGFyZ3MubW92aWVJZCk7XHJcblxyXG4gICAgLy8gNi4gSW5jcmVtZW50YXIgY29udGFkb3IgYXTDs21pY28gZW4gVm90ZXNUYWJsZVxyXG4gICAgY29uc3QgY3VycmVudFZvdGVzID0gYXdhaXQgdGhpcy5pbmNyZW1lbnRWb3RlQ291bnQoYXJncy5yb29tSWQsIGFyZ3MubW92aWVJZCk7XHJcblxyXG4gICAgLy8gNy4gT2J0ZW5lciBtYXhNZW1iZXJzIGRlIGxhIHNhbGEgKG5vIG1pZW1icm9zIGFjdGl2b3MgYWN0dWFsZXMpXHJcbiAgICBjb25zdCB0b3RhbE1lbWJlcnMgPSByb29tLm1heE1lbWJlcnMgfHwgMjsgLy8gRmFsbGJhY2sgYSAyIHNpIG5vIGVzdMOhIGRlZmluaWRvXHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKGDwn5OKIFZvdG9zIGFjdHVhbGVzOiAke2N1cnJlbnRWb3Rlc30sIE1pZW1icm9zIHJlcXVlcmlkb3M6ICR7dG90YWxNZW1iZXJzfWApO1xyXG5cclxuICAgIC8vIENyZWF0ZSB2b3RlIG9iamVjdFxyXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG4gICAgY29uc3Qgdm90ZTogVHJpbml0eVZvdGUgPSB7XHJcbiAgICAgIHJvb21JZDogYXJncy5yb29tSWQsXHJcbiAgICAgIHVzZXJJZCxcclxuICAgICAgbW92aWVJZDogYXJncy5tb3ZpZUlkLFxyXG4gICAgICB2b3RlVHlwZTogYXJncy52b3RlVHlwZSxcclxuICAgICAgdm90ZWRBdDogbm93LFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyA4LiBWZXJpZmljYXIgc2kgc2UgYWxjYW56w7MgZWwgY29uc2Vuc28gKFN0b3Atb24tTWF0Y2gpXHJcbiAgICBsZXQgbWF0Y2g6IFRyaW5pdHlSb29tTWF0Y2ggfCB1bmRlZmluZWQ7XHJcbiAgICBpZiAoY3VycmVudFZvdGVzID49IHRvdGFsTWVtYmVycykge1xyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKCfwn46JIMKhTWF0Y2ggZW5jb250cmFkbyEgQWN0dWFsaXphbmRvIHNhbGEgeSBub3RpZmljYW5kby4uLicpO1xyXG4gICAgICBcclxuICAgICAgLy8gQWN0dWFsaXphciBzYWxhIGNvbiByZXN1bHRhZG9cclxuICAgICAgYXdhaXQgdGhpcy51cGRhdGVSb29tV2l0aE1hdGNoKGFyZ3Mucm9vbUlkLCBhcmdzLm1vdmllSWQpO1xyXG5cclxuICAgICAgLy8gQ3JlYXRlIG1hdGNoIHJlY29yZFxyXG4gICAgICBtYXRjaCA9IHtcclxuICAgICAgICByb29tSWQ6IGFyZ3Mucm9vbUlkLFxyXG4gICAgICAgIG1vdmllSWQ6IGFyZ3MubW92aWVJZCxcclxuICAgICAgICB2b3RlczogY3VycmVudFZvdGVzLFxyXG4gICAgICAgIG1hdGNoZWRBdDogbm93LFxyXG4gICAgICAgIGNyZWF0ZWRBdDogbm93LFxyXG4gICAgICAgIHVwZGF0ZWRBdDogbm93LFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgYXdhaXQgdGhpcy5kYi5wdXQodGhpcy5jb25maWcudGFibGVzLnJvb21NYXRjaGVzLCBtYXRjaCk7XHJcblxyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKCfwn46vIE5ldyBtYXRjaCBjcmVhdGVkJywgeyByb29tSWQ6IGFyZ3Mucm9vbUlkLCBtb3ZpZUlkOiBhcmdzLm1vdmllSWQsIHZvdGVzOiBjdXJyZW50Vm90ZXMgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHsgdm90ZSwgbWF0Y2ggfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCB1c2VyJ3Mgdm90ZXMgZm9yIGEgcm9vbVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZ2V0VXNlclZvdGVzKGFyZ3M6IEdldFVzZXJWb3Rlc0FyZ3MsIHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxUcmluaXR5Vm90ZVtdPiB7XHJcbiAgICB0aGlzLnZhbGlkYXRlQXJnczxHZXRVc2VyVm90ZXNBcmdzPihhcmdzLCBbJ3Jvb21JZCddKTtcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSB1c2VyIGhhcyBhY2Nlc3MgdG8gcm9vbVxyXG4gICAgY29uc3QgaGFzQWNjZXNzID0gYXdhaXQgSGFuZGxlclV0aWxzLnZhbGlkYXRlUm9vbUFjY2VzcyhcclxuICAgICAgdGhpcy5kYixcclxuICAgICAgdXNlcklkLFxyXG4gICAgICBhcmdzLnJvb21JZCxcclxuICAgICAgdGhpcy5jb25maWdcclxuICAgICk7XHJcblxyXG4gICAgaWYgKCFoYXNBY2Nlc3MpIHtcclxuICAgICAgdGhyb3cgbmV3IFVuYXV0aG9yaXplZEVycm9yKCdBY2Nlc3MgZGVuaWVkIHRvIHJvb20nKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgdXNlcidzIHZvdGVzIGZvciB0aGlzIHJvb21cclxuICAgIGNvbnN0IHZvdGVzID0gYXdhaXQgdGhpcy5kYi5xdWVyeTxUcmluaXR5Vm90ZT4oXHJcbiAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy52b3RlcyxcclxuICAgICAgJ3Jvb21JZCA9IDpyb29tSWQgQU5EIHVzZXJJZCA9IDp1c2VySWQnLFxyXG4gICAgICB7XHJcbiAgICAgICAgaW5kZXhOYW1lOiAnUm9vbVVzZXJJbmRleCcsXHJcbiAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzpyb29tSWQnOiBhcmdzLnJvb21JZCxcclxuICAgICAgICAgICc6dXNlcklkJzogdXNlcklkLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgcmV0dXJuIHZvdGVzLml0ZW1zO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGFsbCB2b3RlcyBmb3IgYSByb29tIChvciBzcGVjaWZpYyBtb3ZpZSlcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGdldFJvb21Wb3RlcyhhcmdzOiBHZXRSb29tVm90ZXNBcmdzLCB1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8VHJpbml0eVZvdGVbXT4ge1xyXG4gICAgdGhpcy52YWxpZGF0ZUFyZ3M8R2V0Um9vbVZvdGVzQXJncz4oYXJncywgWydyb29tSWQnXSk7XHJcblxyXG4gICAgLy8gVmFsaWRhdGUgdXNlciBoYXMgYWNjZXNzIHRvIHJvb21cclxuICAgIGNvbnN0IGhhc0FjY2VzcyA9IGF3YWl0IEhhbmRsZXJVdGlscy52YWxpZGF0ZVJvb21BY2Nlc3MoXHJcbiAgICAgIHRoaXMuZGIsXHJcbiAgICAgIHVzZXJJZCxcclxuICAgICAgYXJncy5yb29tSWQsXHJcbiAgICAgIHRoaXMuY29uZmlnXHJcbiAgICApO1xyXG5cclxuICAgIGlmICghaGFzQWNjZXNzKSB7XHJcbiAgICAgIHRocm93IG5ldyBVbmF1dGhvcml6ZWRFcnJvcignQWNjZXNzIGRlbmllZCB0byByb29tJyk7XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IHZvdGVzO1xyXG5cclxuICAgIGlmIChhcmdzLm1vdmllSWQpIHtcclxuICAgICAgLy8gR2V0IHZvdGVzIGZvciBzcGVjaWZpYyBtb3ZpZVxyXG4gICAgICB2b3RlcyA9IGF3YWl0IHRoaXMuZGIucXVlcnk8VHJpbml0eVZvdGU+KFxyXG4gICAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy52b3RlcyxcclxuICAgICAgICAncm9vbUlkID0gOnJvb21JZCBBTkQgbW92aWVJZCA9IDptb3ZpZUlkJyxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBpbmRleE5hbWU6ICdSb29tTW92aWVJbmRleCcsXHJcbiAgICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAgICc6cm9vbUlkJzogYXJncy5yb29tSWQsXHJcbiAgICAgICAgICAgICc6bW92aWVJZCc6IGFyZ3MubW92aWVJZCxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfVxyXG4gICAgICApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gR2V0IGFsbCB2b3RlcyBmb3Igcm9vbVxyXG4gICAgICB2b3RlcyA9IGF3YWl0IHRoaXMuZGIucXVlcnk8VHJpbml0eVZvdGU+KFxyXG4gICAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy52b3RlcyxcclxuICAgICAgICAncm9vbUlkID0gOnJvb21JZCcsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgICAnOnJvb21JZCc6IGFyZ3Mucm9vbUlkLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9XHJcbiAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHZvdGVzLml0ZW1zO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2sgZm9yIG1hdGNoZXMgaW4gYSByb29tXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBjaGVja01hdGNoKGFyZ3M6IENoZWNrTWF0Y2hBcmdzLCB1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8VHJpbml0eVJvb21NYXRjaCB8IG51bGw+IHtcclxuICAgIHRoaXMudmFsaWRhdGVBcmdzPENoZWNrTWF0Y2hBcmdzPihhcmdzLCBbJ3Jvb21JZCddKTtcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSB1c2VyIGhhcyBhY2Nlc3MgdG8gcm9vbVxyXG4gICAgY29uc3QgaGFzQWNjZXNzID0gYXdhaXQgSGFuZGxlclV0aWxzLnZhbGlkYXRlUm9vbUFjY2VzcyhcclxuICAgICAgdGhpcy5kYixcclxuICAgICAgdXNlcklkLFxyXG4gICAgICBhcmdzLnJvb21JZCxcclxuICAgICAgdGhpcy5jb25maWdcclxuICAgICk7XHJcblxyXG4gICAgaWYgKCFoYXNBY2Nlc3MpIHtcclxuICAgICAgdGhyb3cgbmV3IFVuYXV0aG9yaXplZEVycm9yKCdBY2Nlc3MgZGVuaWVkIHRvIHJvb20nKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgcm9vbSBkZXRhaWxzXHJcbiAgICBjb25zdCByb29tID0gYXdhaXQgdGhpcy5kYi5nZXQ8VHJpbml0eVJvb20+KFxyXG4gICAgICB0aGlzLmNvbmZpZy50YWJsZXMucm9vbXMsXHJcbiAgICAgIHsgaWQ6IGFyZ3Mucm9vbUlkIH1cclxuICAgICk7XHJcblxyXG4gICAgaWYgKCFyb29tIHx8ICFyb29tLmlzQWN0aXZlKSB7XHJcbiAgICAgIHRocm93IG5ldyBOb3RGb3VuZEVycm9yKCdSb29tJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgcm9vbSBhbHJlYWR5IGhhcyBhIG1hdGNoXHJcbiAgICBpZiAocm9vbS5zdGF0dXMgPT09ICdNQVRDSEVEJyAmJiByb29tLnJlc3VsdE1vdmllSWQpIHtcclxuICAgICAgY29uc3QgZXhpc3RpbmdNYXRjaCA9IGF3YWl0IHRoaXMuZGIuZ2V0PFRyaW5pdHlSb29tTWF0Y2g+KFxyXG4gICAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tTWF0Y2hlcyxcclxuICAgICAgICB7IHJvb21JZDogYXJncy5yb29tSWQsIG1vdmllSWQ6IHJvb20ucmVzdWx0TW92aWVJZCB9XHJcbiAgICAgICk7XHJcbiAgICAgIHJldHVybiBleGlzdGluZ01hdGNoO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGFsbCBtb3ZpZXMgZm9yIHBvdGVudGlhbCBtYXRjaGVzXHJcbiAgICBjb25zdCByb29tTW92aWVzID0gYXdhaXQgdGhpcy5kYi5xdWVyeShcclxuICAgICAgdGhpcy5jb25maWcudGFibGVzLnJvb21Nb3ZpZUNhY2hlLFxyXG4gICAgICAncm9vbUlkID0gOnJvb21JZCcsXHJcbiAgICAgIHtcclxuICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7ICc6cm9vbUlkJzogYXJncy5yb29tSWQgfSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IG1vdmllIG9mIHJvb21Nb3ZpZXMuaXRlbXMpIHtcclxuICAgICAgY29uc3QgbWF0Y2ggPSBhd2FpdCB0aGlzLmNoZWNrRm9yTWF0Y2goYXJncy5yb29tSWQsIG1vdmllLm1vdmllSWQsIHJvb20ubWF4TWVtYmVycyk7XHJcbiAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgIHJldHVybiBtYXRjaDtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IHVzZXIncyB2b3RpbmcgcHJvZ3Jlc3MgaW4gYSByb29tXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBnZXRVc2VyVm90ZVByb2dyZXNzKGFyZ3M6IHsgcm9vbUlkOiBzdHJpbmcgfSwgdXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPHtcclxuICAgIHRvdGFsTW92aWVzOiBudW1iZXI7XHJcbiAgICB2b3RlZE1vdmllczogbnVtYmVyO1xyXG4gICAgcmVtYWluaW5nTW92aWVzOiBudW1iZXI7XHJcbiAgICBjb21wbGV0aW9uUGVyY2VudGFnZTogbnVtYmVyO1xyXG4gICAgaGFzVm90ZWRBbGw6IGJvb2xlYW47XHJcbiAgfT4ge1xyXG4gICAgLy8gVmFsaWRhdGUgdXNlciBoYXMgYWNjZXNzIHRvIHJvb21cclxuICAgIGNvbnN0IGhhc0FjY2VzcyA9IGF3YWl0IEhhbmRsZXJVdGlscy52YWxpZGF0ZVJvb21BY2Nlc3MoXHJcbiAgICAgIHRoaXMuZGIsXHJcbiAgICAgIHVzZXJJZCxcclxuICAgICAgYXJncy5yb29tSWQsXHJcbiAgICAgIHRoaXMuY29uZmlnXHJcbiAgICApO1xyXG5cclxuICAgIGlmICghaGFzQWNjZXNzKSB7XHJcbiAgICAgIHRocm93IG5ldyBVbmF1dGhvcml6ZWRFcnJvcignQWNjZXNzIGRlbmllZCB0byByb29tJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IHRvdGFsIG1vdmllcyBpbiByb29tIGNhY2hlXHJcbiAgICBjb25zdCByb29tTW92aWVzID0gYXdhaXQgdGhpcy5kYi5xdWVyeShcclxuICAgICAgdGhpcy5jb25maWcudGFibGVzLnJvb21Nb3ZpZUNhY2hlLFxyXG4gICAgICAncm9vbUlkID0gOnJvb21JZCcsXHJcbiAgICAgIHtcclxuICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7ICc6cm9vbUlkJzogYXJncy5yb29tSWQgfSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCB0b3RhbE1vdmllcyA9IHJvb21Nb3ZpZXMuY291bnQ7XHJcblxyXG4gICAgLy8gR2V0IHVzZXIncyB2b3RlcyBmb3IgdGhpcyByb29tXHJcbiAgICBjb25zdCB1c2VyVm90ZXMgPSBhd2FpdCB0aGlzLmdldFVzZXJWb3Rlcyh7IHJvb21JZDogYXJncy5yb29tSWQgfSwgdXNlcklkKTtcclxuICAgIGNvbnN0IHZvdGVkTW92aWVzID0gdXNlclZvdGVzLmxlbmd0aDtcclxuXHJcbiAgICBjb25zdCByZW1haW5pbmdNb3ZpZXMgPSBNYXRoLm1heCgwLCB0b3RhbE1vdmllcyAtIHZvdGVkTW92aWVzKTtcclxuICAgIGNvbnN0IGNvbXBsZXRpb25QZXJjZW50YWdlID0gdG90YWxNb3ZpZXMgPiAwID8gTWF0aC5yb3VuZCgodm90ZWRNb3ZpZXMgLyB0b3RhbE1vdmllcykgKiAxMDApIDogMDtcclxuICAgIGNvbnN0IGhhc1ZvdGVkQWxsID0gdm90ZWRNb3ZpZXMgPj0gdG90YWxNb3ZpZXM7XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgdG90YWxNb3ZpZXMsXHJcbiAgICAgIHZvdGVkTW92aWVzLFxyXG4gICAgICByZW1haW5pbmdNb3ZpZXMsXHJcbiAgICAgIGNvbXBsZXRpb25QZXJjZW50YWdlLFxyXG4gICAgICBoYXNWb3RlZEFsbCxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDaGVjayBpZiBhIHNwZWNpZmljIG1vdmllIGhhcyBlbm91Z2ggdm90ZXMgZm9yIGEgbWF0Y2hcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGNoZWNrRm9yTWF0Y2gocm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZywgcmVxdWlyZWRWb3RlczogbnVtYmVyKTogUHJvbWlzZTxUcmluaXR5Um9vbU1hdGNoIHwgbnVsbD4ge1xyXG4gICAgLy8gR2V0IGFsbCBMSUtFIHZvdGVzIGZvciB0aGlzIG1vdmllIGluIHRoaXMgcm9vbVxyXG4gICAgY29uc3QgbGlrZVZvdGVzID0gYXdhaXQgdGhpcy5kYi5xdWVyeTxUcmluaXR5Vm90ZT4oXHJcbiAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy52b3RlcyxcclxuICAgICAgJ3Jvb21JZCA9IDpyb29tSWQgQU5EIG1vdmllSWQgPSA6bW92aWVJZCcsXHJcbiAgICAgIHtcclxuICAgICAgICBpbmRleE5hbWU6ICdSb29tTW92aWVJbmRleCcsXHJcbiAgICAgICAgZmlsdGVyRXhwcmVzc2lvbjogJ3ZvdGVUeXBlID0gOnZvdGVUeXBlJyxcclxuICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOnJvb21JZCc6IHJvb21JZCxcclxuICAgICAgICAgICc6bW92aWVJZCc6IG1vdmllSWQsXHJcbiAgICAgICAgICAnOnZvdGVUeXBlJzogJ0xJS0UnLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgd2UgaGF2ZSBlbm91Z2ggdm90ZXMgZm9yIGEgbWF0Y2hcclxuICAgIGlmIChsaWtlVm90ZXMuY291bnQgPj0gcmVxdWlyZWRWb3Rlcykge1xyXG4gICAgICAvLyBDaGVjayBpZiBtYXRjaCBhbHJlYWR5IGV4aXN0c1xyXG4gICAgICBsZXQgZXhpc3RpbmdNYXRjaCA9IGF3YWl0IHRoaXMuZGIuZ2V0PFRyaW5pdHlSb29tTWF0Y2g+KFxyXG4gICAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tTWF0Y2hlcyxcclxuICAgICAgICB7IHJvb21JZCwgbW92aWVJZCB9XHJcbiAgICAgICk7XHJcblxyXG4gICAgICBpZiAoIWV4aXN0aW5nTWF0Y2gpIHtcclxuICAgICAgICAvLyBDcmVhdGUgbmV3IG1hdGNoIHJlY29yZFxyXG4gICAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICAgICAgICBjb25zdCBtYXRjaDogVHJpbml0eVJvb21NYXRjaCA9IHtcclxuICAgICAgICAgIHJvb21JZCxcclxuICAgICAgICAgIG1vdmllSWQsXHJcbiAgICAgICAgICB2b3RlczogbGlrZVZvdGVzLmNvdW50LFxyXG4gICAgICAgICAgbWF0Y2hlZEF0OiBub3csXHJcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5vdyxcclxuICAgICAgICAgIHVwZGF0ZWRBdDogbm93LFxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGF3YWl0IHRoaXMuZGIucHV0KHRoaXMuY29uZmlnLnRhYmxlcy5yb29tTWF0Y2hlcywgbWF0Y2gpO1xyXG4gICAgICAgIGV4aXN0aW5nTWF0Y2ggPSBtYXRjaDtcclxuXHJcbiAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygn8J+OryBOZXcgbWF0Y2ggY3JlYXRlZCcsIHsgcm9vbUlkLCBtb3ZpZUlkLCB2b3RlczogbGlrZVZvdGVzLmNvdW50IH0pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gZXhpc3RpbmdNYXRjaDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBhbmQgdmFsaWRhdGUgcm9vbSAobWF0Y2hpbmcgZXhpc3RpbmcgZ2V0Um9vbUFuZFZhbGlkYXRlKVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZ2V0Um9vbUFuZFZhbGlkYXRlKHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTxUcmluaXR5Um9vbT4ge1xyXG4gICAgdGhpcy5sb2dnZXIuaW5mbygn8J+UjSBERUJVRzogZ2V0Um9vbUFuZFZhbGlkYXRlIHVzYW5kbyBjbGF2ZTonLCB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSk7XHJcbiAgICBcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5kYi5nZXQodGhpcy5jb25maWcudGFibGVzLnJvb21zLCB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSk7XHJcbiAgICBcclxuICAgIGlmICghcmVzcG9uc2UpIHtcclxuICAgICAgdGhyb3cgbmV3IE5vdEZvdW5kRXJyb3IoJ1NhbGEgbm8gZW5jb250cmFkYScpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHJvb20gPSByZXNwb25zZSBhcyBhbnk7XHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKGDwn5SNIFJvb20gU3RhdHVzIENoZWNrOiBJRD0ke3Jvb20uaWQgfHwgcm9vbS5yb29tSWR9LCBTdGF0dXM9JHtyb29tLnN0YXR1c30sIFR5cGU9JHt0eXBlb2Ygcm9vbS5zdGF0dXN9YCk7XHJcblxyXG4gICAgaWYgKHJvb20uc3RhdHVzICE9PSAnQUNUSVZFJyAmJiByb29tLnN0YXR1cyAhPT0gJ1dBSVRJTkcnKSB7XHJcbiAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoYExhIHNhbGEgbm8gZXN0w6EgZGlzcG9uaWJsZSBwYXJhIHZvdGFyLiBFc3RhZG8gYWN0dWFsOiAke3Jvb20uc3RhdHVzfWApO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIC4uLnJvb20sXHJcbiAgICAgIGlkOiByb29tLnJvb21JZCB8fCByb29tLmlkLFxyXG4gICAgfSBhcyBUcmluaXR5Um9vbTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIHVzZXIgbWVtYmVyc2hpcCAobWF0Y2hpbmcgZXhpc3RpbmcgdmFsaWRhdGVVc2VyTWVtYmVyc2hpcClcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlVXNlck1lbWJlcnNoaXAodXNlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZGIuZ2V0PFRyaW5pdHlSb29tTWVtYmVyPihcclxuICAgICAgdGhpcy5jb25maWcudGFibGVzLnJvb21NZW1iZXJzLFxyXG4gICAgICB7IHJvb21JZCwgdXNlcklkIH1cclxuICAgICk7XHJcblxyXG4gICAgaWYgKCFyZXNwb25zZSB8fCAhcmVzcG9uc2UuaXNBY3RpdmUpIHtcclxuICAgICAgdGhyb3cgbmV3IFVuYXV0aG9yaXplZEVycm9yKCdVc3VhcmlvIG5vIGVzIG1pZW1icm8gYWN0aXZvIGRlIGxhIHNhbGEnKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFByZXZlbnQgZHVwbGljYXRlIHZvdGVzIChtYXRjaGluZyBleGlzdGluZyBwcmV2ZW50RHVwbGljYXRlVm90ZSlcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIHByZXZlbnREdXBsaWNhdGVWb3RlKHVzZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZywgbW92aWVJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCB1c2VyTW92aWVLZXkgPSBgJHt1c2VySWR9IyR7bW92aWVJZH1gO1xyXG5cclxuICAgIC8vIENoZWNrIGlmIHVzZXIgYWxyZWFkeSB2b3RlZCBmb3IgdGhpcyBtb3ZpZSBpbiB0aGlzIHJvb21cclxuICAgIGNvbnN0IGV4aXN0aW5nVm90ZSA9IGF3YWl0IHRoaXMuZGIuZ2V0KFxyXG4gICAgICB0aGlzLmNvbmZpZy50YWJsZXMudm90ZXMsXHJcbiAgICAgIHtcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgJ3VzZXJJZCNtb3ZpZUlkJzogdXNlck1vdmllS2V5XHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgaWYgKGV4aXN0aW5nVm90ZSkge1xyXG4gICAgICB0aHJvdyBuZXcgQ29uZmxpY3RFcnJvcihgVXN1YXJpbyAke3VzZXJJZH0geWEgdm90w7MgcG9yIGxhIHBlbMOtY3VsYSAke21vdmllSWR9IGVuIGxhIHNhbGEgJHtyb29tSWR9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmVnaXN0ZXIgdGhlIHZvdGUgdG8gcHJldmVudCBkdXBsaWNhdGVzXHJcbiAgICBhd2FpdCB0aGlzLmRiLnB1dCh0aGlzLmNvbmZpZy50YWJsZXMudm90ZXMsIHtcclxuICAgICAgcm9vbUlkLFxyXG4gICAgICAndXNlcklkI21vdmllSWQnOiB1c2VyTW92aWVLZXksXHJcbiAgICAgIHVzZXJJZCxcclxuICAgICAgbW92aWVJZCxcclxuICAgICAgdm90ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB2b3RlVHlwZTogJ0xJS0UnXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKGDinIUgVm90byByZWdpc3RyYWRvOiBVc3VhcmlvICR7dXNlcklkfSwgU2FsYSAke3Jvb21JZH0sIFBlbMOtY3VsYSAke21vdmllSWR9YCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJbmNyZW1lbnQgdm90ZSBjb3VudCBhdG9taWNhbGx5IChtYXRjaGluZyBleGlzdGluZyBpbmNyZW1lbnRWb3RlQ291bnQpXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBpbmNyZW1lbnRWb3RlQ291bnQocm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBUcnkgdG8gdXBkYXRlIGV4aXN0aW5nIHZvdGUgY291bnQgYXRvbWljYWxseVxyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZGIudXBkYXRlKFxyXG4gICAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tTWF0Y2hlcyxcclxuICAgICAgICB7IHJvb21JZCwgbW92aWVJZCB9LFxyXG4gICAgICAgICdBREQgdm90ZXMgOmluY3JlbWVudCBTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgICAnOmluY3JlbWVudCc6IDEsXHJcbiAgICAgICAgICAgICc6dXBkYXRlZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHJldHVyblZhbHVlczogJ0FMTF9ORVcnLFxyXG4gICAgICAgIH1cclxuICAgICAgKTtcclxuXHJcbiAgICAgIGNvbnN0IHZvdGVDb3VudCA9IChyZXNwb25zZSBhcyBhbnkpPy52b3RlcyB8fCAxO1xyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKGDinIUgVm90byBpbmNyZW1lbnRhZG86IFNhbGEgJHtyb29tSWR9LCBQZWzDrWN1bGEgJHttb3ZpZUlkfSwgVG90YWw6ICR7dm90ZUNvdW50fWApO1xyXG4gICAgICByZXR1cm4gdm90ZUNvdW50O1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIC8vIElmIGl0ZW0gZG9lc24ndCBleGlzdCwgY3JlYXRlIGl0XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgbmV3Vm90ZSA9IHtcclxuICAgICAgICAgIHJvb21JZCxcclxuICAgICAgICAgIG1vdmllSWQsXHJcbiAgICAgICAgICB2b3RlczogMSxcclxuICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgYXdhaXQgdGhpcy5kYi5wdXQodGhpcy5jb25maWcudGFibGVzLnJvb21NYXRjaGVzLCBuZXdWb3RlKTtcclxuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKGDinIUgTnVldm8gdm90byBjcmVhZG86IFNhbGEgJHtyb29tSWR9LCBQZWzDrWN1bGEgJHttb3ZpZUlkfSwgVG90YWw6IDFgKTtcclxuICAgICAgICByZXR1cm4gMTtcclxuXHJcbiAgICAgIH0gY2F0Y2ggKHB1dEVycm9yKSB7XHJcbiAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoJ+KdjCBFcnJvciBpbmNyZW1lbnRhbmRvIHZvdG8nLCBwdXRFcnJvciBhcyBFcnJvcik7XHJcbiAgICAgICAgdGhyb3cgcHV0RXJyb3I7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFVwZGF0ZSByb29tIHdpdGggbWF0Y2ggcmVzdWx0IChtYXRjaGluZyBleGlzdGluZyB1cGRhdGVSb29tV2l0aE1hdGNoKVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgdXBkYXRlUm9vbVdpdGhNYXRjaChyb29tSWQ6IHN0cmluZywgbW92aWVJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKCfwn5SNIERFQlVHOiB1cGRhdGVSb29tV2l0aE1hdGNoIHVzYW5kbyBjbGF2ZTonLCB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSk7XHJcbiAgICBcclxuICAgIGF3YWl0IHRoaXMuZGIudXBkYXRlKFxyXG4gICAgICB0aGlzLmNvbmZpZy50YWJsZXMucm9vbXMsXHJcbiAgICAgIHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9LFxyXG4gICAgICAnU0VUICNzdGF0dXMgPSA6c3RhdHVzLCByZXN1bHRNb3ZpZUlkID0gOm1vdmllSWQsIHVwZGF0ZWRBdCA9IDp1cGRhdGVkQXQnLFxyXG4gICAgICB7XHJcbiAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7XHJcbiAgICAgICAgICAnI3N0YXR1cyc6ICdzdGF0dXMnLCAvLyAnc3RhdHVzJyBpcyBhIHJlc2VydmVkIHdvcmQgaW4gRHluYW1vREJcclxuICAgICAgICB9LFxyXG4gICAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICc6c3RhdHVzJzogJ01BVENIRUQnLFxyXG4gICAgICAgICAgJzptb3ZpZUlkJzogbW92aWVJZCxcclxuICAgICAgICAgICc6dXBkYXRlZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgdGhpcy5sb2dnZXIuaW5mbyhg4pyFIFNhbGEgJHtyb29tSWR9IGFjdHVhbGl6YWRhIGNvbiBtYXRjaDogcGVsw61jdWxhICR7bW92aWVJZH1gKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFRyYWNrIHNob3duIG1vdmllIChtYXRjaGluZyBleGlzdGluZyB0cmFja1Nob3duTW92aWUpXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyB0cmFja1Nob3duTW92aWUocm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5kYi51cGRhdGUoXHJcbiAgICAgICAgdGhpcy5jb25maWcudGFibGVzLnJvb21zLFxyXG4gICAgICAgIHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9LFxyXG4gICAgICAgICdBREQgc2hvd25Nb3ZpZUlkcyA6bW92aWVTZXQnLFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICAgJzptb3ZpZVNldCc6IG5ldyBTZXQoW21vdmllSWRdKSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfVxyXG4gICAgICApO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYOKaoO+4jyBFcnJvciBhbCByZWdpc3RyYXIgcGVsw61jdWxhIG1vc3RyYWRhICR7bW92aWVJZH1gLCBlcnJvciBhcyBFcnJvcik7XHJcbiAgICAgIC8vIERvbid0IGZhaWwgdGhlIHZvdGUgaWYgdGhpcyBmYWlscywgaXQncyBzZWNvbmRhcnlcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIEV4cG9ydCB0aGUgaGFuZGxlclxyXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoVm90ZUhhbmRsZXIpOyJdfQ==