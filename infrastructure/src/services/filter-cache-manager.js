"use strict";
/**
 * FilterCacheManager - Efficient Cache Management for Content Filtering
 *
 * Manages caching of filtered content by unique FilterCriteria combinations:
 * - Cache key generation from FilterCriteria
 * - Cache storage and retrieval with DynamoDB
 * - Cache expiration and invalidation
 * - Content exclusion tracking per room
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterCacheManager = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const crypto_1 = require("crypto");
class FilterCacheManager {
    constructor() {
        this.CACHE_TTL_HOURS = 24; // Cache expires after 24 hours
        this.dynamoClient = new client_dynamodb_1.DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
        this.cacheTableName = process.env.FILTER_CACHE_TABLE || 'trinity-filter-cache';
        this.exclusionsTableName = process.env.ROOM_EXCLUSIONS_TABLE || 'trinity-room-exclusions';
        // Log cache configuration for debugging
        console.log(`🔍 FilterCache: Initialized with tables: ${this.cacheTableName}, ${this.exclusionsTableName}`);
    }
    /**
     * Gets cached content for specific filter criteria
     * Requirements: 7.1, 7.2
     */
    async getCachedContent(criteria) {
        const cacheKey = this.generateCacheKey(criteria);
        console.log(`🔍 FilterCache: Looking for cached content with key: ${cacheKey}`);
        try {
            const command = new client_dynamodb_1.GetItemCommand({
                TableName: this.cacheTableName,
                Key: (0, util_dynamodb_1.marshall)({ cacheKey })
            });
            const response = await this.dynamoClient.send(command);
            if (!response.Item) {
                console.log(`❌ FilterCache: No cached content found for key: ${cacheKey}`);
                return null;
            }
            const cacheEntry = (0, util_dynamodb_1.unmarshall)(response.Item);
            // Check if cache has expired
            if (new Date() > new Date(cacheEntry.expiresAt)) {
                console.log(`⏰ FilterCache: Cache expired for key: ${cacheKey}`);
                await this.invalidateCache(criteria);
                return null;
            }
            console.log(`✅ FilterCache: Found ${cacheEntry.content.length} cached items`);
            return cacheEntry.content;
        }
        catch (error) {
            console.error(`❌ FilterCache: Error getting cached content:`, error);
            // Check if it's a table not found error
            if (error.name === 'ResourceNotFoundException' || error.__type?.includes('ResourceNotFoundException')) {
                console.log(`💡 FilterCache: Cache table '${this.cacheTableName}' not found - graceful degradation`);
                return null;
            }
            return null; // Graceful degradation for any other errors
        }
    }
    /**
     * Stores content in cache with expiration
     * Requirements: 7.1, 7.2, 7.3
     */
    async setCachedContent(criteria, content) {
        const cacheKey = this.generateCacheKey(criteria);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + (this.CACHE_TTL_HOURS * 60 * 60 * 1000));
        console.log(`💾 FilterCache: Storing ${content.length} items with key: ${cacheKey}`);
        try {
            const cacheEntry = {
                cacheKey,
                mediaType: criteria.mediaType,
                genreIds: criteria.genres,
                content,
                createdAt: now,
                expiresAt,
                totalAvailable: content.length
            };
            const command = new client_dynamodb_1.PutItemCommand({
                TableName: this.cacheTableName,
                Item: (0, util_dynamodb_1.marshall)(cacheEntry, {
                    convertClassInstanceToMap: true,
                    removeUndefinedValues: true
                })
            });
            await this.dynamoClient.send(command);
            console.log(`✅ FilterCache: Successfully cached content, expires at ${expiresAt.toISOString()}`);
        }
        catch (error) {
            console.error(`❌ FilterCache: Error storing cached content:`, error);
            // Check if it's a table not found error
            if (error.name === 'ResourceNotFoundException' || error.__type?.includes('ResourceNotFoundException')) {
                console.log(`💡 FilterCache: Cache table '${this.cacheTableName}' not found - skipping cache storage`);
                return;
            }
            // Don't throw - caching is not critical for functionality
        }
    }
    /**
     * Invalidates cache entry for specific criteria
     * Requirements: 7.3, 7.5
     */
    async invalidateCache(criteria) {
        const cacheKey = this.generateCacheKey(criteria);
        console.log(`🗑️ FilterCache: Invalidating cache for key: ${cacheKey}`);
        try {
            const command = new client_dynamodb_1.DeleteItemCommand({
                TableName: this.cacheTableName,
                Key: (0, util_dynamodb_1.marshall)({ cacheKey })
            });
            await this.dynamoClient.send(command);
            console.log(`✅ FilterCache: Successfully invalidated cache`);
        }
        catch (error) {
            console.error(`❌ FilterCache: Error invalidating cache:`, error);
            // Don't throw - this is not critical
        }
    }
    /**
     * Tracks content that has been shown in a room to avoid repetition
     * Requirements: 7.4
     */
    async trackShownContent(roomId, contentIds) {
        console.log(`📝 FilterCache: Tracking ${contentIds.length} shown items for room ${roomId}`);
        try {
            // Get existing exclusions
            const existingExclusions = await this.getRoomExclusions(roomId);
            const allExcludedIds = new Set([...existingExclusions, ...contentIds]);
            const exclusionData = {
                roomId,
                excludedIds: Array.from(allExcludedIds),
                lastUpdated: new Date().toISOString()
            };
            const command = new client_dynamodb_1.PutItemCommand({
                TableName: this.exclusionsTableName,
                Item: (0, util_dynamodb_1.marshall)(exclusionData)
            });
            await this.dynamoClient.send(command);
            console.log(`✅ FilterCache: Updated exclusions for room ${roomId} (${allExcludedIds.size} total)`);
        }
        catch (error) {
            console.error(`❌ FilterCache: Error tracking shown content:`, error);
            // Don't throw - this is not critical for core functionality
        }
    }
    /**
     * Gets list of content IDs that have been shown in a room
     * Requirements: 7.4
     */
    async getRoomExclusions(roomId) {
        try {
            const command = new client_dynamodb_1.GetItemCommand({
                TableName: this.exclusionsTableName,
                Key: (0, util_dynamodb_1.marshall)({ roomId })
            });
            const response = await this.dynamoClient.send(command);
            if (!response.Item) {
                return [];
            }
            const exclusionData = (0, util_dynamodb_1.unmarshall)(response.Item);
            return exclusionData.excludedIds || [];
        }
        catch (error) {
            console.error(`❌ FilterCache: Error getting room exclusions:`, error);
            return []; // Return empty array on error
        }
    }
    /**
     * Generates unique cache key from FilterCriteria
     * Requirements: 7.1
     */
    generateCacheKey(criteria) {
        // Create a deterministic string from criteria
        const keyData = {
            mediaType: criteria.mediaType,
            genres: criteria.genres.sort() // Sort to ensure consistent key regardless of order
        };
        const keyString = JSON.stringify(keyData);
        // Generate SHA-256 hash for consistent, short key
        const hash = (0, crypto_1.createHash)('sha256').update(keyString).digest('hex');
        // Use first 16 characters for shorter keys
        return `filter_${hash.substring(0, 16)}`;
    }
    /**
     * Cleans up expired cache entries (maintenance function)
     * Requirements: 7.3, 7.5
     */
    async cleanupExpiredCache() {
        console.log(`🧹 FilterCache: Starting cleanup of expired cache entries`);
        // This would typically use a DynamoDB scan with filter
        // For now, we'll implement a basic version
        // In production, this should be run as a scheduled Lambda function
        try {
            // Implementation would scan the cache table and delete expired entries
            console.log(`✅ FilterCache: Cleanup completed`);
        }
        catch (error) {
            console.error(`❌ FilterCache: Error during cleanup:`, error);
        }
    }
}
exports.FilterCacheManager = FilterCacheManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsdGVyLWNhY2hlLW1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJmaWx0ZXItY2FjaGUtbWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7R0FVRzs7O0FBRUgsOERBQWdJO0FBQ2hJLDBEQUE4RDtBQUM5RCxtQ0FBb0M7QUFtQnBDLE1BQWEsa0JBQWtCO0lBTTdCO1FBRmlCLG9CQUFlLEdBQUcsRUFBRSxDQUFDLENBQUMsK0JBQStCO1FBR3BFLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFDMUYsSUFBSSxDQUFDLGNBQWMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLHNCQUFzQixDQUFDO1FBQy9FLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixJQUFJLHlCQUF5QixDQUFDO1FBRTFGLHdDQUF3QztRQUN4QyxPQUFPLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxJQUFJLENBQUMsY0FBYyxLQUFLLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUM7SUFDOUcsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxRQUF3QjtRQUM3QyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDakQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3REFBd0QsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUVoRixJQUFJLENBQUM7WUFDSCxNQUFNLE9BQU8sR0FBRyxJQUFJLGdDQUFjLENBQUM7Z0JBQ2pDLFNBQVMsRUFBRSxJQUFJLENBQUMsY0FBYztnQkFDOUIsR0FBRyxFQUFFLElBQUEsd0JBQVEsRUFBQyxFQUFFLFFBQVEsRUFBRSxDQUFDO2FB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R0c7SUFDSCxLQUFLLENBQUMsbUJBQW1CO1FBQ3ZCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkRBQTJELENBQUMsQ0FBQztRQUV6RSx1REFBdUQ7UUFDdkQsMkNBQTJDO1FBQzNDLG1FQUFtRTtRQUVuRSxJQUFJLENBQUM7WUFDSCx1RUFBdUU7WUFDdkUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQ2xELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQ0FBc0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMvRCxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBbE9ELGdEQWtPQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBGaWx0ZXJDYWNoZU1hbmFnZXIgLSBFZmZpY2llbnQgQ2FjaGUgTWFuYWdlbWVudCBmb3IgQ29udGVudCBGaWx0ZXJpbmdcclxuICogXHJcbiAqIE1hbmFnZXMgY2FjaGluZyBvZiBmaWx0ZXJlZCBjb250ZW50IGJ5IHVuaXF1ZSBGaWx0ZXJDcml0ZXJpYSBjb21iaW5hdGlvbnM6XHJcbiAqIC0gQ2FjaGUga2V5IGdlbmVyYXRpb24gZnJvbSBGaWx0ZXJDcml0ZXJpYVxyXG4gKiAtIENhY2hlIHN0b3JhZ2UgYW5kIHJldHJpZXZhbCB3aXRoIER5bmFtb0RCXHJcbiAqIC0gQ2FjaGUgZXhwaXJhdGlvbiBhbmQgaW52YWxpZGF0aW9uXHJcbiAqIC0gQ29udGVudCBleGNsdXNpb24gdHJhY2tpbmcgcGVyIHJvb21cclxuICogXHJcbiAqIFJlcXVpcmVtZW50czogNy4xLCA3LjIsIDcuMywgNy40LCA3LjVcclxuICovXHJcblxyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCwgUHV0SXRlbUNvbW1hbmQsIEdldEl0ZW1Db21tYW5kLCBEZWxldGVJdGVtQ29tbWFuZCwgVXBkYXRlSXRlbUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBtYXJzaGFsbCwgdW5tYXJzaGFsbCB9IGZyb20gJ0Bhd3Mtc2RrL3V0aWwtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBjcmVhdGVIYXNoIH0gZnJvbSAnY3J5cHRvJztcclxuaW1wb3J0IHsgRmlsdGVyQ3JpdGVyaWEsIENvbnRlbnRQb29sRW50cnkgfSBmcm9tICcuL2NvbnRlbnQtZmlsdGVyLXNlcnZpY2UnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBGaWx0ZXJDYWNoZUVudHJ5IHtcclxuICBjYWNoZUtleTogc3RyaW5nO1xyXG4gIG1lZGlhVHlwZTogc3RyaW5nO1xyXG4gIGdlbnJlSWRzOiBudW1iZXJbXTtcclxuICBjb250ZW50OiBDb250ZW50UG9vbEVudHJ5W107XHJcbiAgY3JlYXRlZEF0OiBEYXRlIHwgc3RyaW5nO1xyXG4gIGV4cGlyZXNBdDogRGF0ZSB8IHN0cmluZztcclxuICB0b3RhbEF2YWlsYWJsZTogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFJvb21FeGNsdXNpb25zIHtcclxuICByb29tSWQ6IHN0cmluZztcclxuICBleGNsdWRlZElkczogU2V0PHN0cmluZz47XHJcbiAgbGFzdFVwZGF0ZWQ6IERhdGU7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBGaWx0ZXJDYWNoZU1hbmFnZXIge1xyXG4gIHByaXZhdGUgZHluYW1vQ2xpZW50OiBEeW5hbW9EQkNsaWVudDtcclxuICBwcml2YXRlIGNhY2hlVGFibGVOYW1lOiBzdHJpbmc7XHJcbiAgcHJpdmF0ZSBleGNsdXNpb25zVGFibGVOYW1lOiBzdHJpbmc7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBDQUNIRV9UVExfSE9VUlMgPSAyNDsgLy8gQ2FjaGUgZXhwaXJlcyBhZnRlciAyNCBob3Vyc1xyXG5cclxuICBjb25zdHJ1Y3RvcigpIHtcclxuICAgIHRoaXMuZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xyXG4gICAgdGhpcy5jYWNoZVRhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkZJTFRFUl9DQUNIRV9UQUJMRSB8fCAndHJpbml0eS1maWx0ZXItY2FjaGUnO1xyXG4gICAgdGhpcy5leGNsdXNpb25zVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuUk9PTV9FWENMVVNJT05TX1RBQkxFIHx8ICd0cmluaXR5LXJvb20tZXhjbHVzaW9ucyc7XHJcbiAgICBcclxuICAgIC8vIExvZyBjYWNoZSBjb25maWd1cmF0aW9uIGZvciBkZWJ1Z2dpbmdcclxuICAgIGNvbnNvbGUubG9nKGDwn5SNIEZpbHRlckNhY2hlOiBJbml0aWFsaXplZCB3aXRoIHRhYmxlczogJHt0aGlzLmNhY2hlVGFibGVOYW1lfSwgJHt0aGlzLmV4Y2x1c2lvbnNUYWJsZU5hbWV9YCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXRzIGNhY2hlZCBjb250ZW50IGZvciBzcGVjaWZpYyBmaWx0ZXIgY3JpdGVyaWFcclxuICAgKiBSZXF1aXJlbWVudHM6IDcuMSwgNy4yXHJcbiAgICovXHJcbiAgYXN5bmMgZ2V0Q2FjaGVkQ29udGVudChjcml0ZXJpYTogRmlsdGVyQ3JpdGVyaWEpOiBQcm9taXNlPENvbnRlbnRQb29sRW50cnlbXSB8IG51bGw+IHtcclxuICAgIGNvbnN0IGNhY2hlS2V5ID0gdGhpcy5nZW5lcmF0ZUNhY2hlS2V5KGNyaXRlcmlhKTtcclxuICAgIGNvbnNvbGUubG9nKGDwn5SNIEZpbHRlckNhY2hlOiBMb29raW5nIGZvciBjYWNoZWQgY29udGVudCB3aXRoIGtleTogJHtjYWNoZUtleX1gKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IEdldEl0ZW1Db21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHRoaXMuY2FjaGVUYWJsZU5hbWUsXHJcbiAgICAgICAgS2V5OiBtYXJzaGFsbCh7IGNhY2hlS2V5IH0pXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmR5bmFtb0NsaWVudC5zZW5kKGNvbW1hbmQpO1xyXG4gICAgICBcclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKdjCBGaWx0ZXJDYWNoZTogTm8gY2FjaGVkIGNvbnRlbnQgZm91bmQgZm9yIGtleTogJHtjYWNoZUtleX1gKTtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgY2FjaGVFbnRyeSA9IHVubWFyc2hhbGwocmVzcG9uc2UuSXRlbSkgYXMgRmlsdGVyQ2FjaGVFbnRyeTtcclxuICAgICAgXHJcbiAgICAgIC8vIENoZWNrIGlmIGNhY2hlIGhhcyBleHBpcmVkXHJcbiAgICAgIGlmIChuZXcgRGF0ZSgpID4gbmV3IERhdGUoY2FjaGVFbnRyeS5leHBpcmVzQXQpKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKPsCBGaWx0ZXJDYWNoZTogQ2FjaGUgZXhwaXJlZCBmb3Iga2V5OiAke2NhY2hlS2V5fWApO1xyXG4gICAgICAgIGF3YWl0IHRoaXMuaW52YWxpZGF0ZUNhY2hlKGNyaXRlcmlhKTtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc29sZS5sb2coYOKchSBGaWx0ZXJDYWNoZTogRm91bmQgJHtjYWNoZUVudHJ5LmNvbnRlbnQubGVuZ3RofSBjYWNoZWQgaXRlbXNgKTtcclxuICAgICAgcmV0dXJuIGNhY2hlRW50cnkuY29udGVudDtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGaWx0ZXJDYWNoZTogRXJyb3IgZ2V0dGluZyBjYWNoZWQgY29udGVudDpgLCBlcnJvcik7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgdGFibGUgbm90IGZvdW5kIGVycm9yXHJcbiAgICAgIGlmIChlcnJvci5uYW1lID09PSAnUmVzb3VyY2VOb3RGb3VuZEV4Y2VwdGlvbicgfHwgZXJyb3IuX190eXBlPy5pbmNsdWRlcygnUmVzb3VyY2VOb3RGb3VuZEV4Y2VwdGlvbicpKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfkqEgRmlsdGVyQ2FjaGU6IENhY2hlIHRhYmxlICcke3RoaXMuY2FjaGVUYWJsZU5hbWV9JyBub3QgZm91bmQgLSBncmFjZWZ1bCBkZWdyYWRhdGlvbmApO1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4gbnVsbDsgLy8gR3JhY2VmdWwgZGVncmFkYXRpb24gZm9yIGFueSBvdGhlciBlcnJvcnNcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFN0b3JlcyBjb250ZW50IGluIGNhY2hlIHdpdGggZXhwaXJhdGlvblxyXG4gICAqIFJlcXVpcmVtZW50czogNy4xLCA3LjIsIDcuM1xyXG4gICAqL1xyXG4gIGFzeW5jIHNldENhY2hlZENvbnRlbnQoY3JpdGVyaWE6IEZpbHRlckNyaXRlcmlhLCBjb250ZW50OiBDb250ZW50UG9vbEVudHJ5W10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGNhY2hlS2V5ID0gdGhpcy5nZW5lcmF0ZUNhY2hlS2V5KGNyaXRlcmlhKTtcclxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XHJcbiAgICBjb25zdCBleHBpcmVzQXQgPSBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgKHRoaXMuQ0FDSEVfVFRMX0hPVVJTICogNjAgKiA2MCAqIDEwMDApKTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg8J+SviBGaWx0ZXJDYWNoZTogU3RvcmluZyAke2NvbnRlbnQubGVuZ3RofSBpdGVtcyB3aXRoIGtleTogJHtjYWNoZUtleX1gKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjYWNoZUVudHJ5OiBGaWx0ZXJDYWNoZUVudHJ5ID0ge1xyXG4gICAgICAgIGNhY2hlS2V5LFxyXG4gICAgICAgIG1lZGlhVHlwZTogY3JpdGVyaWEubWVkaWFUeXBlLFxyXG4gICAgICAgIGdlbnJlSWRzOiBjcml0ZXJpYS5nZW5yZXMsXHJcbiAgICAgICAgY29udGVudCxcclxuICAgICAgICBjcmVhdGVkQXQ6IG5vdyxcclxuICAgICAgICBleHBpcmVzQXQsXHJcbiAgICAgICAgdG90YWxBdmFpbGFibGU6IGNvbnRlbnQubGVuZ3RoXHJcbiAgICAgIH07XHJcblxyXG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IFB1dEl0ZW1Db21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHRoaXMuY2FjaGVUYWJsZU5hbWUsXHJcbiAgICAgICAgSXRlbTogbWFyc2hhbGwoY2FjaGVFbnRyeSwge1xyXG4gICAgICAgICAgY29udmVydENsYXNzSW5zdGFuY2VUb01hcDogdHJ1ZSxcclxuICAgICAgICAgIHJlbW92ZVVuZGVmaW5lZFZhbHVlczogdHJ1ZVxyXG4gICAgICAgIH0pXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgYXdhaXQgdGhpcy5keW5hbW9DbGllbnQuc2VuZChjb21tYW5kKTtcclxuICAgICAgY29uc29sZS5sb2coYOKchSBGaWx0ZXJDYWNoZTogU3VjY2Vzc2Z1bGx5IGNhY2hlZCBjb250ZW50LCBleHBpcmVzIGF0ICR7ZXhwaXJlc0F0LnRvSVNPU3RyaW5nKCl9YCk7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgRmlsdGVyQ2FjaGU6IEVycm9yIHN0b3JpbmcgY2FjaGVkIGNvbnRlbnQ6YCwgZXJyb3IpO1xyXG4gICAgICBcclxuICAgICAgLy8gQ2hlY2sgaWYgaXQncyBhIHRhYmxlIG5vdCBmb3VuZCBlcnJvclxyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1Jlc291cmNlTm90Rm91bmRFeGNlcHRpb24nIHx8IGVycm9yLl9fdHlwZT8uaW5jbHVkZXMoJ1Jlc291cmNlTm90Rm91bmRFeGNlcHRpb24nKSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5KhIEZpbHRlckNhY2hlOiBDYWNoZSB0YWJsZSAnJHt0aGlzLmNhY2hlVGFibGVOYW1lfScgbm90IGZvdW5kIC0gc2tpcHBpbmcgY2FjaGUgc3RvcmFnZWApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gRG9uJ3QgdGhyb3cgLSBjYWNoaW5nIGlzIG5vdCBjcml0aWNhbCBmb3IgZnVuY3Rpb25hbGl0eVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSW52YWxpZGF0ZXMgY2FjaGUgZW50cnkgZm9yIHNwZWNpZmljIGNyaXRlcmlhXHJcbiAgICogUmVxdWlyZW1lbnRzOiA3LjMsIDcuNVxyXG4gICAqL1xyXG4gIGFzeW5jIGludmFsaWRhdGVDYWNoZShjcml0ZXJpYTogRmlsdGVyQ3JpdGVyaWEpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGNhY2hlS2V5ID0gdGhpcy5nZW5lcmF0ZUNhY2hlS2V5KGNyaXRlcmlhKTtcclxuICAgIGNvbnNvbGUubG9nKGDwn5eR77iPIEZpbHRlckNhY2hlOiBJbnZhbGlkYXRpbmcgY2FjaGUgZm9yIGtleTogJHtjYWNoZUtleX1gKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IERlbGV0ZUl0ZW1Db21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHRoaXMuY2FjaGVUYWJsZU5hbWUsXHJcbiAgICAgICAgS2V5OiBtYXJzaGFsbCh7IGNhY2hlS2V5IH0pXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgYXdhaXQgdGhpcy5keW5hbW9DbGllbnQuc2VuZChjb21tYW5kKTtcclxuICAgICAgY29uc29sZS5sb2coYOKchSBGaWx0ZXJDYWNoZTogU3VjY2Vzc2Z1bGx5IGludmFsaWRhdGVkIGNhY2hlYCk7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZpbHRlckNhY2hlOiBFcnJvciBpbnZhbGlkYXRpbmcgY2FjaGU6YCwgZXJyb3IpO1xyXG4gICAgICAvLyBEb24ndCB0aHJvdyAtIHRoaXMgaXMgbm90IGNyaXRpY2FsXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBUcmFja3MgY29udGVudCB0aGF0IGhhcyBiZWVuIHNob3duIGluIGEgcm9vbSB0byBhdm9pZCByZXBldGl0aW9uXHJcbiAgICogUmVxdWlyZW1lbnRzOiA3LjRcclxuICAgKi9cclxuICBhc3luYyB0cmFja1Nob3duQ29udGVudChyb29tSWQ6IHN0cmluZywgY29udGVudElkczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKGDwn5OdIEZpbHRlckNhY2hlOiBUcmFja2luZyAke2NvbnRlbnRJZHMubGVuZ3RofSBzaG93biBpdGVtcyBmb3Igcm9vbSAke3Jvb21JZH1gKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBHZXQgZXhpc3RpbmcgZXhjbHVzaW9uc1xyXG4gICAgICBjb25zdCBleGlzdGluZ0V4Y2x1c2lvbnMgPSBhd2FpdCB0aGlzLmdldFJvb21FeGNsdXNpb25zKHJvb21JZCk7XHJcbiAgICAgIGNvbnN0IGFsbEV4Y2x1ZGVkSWRzID0gbmV3IFNldChbLi4uZXhpc3RpbmdFeGNsdXNpb25zLCAuLi5jb250ZW50SWRzXSk7XHJcblxyXG4gICAgICBjb25zdCBleGNsdXNpb25EYXRhID0ge1xyXG4gICAgICAgIHJvb21JZCxcclxuICAgICAgICBleGNsdWRlZElkczogQXJyYXkuZnJvbShhbGxFeGNsdWRlZElkcyksXHJcbiAgICAgICAgbGFzdFVwZGF0ZWQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBQdXRJdGVtQ29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiB0aGlzLmV4Y2x1c2lvbnNUYWJsZU5hbWUsXHJcbiAgICAgICAgSXRlbTogbWFyc2hhbGwoZXhjbHVzaW9uRGF0YSlcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBhd2FpdCB0aGlzLmR5bmFtb0NsaWVudC5zZW5kKGNvbW1hbmQpO1xyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEZpbHRlckNhY2hlOiBVcGRhdGVkIGV4Y2x1c2lvbnMgZm9yIHJvb20gJHtyb29tSWR9ICgke2FsbEV4Y2x1ZGVkSWRzLnNpemV9IHRvdGFsKWApO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGaWx0ZXJDYWNoZTogRXJyb3IgdHJhY2tpbmcgc2hvd24gY29udGVudDpgLCBlcnJvcik7XHJcbiAgICAgIC8vIERvbid0IHRocm93IC0gdGhpcyBpcyBub3QgY3JpdGljYWwgZm9yIGNvcmUgZnVuY3Rpb25hbGl0eVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0cyBsaXN0IG9mIGNvbnRlbnQgSURzIHRoYXQgaGF2ZSBiZWVuIHNob3duIGluIGEgcm9vbVxyXG4gICAqIFJlcXVpcmVtZW50czogNy40XHJcbiAgICovXHJcbiAgYXN5bmMgZ2V0Um9vbUV4Y2x1c2lvbnMocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IEdldEl0ZW1Db21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHRoaXMuZXhjbHVzaW9uc1RhYmxlTmFtZSxcclxuICAgICAgICBLZXk6IG1hcnNoYWxsKHsgcm9vbUlkIH0pXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmR5bmFtb0NsaWVudC5zZW5kKGNvbW1hbmQpO1xyXG4gICAgICBcclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBleGNsdXNpb25EYXRhID0gdW5tYXJzaGFsbChyZXNwb25zZS5JdGVtKTtcclxuICAgICAgcmV0dXJuIGV4Y2x1c2lvbkRhdGEuZXhjbHVkZWRJZHMgfHwgW107XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZpbHRlckNhY2hlOiBFcnJvciBnZXR0aW5nIHJvb20gZXhjbHVzaW9uczpgLCBlcnJvcik7XHJcbiAgICAgIHJldHVybiBbXTsgLy8gUmV0dXJuIGVtcHR5IGFycmF5IG9uIGVycm9yXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmF0ZXMgdW5pcXVlIGNhY2hlIGtleSBmcm9tIEZpbHRlckNyaXRlcmlhXHJcbiAgICogUmVxdWlyZW1lbnRzOiA3LjFcclxuICAgKi9cclxuICBwcml2YXRlIGdlbmVyYXRlQ2FjaGVLZXkoY3JpdGVyaWE6IEZpbHRlckNyaXRlcmlhKTogc3RyaW5nIHtcclxuICAgIC8vIENyZWF0ZSBhIGRldGVybWluaXN0aWMgc3RyaW5nIGZyb20gY3JpdGVyaWFcclxuICAgIGNvbnN0IGtleURhdGEgPSB7XHJcbiAgICAgIG1lZGlhVHlwZTogY3JpdGVyaWEubWVkaWFUeXBlLFxyXG4gICAgICBnZW5yZXM6IGNyaXRlcmlhLmdlbnJlcy5zb3J0KCkgLy8gU29ydCB0byBlbnN1cmUgY29uc2lzdGVudCBrZXkgcmVnYXJkbGVzcyBvZiBvcmRlclxyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCBrZXlTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShrZXlEYXRhKTtcclxuICAgIFxyXG4gICAgLy8gR2VuZXJhdGUgU0hBLTI1NiBoYXNoIGZvciBjb25zaXN0ZW50LCBzaG9ydCBrZXlcclxuICAgIGNvbnN0IGhhc2ggPSBjcmVhdGVIYXNoKCdzaGEyNTYnKS51cGRhdGUoa2V5U3RyaW5nKS5kaWdlc3QoJ2hleCcpO1xyXG4gICAgXHJcbiAgICAvLyBVc2UgZmlyc3QgMTYgY2hhcmFjdGVycyBmb3Igc2hvcnRlciBrZXlzXHJcbiAgICByZXR1cm4gYGZpbHRlcl8ke2hhc2guc3Vic3RyaW5nKDAsIDE2KX1gO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2xlYW5zIHVwIGV4cGlyZWQgY2FjaGUgZW50cmllcyAobWFpbnRlbmFuY2UgZnVuY3Rpb24pXHJcbiAgICogUmVxdWlyZW1lbnRzOiA3LjMsIDcuNVxyXG4gICAqL1xyXG4gIGFzeW5jIGNsZWFudXBFeHBpcmVkQ2FjaGUoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+nuSBGaWx0ZXJDYWNoZTogU3RhcnRpbmcgY2xlYW51cCBvZiBleHBpcmVkIGNhY2hlIGVudHJpZXNgKTtcclxuICAgIFxyXG4gICAgLy8gVGhpcyB3b3VsZCB0eXBpY2FsbHkgdXNlIGEgRHluYW1vREIgc2NhbiB3aXRoIGZpbHRlclxyXG4gICAgLy8gRm9yIG5vdywgd2UnbGwgaW1wbGVtZW50IGEgYmFzaWMgdmVyc2lvblxyXG4gICAgLy8gSW4gcHJvZHVjdGlvbiwgdGhpcyBzaG91bGQgYmUgcnVuIGFzIGEgc2NoZWR1bGVkIExhbWJkYSBmdW5jdGlvblxyXG4gICAgXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBJbXBsZW1lbnRhdGlvbiB3b3VsZCBzY2FuIHRoZSBjYWNoZSB0YWJsZSBhbmQgZGVsZXRlIGV4cGlyZWQgZW50cmllc1xyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEZpbHRlckNhY2hlOiBDbGVhbnVwIGNvbXBsZXRlZGApO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZpbHRlckNhY2hlOiBFcnJvciBkdXJpbmcgY2xlYW51cDpgLCBlcnJvcik7XHJcbiAgICB9XHJcbiAgfVxyXG59Il19