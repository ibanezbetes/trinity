"use strict";
/**
 * Base handler for Trinity Lambda functions
 * Provides common functionality, error handling, and logging
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandlerUtils = exports.BaseHandler = void 0;
exports.createHandler = createHandler;
const types_1 = require("../shared/types");
const logger_1 = require("../shared/logger");
const config_1 = require("../shared/config");
const database_1 = require("../shared/database");
const error_handler_1 = require("../shared/error-handler");
class BaseHandler {
    constructor() {
        /**
         * Logger interface that exposes only public methods
         */
        this.logger = {
            info: (message, context) => logger_1.logger.info(message, context),
            error: (message, error, context) => logger_1.logger.error(message, error, context),
            warn: (message, context) => logger_1.logger.warn(message, context),
            debug: (message, context) => logger_1.logger.debug(message, context),
        };
        // Initialize will be called by the handler wrapper
    }
    /**
     * Initialize the handler with configuration and database
     */
    async initialize() {
        if (!this.config) {
            this.config = await (0, config_1.getTrinityConfig)();
            this.db = await (0, database_1.createDatabase)(this.config);
            // Update logger context with function name
            // Logger context is managed globally
        }
    }
    /**
     * Validate user authentication
     */
    validateAuth(event) {
        if (!event.identity?.sub) {
            throw new types_1.TrinityError('User not authenticated', 'UNAUTHORIZED', 401);
        }
        return event.identity.sub;
    }
    /**
     * Validate required arguments
     */
    validateArgs(args, requiredFields) {
        const missing = requiredFields.filter(field => !args[field]);
        if (missing.length > 0) {
            throw new types_1.TrinityError(`Missing required arguments: ${missing.join(', ')}`, 'VALIDATION_ERROR', 400, { missing });
        }
        return args;
    }
    /**
     * Create success response
     */
    success(data, statusCode = 200) {
        return {
            statusCode,
            body: JSON.stringify(data),
            data,
        };
    }
    /**
     * Create error response using centralized error handler
     */
    error(error, context = {}) {
        const errorResponse = error_handler_1.ErrorHandler.createErrorResponse(error, context);
        return {
            statusCode: errorResponse.statusCode,
            body: JSON.stringify({
                error: errorResponse.error,
                code: errorResponse.code,
                category: errorResponse.category,
                details: errorResponse.details,
                timestamp: errorResponse.timestamp,
            }),
        };
    }
}
exports.BaseHandler = BaseHandler;
/**
 * Handler wrapper that provides common functionality
 */
function createHandler(HandlerClass) {
    return async (event) => {
        const timer = new logger_1.PerformanceTimer('LambdaHandler', logger_1.logger);
        const handlerInstance = new HandlerClass();
        try {
            // Log function start
            logger_1.LogUtils.logFunctionStart(process.env.AWS_LAMBDA_FUNCTION_NAME || 'UnknownFunction', event, { userId: event.identity?.sub });
            // Initialize handler
            await handlerInstance.initialize();
            // Execute handler
            const result = await handlerInstance.handle(event);
            // Log function end
            logger_1.LogUtils.logFunctionEnd(process.env.AWS_LAMBDA_FUNCTION_NAME || 'UnknownFunction', result, { userId: event.identity?.sub });
            timer.finish(true);
            return result;
        }
        catch (error) {
            const errorContext = {
                userId: event.identity?.sub,
                operation: event.info?.fieldName,
                requestId: process.env.AWS_REQUEST_ID,
            };
            // Use centralized error handling
            error_handler_1.ErrorHandler.logError(error, errorContext, process.env.AWS_LAMBDA_FUNCTION_NAME);
            timer.finishWithError(error);
            // Return GraphQL-compatible error
            if (error instanceof types_1.TrinityError) {
                throw error;
            }
            // Use error handler to create consistent error response
            const errorResponse = error_handler_1.ErrorHandler.createErrorResponse(error, errorContext);
            throw new types_1.TrinityError(errorResponse.error, errorResponse.code, errorResponse.statusCode, errorResponse.details);
        }
    };
}
/**
 * Utility functions for common handler operations
 */
