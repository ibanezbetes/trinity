"use strict";
/**
 * Trinity Auth Handler
 * Handles user authentication and authorization operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const base_handler_1 = require("./base-handler");
const types_1 = require("../shared/types");
const base_handler_2 = require("./base-handler");
class AuthHandler extends base_handler_1.BaseHandler {
    async handle(event) {
        const { fieldName } = base_handler_2.HandlerUtils.getOperationInfo(event);
        const { userId } = base_handler_2.HandlerUtils.getUserInfo(event);
        this.logger.info(`🔐 Auth operation: ${fieldName}`, { userId, fieldName });
        switch (fieldName) {
            case 'createUser':
                return this.createUser(event.arguments, userId);
            case 'updateUser':
                return this.updateUser(event.arguments, userId);
            case 'getUser':
                return this.getUser(event.arguments, userId);
            case 'getCurrentUser':
                return this.getCurrentUser(userId);
            case 'deleteUser':
                return this.deleteUser(userId);
            default:
                throw new types_1.ValidationError(`Unknown auth operation: ${fieldName}`);
        }
    }
    /**
     * Create a new user profile
     */
    async createUser(args, userId) {
        // Validate required fields
        this.validateArgs(args, ['username', 'email']);
        // Sanitize inputs
        const username = base_handler_2.HandlerUtils.sanitizeString(args.username, 50);
        const email = base_handler_2.HandlerUtils.sanitizeString(args.email, 255);
        const displayName = args.displayName ? base_handler_2.HandlerUtils.sanitizeString(args.displayName, 100) : username;
        // Check if user already exists
        const existingUser = await this.db.get(this.config.tables.users, { id: userId });
        if (existingUser) {
            throw new types_1.ConflictError('User already exists', { userId });
        }
        // Check if username is taken
        const usernameCheck = await this.db.query(this.config.tables.users, 'username = :username', {
            indexName: 'UsernameIndex',
            expressionAttributeValues: { ':username': username },
            limit: 1,
        });
        if (usernameCheck.count > 0) {
            throw new types_1.ConflictError('Username already taken', { username });
        }
        // Create user object
        const now = new Date().toISOString();
        const user = {
            id: userId,
            username,
            email,
            displayName,
            createdAt: now,
            updatedAt: now,
            isActive: true,
        };
        // Save user to database
        await this.db.put(this.config.tables.users, user);
        this.logger.info('✅ User created successfully', { userId, username });
        return user;
    }
    /**
     * Update user profile
     */
    async updateUser(args, userId) {
        // Get existing user
        const existingUser = await this.db.get(this.config.tables.users, { id: userId });
        if (!existingUser) {
            throw new types_1.NotFoundError('User', userId);
        }
        // Build update expression
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        if (args.displayName !== undefined) {
            updateExpressions.push('#displayName = :displayName');
            expressionAttributeNames['#displayName'] = 'displayName';
            expressionAttributeValues[':displayName'] = base_handler_2.HandlerUtils.sanitizeString(args.displayName, 100);
        }
        if (args.avatar !== undefined) {
            updateExpressions.push('#avatar = :avatar');
            expressionAttributeNames['#avatar'] = 'avatar';
            expressionAttributeValues[':avatar'] = base_handler_2.HandlerUtils.sanitizeString(args.avatar, 500);
        }
        if (updateExpressions.length === 0) {
            return existingUser; // No changes
        }
        // Add updatedAt
        updateExpressions.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();
        const updateExpression = `SET ${updateExpressions.join(', ')}`;
        // Update user
        const updatedUser = await this.db.update(this.config.tables.users, { id: userId }, updateExpression, {
            expressionAttributeNames,
            expressionAttributeValues,
            returnValues: 'ALL_NEW',
        });
        this.logger.info('✅ User updated successfully', { userId });
        return updatedUser;
    }
    /**
     * Get user by ID
     */
    async getUser(args, requestingUserId) {
        const targetUserId = args.userId || requestingUserId;
        const user = await this.db.get(this.config.tables.users, { id: targetUserId });
        if (!user) {
            throw new types_1.NotFoundError('User', targetUserId);
        }
        if (!user.isActive) {
            throw new types_1.NotFoundError('User', targetUserId);
        }
        return user;
    }
    /**
     * Get current authenticated user
     */
    async getCurrentUser(userId) {
        return this.getUser({}, userId);
    }
    /**
     * Soft delete user (deactivate)
     */
    async deleteUser(userId) {
        // Check if user exists
        const existingUser = await this.db.get(this.config.tables.users, { id: userId });
        if (!existingUser) {
            throw new types_1.NotFoundError('User', userId);
        }
        // Soft delete by setting isActive to false
        await this.db.update(this.config.tables.users, { id: userId }, 'SET #isActive = :isActive, #updatedAt = :updatedAt', {
            expressionAttributeNames: {
                '#isActive': 'isActive',
                '#updatedAt': 'updatedAt',
            },
            expressionAttributeValues: {
                ':isActive': false,
                ':updatedAt': new Date().toISOString(),
            },
        });
        this.logger.info('✅ User deactivated successfully', { userId });
        return true;
    }
}
// Export the handler
exports.handler = (0, base_handler_1.createHandler)(AuthHandler);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXV0aC1oYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7OztBQUVILGlEQUE0RDtBQUM1RCwyQ0FBMkc7QUFDM0csaURBQThDO0FBaUI5QyxNQUFNLFdBQVksU0FBUSwwQkFBVztJQUNuQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQW1CO1FBQzlCLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRywyQkFBWSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNELE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRywyQkFBWSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUVuRCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsU0FBUyxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUUzRSxRQUFRLFNBQVMsRUFBRSxDQUFDO1lBQ2xCLEtBQUssWUFBWTtnQkFDZixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFNBQTJCLEVBQUUsTUFBTyxDQUFDLENBQUM7WUFFckUsS0FBSyxZQUFZO2dCQUNmLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsU0FBMkIsRUFBRSxNQUFPLENBQUMsQ0FBQztZQUVyRSxLQUFLLFNBQVM7Z0JBQ1osT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxTQUF3QixFQUFFLE1BQU8sQ0FBQyxDQUFDO1lBRS9ELEtBQUssZ0JBQWdCO2dCQUNuQixPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTyxDQUFDLENBQUM7WUFFdEMsS0FBSyxZQUFZO2dCQUNmLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFPLENBQUMsQ0FBQztZQUVsQztnQkFDRSxNQUFNLElBQUksdUJBQWUsQ0FBQywyQkFBMkIsU0FBUyxFQUFF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QUFVLENBQUMsTUFBYztRQUNyQyx1QkFBdUI7UUFDdkIsTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FDcEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUN4QixFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsQ0FDZixDQUFDO1FBRUYsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2xCLE1BQU0sSUFBSSxxQkFBYSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMxQyxDQUFDO1FBRUQsMkNBQTJDO1FBQzNDLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQ2xCLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFDeEIsRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLEVBQ2Qsb0RBQW9ELEVBQ3BEO1lBQ0Usd0JBQXdCLEVBQUU7Z0JBQ3hCLFdBQVcsRUFBRSxVQUFVO2dCQUN2QixZQUFZLEVBQUUsV0FBVzthQUMxQjtZQUNELHlCQUF5QixFQUFFO2dCQUN6QixXQUFXLEVBQUUsS0FBSztnQkFDbEIsWUFBWSxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO2FBQ3ZDO1NBQ0YsQ0FDRixDQUFDO1FBRUYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ2hFLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztDQUNGO0FBRUQscUJBQXFCO0FBQ1IsUUFBQSxPQUFPLEdBQUcsSUFBQSw0QkFBYSxFQUFDLFdBQVcsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIFRyaW5pdHkgQXV0aCBIYW5kbGVyXHJcbiAqIEhhbmRsZXMgdXNlciBhdXRoZW50aWNhdGlvbiBhbmQgYXV0aG9yaXphdGlvbiBvcGVyYXRpb25zXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgQmFzZUhhbmRsZXIsIGNyZWF0ZUhhbmRsZXIgfSBmcm9tICcuL2Jhc2UtaGFuZGxlcic7XHJcbmltcG9ydCB7IEFwcFN5bmNFdmVudCwgVHJpbml0eVVzZXIsIFZhbGlkYXRpb25FcnJvciwgTm90Rm91bmRFcnJvciwgQ29uZmxpY3RFcnJvciB9IGZyb20gJy4uL3NoYXJlZC90eXBlcyc7XHJcbmltcG9ydCB7IEhhbmRsZXJVdGlscyB9IGZyb20gJy4vYmFzZS1oYW5kbGVyJztcclxuXHJcbmludGVyZmFjZSBDcmVhdGVVc2VyQXJncyB7XHJcbiAgdXNlcm5hbWU6IHN0cmluZztcclxuICBlbWFpbDogc3RyaW5nO1xyXG4gIGRpc3BsYXlOYW1lPzogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVXBkYXRlVXNlckFyZ3Mge1xyXG4gIGRpc3BsYXlOYW1lPzogc3RyaW5nO1xyXG4gIGF2YXRhcj86IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEdldFVzZXJBcmdzIHtcclxuICB1c2VySWQ/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmNsYXNzIEF1dGhIYW5kbGVyIGV4dGVuZHMgQmFzZUhhbmRsZXIge1xyXG4gIGFzeW5jIGhhbmRsZShldmVudDogQXBwU3luY0V2ZW50KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnN0IHsgZmllbGROYW1lIH0gPSBIYW5kbGVyVXRpbHMuZ2V0T3BlcmF0aW9uSW5mbyhldmVudCk7XHJcbiAgICBjb25zdCB7IHVzZXJJZCB9ID0gSGFuZGxlclV0aWxzLmdldFVzZXJJbmZvKGV2ZW50KTtcclxuXHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKGDwn5SQIEF1dGggb3BlcmF0aW9uOiAke2ZpZWxkTmFtZX1gLCB7IHVzZXJJZCwgZmllbGROYW1lIH0pO1xyXG5cclxuICAgIHN3aXRjaCAoZmllbGROYW1lKSB7XHJcbiAgICAgIGNhc2UgJ2NyZWF0ZVVzZXInOlxyXG4gICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVVzZXIoZXZlbnQuYXJndW1lbnRzIGFzIENyZWF0ZVVzZXJBcmdzLCB1c2VySWQhKTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ3VwZGF0ZVVzZXInOlxyXG4gICAgICAgIHJldHVybiB0aGlzLnVwZGF0ZVVzZXIoZXZlbnQuYXJndW1lbnRzIGFzIFVwZGF0ZVVzZXJBcmdzLCB1c2VySWQhKTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2dldFVzZXInOlxyXG4gICAgICAgIHJldHVybiB0aGlzLmdldFVzZXIoZXZlbnQuYXJndW1lbnRzIGFzIEdldFVzZXJBcmdzLCB1c2VySWQhKTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2dldEN1cnJlbnRVc2VyJzpcclxuICAgICAgICByZXR1cm4gdGhpcy5nZXRDdXJyZW50VXNlcih1c2VySWQhKTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2RlbGV0ZVVzZXInOlxyXG4gICAgICAgIHJldHVybiB0aGlzLmRlbGV0ZVVzZXIodXNlcklkISk7XHJcbiAgICAgIFxyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoYFVua25vd24gYXV0aCBvcGVyYXRpb246ICR7ZmllbGROYW1lfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIGEgbmV3IHVzZXIgcHJvZmlsZVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgY3JlYXRlVXNlcihhcmdzOiBDcmVhdGVVc2VyQXJncywgdXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPFRyaW5pdHlVc2VyPiB7XHJcbiAgICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBmaWVsZHNcclxuICAgIHRoaXMudmFsaWRhdGVBcmdzPENyZWF0ZVVzZXJBcmdzPihhcmdzLCBbJ3VzZXJuYW1lJywgJ2VtYWlsJ10pO1xyXG5cclxuICAgIC8vIFNhbml0aXplIGlucHV0c1xyXG4gICAgY29uc3QgdXNlcm5hbWUgPSBIYW5kbGVyVXRpbHMuc2FuaXRpemVTdHJpbmcoYXJncy51c2VybmFtZSwgNTApO1xyXG4gICAgY29uc3QgZW1haWwgPSBIYW5kbGVyVXRpbHMuc2FuaXRpemVTdHJpbmcoYXJncy5lbWFpbCwgMjU1KTtcclxuICAgIGNvbnN0IGRpc3BsYXlOYW1lID0gYXJncy5kaXNwbGF5TmFtZSA/IEhhbmRsZXJVdGlscy5zYW5pdGl6ZVN0cmluZyhhcmdzLmRpc3BsYXlOYW1lLCAxMDApIDogdXNlcm5hbWU7XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgdXNlciBhbHJlYWR5IGV4aXN0c1xyXG4gICAgY29uc3QgZXhpc3RpbmdVc2VyID0gYXdhaXQgdGhpcy5kYi5nZXQ8VHJpbml0eVVzZXI+KFxyXG4gICAgICB0aGlzLmNvbmZpZy50YWJsZXMudXNlcnMsXHJcbiAgICAgIHsgaWQ6IHVzZXJJZCB9XHJcbiAgICApO1xyXG5cclxuICAgIGlmIChleGlzdGluZ1VzZXIpIHtcclxuICAgICAgdGhyb3cgbmV3IENvbmZsaWN0RXJyb3IoJ1VzZXIgYWxyZWFkeSBleGlzdHMnLCB7IHVzZXJJZCB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBpZiB1c2VybmFtZSBpcyB0YWtlblxyXG4gICAgY29uc3QgdXNlcm5hbWVDaGVjayA9IGF3YWl0IHRoaXMuZGIucXVlcnk8VHJpbml0eVVzZXI+KFxyXG4gICAgICB0aGlzLmNvbmZpZy50YWJsZXMudXNlcnMsXHJcbiAgICAgICd1c2VybmFtZSA9IDp1c2VybmFtZScsXHJcbiAgICAgIHtcclxuICAgICAgICBpbmRleE5hbWU6ICdVc2VybmFtZUluZGV4JyxcclxuICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7ICc6dXNlcm5hbWUnOiB1c2VybmFtZSB9LFxyXG4gICAgICAgIGxpbWl0OiAxLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIGlmICh1c2VybmFtZUNoZWNrLmNvdW50ID4gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgQ29uZmxpY3RFcnJvcignVXNlcm5hbWUgYWxyZWFkeSB0YWtlbicsIHsgdXNlcm5hbWUgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ3JlYXRlIHVzZXIgb2JqZWN0XHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcbiAgICBjb25zdCB1c2VyOiBUcmluaXR5VXNlciA9IHtcclxuICAgICAgaWQ6IHVzZXJJZCxcclxuICAgICAgdXNlcm5hbWUsXHJcbiAgICAgIGVtYWlsLFxyXG4gICAgICBkaXNwbGF5TmFtZSxcclxuICAgICAgY3JlYXRlZEF0OiBub3csXHJcbiAgICAgIHVwZGF0ZWRBdDogbm93LFxyXG4gICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgIH07XHJcblxyXG4gICAgLy8gU2F2ZSB1c2VyIHRvIGRhdGFiYXNlXHJcbiAgICBhd2FpdCB0aGlzLmRiLnB1dCh0aGlzLmNvbmZpZy50YWJsZXMudXNlcnMsIHVzZXIpO1xyXG5cclxuICAgIHRoaXMubG9nZ2VyLmluZm8oJ+KchSBVc2VyIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5JywgeyB1c2VySWQsIHVzZXJuYW1lIH0pO1xyXG4gICAgcmV0dXJuIHVzZXI7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBVcGRhdGUgdXNlciBwcm9maWxlXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyB1cGRhdGVVc2VyKGFyZ3M6IFVwZGF0ZVVzZXJBcmdzLCB1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8VHJpbml0eVVzZXI+IHtcclxuICAgIC8vIEdldCBleGlzdGluZyB1c2VyXHJcbiAgICBjb25zdCBleGlzdGluZ1VzZXIgPSBhd2FpdCB0aGlzLmRiLmdldDxUcmluaXR5VXNlcj4oXHJcbiAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy51c2VycyxcclxuICAgICAgeyBpZDogdXNlcklkIH1cclxuICAgICk7XHJcblxyXG4gICAgaWYgKCFleGlzdGluZ1VzZXIpIHtcclxuICAgICAgdGhyb3cgbmV3IE5vdEZvdW5kRXJyb3IoJ1VzZXInLCB1c2VySWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEJ1aWxkIHVwZGF0ZSBleHByZXNzaW9uXHJcbiAgICBjb25zdCB1cGRhdGVFeHByZXNzaW9uczogc3RyaW5nW10gPSBbXTtcclxuICAgIGNvbnN0IGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xyXG4gICAgY29uc3QgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xyXG5cclxuICAgIGlmIChhcmdzLmRpc3BsYXlOYW1lICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgdXBkYXRlRXhwcmVzc2lvbnMucHVzaCgnI2Rpc3BsYXlOYW1lID0gOmRpc3BsYXlOYW1lJyk7XHJcbiAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lc1snI2Rpc3BsYXlOYW1lJ10gPSAnZGlzcGxheU5hbWUnO1xyXG4gICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzWyc6ZGlzcGxheU5hbWUnXSA9IEhhbmRsZXJVdGlscy5zYW5pdGl6ZVN0cmluZyhhcmdzLmRpc3BsYXlOYW1lLCAxMDApO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChhcmdzLmF2YXRhciAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIHVwZGF0ZUV4cHJlc3Npb25zLnB1c2goJyNhdmF0YXIgPSA6YXZhdGFyJyk7XHJcbiAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lc1snI2F2YXRhciddID0gJ2F2YXRhcic7XHJcbiAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXNbJzphdmF0YXInXSA9IEhhbmRsZXJVdGlscy5zYW5pdGl6ZVN0cmluZyhhcmdzLmF2YXRhciwgNTAwKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodXBkYXRlRXhwcmVzc2lvbnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHJldHVybiBleGlzdGluZ1VzZXI7IC8vIE5vIGNoYW5nZXNcclxuICAgIH1cclxuXHJcbiAgICAvLyBBZGQgdXBkYXRlZEF0XHJcbiAgICB1cGRhdGVFeHByZXNzaW9ucy5wdXNoKCcjdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcpO1xyXG4gICAgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzWycjdXBkYXRlZEF0J10gPSAndXBkYXRlZEF0JztcclxuICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXNbJzp1cGRhdGVkQXQnXSA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuXHJcbiAgICBjb25zdCB1cGRhdGVFeHByZXNzaW9uID0gYFNFVCAke3VwZGF0ZUV4cHJlc3Npb25zLmpvaW4oJywgJyl9YDtcclxuXHJcbiAgICAvLyBVcGRhdGUgdXNlclxyXG4gICAgY29uc3QgdXBkYXRlZFVzZXIgPSBhd2FpdCB0aGlzLmRiLnVwZGF0ZTxUcmluaXR5VXNlcj4oXHJcbiAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy51c2VycyxcclxuICAgICAgeyBpZDogdXNlcklkIH0sXHJcbiAgICAgIHVwZGF0ZUV4cHJlc3Npb24sXHJcbiAgICAgIHtcclxuICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlTmFtZXMsXHJcbiAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlcyxcclxuICAgICAgICByZXR1cm5WYWx1ZXM6ICdBTExfTkVXJyxcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKCfinIUgVXNlciB1cGRhdGVkIHN1Y2Nlc3NmdWxseScsIHsgdXNlcklkIH0pO1xyXG4gICAgcmV0dXJuIHVwZGF0ZWRVc2VyITtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCB1c2VyIGJ5IElEXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBnZXRVc2VyKGFyZ3M6IEdldFVzZXJBcmdzLCByZXF1ZXN0aW5nVXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPFRyaW5pdHlVc2VyPiB7XHJcbiAgICBjb25zdCB0YXJnZXRVc2VySWQgPSBhcmdzLnVzZXJJZCB8fCByZXF1ZXN0aW5nVXNlcklkO1xyXG5cclxuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCB0aGlzLmRiLmdldDxUcmluaXR5VXNlcj4oXHJcbiAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy51c2VycyxcclxuICAgICAgeyBpZDogdGFyZ2V0VXNlcklkIH1cclxuICAgICk7XHJcblxyXG4gICAgaWYgKCF1c2VyKSB7XHJcbiAgICAgIHRocm93IG5ldyBOb3RGb3VuZEVycm9yKCdVc2VyJywgdGFyZ2V0VXNlcklkKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXVzZXIuaXNBY3RpdmUpIHtcclxuICAgICAgdGhyb3cgbmV3IE5vdEZvdW5kRXJyb3IoJ1VzZXInLCB0YXJnZXRVc2VySWQpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB1c2VyO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGN1cnJlbnQgYXV0aGVudGljYXRlZCB1c2VyXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBnZXRDdXJyZW50VXNlcih1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8VHJpbml0eVVzZXI+IHtcclxuICAgIHJldHVybiB0aGlzLmdldFVzZXIoe30sIHVzZXJJZCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTb2Z0IGRlbGV0ZSB1c2VyIChkZWFjdGl2YXRlKVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlVXNlcih1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgLy8gQ2hlY2sgaWYgdXNlciBleGlzdHNcclxuICAgIGNvbnN0IGV4aXN0aW5nVXNlciA9IGF3YWl0IHRoaXMuZGIuZ2V0PFRyaW5pdHlVc2VyPihcclxuICAgICAgdGhpcy5jb25maWcudGFibGVzLnVzZXJzLFxyXG4gICAgICB7IGlkOiB1c2VySWQgfVxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoIWV4aXN0aW5nVXNlcikge1xyXG4gICAgICB0aHJvdyBuZXcgTm90Rm91bmRFcnJvcignVXNlcicsIHVzZXJJZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU29mdCBkZWxldGUgYnkgc2V0dGluZyBpc0FjdGl2ZSB0byBmYWxzZVxyXG4gICAgYXdhaXQgdGhpcy5kYi51cGRhdGUoXHJcbiAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy51c2VycyxcclxuICAgICAgeyBpZDogdXNlcklkIH0sXHJcbiAgICAgICdTRVQgI2lzQWN0aXZlID0gOmlzQWN0aXZlLCAjdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgIHtcclxuICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHtcclxuICAgICAgICAgICcjaXNBY3RpdmUnOiAnaXNBY3RpdmUnLFxyXG4gICAgICAgICAgJyN1cGRhdGVkQXQnOiAndXBkYXRlZEF0JyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICc6aXNBY3RpdmUnOiBmYWxzZSxcclxuICAgICAgICAgICc6dXBkYXRlZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgdGhpcy5sb2dnZXIuaW5mbygn4pyFIFVzZXIgZGVhY3RpdmF0ZWQgc3VjY2Vzc2Z1bGx5JywgeyB1c2VySWQgfSk7XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcbn1cclxuXHJcbi8vIEV4cG9ydCB0aGUgaGFuZGxlclxyXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoQXV0aEhhbmRsZXIpOyJdfQ==