"use strict";
/**
 * Business Logic Factory - Extracted from MONOLITH files
 *
 * Factory for creating and managing business logic components
 * Provides singleton instances and dependency injection
 *
 * Requirements: 1.4, 3.1, 3.5
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessLogicFactory = void 0;
const enhanced_tmdb_client_js_1 = require("./enhanced-tmdb-client.js");
const content_filter_service_js_1 = require("./content-filter-service.js");
const dynamodb_service_js_1 = require("./dynamodb-service.js");
const business_logic_types_js_1 = require("./business-logic-types.js");
class BusinessLogicFactory {
    constructor() {
        this.tmdbClient = null;
        this.contentFilterService = null;
        this.dynamoDBService = null;
        console.log('🏭 BusinessLogicFactory initialized');
    }
    /**
     * Gets the singleton instance
     */
    static getInstance() {
        if (!BusinessLogicFactory.instance) {
            BusinessLogicFactory.instance = new BusinessLogicFactory();
        }
        return BusinessLogicFactory.instance;
    }
    /**
     * Creates or gets the TMDB client instance
     */
    getTMDBClient(apiKey) {
        if (!this.tmdbClient) {
            this.tmdbClient = new enhanced_tmdb_client_js_1.EnhancedTMDBClient(apiKey);
            console.log('🎬 EnhancedTMDBClient created');
        }
        return this.tmdbClient;
    }
    /**
     * Creates or gets the content filter service instance
     */
    getContentFilterService(apiKey) {
        if (!this.contentFilterService) {
            this.contentFilterService = new content_filter_service_js_1.ContentFilterService(apiKey);
            console.log('🎯 ContentFilterService created');
        }
        return this.contentFilterService;
    }
    /**
     * Creates or gets the DynamoDB service instance
     */
    getDynamoDBService() {
        if (!this.dynamoDBService) {
            this.dynamoDBService = new dynamodb_service_js_1.DynamoDBService();
            console.log('🗄️ DynamoDBService created');
        }
        return this.dynamoDBService;
    }
    /**
     * Gets all business logic dependencies
     */
    getAllDependencies(apiKey) {
        return {
            tmdbClient: this.getTMDBClient(apiKey),
            contentFilterService: this.getContentFilterService(apiKey),
            dynamoDBService: this.getDynamoDBService()
        };
    }
    /**
     * Validates that all required environment variables are present
     */
    validateEnvironment() {
        const requiredVars = [
            'TMDB_API_KEY',
            'AWS_REGION',
            'ROOMS_TABLE',
            'ROOM_MEMBERS_TABLE',
            'VOTES_TABLE',
            'ROOM_MOVIE_CACHE_TABLE'
        ];
        const missingVars = requiredVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            console.error('❌ Missing required environment variables:', missingVars);
            return { isValid: false, missingVars };
        }
        console.log('✅ All required environment variables are present');
        return { isValid: true, missingVars: [] };
    }
    /**
     * Initializes all services with validation
     */
    async initializeServices(apiKey) {
        console.log('🚀 Initializing business logic services...');
        // Validate environment
        const envValidation = this.validateEnvironment();
        if (!envValidation.isValid) {
            throw new Error(`Missing required environment variables: ${envValidation.missingVars.join(', ')}`);
        }
        // Get all dependencies
        const dependencies = this.getAllDependencies(apiKey);
        // Validate TMDB client
        try {
            const westernLanguages = dependencies.tmdbClient.getWesternLanguages();
            console.log('✅ TMDB Client validated - Western languages:', westernLanguages);
        }
        catch (error) {
            console.error('❌ TMDB Client validation failed:', error);
            throw error;
        }
        // Validate DynamoDB service
        try {
            const tableNames = dependencies.dynamoDBService.getTableNames();
            console.log('✅ DynamoDB Service validated - Table names configured:', Object.keys(tableNames));
        }
        catch (error) {
            console.error('❌ DynamoDB Service validation failed:', error);
            throw error;
        }
        console.log('🎉 All business logic services initialized successfully');
        console.log('📋 Business Logic Constants:', {
            maxMoviesPerRoom: business_logic_types_js_1.BUSINESS_LOGIC_CONSTANTS.MAX_MOVIES_PER_ROOM,
            maxGenresPerRoom: business_logic_types_js_1.BUSINESS_LOGIC_CONSTANTS.MAX_GENRES_PER_ROOM,
            westernLanguages: business_logic_types_js_1.BUSINESS_LOGIC_CONSTANTS.WESTERN_LANGUAGES,
            businessLogicVersion: business_logic_types_js_1.BUSINESS_LOGIC_CONSTANTS.BUSINESS_LOGIC_VERSION
        });
        return dependencies;
    }
    /**
     * Creates a room with 50-movie cache using extracted business logic
     */
    async createRoomWithCache(roomData, apiKey) {
        console.log('🏠 Creating room with 50-movie cache using extracted business logic');
        const dependencies = await this.initializeServices(apiKey);
        const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        try {
            // Create filtered content using extracted business logic
            const movies = await dependencies.contentFilterService.createFilteredRoom({
                mediaType: roomData.mediaType,
                genres: roomData.genreIds,
                roomId
            });
            console.log(`✅ Generated ${movies.length} movies using extracted business logic`);
            // Create room object
            const room = {
                id: roomId,
                name: roomData.name,
                mediaType: roomData.mediaType,
                genreIds: roomData.genreIds,
                hostId: roomData.hostId,
                maxMembers: roomData.maxMembers,
                status: 'WAITING',
                memberCount: 1,
                totalMovies: movies.length,
                businessLogicVersion: business_logic_types_js_1.BUSINESS_LOGIC_CONSTANTS.BUSINESS_LOGIC_VERSION,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            // Store room in DynamoDB
            await dependencies.dynamoDBService.putItem('rooms', {
                PK: roomId,
                SK: 'ROOM',
                roomId,
                ...room
            });
            // Store movie cache in DynamoDB
            await dependencies.dynamoDBService.storeRoomMovieCache(roomId, movies);
            // Add host as member
            await dependencies.dynamoDBService.putItem('roomMembers', {
                roomId,
                userId: roomData.hostId,
                role: 'HOST',
                joinedAt: new Date().toISOString(),
                isActive: true
            });
            console.log(`🎉 Room ${roomId} created successfully with ${movies.length} cached movies`);
            return { room, movies };
        }
        catch (error) {
            console.error(`❌ Error creating room with cache:`, error);
            throw error;
        }
    }
    /**
     * Validates business logic integrity
     */
    async validateBusinessLogicIntegrity(apiKey) {
        console.log('🔍 Validating business logic integrity...');
        const errors = [];
        const warnings = [];
        try {
            const dependencies = await this.initializeServices(apiKey);
            // Test TMDB client
            try {
                const genres = await dependencies.tmdbClient.getGenres('MOVIE');
                if (genres.length === 0) {
                    warnings.push('TMDB client returned no movie genres');
                }
            }
            catch (error) {
                errors.push(`TMDB client test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            // Test content filter service
            try {
                const westernLanguages = dependencies.contentFilterService.getWesternLanguages();
                if (westernLanguages.length !== business_logic_types_js_1.BUSINESS_LOGIC_CONSTANTS.WESTERN_LANGUAGES.length) {
                    errors.push('Western languages configuration mismatch');
                }
            }
            catch (error) {
                errors.push(`Content filter service test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            // Test DynamoDB service
            try {
                const tableNames = dependencies.dynamoDBService.getTableNames();
                const requiredTables = ['rooms', 'roomMembers', 'votes', 'roomMovieCache'];
                for (const table of requiredTables) {
                    if (!tableNames[table]) {
                        errors.push(`Missing table configuration: ${table}`);
                    }
                }
            }
            catch (error) {
                errors.push(`DynamoDB service test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            const isValid = errors.length === 0;
            if (isValid) {
                console.log('✅ Business logic integrity validation passed');
            }
            else {
                console.error('❌ Business logic integrity validation failed:', errors);
            }
            if (warnings.length > 0) {
                console.warn('⚠️ Business logic integrity warnings:', warnings);
            }
            return { isValid, errors, warnings };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Business logic initialization failed: ${errorMessage}`);
            return { isValid: false, errors, warnings };
        }
    }
    /**
     * Resets all singleton instances (for testing)
     */
    static reset() {
        if (BusinessLogicFactory.instance) {
            BusinessLogicFactory.instance.tmdbClient = null;
            BusinessLogicFactory.instance.contentFilterService = null;
            BusinessLogicFactory.instance.dynamoDBService = null;
            BusinessLogicFactory.instance = null;
        }
        console.log('🔄 BusinessLogicFactory reset');
    }
}
exports.BusinessLogicFactory = BusinessLogicFactory;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVzaW5lc3MtbG9naWMtZmFjdG9yeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJ1c2luZXNzLWxvZ2ljLWZhY3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7O0dBT0c7OztBQUVILHVFQUErRDtBQUMvRCwyRUFBbUU7QUFDbkUsK0RBQXdEO0FBQ3hELHVFQUFxRTtBQVFyRSxNQUFhLG9CQUFvQjtJQU0vQjtRQUpRLGVBQVUsR0FBOEIsSUFBSSxDQUFDO1FBQzdDLHlCQUFvQixHQUFnQyxJQUFJLENBQUM7UUFDekQsb0JBQWUsR0FBMkIsSUFBSSxDQUFDO1FBR3JELE9BQU8sQ0FBQyxHQUFHLENBQUMscUNBQXFDLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsV0FBVztRQUNoQixJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbkMsb0JBQW9CLENBQUMsUUFBUSxHQUFHLElBQUksb0JBQW9CLEVBQUUsQ0FBQztRQUM3RCxDQUFDO1FBQ0QsT0FBTyxvQkFBb0IsQ0FBQyxRQUFRLENBQUM7SUFDdkMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsYUFBYSxDQUFDLE1BQWU7UUFDM0IsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksNENBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakQsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQy9DLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUM7SUFDekIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsdUJBQXVCLENBQUMsTUFBZTtRQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksZ0RBQW9CLENBQUMsTUFBTSxDQUFDLENBQUM7WUFD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Y3RlZCBmcm9tIE1PTk9MSVRIIGZpbGVzXHJcbiAqIFxyXG4gKiBGYWN0b3J5IGZvciBjcmVhdGluZyBhbmQgbWFuYWdpbmcgYnVzaW5lc3MgbG9naWMgY29tcG9uZW50c1xyXG4gKiBQcm92aWRlcyBzaW5nbGV0b24gaW5zdGFuY2VzIGFuZCBkZXBlbmRlbmN5IGluamVjdGlvblxyXG4gKiBcclxuICogUmVxdWlyZW1lbnRzOiAxLjQsIDMuMSwgMy41XHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgRW5oYW5jZWRUTURCQ2xpZW50IH0gZnJvbSAnLi9lbmhhbmNlZC10bWRiLWNsaWVudC5qcyc7XHJcbmltcG9ydCB7IENvbnRlbnRGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi9jb250ZW50LWZpbHRlci1zZXJ2aWNlLmpzJztcclxuaW1wb3J0IHsgRHluYW1vREJTZXJ2aWNlIH0gZnJvbSAnLi9keW5hbW9kYi1zZXJ2aWNlLmpzJztcclxuaW1wb3J0IHsgQlVTSU5FU1NfTE9HSUNfQ09OU1RBTlRTIH0gZnJvbSAnLi9idXNpbmVzcy1sb2dpYy10eXBlcy5qcyc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEJ1c2luZXNzTG9naWNEZXBlbmRlbmNpZXMge1xyXG4gIHRtZGJDbGllbnQ6IEVuaGFuY2VkVE1EQkNsaWVudDtcclxuICBjb250ZW50RmlsdGVyU2VydmljZTogQ29udGVudEZpbHRlclNlcnZpY2U7XHJcbiAgZHluYW1vREJTZXJ2aWNlOiBEeW5hbW9EQlNlcnZpY2U7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBCdXNpbmVzc0xvZ2ljRmFjdG9yeSB7XHJcbiAgcHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2U6IEJ1c2luZXNzTG9naWNGYWN0b3J5O1xyXG4gIHByaXZhdGUgdG1kYkNsaWVudDogRW5oYW5jZWRUTURCQ2xpZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSBjb250ZW50RmlsdGVyU2VydmljZTogQ29udGVudEZpbHRlclNlcnZpY2UgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIGR5bmFtb0RCU2VydmljZTogRHluYW1vREJTZXJ2aWNlIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gIHByaXZhdGUgY29uc3RydWN0b3IoKSB7XHJcbiAgICBjb25zb2xlLmxvZygn8J+PrSBCdXNpbmVzc0xvZ2ljRmFjdG9yeSBpbml0aWFsaXplZCcpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0cyB0aGUgc2luZ2xldG9uIGluc3RhbmNlXHJcbiAgICovXHJcbiAgc3RhdGljIGdldEluc3RhbmNlKCk6IEJ1c2luZXNzTG9naWNGYWN0b3J5IHtcclxuICAgIGlmICghQnVzaW5lc3NMb2dpY0ZhY3RvcnkuaW5zdGFuY2UpIHtcclxuICAgICAgQnVzaW5lc3NMb2dpY0ZhY3RvcnkuaW5zdGFuY2UgPSBuZXcgQnVzaW5lc3NMb2dpY0ZhY3RvcnkoKTtcclxuICAgIH1cclxuICAgIHJldHVybiBCdXNpbmVzc0xvZ2ljRmFjdG9yeS5pbnN0YW5jZTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZXMgb3IgZ2V0cyB0aGUgVE1EQiBjbGllbnQgaW5zdGFuY2VcclxuICAgKi9cclxuICBnZXRUTURCQ2xpZW50KGFwaUtleT86IHN0cmluZyk6IEVuaGFuY2VkVE1EQkNsaWVudCB7XHJcbiAgICBpZiAoIXRoaXMudG1kYkNsaWVudCkge1xyXG4gICAgICB0aGlzLnRtZGJDbGllbnQgPSBuZXcgRW5oYW5jZWRUTURCQ2xpZW50KGFwaUtleSk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn46sIEVuaGFuY2VkVE1EQkNsaWVudCBjcmVhdGVkJyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy50bWRiQ2xpZW50O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlcyBvciBnZXRzIHRoZSBjb250ZW50IGZpbHRlciBzZXJ2aWNlIGluc3RhbmNlXHJcbiAgICovXHJcbiAgZ2V0Q29udGVudEZpbHRlclNlcnZpY2UoYXBpS2V5Pzogc3RyaW5nKTogQ29udGVudEZpbHRlclNlcnZpY2Uge1xyXG4gICAgaWYgKCF0aGlzLmNvbnRlbnRGaWx0ZXJTZXJ2aWNlKSB7XHJcbiAgICAgIHRoaXMuY29udGVudEZpbHRlclNlcnZpY2UgPSBuZXcgQ29udGVudEZpbHRlclNlcnZpY2UoYXBpS2V5KTtcclxuICAgICAgY29uc29sZS5sb2coJ/Cfjq8gQ29udGVudEZpbHRlclNlcnZpY2UgY3JlYXRlZCcpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuY29udGVudEZpbHRlclNlcnZpY2U7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDcmVhdGVzIG9yIGdldHMgdGhlIER5bmFtb0RCIHNlcnZpY2UgaW5zdGFuY2VcclxuICAgKi9cclxuICBnZXREeW5hbW9EQlNlcnZpY2UoKTogRHluYW1vREJTZXJ2aWNlIHtcclxuICAgIGlmICghdGhpcy5keW5hbW9EQlNlcnZpY2UpIHtcclxuICAgICAgdGhpcy5keW5hbW9EQlNlcnZpY2UgPSBuZXcgRHluYW1vREJTZXJ2aWNlKCk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn5eE77iPIER5bmFtb0RCU2VydmljZSBjcmVhdGVkJyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5keW5hbW9EQlNlcnZpY2U7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXRzIGFsbCBidXNpbmVzcyBsb2dpYyBkZXBlbmRlbmNpZXNcclxuICAgKi9cclxuICBnZXRBbGxEZXBlbmRlbmNpZXMoYXBpS2V5Pzogc3RyaW5nKTogQnVzaW5lc3NMb2dpY0RlcGVuZGVuY2llcyB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICB0bWRiQ2xpZW50OiB0aGlzLmdldFRNREJDbGllbnQoYXBpS2V5KSxcclxuICAgICAgY29udGVudEZpbHRlclNlcnZpY2U6IHRoaXMuZ2V0Q29udGVudEZpbHRlclNlcnZpY2UoYXBpS2V5KSxcclxuICAgICAgZHluYW1vREJTZXJ2aWNlOiB0aGlzLmdldER5bmFtb0RCU2VydmljZSgpXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVmFsaWRhdGVzIHRoYXQgYWxsIHJlcXVpcmVkIGVudmlyb25tZW50IHZhcmlhYmxlcyBhcmUgcHJlc2VudFxyXG4gICAqL1xyXG4gIHZhbGlkYXRlRW52aXJvbm1lbnQoKTogeyBpc1ZhbGlkOiBib29sZWFuOyBtaXNzaW5nVmFyczogc3RyaW5nW10gfSB7XHJcbiAgICBjb25zdCByZXF1aXJlZFZhcnMgPSBbXHJcbiAgICAgICdUTURCX0FQSV9LRVknLFxyXG4gICAgICAnQVdTX1JFR0lPTicsXHJcbiAgICAgICdST09NU19UQUJMRScsXHJcbiAgICAgICdST09NX01FTUJFUlNfVEFCTEUnLFxyXG4gICAgICAnVk9URVNfVEFCTEUnLFxyXG4gICAgICAnUk9PTV9NT1ZJRV9DQUNIRV9UQUJMRSdcclxuICAgIF07XHJcblxyXG4gICAgY29uc3QgbWlzc2luZ1ZhcnMgPSByZXF1aXJlZFZhcnMuZmlsdGVyKHZhck5hbWUgPT4gIXByb2Nlc3MuZW52W3Zhck5hbWVdKTtcclxuXHJcbiAgICBpZiAobWlzc2luZ1ZhcnMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgTWlzc2luZyByZXF1aXJlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXM6JywgbWlzc2luZ1ZhcnMpO1xyXG4gICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgbWlzc2luZ1ZhcnMgfTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZygn4pyFIEFsbCByZXF1aXJlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgYXJlIHByZXNlbnQnKTtcclxuICAgIHJldHVybiB7IGlzVmFsaWQ6IHRydWUsIG1pc3NpbmdWYXJzOiBbXSB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSW5pdGlhbGl6ZXMgYWxsIHNlcnZpY2VzIHdpdGggdmFsaWRhdGlvblxyXG4gICAqL1xyXG4gIGFzeW5jIGluaXRpYWxpemVTZXJ2aWNlcyhhcGlLZXk/OiBzdHJpbmcpOiBQcm9taXNlPEJ1c2luZXNzTG9naWNEZXBlbmRlbmNpZXM+IHtcclxuICAgIGNvbnNvbGUubG9nKCfwn5qAIEluaXRpYWxpemluZyBidXNpbmVzcyBsb2dpYyBzZXJ2aWNlcy4uLicpO1xyXG5cclxuICAgIC8vIFZhbGlkYXRlIGVudmlyb25tZW50XHJcbiAgICBjb25zdCBlbnZWYWxpZGF0aW9uID0gdGhpcy52YWxpZGF0ZUVudmlyb25tZW50KCk7XHJcbiAgICBpZiAoIWVudlZhbGlkYXRpb24uaXNWYWxpZCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgcmVxdWlyZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzOiAke2VudlZhbGlkYXRpb24ubWlzc2luZ1ZhcnMuam9pbignLCAnKX1gKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgYWxsIGRlcGVuZGVuY2llc1xyXG4gICAgY29uc3QgZGVwZW5kZW5jaWVzID0gdGhpcy5nZXRBbGxEZXBlbmRlbmNpZXMoYXBpS2V5KTtcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSBUTURCIGNsaWVudFxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3Qgd2VzdGVybkxhbmd1YWdlcyA9IGRlcGVuZGVuY2llcy50bWRiQ2xpZW50LmdldFdlc3Rlcm5MYW5ndWFnZXMoKTtcclxuICAgICAgY29uc29sZS5sb2coJ+KchSBUTURCIENsaWVudCB2YWxpZGF0ZWQgLSBXZXN0ZXJuIGxhbmd1YWdlczonLCB3ZXN0ZXJuTGFuZ3VhZ2VzKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBUTURCIENsaWVudCB2YWxpZGF0aW9uIGZhaWxlZDonLCBlcnJvcik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFZhbGlkYXRlIER5bmFtb0RCIHNlcnZpY2VcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHRhYmxlTmFtZXMgPSBkZXBlbmRlbmNpZXMuZHluYW1vREJTZXJ2aWNlLmdldFRhYmxlTmFtZXMoKTtcclxuICAgICAgY29uc29sZS5sb2coJ+KchSBEeW5hbW9EQiBTZXJ2aWNlIHZhbGlkYXRlZCAtIFRhYmxlIG5hbWVzIGNvbmZpZ3VyZWQ6JywgT2JqZWN0LmtleXModGFibGVOYW1lcykpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIER5bmFtb0RCIFNlcnZpY2UgdmFsaWRhdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZygn8J+OiSBBbGwgYnVzaW5lc3MgbG9naWMgc2VydmljZXMgaW5pdGlhbGl6ZWQgc3VjY2Vzc2Z1bGx5Jyk7XHJcbiAgICBjb25zb2xlLmxvZygn8J+TiyBCdXNpbmVzcyBMb2dpYyBDb25zdGFudHM6Jywge1xyXG4gICAgICBtYXhNb3ZpZXNQZXJSb29tOiBCVVNJTkVTU19MT0dJQ19DT05TVEFOVFMuTUFYX01PVklFU19QRVJfUk9PTSxcclxuICAgICAgbWF4R2VucmVzUGVyUm9vbTogQlVTSU5FU1NfTE9HSUNfQ09OU1RBTlRTLk1BWF9HRU5SRVNfUEVSX1JPT00sXHJcbiAgICAgIHdlc3Rlcm5MYW5ndWFnZXM6IEJVU0lORVNTX0xPR0lDX0NPTlNUQU5UUy5XRVNURVJOX0xBTkdVQUdFUyxcclxuICAgICAgYnVzaW5lc3NMb2dpY1ZlcnNpb246IEJVU0lORVNTX0xPR0lDX0NPTlNUQU5UUy5CVVNJTkVTU19MT0dJQ19WRVJTSU9OXHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gZGVwZW5kZW5jaWVzO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlcyBhIHJvb20gd2l0aCA1MC1tb3ZpZSBjYWNoZSB1c2luZyBleHRyYWN0ZWQgYnVzaW5lc3MgbG9naWNcclxuICAgKi9cclxuICBhc3luYyBjcmVhdGVSb29tV2l0aENhY2hlKFxyXG4gICAgcm9vbURhdGE6IHtcclxuICAgICAgbmFtZTogc3RyaW5nO1xyXG4gICAgICBtZWRpYVR5cGU6ICdNT1ZJRScgfCAnVFYnO1xyXG4gICAgICBnZW5yZUlkczogbnVtYmVyW107XHJcbiAgICAgIGhvc3RJZDogc3RyaW5nO1xyXG4gICAgICBtYXhNZW1iZXJzOiBudW1iZXI7XHJcbiAgICB9LFxyXG4gICAgYXBpS2V5Pzogc3RyaW5nXHJcbiAgKTogUHJvbWlzZTx7IHJvb206IGFueTsgbW92aWVzOiBhbnlbXSB9PiB7XHJcbiAgICBjb25zb2xlLmxvZygn8J+PoCBDcmVhdGluZyByb29tIHdpdGggNTAtbW92aWUgY2FjaGUgdXNpbmcgZXh0cmFjdGVkIGJ1c2luZXNzIGxvZ2ljJyk7XHJcblxyXG4gICAgY29uc3QgZGVwZW5kZW5jaWVzID0gYXdhaXQgdGhpcy5pbml0aWFsaXplU2VydmljZXMoYXBpS2V5KTtcclxuICAgIGNvbnN0IHJvb21JZCA9IGByb29tXyR7RGF0ZS5ub3coKX1fJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHJpbmcoMiwgOCl9YDtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBDcmVhdGUgZmlsdGVyZWQgY29udGVudCB1c2luZyBleHRyYWN0ZWQgYnVzaW5lc3MgbG9naWNcclxuICAgICAgY29uc3QgbW92aWVzID0gYXdhaXQgZGVwZW5kZW5jaWVzLmNvbnRlbnRGaWx0ZXJTZXJ2aWNlLmNyZWF0ZUZpbHRlcmVkUm9vbSh7XHJcbiAgICAgICAgbWVkaWFUeXBlOiByb29tRGF0YS5tZWRpYVR5cGUsXHJcbiAgICAgICAgZ2VucmVzOiByb29tRGF0YS5nZW5yZUlkcyxcclxuICAgICAgICByb29tSWRcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCAke21vdmllcy5sZW5ndGh9IG1vdmllcyB1c2luZyBleHRyYWN0ZWQgYnVzaW5lc3MgbG9naWNgKTtcclxuXHJcbiAgICAgIC8vIENyZWF0ZSByb29tIG9iamVjdFxyXG4gICAgICBjb25zdCByb29tID0ge1xyXG4gICAgICAgIGlkOiByb29tSWQsXHJcbiAgICAgICAgbmFtZTogcm9vbURhdGEubmFtZSxcclxuICAgICAgICBtZWRpYVR5cGU6IHJvb21EYXRhLm1lZGlhVHlwZSxcclxuICAgICAgICBnZW5yZUlkczogcm9vbURhdGEuZ2VucmVJZHMsXHJcbiAgICAgICAgaG9zdElkOiByb29tRGF0YS5ob3N0SWQsXHJcbiAgICAgICAgbWF4TWVtYmVyczogcm9vbURhdGEubWF4TWVtYmVycyxcclxuICAgICAgICBzdGF0dXM6ICdXQUlUSU5HJyxcclxuICAgICAgICBtZW1iZXJDb3VudDogMSxcclxuICAgICAgICB0b3RhbE1vdmllczogbW92aWVzLmxlbmd0aCxcclxuICAgICAgICBidXNpbmVzc0xvZ2ljVmVyc2lvbjogQlVTSU5FU1NfTE9HSUNfQ09OU1RBTlRTLkJVU0lORVNTX0xPR0lDX1ZFUlNJT04sXHJcbiAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgfTtcclxuXHJcbiAgICAgIC8vIFN0b3JlIHJvb20gaW4gRHluYW1vREJcclxuICAgICAgYXdhaXQgZGVwZW5kZW5jaWVzLmR5bmFtb0RCU2VydmljZS5wdXRJdGVtKCdyb29tcycsIHtcclxuICAgICAgICBQSzogcm9vbUlkLFxyXG4gICAgICAgIFNLOiAnUk9PTScsXHJcbiAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgIC4uLnJvb21cclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBTdG9yZSBtb3ZpZSBjYWNoZSBpbiBEeW5hbW9EQlxyXG4gICAgICBhd2FpdCBkZXBlbmRlbmNpZXMuZHluYW1vREJTZXJ2aWNlLnN0b3JlUm9vbU1vdmllQ2FjaGUocm9vbUlkLCBtb3ZpZXMpO1xyXG5cclxuICAgICAgLy8gQWRkIGhvc3QgYXMgbWVtYmVyXHJcbiAgICAgIGF3YWl0IGRlcGVuZGVuY2llcy5keW5hbW9EQlNlcnZpY2UucHV0SXRlbSgncm9vbU1lbWJlcnMnLCB7XHJcbiAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgIHVzZXJJZDogcm9vbURhdGEuaG9zdElkLFxyXG4gICAgICAgIHJvbGU6ICdIT1NUJyxcclxuICAgICAgICBqb2luZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIGlzQWN0aXZlOiB0cnVlXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYPCfjokgUm9vbSAke3Jvb21JZH0gY3JlYXRlZCBzdWNjZXNzZnVsbHkgd2l0aCAke21vdmllcy5sZW5ndGh9IGNhY2hlZCBtb3ZpZXNgKTtcclxuXHJcbiAgICAgIHJldHVybiB7IHJvb20sIG1vdmllcyB9O1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBjcmVhdGluZyByb29tIHdpdGggY2FjaGU6YCwgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlcyBidXNpbmVzcyBsb2dpYyBpbnRlZ3JpdHlcclxuICAgKi9cclxuICBhc3luYyB2YWxpZGF0ZUJ1c2luZXNzTG9naWNJbnRlZ3JpdHkoYXBpS2V5Pzogc3RyaW5nKTogUHJvbWlzZTx7XHJcbiAgICBpc1ZhbGlkOiBib29sZWFuO1xyXG4gICAgZXJyb3JzOiBzdHJpbmdbXTtcclxuICAgIHdhcm5pbmdzOiBzdHJpbmdbXTtcclxuICB9PiB7XHJcbiAgICBjb25zb2xlLmxvZygn8J+UjSBWYWxpZGF0aW5nIGJ1c2luZXNzIGxvZ2ljIGludGVncml0eS4uLicpO1xyXG5cclxuICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcclxuICAgIGNvbnN0IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGRlcGVuZGVuY2llcyA9IGF3YWl0IHRoaXMuaW5pdGlhbGl6ZVNlcnZpY2VzKGFwaUtleSk7XHJcblxyXG4gICAgICAvLyBUZXN0IFRNREIgY2xpZW50XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgZ2VucmVzID0gYXdhaXQgZGVwZW5kZW5jaWVzLnRtZGJDbGllbnQuZ2V0R2VucmVzKCdNT1ZJRScpO1xyXG4gICAgICAgIGlmIChnZW5yZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICB3YXJuaW5ncy5wdXNoKCdUTURCIGNsaWVudCByZXR1cm5lZCBubyBtb3ZpZSBnZW5yZXMnKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgZXJyb3JzLnB1c2goYFRNREIgY2xpZW50IHRlc3QgZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBUZXN0IGNvbnRlbnQgZmlsdGVyIHNlcnZpY2VcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCB3ZXN0ZXJuTGFuZ3VhZ2VzID0gZGVwZW5kZW5jaWVzLmNvbnRlbnRGaWx0ZXJTZXJ2aWNlLmdldFdlc3Rlcm5MYW5ndWFnZXMoKTtcclxuICAgICAgICBpZiAod2VzdGVybkxhbmd1YWdlcy5sZW5ndGggIT09IEJVU0lORVNTX0xPR0lDX0NPTlNUQU5UUy5XRVNURVJOX0xBTkdVQUdFUy5sZW5ndGgpIHtcclxuICAgICAgICAgIGVycm9ycy5wdXNoKCdXZXN0ZXJuIGxhbmd1YWdlcyBjb25maWd1cmF0aW9uIG1pc21hdGNoJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGVycm9ycy5wdXNoKGBDb250ZW50IGZpbHRlciBzZXJ2aWNlIHRlc3QgZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBUZXN0IER5bmFtb0RCIHNlcnZpY2VcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCB0YWJsZU5hbWVzID0gZGVwZW5kZW5jaWVzLmR5bmFtb0RCU2VydmljZS5nZXRUYWJsZU5hbWVzKCk7XHJcbiAgICAgICAgY29uc3QgcmVxdWlyZWRUYWJsZXMgPSBbJ3Jvb21zJywgJ3Jvb21NZW1iZXJzJywgJ3ZvdGVzJywgJ3Jvb21Nb3ZpZUNhY2hlJ107XHJcbiAgICAgICAgZm9yIChjb25zdCB0YWJsZSBvZiByZXF1aXJlZFRhYmxlcykge1xyXG4gICAgICAgICAgaWYgKCF0YWJsZU5hbWVzW3RhYmxlIGFzIGtleW9mIHR5cGVvZiB0YWJsZU5hbWVzXSkge1xyXG4gICAgICAgICAgICBlcnJvcnMucHVzaChgTWlzc2luZyB0YWJsZSBjb25maWd1cmF0aW9uOiAke3RhYmxlfWApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBlcnJvcnMucHVzaChgRHluYW1vREIgc2VydmljZSB0ZXN0IGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgaXNWYWxpZCA9IGVycm9ycy5sZW5ndGggPT09IDA7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoaXNWYWxpZCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgQnVzaW5lc3MgbG9naWMgaW50ZWdyaXR5IHZhbGlkYXRpb24gcGFzc2VkJyk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEJ1c2luZXNzIGxvZ2ljIGludGVncml0eSB2YWxpZGF0aW9uIGZhaWxlZDonLCBlcnJvcnMpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAod2FybmluZ3MubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGNvbnNvbGUud2Fybign4pqg77iPIEJ1c2luZXNzIGxvZ2ljIGludGVncml0eSB3YXJuaW5nczonLCB3YXJuaW5ncyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiB7IGlzVmFsaWQsIGVycm9ycywgd2FybmluZ3MgfTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJztcclxuICAgICAgZXJyb3JzLnB1c2goYEJ1c2luZXNzIGxvZ2ljIGluaXRpYWxpemF0aW9uIGZhaWxlZDogJHtlcnJvck1lc3NhZ2V9YCk7XHJcbiAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBlcnJvcnMsIHdhcm5pbmdzIH07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZXNldHMgYWxsIHNpbmdsZXRvbiBpbnN0YW5jZXMgKGZvciB0ZXN0aW5nKVxyXG4gICAqL1xyXG4gIHN0YXRpYyByZXNldCgpOiB2b2lkIHtcclxuICAgIGlmIChCdXNpbmVzc0xvZ2ljRmFjdG9yeS5pbnN0YW5jZSkge1xyXG4gICAgICBCdXNpbmVzc0xvZ2ljRmFjdG9yeS5pbnN0YW5jZS50bWRiQ2xpZW50ID0gbnVsbDtcclxuICAgICAgQnVzaW5lc3NMb2dpY0ZhY3RvcnkuaW5zdGFuY2UuY29udGVudEZpbHRlclNlcnZpY2UgPSBudWxsO1xyXG4gICAgICBCdXNpbmVzc0xvZ2ljRmFjdG9yeS5pbnN0YW5jZS5keW5hbW9EQlNlcnZpY2UgPSBudWxsO1xyXG4gICAgICBCdXNpbmVzc0xvZ2ljRmFjdG9yeS5pbnN0YW5jZSA9IG51bGwgYXMgYW55O1xyXG4gICAgfVxyXG4gICAgY29uc29sZS5sb2coJ/CflIQgQnVzaW5lc3NMb2dpY0ZhY3RvcnkgcmVzZXQnKTtcclxuICB9XHJcbn0iXX0=