exports.HandlerUtils = {
    /**
     * Extract GraphQL operation info
     */
    getOperationInfo: (event) => ({
        fieldName: event.info?.fieldName,
        parentTypeName: event.info?.parentTypeName,
        variables: event.info?.variables,
    }),
    /**
     * Extract user info from event
     */
    getUserInfo: (event) => ({
        userId: event.identity?.sub,
        username: event.identity?.username,
        claims: event.identity?.claims,
    }),
    /**
     * Validate room access
     */
    validateRoomAccess: async (db, userId, roomId, config) => {
        try {
            const member = await db.get(config.tables.roomMembers, { roomId, userId });
            return member && member.isActive;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error('❌ Failed to validate room access', err, { userId, roomId });
            return false;
        }
    },
    /**
     * Check if user is room host
     */
    isRoomHost: async (db, userId, roomId, config) => {
        try {
            const room = await db.get(config.tables.rooms, { PK: roomId, SK: 'ROOM' });
            return room && room.hostId === userId;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error('❌ Failed to check room host', err, { userId, roomId });
            return false;
        }
    },
    /**
     * Get active room members count
     */
    getActiveRoomMembersCount: async (db, roomId, config) => {
        try {
            const result = await db.query(config.tables.roomMembers, 'roomId = :roomId', {
                filterExpression: 'isActive = :active',
                expressionAttributeValues: {
                    ':roomId': roomId,
                    ':active': true,
                },
            });
            return result.count;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error('❌ Failed to get active room members count', err, { roomId });
            return 0;
        }
    },
    /**
     * Generate unique ID
     */
    generateId: () => {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    },
    /**
     * Calculate TTL timestamp
     */
    calculateTTL: (days) => {
        return Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
    },
    /**
     * Validate movie ID format
     */
    isValidMovieId: (movieId) => {
        return /^\d+$/.test(movieId);
    },
    /**
     * Validate room capacity
     */
    isValidRoomCapacity: (capacity) => {
        return capacity >= 2 && capacity <= 10;
    },
    /**
     * Sanitize string input
     */
    sanitizeString: (input, maxLength = 255) => {
        if (!input || typeof input !== 'string')
            return '';
        return input
            .trim()
            .substring(0, maxLength)
            .replace(/[<>\"'&]/g, ''); // Basic XSS protection
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFzZS1oYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7OztBQXVHSCxzQ0F5REM7QUE5SkQsMkNBQTRGO0FBQzVGLDZDQUFvRjtBQUNwRiw2Q0FBb0Q7QUFDcEQsaURBQXFFO0FBQ3JFLDJEQUFxRTtBQUVyRSxNQUFzQixXQUFXO0lBSS9CO1FBSUE7O1dBRUc7UUFDTyxXQUFNLEdBQUc7WUFDakIsSUFBSSxFQUFFLENBQUMsT0FBZSxFQUFFLE9BQWEsRUFBRSxFQUFFLENBQUMsZUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDO1lBQ3ZFLEtBQUssRUFBRSxDQUFDLE9BQWUsRUFBRSxLQUFhLEVBQUUsT0FBYSxFQUFFLEVBQUUsQ0FBQyxlQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxDQUFDO1lBQy9GLElBQUksRUFBRSxDQUFDLE9BQWUsRUFBRSxPQUFhLEVBQUUsRUFBRSxDQUFDLGVBQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQztZQUN2RSxLQUFLLEVBQUUsQ0FBQyxPQUFlLEVBQUUsT0FBYSxFQUFFLEVBQUUsQ0FBQyxlQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUM7U0FDMUUsQ0FBQztRQVhBLG1EQUFtRDtJQUNyRCxDQUFDO0lBWUQ7O09BRUc7SUFDSSxLQUFLLENBQUMsVUFBVTtRQUNyQixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxJQUFBLHlCQUFnQixHQUFFLENBQUM7WUFDdkMsSUFBSSxDQUFDLEVBQUUsR0FBRyxNQUFNLElBQUEseUJBQWMsRUFBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFNUMsMkNBQTJDO1lBQzNDLHFDQUFxQztRQUN2QyxDQUFD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XHJcbiAqIEJhc2UgaGFuZGxlciBmb3IgVHJpbml0eSBMYW1iZGEgZnVuY3Rpb25zXHJcbiAqIFByb3ZpZGVzIGNvbW1vbiBmdW5jdGlvbmFsaXR5LCBlcnJvciBoYW5kbGluZywgYW5kIGxvZ2dpbmdcclxuICovXHJcblxyXG5pbXBvcnQgeyBBcHBTeW5jRXZlbnQsIFRyaW5pdHlDb25maWcsIFRyaW5pdHlFcnJvciwgTGFtYmRhUmVzcG9uc2UgfSBmcm9tICcuLi9zaGFyZWQvdHlwZXMnO1xyXG5pbXBvcnQgeyBsb2dnZXIsIExvZ1V0aWxzLCBQZXJmb3JtYW5jZVRpbWVyLCBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi9zaGFyZWQvbG9nZ2VyJztcclxuaW1wb3J0IHsgZ2V0VHJpbml0eUNvbmZpZyB9IGZyb20gJy4uL3NoYXJlZC9jb25maWcnO1xyXG5pbXBvcnQgeyBjcmVhdGVEYXRhYmFzZSwgVHJpbml0eURhdGFiYXNlIH0gZnJvbSAnLi4vc2hhcmVkL2RhdGFiYXNlJztcclxuaW1wb3J0IHsgRXJyb3JIYW5kbGVyLCBFcnJvckNvbnRleHQgfSBmcm9tICcuLi9zaGFyZWQvZXJyb3ItaGFuZGxlcic7XHJcblxyXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQmFzZUhhbmRsZXIge1xyXG4gIHByb3RlY3RlZCBjb25maWc6IFRyaW5pdHlDb25maWc7XHJcbiAgcHJvdGVjdGVkIGRiOiBUcmluaXR5RGF0YWJhc2U7XHJcblxyXG4gIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgLy8gSW5pdGlhbGl6ZSB3aWxsIGJlIGNhbGxlZCBieSB0aGUgaGFuZGxlciB3cmFwcGVyXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBMb2dnZXIgaW50ZXJmYWNlIHRoYXQgZXhwb3NlcyBvbmx5IHB1YmxpYyBtZXRob2RzXHJcbiAgICovXHJcbiAgcHJvdGVjdGVkIGxvZ2dlciA9IHtcclxuICAgIGluZm86IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBhbnkpID0+IGxvZ2dlci5pbmZvKG1lc3NhZ2UsIGNvbnRleHQpLFxyXG4gICAgZXJyb3I6IChtZXNzYWdlOiBzdHJpbmcsIGVycm9yPzogRXJyb3IsIGNvbnRleHQ/OiBhbnkpID0+IGxvZ2dlci5lcnJvcihtZXNzYWdlLCBlcnJvciwgY29udGV4dCksXHJcbiAgICB3YXJuOiAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogYW55KSA9PiBsb2dnZXIud2FybihtZXNzYWdlLCBjb250ZXh0KSxcclxuICAgIGRlYnVnOiAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogYW55KSA9PiBsb2dnZXIuZGVidWcobWVzc2FnZSwgY29udGV4dCksXHJcbiAgfTtcclxuXHJcbiAgLyoqXHJcbiAgICogSW5pdGlhbGl6ZSB0aGUgaGFuZGxlciB3aXRoIGNvbmZpZ3VyYXRpb24gYW5kIGRhdGFiYXNlXHJcbiAgICovXHJcbiAgcHVibGljIGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBpZiAoIXRoaXMuY29uZmlnKSB7XHJcbiAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgZ2V0VHJpbml0eUNvbmZpZygpO1xyXG4gICAgICB0aGlzLmRiID0gYXdhaXQgY3JlYXRlRGF0YWJhc2UodGhpcy5jb25maWcpO1xyXG4gICAgICBcclxuICAgICAgLy8gVXBkYXRlIGxvZ2dlciBjb250ZXh0IHdpdGggZnVuY3Rpb24gbmFtZVxyXG4gICAgICAvLyBMb2dnZXIgY29udGV4dCBpcyBtYW5hZ2VkIGdsb2JhbGx5XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBNYWluIGhhbmRsZXIgbWV0aG9kIC0gdG8gYmUgaW1wbGVtZW50ZWQgYnkgc3ViY2xhc3Nlc1xyXG4gICAqL1xyXG4gIGFic3RyYWN0IGhhbmRsZShldmVudDogQXBwU3luY0V2ZW50KTogUHJvbWlzZTxhbnk+O1xyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSB1c2VyIGF1dGhlbnRpY2F0aW9uXHJcbiAgICovXHJcbiAgcHJvdGVjdGVkIHZhbGlkYXRlQXV0aChldmVudDogQXBwU3luY0V2ZW50KTogc3RyaW5nIHtcclxuICAgIGlmICghZXZlbnQuaWRlbnRpdHk/LnN1Yikge1xyXG4gICAgICB0aHJvdyBuZXcgVHJpbml0eUVycm9yKCdVc2VyIG5vdCBhdXRoZW50aWNhdGVkJywgJ1VOQVVUSE9SSVpFRCcsIDQwMSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZXZlbnQuaWRlbnRpdHkuc3ViO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVmFsaWRhdGUgcmVxdWlyZWQgYXJndW1lbnRzXHJcbiAgICovXHJcbiAgcHJvdGVjdGVkIHZhbGlkYXRlQXJnczxUPihhcmdzOiBhbnksIHJlcXVpcmVkRmllbGRzOiAoa2V5b2YgVClbXSk6IFQge1xyXG4gICAgY29uc3QgbWlzc2luZyA9IHJlcXVpcmVkRmllbGRzLmZpbHRlcihmaWVsZCA9PiAhYXJnc1tmaWVsZF0pO1xyXG4gICAgaWYgKG1pc3NpbmcubGVuZ3RoID4gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgVHJpbml0eUVycm9yKFxyXG4gICAgICAgIGBNaXNzaW5nIHJlcXVpcmVkIGFyZ3VtZW50czogJHttaXNzaW5nLmpvaW4oJywgJyl9YCxcclxuICAgICAgICAnVkFMSURBVElPTl9FUlJPUicsXHJcbiAgICAgICAgNDAwLFxyXG4gICAgICAgIHsgbWlzc2luZyB9XHJcbiAgICAgICk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYXJncyBhcyBUO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIHN1Y2Nlc3MgcmVzcG9uc2VcclxuICAgKi9cclxuICBwcm90ZWN0ZWQgc3VjY2VzczxUPihkYXRhOiBULCBzdGF0dXNDb2RlOiBudW1iZXIgPSAyMDApOiBMYW1iZGFSZXNwb25zZTxUPiB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGF0dXNDb2RlLFxyXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShkYXRhKSxcclxuICAgICAgZGF0YSxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDcmVhdGUgZXJyb3IgcmVzcG9uc2UgdXNpbmcgY2VudHJhbGl6ZWQgZXJyb3IgaGFuZGxlclxyXG4gICAqL1xyXG4gIHByb3RlY3RlZCBlcnJvcihlcnJvcjogRXJyb3IsIGNvbnRleHQ6IEVycm9yQ29udGV4dCA9IHt9KTogTGFtYmRhUmVzcG9uc2Uge1xyXG4gICAgY29uc3QgZXJyb3JSZXNwb25zZSA9IEVycm9ySGFuZGxlci5jcmVhdGVFcnJvclJlc3BvbnNlKGVycm9yLCBjb250ZXh0KTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RhdHVzQ29kZTogZXJyb3JSZXNwb25zZS5zdGF0dXNDb2RlLFxyXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgZXJyb3I6IGVycm9yUmVzcG9uc2UuZXJyb3IsXHJcbiAgICAgICAgY29kZTogZXJyb3JSZXNwb25zZS5jb2RlLFxyXG4gICAgICAgIGNhdGVnb3J5OiBlcnJvclJlc3BvbnNlLmNhdGVnb3J5LFxyXG4gICAgICAgIGRldGFpbHM6IGVycm9yUmVzcG9uc2UuZGV0YWlscyxcclxuICAgICAgICB0aW1lc3RhbXA6IGVycm9yUmVzcG9uc2UudGltZXN0YW1wLFxyXG4gICAgICB9KSxcclxuICAgIH07XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogSGFuZGxlciB3cmFwcGVyIHRoYXQgcHJvdmlkZXMgY29tbW9uIGZ1bmN0aW9uYWxpdHlcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVIYW5kbGVyPFQgZXh0ZW5kcyBCYXNlSGFuZGxlcj4oSGFuZGxlckNsYXNzOiBuZXcgKCkgPT4gVCkge1xyXG4gIHJldHVybiBhc3luYyAoZXZlbnQ6IEFwcFN5bmNFdmVudCk6IFByb21pc2U8YW55PiA9PiB7XHJcbiAgICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdMYW1iZGFIYW5kbGVyJywgbG9nZ2VyKTtcclxuICAgIGNvbnN0IGhhbmRsZXJJbnN0YW5jZSA9IG5ldyBIYW5kbGVyQ2xhc3MoKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBMb2cgZnVuY3Rpb24gc3RhcnRcclxuICAgICAgTG9nVXRpbHMubG9nRnVuY3Rpb25TdGFydChcclxuICAgICAgICBwcm9jZXNzLmVudi5BV1NfTEFNQkRBX0ZVTkNUSU9OX05BTUUgfHwgJ1Vua25vd25GdW5jdGlvbicsXHJcbiAgICAgICAgZXZlbnQsXHJcbiAgICAgICAgeyB1c2VySWQ6IGV2ZW50LmlkZW50aXR5Py5zdWIgfVxyXG4gICAgICApO1xyXG5cclxuICAgICAgLy8gSW5pdGlhbGl6ZSBoYW5kbGVyXHJcbiAgICAgIGF3YWl0IGhhbmRsZXJJbnN0YW5jZS5pbml0aWFsaXplKCk7XHJcblxyXG4gICAgICAvLyBFeGVjdXRlIGhhbmRsZXJcclxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlckluc3RhbmNlLmhhbmRsZShldmVudCk7XHJcblxyXG4gICAgICAvLyBMb2cgZnVuY3Rpb24gZW5kXHJcbiAgICAgIExvZ1V0aWxzLmxvZ0Z1bmN0aW9uRW5kKFxyXG4gICAgICAgIHByb2Nlc3MuZW52LkFXU19MQU1CREFfRlVOQ1RJT05fTkFNRSB8fCAnVW5rbm93bkZ1bmN0aW9uJyxcclxuICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgeyB1c2VySWQ6IGV2ZW50LmlkZW50aXR5Py5zdWIgfVxyXG4gICAgICApO1xyXG5cclxuICAgICAgdGltZXIuZmluaXNoKHRydWUpO1xyXG4gICAgICByZXR1cm4gcmVzdWx0O1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnN0IGVycm9yQ29udGV4dDogRXJyb3JDb250ZXh0ID0ge1xyXG4gICAgICAgIHVzZXJJZDogZXZlbnQuaWRlbnRpdHk/LnN1YixcclxuICAgICAgICBvcGVyYXRpb246IGV2ZW50LmluZm8/LmZpZWxkTmFtZSxcclxuICAgICAgICByZXF1ZXN0SWQ6IHByb2Nlc3MuZW52LkFXU19SRVFVRVNUX0lELFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgLy8gVXNlIGNlbnRyYWxpemVkIGVycm9yIGhhbmRsaW5nXHJcbiAgICAgIEVycm9ySGFuZGxlci5sb2dFcnJvcihlcnJvciBhcyBFcnJvciwgZXJyb3JDb250ZXh0LCBwcm9jZXNzLmVudi5BV1NfTEFNQkRBX0ZVTkNUSU9OX05BTUUpO1xyXG5cclxuICAgICAgdGltZXIuZmluaXNoV2l0aEVycm9yKGVycm9yIGFzIEVycm9yKTtcclxuXHJcbiAgICAgIC8vIFJldHVybiBHcmFwaFFMLWNvbXBhdGlibGUgZXJyb3JcclxuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgVHJpbml0eUVycm9yKSB7XHJcbiAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFVzZSBlcnJvciBoYW5kbGVyIHRvIGNyZWF0ZSBjb25zaXN0ZW50IGVycm9yIHJlc3BvbnNlXHJcbiAgICAgIGNvbnN0IGVycm9yUmVzcG9uc2UgPSBFcnJvckhhbmRsZXIuY3JlYXRlRXJyb3JSZXNwb25zZShlcnJvciBhcyBFcnJvciwgZXJyb3JDb250ZXh0KTtcclxuICAgICAgXHJcbiAgICAgIHRocm93IG5ldyBUcmluaXR5RXJyb3IoXHJcbiAgICAgICAgZXJyb3JSZXNwb25zZS5lcnJvcixcclxuICAgICAgICBlcnJvclJlc3BvbnNlLmNvZGUsXHJcbiAgICAgICAgZXJyb3JSZXNwb25zZS5zdGF0dXNDb2RlLFxyXG4gICAgICAgIGVycm9yUmVzcG9uc2UuZGV0YWlsc1xyXG4gICAgICApO1xyXG4gICAgfVxyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBVdGlsaXR5IGZ1bmN0aW9ucyBmb3IgY29tbW9uIGhhbmRsZXIgb3BlcmF0aW9uc1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IEhhbmRsZXJVdGlscyA9IHtcclxuICAvKipcclxuICAgKiBFeHRyYWN0IEdyYXBoUUwgb3BlcmF0aW9uIGluZm9cclxuICAgKi9cclxuICBnZXRPcGVyYXRpb25JbmZvOiAoZXZlbnQ6IEFwcFN5bmNFdmVudCkgPT4gKHtcclxuICAgIGZpZWxkTmFtZTogZXZlbnQuaW5mbz8uZmllbGROYW1lLFxyXG4gICAgcGFyZW50VHlwZU5hbWU6IGV2ZW50LmluZm8/LnBhcmVudFR5cGVOYW1lLFxyXG4gICAgdmFyaWFibGVzOiBldmVudC5pbmZvPy52YXJpYWJsZXMsXHJcbiAgfSksXHJcblxyXG4gIC8qKlxyXG4gICAqIEV4dHJhY3QgdXNlciBpbmZvIGZyb20gZXZlbnRcclxuICAgKi9cclxuICBnZXRVc2VySW5mbzogKGV2ZW50OiBBcHBTeW5jRXZlbnQpID0+ICh7XHJcbiAgICB1c2VySWQ6IGV2ZW50LmlkZW50aXR5Py5zdWIsXHJcbiAgICB1c2VybmFtZTogZXZlbnQuaWRlbnRpdHk/LnVzZXJuYW1lLFxyXG4gICAgY2xhaW1zOiBldmVudC5pZGVudGl0eT8uY2xhaW1zLFxyXG4gIH0pLFxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSByb29tIGFjY2Vzc1xyXG4gICAqL1xyXG4gIHZhbGlkYXRlUm9vbUFjY2VzczogYXN5bmMgKFxyXG4gICAgZGI6IFRyaW5pdHlEYXRhYmFzZSxcclxuICAgIHVzZXJJZDogc3RyaW5nLFxyXG4gICAgcm9vbUlkOiBzdHJpbmcsXHJcbiAgICBjb25maWc6IFRyaW5pdHlDb25maWdcclxuICApOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IG1lbWJlciA9IGF3YWl0IGRiLmdldChcclxuICAgICAgICBjb25maWcudGFibGVzLnJvb21NZW1iZXJzLFxyXG4gICAgICAgIHsgcm9vbUlkLCB1c2VySWQgfVxyXG4gICAgICApO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIG1lbWJlciAmJiBtZW1iZXIuaXNBY3RpdmU7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zdCBlcnIgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSk7XHJcbiAgICAgIGxvZ2dlci5lcnJvcign4p2MIEZhaWxlZCB0byB2YWxpZGF0ZSByb29tIGFjY2VzcycsIGVyciwgeyB1c2VySWQsIHJvb21JZCB9KTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH0sXHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrIGlmIHVzZXIgaXMgcm9vbSBob3N0XHJcbiAgICovXHJcbiAgaXNSb29tSG9zdDogYXN5bmMgKFxyXG4gICAgZGI6IFRyaW5pdHlEYXRhYmFzZSxcclxuICAgIHVzZXJJZDogc3RyaW5nLFxyXG4gICAgcm9vbUlkOiBzdHJpbmcsXHJcbiAgICBjb25maWc6IFRyaW5pdHlDb25maWdcclxuICApOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJvb20gPSBhd2FpdCBkYi5nZXQoXHJcbiAgICAgICAgY29uZmlnLnRhYmxlcy5yb29tcyxcclxuICAgICAgICB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfVxyXG4gICAgICApO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHJvb20gJiYgcm9vbS5ob3N0SWQgPT09IHVzZXJJZDtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnN0IGVyciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKTtcclxuICAgICAgbG9nZ2VyLmVycm9yKCfinYwgRmFpbGVkIHRvIGNoZWNrIHJvb20gaG9zdCcsIGVyciwgeyB1c2VySWQsIHJvb21JZCB9KTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH0sXHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBhY3RpdmUgcm9vbSBtZW1iZXJzIGNvdW50XHJcbiAgICovXHJcbiAgZ2V0QWN0aXZlUm9vbU1lbWJlcnNDb3VudDogYXN5bmMgKFxyXG4gICAgZGI6IFRyaW5pdHlEYXRhYmFzZSxcclxuICAgIHJvb21JZDogc3RyaW5nLFxyXG4gICAgY29uZmlnOiBUcmluaXR5Q29uZmlnXHJcbiAgKTogUHJvbWlzZTxudW1iZXI+ID0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5KFxyXG4gICAgICAgIGNvbmZpZy50YWJsZXMucm9vbU1lbWJlcnMsXHJcbiAgICAgICAgJ3Jvb21JZCA9IDpyb29tSWQnLFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGZpbHRlckV4cHJlc3Npb246ICdpc0FjdGl2ZSA9IDphY3RpdmUnLFxyXG4gICAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgICAnOnJvb21JZCc6IHJvb21JZCxcclxuICAgICAgICAgICAgJzphY3RpdmUnOiB0cnVlLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9XHJcbiAgICAgICk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4gcmVzdWx0LmNvdW50O1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBsb2dnZXIuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gZ2V0IGFjdGl2ZSByb29tIG1lbWJlcnMgY291bnQnLCBlcnIsIHsgcm9vbUlkIH0pO1xyXG4gICAgICByZXR1cm4gMDtcclxuICAgIH1cclxuICB9LFxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmF0ZSB1bmlxdWUgSURcclxuICAgKi9cclxuICBnZW5lcmF0ZUlkOiAoKTogc3RyaW5nID0+IHtcclxuICAgIHJldHVybiBgJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cmluZygyLCAxNSl9YDtcclxuICB9LFxyXG5cclxuICAvKipcclxuICAgKiBDYWxjdWxhdGUgVFRMIHRpbWVzdGFtcFxyXG4gICAqL1xyXG4gIGNhbGN1bGF0ZVRUTDogKGRheXM6IG51bWJlcik6IG51bWJlciA9PiB7XHJcbiAgICByZXR1cm4gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkgKyAoZGF5cyAqIDI0ICogNjAgKiA2MCk7XHJcbiAgfSxcclxuXHJcbiAgLyoqXHJcbiAgICogVmFsaWRhdGUgbW92aWUgSUQgZm9ybWF0XHJcbiAgICovXHJcbiAgaXNWYWxpZE1vdmllSWQ6IChtb3ZpZUlkOiBzdHJpbmcpOiBib29sZWFuID0+IHtcclxuICAgIHJldHVybiAvXlxcZCskLy50ZXN0KG1vdmllSWQpO1xyXG4gIH0sXHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIHJvb20gY2FwYWNpdHlcclxuICAgKi9cclxuICBpc1ZhbGlkUm9vbUNhcGFjaXR5OiAoY2FwYWNpdHk6IG51bWJlcik6IGJvb2xlYW4gPT4ge1xyXG4gICAgcmV0dXJuIGNhcGFjaXR5ID49IDIgJiYgY2FwYWNpdHkgPD0gMTA7XHJcbiAgfSxcclxuXHJcbiAgLyoqXHJcbiAgICogU2FuaXRpemUgc3RyaW5nIGlucHV0XHJcbiAgICovXHJcbiAgc2FuaXRpemVTdHJpbmc6IChpbnB1dDogc3RyaW5nLCBtYXhMZW5ndGg6IG51bWJlciA9IDI1NSk6IHN0cmluZyA9PiB7XHJcbiAgICBpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gJ3N0cmluZycpIHJldHVybiAnJztcclxuICAgIFxyXG4gICAgcmV0dXJuIGlucHV0XHJcbiAgICAgIC50cmltKClcclxuICAgICAgLnN1YnN0cmluZygwLCBtYXhMZW5ndGgpXHJcbiAgICAgIC5yZXBsYWNlKC9bPD5cXFwiJyZdL2csICcnKTsgLy8gQmFzaWMgWFNTIHByb3RlY3Rpb25cclxuICB9LFxyXG59OyJdfQ==