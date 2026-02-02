"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepLinkService = exports.DeepLinkService = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const metrics_1 = require("../utils/metrics");
/**
 * Deep Link Service
 * Handles invite code generation, validation, and deep link routing
 */
class DeepLinkService {
    constructor(docClient) {
        this.INVITE_CODE_LENGTH = 6;
        this.DEFAULT_EXPIRY_HOURS = 168; // 7 days
        this.MAX_GENERATION_ATTEMPTS = 10;
        this.BASE_URL = 'https://trinity.app';
        if (docClient) {
            this.docClient = docClient;
        }
        else {
            const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
            this.docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
        }
    }
    /**
     * Generate a unique invite link for a room
     */
    async generateInviteLink(roomId, createdBy, options) {
        const timer = new metrics_1.PerformanceTimer('GenerateInviteLink');
        console.log(`🔗 Generating invite link for room ${roomId} by user ${createdBy}`);
        try {
            // Generate unique invite code
            const inviteCode = await this.generateUniqueInviteCode();
            // Calculate expiry time
            const expiryHours = options?.expiryHours || this.DEFAULT_EXPIRY_HOURS;
            const expiresAt = new Date(Date.now() + (expiryHours * 60 * 60 * 1000)).toISOString();
            // Create invite link object
            const inviteLink = {
                code: inviteCode,
                url: `${this.BASE_URL}/room/${inviteCode}`,
                roomId,
                createdBy,
                createdAt: new Date().toISOString(),
                expiresAt,
                isActive: true,
                usageCount: 0,
                maxUsage: options?.maxUsage,
            };
            // Store in DynamoDB
            await this.docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: process.env.ROOM_INVITES_TABLE,
                Item: {
                    PK: inviteCode, // Primary key is the invite code
                    SK: 'INVITE', // Sort key for invite links
                    ...inviteLink,
                },
                ConditionExpression: 'attribute_not_exists(PK)', // Ensure uniqueness
            }));
            // Also create a reverse lookup by roomId for management
            await this.docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: process.env.ROOM_INVITES_TABLE,
                Item: {
                    PK: roomId,
                    SK: `INVITE#${inviteCode}`,
                    inviteCode,
                    createdAt: inviteLink.createdAt,
                    expiresAt: inviteLink.expiresAt,
                    isActive: true,
                },
            }));
            // Log business metric
            (0, metrics_1.logBusinessMetric)('INVITE_LINK_CREATED', roomId, createdBy, {
                inviteCode,
                expiryHours,
                maxUsage: options?.maxUsage,
            });
            console.log(`✅ Invite link generated: ${inviteLink.url} (expires: ${expiresAt})`);
            timer.finish(true, undefined, { inviteCode, roomId });
            return inviteLink;
        }
        catch (error) {
            (0, metrics_1.logError)('GenerateInviteLink', error, { roomId, createdBy });
            timer.finish(false, error.name);
            throw error;
        }
    }
    /**
     * Validate an invite code and return room information
     */
    async validateInviteCode(code) {
        const timer = new metrics_1.PerformanceTimer('ValidateInviteCode');
        console.log(`🔍 Validating invite code: ${code}`);
        try {
            // FIXED: Search directly in ROOMS_TABLE by inviteCode using Scan
            // Instead of using a separate INVITE_LINKS_TABLE that doesn't exist
            const response = await this.docClient.send(new lib_dynamodb_1.ScanCommand({
                TableName: process.env.ROOMS_TABLE,
                FilterExpression: 'inviteCode = :code',
                ExpressionAttributeValues: {
                    ':code': code,
                },
                Limit: 1,
            }));
            if (!response.Items || response.Items.length === 0) {
                console.log(`❌ Invite code not found in ROOMS_TABLE: ${code}`);
                timer.finish(true, undefined, { result: 'not_found' });
                return null;
            }
            const room = response.Items[0];
            // Check if room is active
            if (!room.isActive) {
                console.log(`❌ Room is inactive: ${code}`);
                timer.finish(true, undefined, { result: 'inactive' });
                return null;
            }
            // Check if room is in a valid state for joining
            if (room.status === 'COMPLETED' || room.status === 'CANCELLED') {
                console.log(`❌ Room is ${room.status}: ${code}`);
                timer.finish(true, undefined, { result: 'room_closed' });
                return null;
            }
            // Check if room is full
            if (room.maxMembers && room.memberCount >= room.maxMembers) {
                console.log(`❌ Room is full: ${code} (${room.memberCount}/${room.maxMembers})`);
                timer.finish(true, undefined, { result: 'room_full' });
                return null;
            }
            // Return room information
            const roomInfo = {
                roomId: room.id || room.roomId,
                name: room.name,
                hostId: room.hostId,
                status: room.status,
                memberCount: room.memberCount,
                isPrivate: room.isPrivate,
                createdAt: room.createdAt,
            };
            console.log(`✅ Invite code validated: ${code} -> Room: ${roomInfo.name}`);
            timer.finish(true, undefined, { result: 'valid', roomId: roomInfo.roomId });
            return roomInfo;
        }
        catch (error) {
            (0, metrics_1.logError)('ValidateInviteCode', error, { code });
            timer.finish(false, error.name);
            throw error;
        }
    }
    /**
     * Handle deep link URL and return appropriate action
     */
    async handleDeepLink(url) {
        const timer = new metrics_1.PerformanceTimer('HandleDeepLink');
        console.log(`🔗 Handling deep link: ${url}`);
        try {
            // Parse URL to extract invite code
            const inviteCode = this.extractInviteCodeFromUrl(url);
            if (!inviteCode) {
                console.log(`❌ Invalid deep link format: ${url}`);
                timer.finish(true, undefined, { result: 'invalid_format' });
                return {
                    type: 'ERROR',
                    errorMessage: 'Invalid invite link format',
                };
            }
            // Validate invite code
            const roomInfo = await this.validateInviteCode(inviteCode);
            if (!roomInfo) {
                console.log(`❌ Invalid or expired invite code: ${inviteCode}`);
                timer.finish(true, undefined, { result: 'invalid_code' });
                return {
                    type: 'INVALID_CODE',
                    errorMessage: 'This invite link is invalid or has expired',
                };
            }
            // Check room status
            if (roomInfo.status === 'COMPLETED' || roomInfo.status === 'INACTIVE') {
                console.log(`❌ Room is not available: ${roomInfo.roomId} (status: ${roomInfo.status})`);
                timer.finish(true, undefined, { result: 'room_unavailable' });
                return {
                    type: 'INVALID_CODE',
                    errorMessage: 'This room is no longer available',
                };
            }
            // Increment usage count
            await this.incrementUsageCount(inviteCode);
            console.log(`✅ Deep link handled successfully: ${inviteCode} -> ${roomInfo.roomId}`);
            timer.finish(true, undefined, { result: 'success', roomId: roomInfo.roomId });
            return {
                type: 'JOIN_ROOM',
                roomId: roomInfo.roomId,
                metadata: {
                    roomName: roomInfo.name,
                    hostId: roomInfo.hostId,
                    memberCount: roomInfo.memberCount,
                    inviteCode,
                },
            };
        }
        catch (error) {
            (0, metrics_1.logError)('HandleDeepLink', error, { url });
            timer.finish(false, error.name);
            return {
                type: 'ERROR',
                errorMessage: 'An error occurred while processing the invite link',
            };
        }
    }
    /**
     * Get all active invite links for a room
     */
    async getRoomInviteLinks(roomId) {
        try {
            const response = await this.docClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: process.env.ROOM_INVITES_TABLE,
                KeyConditionExpression: 'PK = :roomId AND begins_with(SK, :invitePrefix)',
                ExpressionAttributeValues: {
                    ':roomId': roomId,
                    ':invitePrefix': 'INVITE#',
                },
            }));
            if (!response.Items || response.Items.length === 0) {
                return [];
            }
            // Get full invite link details for each code
            const inviteLinks = [];
            for (const item of response.Items) {
                const fullInvite = await this.docClient.send(new lib_dynamodb_1.GetCommand({
                    TableName: process.env.ROOM_INVITES_TABLE,
                    Key: { PK: item.inviteCode, SK: 'INVITE' },
                }));
                if (fullInvite.Item) {
                    inviteLinks.push(fullInvite.Item);
                }
            }
            // Filter active and non-expired invites
            const now = new Date();
            return inviteLinks.filter(invite => invite.isActive && new Date(invite.expiresAt) > now);
        }
        catch (error) {
            console.error('❌ Error getting room invite links:', error);
            return [];
        }
    }
    /**
     * Deactivate an invite code
     */
    async deactivateInviteCode(code) {
        try {
            await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: process.env.ROOM_INVITES_TABLE,
                Key: { PK: code, SK: 'INVITE' },
                UpdateExpression: 'SET isActive = :inactive, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':inactive': false,
                    ':updatedAt': new Date().toISOString(),
                },
                ConditionExpression: 'attribute_exists(PK)',
            }));
            console.log(`🔒 Invite code deactivated: ${code}`);
        }
        catch (error) {
            console.error('❌ Error deactivating invite code:', error);
            throw error;
        }
    }
    /**
     * Generate a unique invite code
     */
    async generateUniqueInviteCode() {
        for (let attempt = 0; attempt < this.MAX_GENERATION_ATTEMPTS; attempt++) {
            const code = this.generateRandomCode();
            // Check if code already exists
            const exists = await this.checkCodeExists(code);
            if (!exists) {
                return code;
            }
            console.log(`🔄 Invite code collision, retrying: ${code} (attempt ${attempt + 1})`);
        }
        throw new Error('Failed to generate unique invite code after maximum attempts');
    }
    /**
     * Generate a random invite code
     */
    generateRandomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < this.INVITE_CODE_LENGTH; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    /**
     * Check if an invite code already exists
     */
    async checkCodeExists(code) {
        try {
            const response = await this.docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.ROOM_INVITES_TABLE,
                Key: { PK: code, SK: 'INVITE' },
            }));
            return !!response.Item;
        }
        catch (error) {
            console.error('❌ Error checking code existence:', error);
            return true; // Assume exists to be safe
        }
    }
    /**
     * Extract invite code from URL
     */
    extractInviteCodeFromUrl(url) {
        try {
            // Handle different URL formats:
            // https://trinity.app/room/ABC123
            // trinity.app/room/ABC123
            // /room/ABC123 (only if it's a relative path)
            // ABC123 (direct code)
            const patterns = [
                /^https?:\/\/trinity\.app\/room\/([A-Z0-9]{6})$/i,
                /^trinity\.app\/room\/([A-Z0-9]{6})$/i,
                /^\/room\/([A-Z0-9]{6})$/i,
                /^([A-Z0-9]{6})$/i,
            ];
            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match) {
                    return match[1].toUpperCase();
                }
            }
            return null;
        }
        catch (error) {
            console.error('❌ Error extracting invite code from URL:', error);
            return null;
        }
    }
    /**
     * Get room information by ID
     */
    async getRoomInfo(roomId) {
        try {
            const response = await this.docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.ROOMS_TABLE,
                Key: { PK: roomId, SK: 'ROOM' },
            }));
            if (!response.Item) {
                return null;
            }
            const room = response.Item;
            return {
                roomId: room.roomId || roomId,
                name: room.name || 'Unnamed Room',
                hostId: room.hostId,
                status: room.status,
                memberCount: room.memberCount || 0,
                isPrivate: room.isPrivate || false,
                createdAt: room.createdAt,
            };
        }
        catch (error) {
            console.error('❌ Error getting room info:', error);
            return null;
        }
    }
    /**
     * Increment usage count for an invite code
     */
    async incrementUsageCount(code) {
        try {
            await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: process.env.ROOM_INVITES_TABLE,
                Key: { PK: code, SK: 'INVITE' },
                UpdateExpression: 'ADD usageCount :increment SET updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':increment': 1,
                    ':updatedAt': new Date().toISOString(),
                },
                ConditionExpression: 'attribute_exists(PK)',
            }));
        }
        catch (error) {
            console.error('❌ Error incrementing usage count:', error);
            // Don't throw - this is not critical for the join process
        }
    }
    /**
     * Clean up expired invite codes (maintenance function)
     */
    async cleanupExpiredInvites() {
        console.log('🧹 Starting cleanup of expired invite codes');
        let cleanedCount = 0;
        try {
            // This would typically be implemented as a scheduled job
            // For now, we'll just mark it as a placeholder
            console.log('⚠️ Cleanup function not fully implemented - would be run as scheduled job');
            return cleanedCount;
        }
        catch (error) {
            console.error('❌ Error during invite cleanup:', error);
            return cleanedCount;
        }
    }
    /**
     * Get invite link statistics
     */
    async getInviteStats(code) {
        try {
            const response = await this.docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.ROOM_INVITES_TABLE,
                Key: { PK: code, SK: 'INVITE' },
            }));
            if (!response.Item) {
                return null;
            }
            const invite = response.Item;
            return {
                code: invite.code,
                usageCount: invite.usageCount,
                maxUsage: invite.maxUsage,
                isActive: invite.isActive,
                expiresAt: invite.expiresAt,
                createdAt: invite.createdAt,
            };
        }
        catch (error) {
            console.error('❌ Error getting invite stats:', error);
            return null;
        }
    }
}
exports.DeepLinkService = DeepLinkService;
// Export singleton instance
exports.deepLinkService = new DeepLinkService();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVlcExpbmtTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGVlcExpbmtTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBaUk7QUFDakksOENBQWlGO0FBK0JqRjs7O0dBR0c7QUFDSCxNQUFhLGVBQWU7SUFPMUIsWUFBWSxTQUFrQztRQU43Qix1QkFBa0IsR0FBRyxDQUFDLENBQUM7UUFDdkIseUJBQW9CLEdBQUcsR0FBRyxDQUFDLENBQUMsU0FBUztRQUNyQyw0QkFBdUIsR0FBRyxFQUFFLENBQUM7UUFDN0IsYUFBUSxHQUFHLHFCQUFxQixDQUFDO1FBSWhELElBQUksU0FBUyxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUM3QixDQUFDO2FBQU0sQ0FBQztZQUNOLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM1QyxJQUFJLENBQUMsU0FBUyxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM3RCxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGtCQUFrQixDQUN0QixNQUFjLEVBQ2QsU0FBaUIsRUFDakIsT0FHQztRQUVELE1BQU0sS0FBSyxHQUFHLElBQUksMEJBQWdCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUN6RCxPQUFPLENBQUMsR0FBRyxDQUFDLHNDQUFzQyxNQUFNLFlBQVksU0FBUyxFQUFFLENBQUMsQ0FBQztRQUVqRixJQUFJLENBQUM7WUFDSCw4QkFBOEI7WUFDOUIsTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztZQUV6RCx3QkFBd0I7WUFDeEIsTUFBTSxXQUFXLEdBQUcsT0FBTyxFQUFFLFdBQVcsSUFBSSxJQUFJLENBQUMsb0JBQW9CLENBQUM7WUFDdEUsTUFBTSxTQUFTLEdBQUcs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RUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRTthQUNoQyxDQUFDLENBQUMsQ0FBQztZQUVKLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ25CLE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQztZQUVELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxJQUFrQixDQUFDO1lBQzNDLE9BQU87Z0JBQ0wsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJO2dCQUNqQixVQUFVLEVBQUUsTUFBTSxDQUFDLFVBQVU7Z0JBQzdCLFFBQVEsRUFBRSxNQUFNLENBQUMsUUFBUTtnQkFDekIsUUFBUSxFQUFFLE1BQU0sQ0FBQyxRQUFRO2dCQUN6QixTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVM7Z0JBQzNCLFNBQVMsRUFBRSxNQUFNLENBQUMsU0FBUzthQUM1QixDQUFDO1FBQ0osQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3RELE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztJQUNILENBQUM7Q0FDRjtBQWxlRCwwQ0FrZUM7QUFFRCw0QkFBNEI7QUFDZixRQUFBLGVBQWUsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kLCBQdXRDb21tYW5kLCBRdWVyeUNvbW1hbmQsIFNjYW5Db21tYW5kLCBVcGRhdGVDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcclxuaW1wb3J0IHsgbG9nQnVzaW5lc3NNZXRyaWMsIGxvZ0Vycm9yLCBQZXJmb3JtYW5jZVRpbWVyIH0gZnJvbSAnLi4vdXRpbHMvbWV0cmljcyc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEludml0ZUxpbmsge1xyXG4gIGNvZGU6IHN0cmluZztcclxuICB1cmw6IHN0cmluZztcclxuICByb29tSWQ6IHN0cmluZztcclxuICBjcmVhdGVkQnk6IHN0cmluZztcclxuICBjcmVhdGVkQXQ6IHN0cmluZztcclxuICBleHBpcmVzQXQ6IHN0cmluZztcclxuICBpc0FjdGl2ZTogYm9vbGVhbjtcclxuICB1c2FnZUNvdW50OiBudW1iZXI7XHJcbiAgbWF4VXNhZ2U/OiBudW1iZXI7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRGVlcExpbmtBY3Rpb24ge1xyXG4gIHR5cGU6ICdKT0lOX1JPT00nIHwgJ0lOVkFMSURfQ09ERScgfCAnRVhQSVJFRF9DT0RFJyB8ICdFUlJPUic7XHJcbiAgcm9vbUlkPzogc3RyaW5nO1xyXG4gIGVycm9yTWVzc2FnZT86IHN0cmluZztcclxuICBtZXRhZGF0YT86IHsgW2tleTogc3RyaW5nXTogYW55IH07XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgUm9vbUluZm8ge1xyXG4gIHJvb21JZDogc3RyaW5nO1xyXG4gIG5hbWU6IHN0cmluZztcclxuICBob3N0SWQ6IHN0cmluZztcclxuICBzdGF0dXM6IHN0cmluZztcclxuICBtZW1iZXJDb3VudDogbnVtYmVyO1xyXG4gIGlzUHJpdmF0ZTogYm9vbGVhbjtcclxuICBjcmVhdGVkQXQ6IHN0cmluZztcclxufVxyXG5cclxuLyoqXHJcbiAqIERlZXAgTGluayBTZXJ2aWNlXHJcbiAqIEhhbmRsZXMgaW52aXRlIGNvZGUgZ2VuZXJhdGlvbiwgdmFsaWRhdGlvbiwgYW5kIGRlZXAgbGluayByb3V0aW5nXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgRGVlcExpbmtTZXJ2aWNlIHtcclxuICBwcml2YXRlIHJlYWRvbmx5IElOVklURV9DT0RFX0xFTkdUSCA9IDY7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBERUZBVUxUX0VYUElSWV9IT1VSUyA9IDE2ODsgLy8gNyBkYXlzXHJcbiAgcHJpdmF0ZSByZWFkb25seSBNQVhfR0VORVJBVElPTl9BVFRFTVBUUyA9IDEwO1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgQkFTRV9VUkwgPSAnaHR0cHM6Ly90cmluaXR5LmFwcCc7XHJcbiAgcHJpdmF0ZSBkb2NDbGllbnQ6IER5bmFtb0RCRG9jdW1lbnRDbGllbnQ7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGRvY0NsaWVudD86IER5bmFtb0RCRG9jdW1lbnRDbGllbnQpIHtcclxuICAgIGlmIChkb2NDbGllbnQpIHtcclxuICAgICAgdGhpcy5kb2NDbGllbnQgPSBkb2NDbGllbnQ7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xyXG4gICAgICB0aGlzLmRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgYSB1bmlxdWUgaW52aXRlIGxpbmsgZm9yIGEgcm9vbVxyXG4gICAqL1xyXG4gIGFzeW5jIGdlbmVyYXRlSW52aXRlTGluayhcclxuICAgIHJvb21JZDogc3RyaW5nLFxyXG4gICAgY3JlYXRlZEJ5OiBzdHJpbmcsXHJcbiAgICBvcHRpb25zPzoge1xyXG4gICAgICBleHBpcnlIb3Vycz86IG51bWJlcjtcclxuICAgICAgbWF4VXNhZ2U/OiBudW1iZXI7XHJcbiAgICB9XHJcbiAgKTogUHJvbWlzZTxJbnZpdGVMaW5rPiB7XHJcbiAgICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdHZW5lcmF0ZUludml0ZUxpbmsnKTtcclxuICAgIGNvbnNvbGUubG9nKGDwn5SXIEdlbmVyYXRpbmcgaW52aXRlIGxpbmsgZm9yIHJvb20gJHtyb29tSWR9IGJ5IHVzZXIgJHtjcmVhdGVkQnl9YCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gR2VuZXJhdGUgdW5pcXVlIGludml0ZSBjb2RlXHJcbiAgICAgIGNvbnN0IGludml0ZUNvZGUgPSBhd2FpdCB0aGlzLmdlbmVyYXRlVW5pcXVlSW52aXRlQ29kZSgpO1xyXG5cclxuICAgICAgLy8gQ2FsY3VsYXRlIGV4cGlyeSB0aW1lXHJcbiAgICAgIGNvbnN0IGV4cGlyeUhvdXJzID0gb3B0aW9ucz8uZXhwaXJ5SG91cnMgfHwgdGhpcy5ERUZBVUxUX0VYUElSWV9IT1VSUztcclxuICAgICAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoRGF0ZS5ub3coKSArIChleHBpcnlIb3VycyAqIDYwICogNjAgKiAxMDAwKSkudG9JU09TdHJpbmcoKTtcclxuXHJcbiAgICAgIC8vIENyZWF0ZSBpbnZpdGUgbGluayBvYmplY3RcclxuICAgICAgY29uc3QgaW52aXRlTGluazogSW52aXRlTGluayA9IHtcclxuICAgICAgICBjb2RlOiBpbnZpdGVDb2RlLFxyXG4gICAgICAgIHVybDogYCR7dGhpcy5CQVNFX1VSTH0vcm9vbS8ke2ludml0ZUNvZGV9YCxcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgY3JlYXRlZEJ5LFxyXG4gICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIGV4cGlyZXNBdCxcclxuICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgICAgICB1c2FnZUNvdW50OiAwLFxyXG4gICAgICAgIG1heFVzYWdlOiBvcHRpb25zPy5tYXhVc2FnZSxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIC8vIFN0b3JlIGluIER5bmFtb0RCXHJcbiAgICAgIGF3YWl0IHRoaXMuZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9JTlZJVEVTX1RBQkxFISxcclxuICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICBQSzogaW52aXRlQ29kZSwgLy8gUHJpbWFyeSBrZXkgaXMgdGhlIGludml0ZSBjb2RlXHJcbiAgICAgICAgICBTSzogJ0lOVklURScsICAgLy8gU29ydCBrZXkgZm9yIGludml0ZSBsaW5rc1xyXG4gICAgICAgICAgLi4uaW52aXRlTGluayxcclxuICAgICAgICB9LFxyXG4gICAgICAgIENvbmRpdGlvbkV4cHJlc3Npb246ICdhdHRyaWJ1dGVfbm90X2V4aXN0cyhQSyknLCAvLyBFbnN1cmUgdW5pcXVlbmVzc1xyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBBbHNvIGNyZWF0ZSBhIHJldmVyc2UgbG9va3VwIGJ5IHJvb21JZCBmb3IgbWFuYWdlbWVudFxyXG4gICAgICBhd2FpdCB0aGlzLmRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fSU5WSVRFU19UQUJMRSEsXHJcbiAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgUEs6IHJvb21JZCxcclxuICAgICAgICAgIFNLOiBgSU5WSVRFIyR7aW52aXRlQ29kZX1gLFxyXG4gICAgICAgICAgaW52aXRlQ29kZSxcclxuICAgICAgICAgIGNyZWF0ZWRBdDogaW52aXRlTGluay5jcmVhdGVkQXQsXHJcbiAgICAgICAgICBleHBpcmVzQXQ6IGludml0ZUxpbmsuZXhwaXJlc0F0LFxyXG4gICAgICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpY1xyXG4gICAgICBsb2dCdXNpbmVzc01ldHJpYygnSU5WSVRFX0xJTktfQ1JFQVRFRCcsIHJvb21JZCwgY3JlYXRlZEJ5LCB7XHJcbiAgICAgICAgaW52aXRlQ29kZSxcclxuICAgICAgICBleHBpcnlIb3VycyxcclxuICAgICAgICBtYXhVc2FnZTogb3B0aW9ucz8ubWF4VXNhZ2UsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYOKchSBJbnZpdGUgbGluayBnZW5lcmF0ZWQ6ICR7aW52aXRlTGluay51cmx9IChleHBpcmVzOiAke2V4cGlyZXNBdH0pYCk7XHJcbiAgICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgaW52aXRlQ29kZSwgcm9vbUlkIH0pO1xyXG4gICAgICByZXR1cm4gaW52aXRlTGluaztcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBsb2dFcnJvcignR2VuZXJhdGVJbnZpdGVMaW5rJywgZXJyb3IgYXMgRXJyb3IsIHsgcm9vbUlkLCBjcmVhdGVkQnkgfSk7XHJcbiAgICAgIHRpbWVyLmZpbmlzaChmYWxzZSwgKGVycm9yIGFzIEVycm9yKS5uYW1lKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBhbiBpbnZpdGUgY29kZSBhbmQgcmV0dXJuIHJvb20gaW5mb3JtYXRpb25cclxuICAgKi9cclxuICBhc3luYyB2YWxpZGF0ZUludml0ZUNvZGUoY29kZTogc3RyaW5nKTogUHJvbWlzZTxSb29tSW5mbyB8IG51bGw+IHtcclxuICAgIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ1ZhbGlkYXRlSW52aXRlQ29kZScpO1xyXG4gICAgY29uc29sZS5sb2coYPCflI0gVmFsaWRhdGluZyBpbnZpdGUgY29kZTogJHtjb2RlfWApO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIEZJWEVEOiBTZWFyY2ggZGlyZWN0bHkgaW4gUk9PTVNfVEFCTEUgYnkgaW52aXRlQ29kZSB1c2luZyBTY2FuXHJcbiAgICAgIC8vIEluc3RlYWQgb2YgdXNpbmcgYSBzZXBhcmF0ZSBJTlZJVEVfTElOS1NfVEFCTEUgdGhhdCBkb2Vzbid0IGV4aXN0XHJcblxyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZG9jQ2xpZW50LnNlbmQobmV3IFNjYW5Db21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgICBGaWx0ZXJFeHByZXNzaW9uOiAnaW52aXRlQ29kZSA9IDpjb2RlJyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOmNvZGUnOiBjb2RlLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgTGltaXQ6IDEsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2UuSXRlbXMgfHwgcmVzcG9uc2UuSXRlbXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKdjCBJbnZpdGUgY29kZSBub3QgZm91bmQgaW4gUk9PTVNfVEFCTEU6ICR7Y29kZX1gKTtcclxuICAgICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJlc3VsdDogJ25vdF9mb3VuZCcgfSk7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHJvb20gPSByZXNwb25zZS5JdGVtc1swXSBhcyBhbnk7XHJcblxyXG4gICAgICAvLyBDaGVjayBpZiByb29tIGlzIGFjdGl2ZVxyXG4gICAgICBpZiAoIXJvb20uaXNBY3RpdmUpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg4p2MIFJvb20gaXMgaW5hY3RpdmU6ICR7Y29kZX1gKTtcclxuICAgICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJlc3VsdDogJ2luYWN0aXZlJyB9KTtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gQ2hlY2sgaWYgcm9vbSBpcyBpbiBhIHZhbGlkIHN0YXRlIGZvciBqb2luaW5nXHJcbiAgICAgIGlmIChyb29tLnN0YXR1cyA9PT0gJ0NPTVBMRVRFRCcgfHwgcm9vbS5zdGF0dXMgPT09ICdDQU5DRUxMRUQnKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKdjCBSb29tIGlzICR7cm9vbS5zdGF0dXN9OiAke2NvZGV9YCk7XHJcbiAgICAgICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByZXN1bHQ6ICdyb29tX2Nsb3NlZCcgfSk7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIENoZWNrIGlmIHJvb20gaXMgZnVsbFxyXG4gICAgICBpZiAocm9vbS5tYXhNZW1iZXJzICYmIHJvb20ubWVtYmVyQ291bnQgPj0gcm9vbS5tYXhNZW1iZXJzKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKdjCBSb29tIGlzIGZ1bGw6ICR7Y29kZX0gKCR7cm9vbS5tZW1iZXJDb3VudH0vJHtyb29tLm1heE1lbWJlcnN9KWApO1xyXG4gICAgICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgcmVzdWx0OiAncm9vbV9mdWxsJyB9KTtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gUmV0dXJuIHJvb20gaW5mb3JtYXRpb25cclxuICAgICAgY29uc3Qgcm9vbUluZm86IFJvb21JbmZvID0ge1xyXG4gICAgICAgIHJvb21JZDogcm9vbS5pZCB8fCByb29tLnJvb21JZCxcclxuICAgICAgICBuYW1lOiByb29tLm5hbWUsXHJcbiAgICAgICAgaG9zdElkOiByb29tLmhvc3RJZCxcclxuICAgICAgICBzdGF0dXM6IHJvb20uc3RhdHVzLFxyXG4gICAgICAgIG1lbWJlckNvdW50OiByb29tLm1lbWJlckNvdW50LFxyXG4gICAgICAgIGlzUHJpdmF0ZTogcm9vbS5pc1ByaXZhdGUsXHJcbiAgICAgICAgY3JlYXRlZEF0OiByb29tLmNyZWF0ZWRBdCxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgSW52aXRlIGNvZGUgdmFsaWRhdGVkOiAke2NvZGV9IC0+IFJvb206ICR7cm9vbUluZm8ubmFtZX1gKTtcclxuICAgICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByZXN1bHQ6ICd2YWxpZCcsIHJvb21JZDogcm9vbUluZm8ucm9vbUlkIH0pO1xyXG4gICAgICByZXR1cm4gcm9vbUluZm87XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgbG9nRXJyb3IoJ1ZhbGlkYXRlSW52aXRlQ29kZScsIGVycm9yIGFzIEVycm9yLCB7IGNvZGUgfSk7XHJcbiAgICAgIHRpbWVyLmZpbmlzaChmYWxzZSwgKGVycm9yIGFzIEVycm9yKS5uYW1lKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBIYW5kbGUgZGVlcCBsaW5rIFVSTCBhbmQgcmV0dXJuIGFwcHJvcHJpYXRlIGFjdGlvblxyXG4gICAqL1xyXG4gIGFzeW5jIGhhbmRsZURlZXBMaW5rKHVybDogc3RyaW5nKTogUHJvbWlzZTxEZWVwTGlua0FjdGlvbj4ge1xyXG4gICAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignSGFuZGxlRGVlcExpbmsnKTtcclxuICAgIGNvbnNvbGUubG9nKGDwn5SXIEhhbmRsaW5nIGRlZXAgbGluazogJHt1cmx9YCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gUGFyc2UgVVJMIHRvIGV4dHJhY3QgaW52aXRlIGNvZGVcclxuICAgICAgY29uc3QgaW52aXRlQ29kZSA9IHRoaXMuZXh0cmFjdEludml0ZUNvZGVGcm9tVXJsKHVybCk7XHJcbiAgICAgIGlmICghaW52aXRlQ29kZSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDinYwgSW52YWxpZCBkZWVwIGxpbmsgZm9ybWF0OiAke3VybH1gKTtcclxuICAgICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJlc3VsdDogJ2ludmFsaWRfZm9ybWF0JyB9KTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgdHlwZTogJ0VSUk9SJyxcclxuICAgICAgICAgIGVycm9yTWVzc2FnZTogJ0ludmFsaWQgaW52aXRlIGxpbmsgZm9ybWF0JyxcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBWYWxpZGF0ZSBpbnZpdGUgY29kZVxyXG4gICAgICBjb25zdCByb29tSW5mbyA9IGF3YWl0IHRoaXMudmFsaWRhdGVJbnZpdGVDb2RlKGludml0ZUNvZGUpO1xyXG4gICAgICBpZiAoIXJvb21JbmZvKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKdjCBJbnZhbGlkIG9yIGV4cGlyZWQgaW52aXRlIGNvZGU6ICR7aW52aXRlQ29kZX1gKTtcclxuICAgICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJlc3VsdDogJ2ludmFsaWRfY29kZScgfSk7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIHR5cGU6ICdJTlZBTElEX0NPREUnLFxyXG4gICAgICAgICAgZXJyb3JNZXNzYWdlOiAnVGhpcyBpbnZpdGUgbGluayBpcyBpbnZhbGlkIG9yIGhhcyBleHBpcmVkJyxcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBDaGVjayByb29tIHN0YXR1c1xyXG4gICAgICBpZiAocm9vbUluZm8uc3RhdHVzID09PSAnQ09NUExFVEVEJyB8fCByb29tSW5mby5zdGF0dXMgPT09ICdJTkFDVElWRScpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg4p2MIFJvb20gaXMgbm90IGF2YWlsYWJsZTogJHtyb29tSW5mby5yb29tSWR9IChzdGF0dXM6ICR7cm9vbUluZm8uc3RhdHVzfSlgKTtcclxuICAgICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJlc3VsdDogJ3Jvb21fdW5hdmFpbGFibGUnIH0pO1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICB0eXBlOiAnSU5WQUxJRF9DT0RFJyxcclxuICAgICAgICAgIGVycm9yTWVzc2FnZTogJ1RoaXMgcm9vbSBpcyBubyBsb25nZXIgYXZhaWxhYmxlJyxcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBJbmNyZW1lbnQgdXNhZ2UgY291bnRcclxuICAgICAgYXdhaXQgdGhpcy5pbmNyZW1lbnRVc2FnZUNvdW50KGludml0ZUNvZGUpO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYOKchSBEZWVwIGxpbmsgaGFuZGxlZCBzdWNjZXNzZnVsbHk6ICR7aW52aXRlQ29kZX0gLT4gJHtyb29tSW5mby5yb29tSWR9YCk7XHJcbiAgICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgcmVzdWx0OiAnc3VjY2VzcycsIHJvb21JZDogcm9vbUluZm8ucm9vbUlkIH0pO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6ICdKT0lOX1JPT00nLFxyXG4gICAgICAgIHJvb21JZDogcm9vbUluZm8ucm9vbUlkLFxyXG4gICAgICAgIG1ldGFkYXRhOiB7XHJcbiAgICAgICAgICByb29tTmFtZTogcm9vbUluZm8ubmFtZSxcclxuICAgICAgICAgIGhvc3RJZDogcm9vbUluZm8uaG9zdElkLFxyXG4gICAgICAgICAgbWVtYmVyQ291bnQ6IHJvb21JbmZvLm1lbWJlckNvdW50LFxyXG4gICAgICAgICAgaW52aXRlQ29kZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9O1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGxvZ0Vycm9yKCdIYW5kbGVEZWVwTGluaycsIGVycm9yIGFzIEVycm9yLCB7IHVybCB9KTtcclxuICAgICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6ICdFUlJPUicsXHJcbiAgICAgICAgZXJyb3JNZXNzYWdlOiAnQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgcHJvY2Vzc2luZyB0aGUgaW52aXRlIGxpbmsnLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGFsbCBhY3RpdmUgaW52aXRlIGxpbmtzIGZvciBhIHJvb21cclxuICAgKi9cclxuICBhc3luYyBnZXRSb29tSW52aXRlTGlua3Mocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPEludml0ZUxpbmtbXT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmRvY0NsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9JTlZJVEVTX1RBQkxFISxcclxuICAgICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAnUEsgPSA6cm9vbUlkIEFORCBiZWdpbnNfd2l0aChTSywgOmludml0ZVByZWZpeCknLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICc6cm9vbUlkJzogcm9vbUlkLFxyXG4gICAgICAgICAgJzppbnZpdGVQcmVmaXgnOiAnSU5WSVRFIycsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtcyB8fCByZXNwb25zZS5JdGVtcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICByZXR1cm4gW107XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEdldCBmdWxsIGludml0ZSBsaW5rIGRldGFpbHMgZm9yIGVhY2ggY29kZVxyXG4gICAgICBjb25zdCBpbnZpdGVMaW5rczogSW52aXRlTGlua1tdID0gW107XHJcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiByZXNwb25zZS5JdGVtcykge1xyXG4gICAgICAgIGNvbnN0IGZ1bGxJbnZpdGUgPSBhd2FpdCB0aGlzLmRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9JTlZJVEVTX1RBQkxFISxcclxuICAgICAgICAgIEtleTogeyBQSzogaXRlbS5pbnZpdGVDb2RlLCBTSzogJ0lOVklURScgfSxcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGlmIChmdWxsSW52aXRlLkl0ZW0pIHtcclxuICAgICAgICAgIGludml0ZUxpbmtzLnB1c2goZnVsbEludml0ZS5JdGVtIGFzIEludml0ZUxpbmspO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRmlsdGVyIGFjdGl2ZSBhbmQgbm9uLWV4cGlyZWQgaW52aXRlc1xyXG4gICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG4gICAgICByZXR1cm4gaW52aXRlTGlua3MuZmlsdGVyKGludml0ZSA9PlxyXG4gICAgICAgIGludml0ZS5pc0FjdGl2ZSAmJiBuZXcgRGF0ZShpbnZpdGUuZXhwaXJlc0F0KSA+IG5vd1xyXG4gICAgICApO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBnZXR0aW5nIHJvb20gaW52aXRlIGxpbmtzOicsIGVycm9yKTtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRGVhY3RpdmF0ZSBhbiBpbnZpdGUgY29kZVxyXG4gICAqL1xyXG4gIGFzeW5jIGRlYWN0aXZhdGVJbnZpdGVDb2RlKGNvZGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5kb2NDbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX0lOVklURVNfVEFCTEUhLFxyXG4gICAgICAgIEtleTogeyBQSzogY29kZSwgU0s6ICdJTlZJVEUnIH0sXHJcbiAgICAgICAgVXBkYXRlRXhwcmVzc2lvbjogJ1NFVCBpc0FjdGl2ZSA9IDppbmFjdGl2ZSwgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzppbmFjdGl2ZSc6IGZhbHNlLFxyXG4gICAgICAgICAgJzp1cGRhdGVkQXQnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgICBDb25kaXRpb25FeHByZXNzaW9uOiAnYXR0cmlidXRlX2V4aXN0cyhQSyknLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg8J+UkiBJbnZpdGUgY29kZSBkZWFjdGl2YXRlZDogJHtjb2RlfWApO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRlYWN0aXZhdGluZyBpbnZpdGUgY29kZTonLCBlcnJvcik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgYSB1bmlxdWUgaW52aXRlIGNvZGVcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGdlbmVyYXRlVW5pcXVlSW52aXRlQ29kZSgpOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCB0aGlzLk1BWF9HRU5FUkFUSU9OX0FUVEVNUFRTOyBhdHRlbXB0KyspIHtcclxuICAgICAgY29uc3QgY29kZSA9IHRoaXMuZ2VuZXJhdGVSYW5kb21Db2RlKCk7XHJcblxyXG4gICAgICAvLyBDaGVjayBpZiBjb2RlIGFscmVhZHkgZXhpc3RzXHJcbiAgICAgIGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuY2hlY2tDb2RlRXhpc3RzKGNvZGUpO1xyXG4gICAgICBpZiAoIWV4aXN0cykge1xyXG4gICAgICAgIHJldHVybiBjb2RlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg8J+UhCBJbnZpdGUgY29kZSBjb2xsaXNpb24sIHJldHJ5aW5nOiAke2NvZGV9IChhdHRlbXB0ICR7YXR0ZW1wdCArIDF9KWApO1xyXG4gICAgfVxyXG5cclxuICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdlbmVyYXRlIHVuaXF1ZSBpbnZpdGUgY29kZSBhZnRlciBtYXhpbXVtIGF0dGVtcHRzJyk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmF0ZSBhIHJhbmRvbSBpbnZpdGUgY29kZVxyXG4gICAqL1xyXG4gIHByaXZhdGUgZ2VuZXJhdGVSYW5kb21Db2RlKCk6IHN0cmluZyB7XHJcbiAgICBjb25zdCBjaGFycyA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWjAxMjM0NTY3ODknO1xyXG4gICAgbGV0IHJlc3VsdCA9ICcnO1xyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5JTlZJVEVfQ09ERV9MRU5HVEg7IGkrKykge1xyXG4gICAgICByZXN1bHQgKz0gY2hhcnMuY2hhckF0KE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGNoYXJzLmxlbmd0aCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDaGVjayBpZiBhbiBpbnZpdGUgY29kZSBhbHJlYWR5IGV4aXN0c1xyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tDb2RlRXhpc3RzKGNvZGU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fSU5WSVRFU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IFBLOiBjb2RlLCBTSzogJ0lOVklURScgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgcmV0dXJuICEhcmVzcG9uc2UuSXRlbTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBjaGVja2luZyBjb2RlIGV4aXN0ZW5jZTonLCBlcnJvcik7XHJcbiAgICAgIHJldHVybiB0cnVlOyAvLyBBc3N1bWUgZXhpc3RzIHRvIGJlIHNhZmVcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEV4dHJhY3QgaW52aXRlIGNvZGUgZnJvbSBVUkxcclxuICAgKi9cclxuICBwcml2YXRlIGV4dHJhY3RJbnZpdGVDb2RlRnJvbVVybCh1cmw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gSGFuZGxlIGRpZmZlcmVudCBVUkwgZm9ybWF0czpcclxuICAgICAgLy8gaHR0cHM6Ly90cmluaXR5LmFwcC9yb29tL0FCQzEyM1xyXG4gICAgICAvLyB0cmluaXR5LmFwcC9yb29tL0FCQzEyM1xyXG4gICAgICAvLyAvcm9vbS9BQkMxMjMgKG9ubHkgaWYgaXQncyBhIHJlbGF0aXZlIHBhdGgpXHJcbiAgICAgIC8vIEFCQzEyMyAoZGlyZWN0IGNvZGUpXHJcblxyXG4gICAgICBjb25zdCBwYXR0ZXJucyA9IFtcclxuICAgICAgICAvXmh0dHBzPzpcXC9cXC90cmluaXR5XFwuYXBwXFwvcm9vbVxcLyhbQS1aMC05XXs2fSkkL2ksXHJcbiAgICAgICAgL150cmluaXR5XFwuYXBwXFwvcm9vbVxcLyhbQS1aMC05XXs2fSkkL2ksXHJcbiAgICAgICAgL15cXC9yb29tXFwvKFtBLVowLTldezZ9KSQvaSxcclxuICAgICAgICAvXihbQS1aMC05XXs2fSkkL2ksXHJcbiAgICAgIF07XHJcblxyXG4gICAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgcGF0dGVybnMpIHtcclxuICAgICAgICBjb25zdCBtYXRjaCA9IHVybC5tYXRjaChwYXR0ZXJuKTtcclxuICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgIHJldHVybiBtYXRjaFsxXS50b1VwcGVyQ2FzZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZXh0cmFjdGluZyBpbnZpdGUgY29kZSBmcm9tIFVSTDonLCBlcnJvcik7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IHJvb20gaW5mb3JtYXRpb24gYnkgSURcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGdldFJvb21JbmZvKHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTxSb29tSW5mbyB8IG51bGw+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5kb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHJvb20gPSByZXNwb25zZS5JdGVtO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHJvb21JZDogcm9vbS5yb29tSWQgfHwgcm9vbUlkLFxyXG4gICAgICAgIG5hbWU6IHJvb20ubmFtZSB8fCAnVW5uYW1lZCBSb29tJyxcclxuICAgICAgICBob3N0SWQ6IHJvb20uaG9zdElkLFxyXG4gICAgICAgIHN0YXR1czogcm9vbS5zdGF0dXMsXHJcbiAgICAgICAgbWVtYmVyQ291bnQ6IHJvb20ubWVtYmVyQ291bnQgfHwgMCxcclxuICAgICAgICBpc1ByaXZhdGU6IHJvb20uaXNQcml2YXRlIHx8IGZhbHNlLFxyXG4gICAgICAgIGNyZWF0ZWRBdDogcm9vbS5jcmVhdGVkQXQsXHJcbiAgICAgIH07XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZ2V0dGluZyByb29tIGluZm86JywgZXJyb3IpO1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEluY3JlbWVudCB1c2FnZSBjb3VudCBmb3IgYW4gaW52aXRlIGNvZGVcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGluY3JlbWVudFVzYWdlQ291bnQoY29kZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCB0aGlzLmRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fSU5WSVRFU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IFBLOiBjb2RlLCBTSzogJ0lOVklURScgfSxcclxuICAgICAgICBVcGRhdGVFeHByZXNzaW9uOiAnQUREIHVzYWdlQ291bnQgOmluY3JlbWVudCBTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzppbmNyZW1lbnQnOiAxLFxyXG4gICAgICAgICAgJzp1cGRhdGVkQXQnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgICBDb25kaXRpb25FeHByZXNzaW9uOiAnYXR0cmlidXRlX2V4aXN0cyhQSyknLFxyXG4gICAgICB9KSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW5jcmVtZW50aW5nIHVzYWdlIGNvdW50OicsIGVycm9yKTtcclxuICAgICAgLy8gRG9uJ3QgdGhyb3cgLSB0aGlzIGlzIG5vdCBjcml0aWNhbCBmb3IgdGhlIGpvaW4gcHJvY2Vzc1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2xlYW4gdXAgZXhwaXJlZCBpbnZpdGUgY29kZXMgKG1haW50ZW5hbmNlIGZ1bmN0aW9uKVxyXG4gICAqL1xyXG4gIGFzeW5jIGNsZWFudXBFeHBpcmVkSW52aXRlcygpOiBQcm9taXNlPG51bWJlcj4ge1xyXG4gICAgY29uc29sZS5sb2coJ/Cfp7kgU3RhcnRpbmcgY2xlYW51cCBvZiBleHBpcmVkIGludml0ZSBjb2RlcycpO1xyXG4gICAgbGV0IGNsZWFuZWRDb3VudCA9IDA7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gVGhpcyB3b3VsZCB0eXBpY2FsbHkgYmUgaW1wbGVtZW50ZWQgYXMgYSBzY2hlZHVsZWQgam9iXHJcbiAgICAgIC8vIEZvciBub3csIHdlJ2xsIGp1c3QgbWFyayBpdCBhcyBhIHBsYWNlaG9sZGVyXHJcbiAgICAgIGNvbnNvbGUubG9nKCfimqDvuI8gQ2xlYW51cCBmdW5jdGlvbiBub3QgZnVsbHkgaW1wbGVtZW50ZWQgLSB3b3VsZCBiZSBydW4gYXMgc2NoZWR1bGVkIGpvYicpO1xyXG4gICAgICByZXR1cm4gY2xlYW5lZENvdW50O1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGR1cmluZyBpbnZpdGUgY2xlYW51cDonLCBlcnJvcik7XHJcbiAgICAgIHJldHVybiBjbGVhbmVkQ291bnQ7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgaW52aXRlIGxpbmsgc3RhdGlzdGljc1xyXG4gICAqL1xyXG4gIGFzeW5jIGdldEludml0ZVN0YXRzKGNvZGU6IHN0cmluZyk6IFByb21pc2U8e1xyXG4gICAgY29kZTogc3RyaW5nO1xyXG4gICAgdXNhZ2VDb3VudDogbnVtYmVyO1xyXG4gICAgbWF4VXNhZ2U/OiBudW1iZXI7XHJcbiAgICBpc0FjdGl2ZTogYm9vbGVhbjtcclxuICAgIGV4cGlyZXNBdDogc3RyaW5nO1xyXG4gICAgY3JlYXRlZEF0OiBzdHJpbmc7XHJcbiAgfSB8IG51bGw+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5kb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX0lOVklURVNfVEFCTEUhLFxyXG4gICAgICAgIEtleTogeyBQSzogY29kZSwgU0s6ICdJTlZJVEUnIH0sXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBpbnZpdGUgPSByZXNwb25zZS5JdGVtIGFzIEludml0ZUxpbms7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgY29kZTogaW52aXRlLmNvZGUsXHJcbiAgICAgICAgdXNhZ2VDb3VudDogaW52aXRlLnVzYWdlQ291bnQsXHJcbiAgICAgICAgbWF4VXNhZ2U6IGludml0ZS5tYXhVc2FnZSxcclxuICAgICAgICBpc0FjdGl2ZTogaW52aXRlLmlzQWN0aXZlLFxyXG4gICAgICAgIGV4cGlyZXNBdDogaW52aXRlLmV4cGlyZXNBdCxcclxuICAgICAgICBjcmVhdGVkQXQ6IGludml0ZS5jcmVhdGVkQXQsXHJcbiAgICAgIH07XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZ2V0dGluZyBpbnZpdGUgc3RhdHM6JywgZXJyb3IpO1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIEV4cG9ydCBzaW5nbGV0b24gaW5zdGFuY2VcclxuZXhwb3J0IGNvbnN0IGRlZXBMaW5rU2VydmljZSA9IG5ldyBEZWVwTGlua1NlcnZpY2UoKTsiXX0=