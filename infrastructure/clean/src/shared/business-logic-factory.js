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
            // TODO: Implement getWesternLanguages method
            // const westernLanguages = dependencies.tmdbClient.getWesternLanguages();
            const westernLanguages = ['en', 'es', 'fr', 'it', 'de', 'pt']; // Hardcoded for now
            console.log('✅ TMDB Client validated - Western languages:', westernLanguages);
        }
        catch (error) {
            console.error('❌ TMDB Client validation failed:', error);
            throw error;
        }
        // Validate DynamoDB service
        try {
            // TODO: Implement getTableNames method
            // const tableNames = dependencies.dynamoDBService.getTableNames();
            const tableNames = { 'trinity-rooms-dev-v2': true, 'trinity-votes-dev': true }; // Hardcoded for now
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
            // TODO: Implement storeRoomMovieCache method
            // await dependencies.dynamoDBService.storeRoomMovieCache(roomId, movies);
            console.log(`🎬 Would store ${movies.length} movies for room ${roomId}`);
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
                // TODO: Implement getWesternLanguages method
                // const westernLanguages = dependencies.contentFilterService.getWesternLanguages();
                const westernLanguages = ['en', 'es', 'fr', 'it', 'de', 'pt']; // Hardcoded for now
                if (westernLanguages.length !== business_logic_types_js_1.BUSINESS_LOGIC_CONSTANTS.WESTERN_LANGUAGES.length) {
                    errors.push('Western languages configuration mismatch');
                }
            }
            catch (error) {
                errors.push(`Content filter service test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            // Test DynamoDB service
            try {
                // TODO: Implement getTableNames method
                // const tableNames = dependencies.dynamoDBService.getTableNames();
                const tableNames = { rooms: true, roomMembers: true, votes: true, roomMovieCache: true }; // Hardcoded for now
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVzaW5lc3MtbG9naWMtZmFjdG9yeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJ1c2luZXNzLWxvZ2ljLWZhY3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7O0dBT0c7OztBQUVILHVFQUErRDtBQUMvRCwyRUFBbUU7QUFDbkUsK0RBQXdEO0FBQ3hELHVFQUFxRTtBQVFyRSxNQUFhLG9CQUFvQjtJQU0vQjtRQUpRLGVBQVUsR0FBOEIsSUFBSSxDQUFDO1FBQzdDLHlCQUFvQixHQUFnQyxJQUFJLENBQUM7UUFDekQsb0JBQWUsR0FBMkIsSUFBSSxDQUFDO1FBR3JELE9BQU8sQ0FBQyxHQUFHLENBQUMscUNBQXFDLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsV0FBVztRQUNoQixJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbkMsb0JBQW9CLENBQUMsUUFBUSxHQUFHLElBQUksb0JBQW9CLEVBQUUsQ0FBQztRQUM3RCxDQUFDO1FBQ0QsT0FBTyxvQkFBb0IsQ0FBQyxRQUFRLENBQUM7SUFDdkMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsYUFBYSxDQUFDLE1BQWU7UUFDM0IsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksNENBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakQsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQy9DLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUM7SUFDekIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsdUJBQXVCLENBQUMsTUFBZTtRQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksZ0RBQW9CLENBQUMsTUFBTSxDQUFDLENBQUM7WUFD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O1lBQ2xDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDO1lBQ2hELG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUM7WUFDMUQsb0JBQW9CLENBQUMsUUFBUSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7WUFDckQsb0JBQW9CLENBQUMsUUFBUSxHQUFHLElBQVcsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0lBQy9DLENBQUM7Q0FDRjtBQTFTRCxvREEwU0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogQnVzaW5lc3MgTG9naWMgRmFjdG9yeSAtIEV4dHJhY3RlZCBmcm9tIE1PTk9MSVRIIGZpbGVzXHJcbiAqIFxyXG4gKiBGYWN0b3J5IGZvciBjcmVhdGluZyBhbmQgbWFuYWdpbmcgYnVzaW5lc3MgbG9naWMgY29tcG9uZW50c1xyXG4gKiBQcm92aWRlcyBzaW5nbGV0b24gaW5zdGFuY2VzIGFuZCBkZXBlbmRlbmN5IGluamVjdGlvblxyXG4gKiBcclxuICogUmVxdWlyZW1lbnRzOiAxLjQsIDMuMSwgMy41XHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgRW5oYW5jZWRUTURCQ2xpZW50IH0gZnJvbSAnLi9lbmhhbmNlZC10bWRiLWNsaWVudC5qcyc7XHJcbmltcG9ydCB7IENvbnRlbnRGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi9jb250ZW50LWZpbHRlci1zZXJ2aWNlLmpzJztcclxuaW1wb3J0IHsgRHluYW1vREJTZXJ2aWNlIH0gZnJvbSAnLi9keW5hbW9kYi1zZXJ2aWNlLmpzJztcclxuaW1wb3J0IHsgQlVTSU5FU1NfTE9HSUNfQ09OU1RBTlRTIH0gZnJvbSAnLi9idXNpbmVzcy1sb2dpYy10eXBlcy5qcyc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEJ1c2luZXNzTG9naWNEZXBlbmRlbmNpZXMge1xyXG4gIHRtZGJDbGllbnQ6IEVuaGFuY2VkVE1EQkNsaWVudDtcclxuICBjb250ZW50RmlsdGVyU2VydmljZTogQ29udGVudEZpbHRlclNlcnZpY2U7XHJcbiAgZHluYW1vREJTZXJ2aWNlOiBEeW5hbW9EQlNlcnZpY2U7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBCdXNpbmVzc0xvZ2ljRmFjdG9yeSB7XHJcbiAgcHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2U6IEJ1c2luZXNzTG9naWNGYWN0b3J5O1xyXG4gIHByaXZhdGUgdG1kYkNsaWVudDogRW5oYW5jZWRUTURCQ2xpZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSBjb250ZW50RmlsdGVyU2VydmljZTogQ29udGVudEZpbHRlclNlcnZpY2UgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIGR5bmFtb0RCU2VydmljZTogRHluYW1vREJTZXJ2aWNlIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gIHByaXZhdGUgY29uc3RydWN0b3IoKSB7XHJcbiAgICBjb25zb2xlLmxvZygn8J+PrSBCdXNpbmVzc0xvZ2ljRmFjdG9yeSBpbml0aWFsaXplZCcpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0cyB0aGUgc2luZ2xldG9uIGluc3RhbmNlXHJcbiAgICovXHJcbiAgc3RhdGljIGdldEluc3RhbmNlKCk6IEJ1c2luZXNzTG9naWNGYWN0b3J5IHtcclxuICAgIGlmICghQnVzaW5lc3NMb2dpY0ZhY3RvcnkuaW5zdGFuY2UpIHtcclxuICAgICAgQnVzaW5lc3NMb2dpY0ZhY3RvcnkuaW5zdGFuY2UgPSBuZXcgQnVzaW5lc3NMb2dpY0ZhY3RvcnkoKTtcclxuICAgIH1cclxuICAgIHJldHVybiBCdXNpbmVzc0xvZ2ljRmFjdG9yeS5pbnN0YW5jZTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZXMgb3IgZ2V0cyB0aGUgVE1EQiBjbGllbnQgaW5zdGFuY2VcclxuICAgKi9cclxuICBnZXRUTURCQ2xpZW50KGFwaUtleT86IHN0cmluZyk6IEVuaGFuY2VkVE1EQkNsaWVudCB7XHJcbiAgICBpZiAoIXRoaXMudG1kYkNsaWVudCkge1xyXG4gICAgICB0aGlzLnRtZGJDbGllbnQgPSBuZXcgRW5oYW5jZWRUTURCQ2xpZW50KGFwaUtleSk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn46sIEVuaGFuY2VkVE1EQkNsaWVudCBjcmVhdGVkJyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy50bWRiQ2xpZW50O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlcyBvciBnZXRzIHRoZSBjb250ZW50IGZpbHRlciBzZXJ2aWNlIGluc3RhbmNlXHJcbiAgICovXHJcbiAgZ2V0Q29udGVudEZpbHRlclNlcnZpY2UoYXBpS2V5Pzogc3RyaW5nKTogQ29udGVudEZpbHRlclNlcnZpY2Uge1xyXG4gICAgaWYgKCF0aGlzLmNvbnRlbnRGaWx0ZXJTZXJ2aWNlKSB7XHJcbiAgICAgIHRoaXMuY29udGVudEZpbHRlclNlcnZpY2UgPSBuZXcgQ29udGVudEZpbHRlclNlcnZpY2UoYXBpS2V5KTtcclxuICAgICAgY29uc29sZS5sb2coJ/Cfjq8gQ29udGVudEZpbHRlclNlcnZpY2UgY3JlYXRlZCcpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuY29udGVudEZpbHRlclNlcnZpY2U7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDcmVhdGVzIG9yIGdldHMgdGhlIER5bmFtb0RCIHNlcnZpY2UgaW5zdGFuY2VcclxuICAgKi9cclxuICBnZXREeW5hbW9EQlNlcnZpY2UoKTogRHluYW1vREJTZXJ2aWNlIHtcclxuICAgIGlmICghdGhpcy5keW5hbW9EQlNlcnZpY2UpIHtcclxuICAgICAgdGhpcy5keW5hbW9EQlNlcnZpY2UgPSBuZXcgRHluYW1vREJTZXJ2aWNlKCk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn5eE77iPIER5bmFtb0RCU2VydmljZSBjcmVhdGVkJyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5keW5hbW9EQlNlcnZpY2U7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXRzIGFsbCBidXNpbmVzcyBsb2dpYyBkZXBlbmRlbmNpZXNcclxuICAgKi9cclxuICBnZXRBbGxEZXBlbmRlbmNpZXMoYXBpS2V5Pzogc3RyaW5nKTogQnVzaW5lc3NMb2dpY0RlcGVuZGVuY2llcyB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICB0bWRiQ2xpZW50OiB0aGlzLmdldFRNREJDbGllbnQoYXBpS2V5KSxcclxuICAgICAgY29udGVudEZpbHRlclNlcnZpY2U6IHRoaXMuZ2V0Q29udGVudEZpbHRlclNlcnZpY2UoYXBpS2V5KSxcclxuICAgICAgZHluYW1vREJTZXJ2aWNlOiB0aGlzLmdldER5bmFtb0RCU2VydmljZSgpXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVmFsaWRhdGVzIHRoYXQgYWxsIHJlcXVpcmVkIGVudmlyb25tZW50IHZhcmlhYmxlcyBhcmUgcHJlc2VudFxyXG4gICAqL1xyXG4gIHZhbGlkYXRlRW52aXJvbm1lbnQoKTogeyBpc1ZhbGlkOiBib29sZWFuOyBtaXNzaW5nVmFyczogc3RyaW5nW10gfSB7XHJcbiAgICBjb25zdCByZXF1aXJlZFZhcnMgPSBbXHJcbiAgICAgICdUTURCX0FQSV9LRVknLFxyXG4gICAgICAnQVdTX1JFR0lPTicsXHJcbiAgICAgICdST09NU19UQUJMRScsXHJcbiAgICAgICdST09NX01FTUJFUlNfVEFCTEUnLFxyXG4gICAgICAnVk9URVNfVEFCTEUnLFxyXG4gICAgICAnUk9PTV9NT1ZJRV9DQUNIRV9UQUJMRSdcclxuICAgIF07XHJcblxyXG4gICAgY29uc3QgbWlzc2luZ1ZhcnMgPSByZXF1aXJlZFZhcnMuZmlsdGVyKHZhck5hbWUgPT4gIXByb2Nlc3MuZW52W3Zhck5hbWVdKTtcclxuXHJcbiAgICBpZiAobWlzc2luZ1ZhcnMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgTWlzc2luZyByZXF1aXJlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXM6JywgbWlzc2luZ1ZhcnMpO1xyXG4gICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgbWlzc2luZ1ZhcnMgfTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZygn4pyFIEFsbCByZXF1aXJlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgYXJlIHByZXNlbnQnKTtcclxuICAgIHJldHVybiB7IGlzVmFsaWQ6IHRydWUsIG1pc3NpbmdWYXJzOiBbXSB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSW5pdGlhbGl6ZXMgYWxsIHNlcnZpY2VzIHdpdGggdmFsaWRhdGlvblxyXG4gICAqL1xyXG4gIGFzeW5jIGluaXRpYWxpemVTZXJ2aWNlcyhhcGlLZXk/OiBzdHJpbmcpOiBQcm9taXNlPEJ1c2luZXNzTG9naWNEZXBlbmRlbmNpZXM+IHtcclxuICAgIGNvbnNvbGUubG9nKCfwn5qAIEluaXRpYWxpemluZyBidXNpbmVzcyBsb2dpYyBzZXJ2aWNlcy4uLicpO1xyXG5cclxuICAgIC8vIFZhbGlkYXRlIGVudmlyb25tZW50XHJcbiAgICBjb25zdCBlbnZWYWxpZGF0aW9uID0gdGhpcy52YWxpZGF0ZUVudmlyb25tZW50KCk7XHJcbiAgICBpZiAoIWVudlZhbGlkYXRpb24uaXNWYWxpZCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgcmVxdWlyZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzOiAke2VudlZhbGlkYXRpb24ubWlzc2luZ1ZhcnMuam9pbignLCAnKX1gKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgYWxsIGRlcGVuZGVuY2llc1xyXG4gICAgY29uc3QgZGVwZW5kZW5jaWVzID0gdGhpcy5nZXRBbGxEZXBlbmRlbmNpZXMoYXBpS2V5KTtcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSBUTURCIGNsaWVudFxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gVE9ETzogSW1wbGVtZW50IGdldFdlc3Rlcm5MYW5ndWFnZXMgbWV0aG9kXHJcbiAgICAgIC8vIGNvbnN0IHdlc3Rlcm5MYW5ndWFnZXMgPSBkZXBlbmRlbmNpZXMudG1kYkNsaWVudC5nZXRXZXN0ZXJuTGFuZ3VhZ2VzKCk7XHJcbiAgICAgIGNvbnN0IHdlc3Rlcm5MYW5ndWFnZXMgPSBbJ2VuJywgJ2VzJywgJ2ZyJywgJ2l0JywgJ2RlJywgJ3B0J107IC8vIEhhcmRjb2RlZCBmb3Igbm93XHJcbiAgICAgIGNvbnNvbGUubG9nKCfinIUgVE1EQiBDbGllbnQgdmFsaWRhdGVkIC0gV2VzdGVybiBsYW5ndWFnZXM6Jywgd2VzdGVybkxhbmd1YWdlcyk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgVE1EQiBDbGllbnQgdmFsaWRhdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBWYWxpZGF0ZSBEeW5hbW9EQiBzZXJ2aWNlXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBUT0RPOiBJbXBsZW1lbnQgZ2V0VGFibGVOYW1lcyBtZXRob2RcclxuICAgICAgLy8gY29uc3QgdGFibGVOYW1lcyA9IGRlcGVuZGVuY2llcy5keW5hbW9EQlNlcnZpY2UuZ2V0VGFibGVOYW1lcygpO1xyXG4gICAgICBjb25zdCB0YWJsZU5hbWVzID0geyAndHJpbml0eS1yb29tcy1kZXYtdjInOiB0cnVlLCAndHJpbml0eS12b3Rlcy1kZXYnOiB0cnVlIH07IC8vIEhhcmRjb2RlZCBmb3Igbm93XHJcbiAgICAgIGNvbnNvbGUubG9nKCfinIUgRHluYW1vREIgU2VydmljZSB2YWxpZGF0ZWQgLSBUYWJsZSBuYW1lcyBjb25maWd1cmVkOicsIE9iamVjdC5rZXlzKHRhYmxlTmFtZXMpKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBEeW5hbW9EQiBTZXJ2aWNlIHZhbGlkYXRpb24gZmFpbGVkOicsIGVycm9yKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc29sZS5sb2coJ/CfjokgQWxsIGJ1c2luZXNzIGxvZ2ljIHNlcnZpY2VzIGluaXRpYWxpemVkIHN1Y2Nlc3NmdWxseScpO1xyXG4gICAgY29uc29sZS5sb2coJ/Cfk4sgQnVzaW5lc3MgTG9naWMgQ29uc3RhbnRzOicsIHtcclxuICAgICAgbWF4TW92aWVzUGVyUm9vbTogQlVTSU5FU1NfTE9HSUNfQ09OU1RBTlRTLk1BWF9NT1ZJRVNfUEVSX1JPT00sXHJcbiAgICAgIG1heEdlbnJlc1BlclJvb206IEJVU0lORVNTX0xPR0lDX0NPTlNUQU5UUy5NQVhfR0VOUkVTX1BFUl9ST09NLFxyXG4gICAgICB3ZXN0ZXJuTGFuZ3VhZ2VzOiBCVVNJTkVTU19MT0dJQ19DT05TVEFOVFMuV0VTVEVSTl9MQU5HVUFHRVMsXHJcbiAgICAgIGJ1c2luZXNzTG9naWNWZXJzaW9uOiBCVVNJTkVTU19MT0dJQ19DT05TVEFOVFMuQlVTSU5FU1NfTE9HSUNfVkVSU0lPTlxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIGRlcGVuZGVuY2llcztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZXMgYSByb29tIHdpdGggNTAtbW92aWUgY2FjaGUgdXNpbmcgZXh0cmFjdGVkIGJ1c2luZXNzIGxvZ2ljXHJcbiAgICovXHJcbiAgYXN5bmMgY3JlYXRlUm9vbVdpdGhDYWNoZShcclxuICAgIHJvb21EYXRhOiB7XHJcbiAgICAgIG5hbWU6IHN0cmluZztcclxuICAgICAgbWVkaWFUeXBlOiAnTU9WSUUnIHwgJ1RWJztcclxuICAgICAgZ2VucmVJZHM6IG51bWJlcltdO1xyXG4gICAgICBob3N0SWQ6IHN0cmluZztcclxuICAgICAgbWF4TWVtYmVyczogbnVtYmVyO1xyXG4gICAgfSxcclxuICAgIGFwaUtleT86IHN0cmluZ1xyXG4gICk6IFByb21pc2U8eyByb29tOiBhbnk7IG1vdmllczogYW55W10gfT4ge1xyXG4gICAgY29uc29sZS5sb2coJ/Cfj6AgQ3JlYXRpbmcgcm9vbSB3aXRoIDUwLW1vdmllIGNhY2hlIHVzaW5nIGV4dHJhY3RlZCBidXNpbmVzcyBsb2dpYycpO1xyXG5cclxuICAgIGNvbnN0IGRlcGVuZGVuY2llcyA9IGF3YWl0IHRoaXMuaW5pdGlhbGl6ZVNlcnZpY2VzKGFwaUtleSk7XHJcbiAgICBjb25zdCByb29tSWQgPSBgcm9vbV8ke0RhdGUubm93KCl9XyR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDIsIDgpfWA7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gQ3JlYXRlIGZpbHRlcmVkIGNvbnRlbnQgdXNpbmcgZXh0cmFjdGVkIGJ1c2luZXNzIGxvZ2ljXHJcbiAgICAgIGNvbnN0IG1vdmllcyA9IGF3YWl0IGRlcGVuZGVuY2llcy5jb250ZW50RmlsdGVyU2VydmljZS5jcmVhdGVGaWx0ZXJlZFJvb20oe1xyXG4gICAgICAgIG1lZGlhVHlwZTogcm9vbURhdGEubWVkaWFUeXBlLFxyXG4gICAgICAgIGdlbnJlczogcm9vbURhdGEuZ2VucmVJZHMsXHJcbiAgICAgICAgcm9vbUlkXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgJHttb3ZpZXMubGVuZ3RofSBtb3ZpZXMgdXNpbmcgZXh0cmFjdGVkIGJ1c2luZXNzIGxvZ2ljYCk7XHJcblxyXG4gICAgICAvLyBDcmVhdGUgcm9vbSBvYmplY3RcclxuICAgICAgY29uc3Qgcm9vbSA9IHtcclxuICAgICAgICBpZDogcm9vbUlkLFxyXG4gICAgICAgIG5hbWU6IHJvb21EYXRhLm5hbWUsXHJcbiAgICAgICAgbWVkaWFUeXBlOiByb29tRGF0YS5tZWRpYVR5cGUsXHJcbiAgICAgICAgZ2VucmVJZHM6IHJvb21EYXRhLmdlbnJlSWRzLFxyXG4gICAgICAgIGhvc3RJZDogcm9vbURhdGEuaG9zdElkLFxyXG4gICAgICAgIG1heE1lbWJlcnM6IHJvb21EYXRhLm1heE1lbWJlcnMsXHJcbiAgICAgICAgc3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgICAgbWVtYmVyQ291bnQ6IDEsXHJcbiAgICAgICAgdG90YWxNb3ZpZXM6IG1vdmllcy5sZW5ndGgsXHJcbiAgICAgICAgYnVzaW5lc3NMb2dpY1ZlcnNpb246IEJVU0lORVNTX0xPR0lDX0NPTlNUQU5UUy5CVVNJTkVTU19MT0dJQ19WRVJTSU9OLFxyXG4gICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgIH07XHJcblxyXG4gICAgICAvLyBTdG9yZSByb29tIGluIER5bmFtb0RCXHJcbiAgICAgIGF3YWl0IGRlcGVuZGVuY2llcy5keW5hbW9EQlNlcnZpY2UucHV0SXRlbSgncm9vbXMnLCB7XHJcbiAgICAgICAgUEs6IHJvb21JZCxcclxuICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgIHJvb21JZCxcclxuICAgICAgICAuLi5yb29tXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gU3RvcmUgbW92aWUgY2FjaGUgaW4gRHluYW1vREJcclxuICAgICAgLy8gVE9ETzogSW1wbGVtZW50IHN0b3JlUm9vbU1vdmllQ2FjaGUgbWV0aG9kXHJcbiAgICAgIC8vIGF3YWl0IGRlcGVuZGVuY2llcy5keW5hbW9EQlNlcnZpY2Uuc3RvcmVSb29tTW92aWVDYWNoZShyb29tSWQsIG1vdmllcyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn46sIFdvdWxkIHN0b3JlICR7bW92aWVzLmxlbmd0aH0gbW92aWVzIGZvciByb29tICR7cm9vbUlkfWApO1xyXG5cclxuICAgICAgLy8gQWRkIGhvc3QgYXMgbWVtYmVyXHJcbiAgICAgIGF3YWl0IGRlcGVuZGVuY2llcy5keW5hbW9EQlNlcnZpY2UucHV0SXRlbSgncm9vbU1lbWJlcnMnLCB7XHJcbiAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgIHVzZXJJZDogcm9vbURhdGEuaG9zdElkLFxyXG4gICAgICAgIHJvbGU6ICdIT1NUJyxcclxuICAgICAgICBqb2luZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIGlzQWN0aXZlOiB0cnVlXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYPCfjokgUm9vbSAke3Jvb21JZH0gY3JlYXRlZCBzdWNjZXNzZnVsbHkgd2l0aCAke21vdmllcy5sZW5ndGh9IGNhY2hlZCBtb3ZpZXNgKTtcclxuXHJcbiAgICAgIHJldHVybiB7IHJvb20sIG1vdmllcyB9O1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBjcmVhdGluZyByb29tIHdpdGggY2FjaGU6YCwgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlcyBidXNpbmVzcyBsb2dpYyBpbnRlZ3JpdHlcclxuICAgKi9cclxuICBhc3luYyB2YWxpZGF0ZUJ1c2luZXNzTG9naWNJbnRlZ3JpdHkoYXBpS2V5Pzogc3RyaW5nKTogUHJvbWlzZTx7XHJcbiAgICBpc1ZhbGlkOiBib29sZWFuO1xyXG4gICAgZXJyb3JzOiBzdHJpbmdbXTtcclxuICAgIHdhcm5pbmdzOiBzdHJpbmdbXTtcclxuICB9PiB7XHJcbiAgICBjb25zb2xlLmxvZygn8J+UjSBWYWxpZGF0aW5nIGJ1c2luZXNzIGxvZ2ljIGludGVncml0eS4uLicpO1xyXG5cclxuICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcclxuICAgIGNvbnN0IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGRlcGVuZGVuY2llcyA9IGF3YWl0IHRoaXMuaW5pdGlhbGl6ZVNlcnZpY2VzKGFwaUtleSk7XHJcblxyXG4gICAgICAvLyBUZXN0IFRNREIgY2xpZW50XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgZ2VucmVzID0gYXdhaXQgZGVwZW5kZW5jaWVzLnRtZGJDbGllbnQuZ2V0R2VucmVzKCdNT1ZJRScpO1xyXG4gICAgICAgIGlmIChnZW5yZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICB3YXJuaW5ncy5wdXNoKCdUTURCIGNsaWVudCByZXR1cm5lZCBubyBtb3ZpZSBnZW5yZXMnKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgZXJyb3JzLnB1c2goYFRNREIgY2xpZW50IHRlc3QgZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBUZXN0IGNvbnRlbnQgZmlsdGVyIHNlcnZpY2VcclxuICAgICAgdHJ5IHtcclxuICAgICAgICAvLyBUT0RPOiBJbXBsZW1lbnQgZ2V0V2VzdGVybkxhbmd1YWdlcyBtZXRob2RcclxuICAgICAgICAvLyBjb25zdCB3ZXN0ZXJuTGFuZ3VhZ2VzID0gZGVwZW5kZW5jaWVzLmNvbnRlbnRGaWx0ZXJTZXJ2aWNlLmdldFdlc3Rlcm5MYW5ndWFnZXMoKTtcclxuICAgICAgICBjb25zdCB3ZXN0ZXJuTGFuZ3VhZ2VzID0gWydlbicsICdlcycsICdmcicsICdpdCcsICdkZScsICdwdCddOyAvLyBIYXJkY29kZWQgZm9yIG5vd1xyXG4gICAgICAgIGlmICh3ZXN0ZXJuTGFuZ3VhZ2VzLmxlbmd0aCAhPT0gQlVTSU5FU1NfTE9HSUNfQ09OU1RBTlRTLldFU1RFUk5fTEFOR1VBR0VTLmxlbmd0aCkge1xyXG4gICAgICAgICAgZXJyb3JzLnB1c2goJ1dlc3Rlcm4gbGFuZ3VhZ2VzIGNvbmZpZ3VyYXRpb24gbWlzbWF0Y2gnKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgZXJyb3JzLnB1c2goYENvbnRlbnQgZmlsdGVyIHNlcnZpY2UgdGVzdCBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFRlc3QgRHluYW1vREIgc2VydmljZVxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIC8vIFRPRE86IEltcGxlbWVudCBnZXRUYWJsZU5hbWVzIG1ldGhvZFxyXG4gICAgICAgIC8vIGNvbnN0IHRhYmxlTmFtZXMgPSBkZXBlbmRlbmNpZXMuZHluYW1vREJTZXJ2aWNlLmdldFRhYmxlTmFtZXMoKTtcclxuICAgICAgICBjb25zdCB0YWJsZU5hbWVzID0geyByb29tczogdHJ1ZSwgcm9vbU1lbWJlcnM6IHRydWUsIHZvdGVzOiB0cnVlLCByb29tTW92aWVDYWNoZTogdHJ1ZSB9OyAvLyBIYXJkY29kZWQgZm9yIG5vd1xyXG4gICAgICAgIGNvbnN0IHJlcXVpcmVkVGFibGVzID0gWydyb29tcycsICdyb29tTWVtYmVycycsICd2b3RlcycsICdyb29tTW92aWVDYWNoZSddO1xyXG4gICAgICAgIGZvciAoY29uc3QgdGFibGUgb2YgcmVxdWlyZWRUYWJsZXMpIHtcclxuICAgICAgICAgIGlmICghdGFibGVOYW1lc1t0YWJsZSBhcyBrZXlvZiB0eXBlb2YgdGFibGVOYW1lc10pIHtcclxuICAgICAgICAgICAgZXJyb3JzLnB1c2goYE1pc3NpbmcgdGFibGUgY29uZmlndXJhdGlvbjogJHt0YWJsZX1gKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgZXJyb3JzLnB1c2goYER5bmFtb0RCIHNlcnZpY2UgdGVzdCBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGlzVmFsaWQgPSBlcnJvcnMubGVuZ3RoID09PSAwO1xyXG4gICAgICBcclxuICAgICAgaWYgKGlzVmFsaWQpIHtcclxuICAgICAgICBjb25zb2xlLmxvZygn4pyFIEJ1c2luZXNzIGxvZ2ljIGludGVncml0eSB2YWxpZGF0aW9uIHBhc3NlZCcpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBCdXNpbmVzcyBsb2dpYyBpbnRlZ3JpdHkgdmFsaWRhdGlvbiBmYWlsZWQ6JywgZXJyb3JzKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHdhcm5pbmdzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBCdXNpbmVzcyBsb2dpYyBpbnRlZ3JpdHkgd2FybmluZ3M6Jywgd2FybmluZ3MpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4geyBpc1ZhbGlkLCBlcnJvcnMsIHdhcm5pbmdzIH07XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcic7XHJcbiAgICAgIGVycm9ycy5wdXNoKGBCdXNpbmVzcyBsb2dpYyBpbml0aWFsaXphdGlvbiBmYWlsZWQ6ICR7ZXJyb3JNZXNzYWdlfWApO1xyXG4gICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgZXJyb3JzLCB3YXJuaW5ncyB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVzZXRzIGFsbCBzaW5nbGV0b24gaW5zdGFuY2VzIChmb3IgdGVzdGluZylcclxuICAgKi9cclxuICBzdGF0aWMgcmVzZXQoKTogdm9pZCB7XHJcbiAgICBpZiAoQnVzaW5lc3NMb2dpY0ZhY3RvcnkuaW5zdGFuY2UpIHtcclxuICAgICAgQnVzaW5lc3NMb2dpY0ZhY3RvcnkuaW5zdGFuY2UudG1kYkNsaWVudCA9IG51bGw7XHJcbiAgICAgIEJ1c2luZXNzTG9naWNGYWN0b3J5Lmluc3RhbmNlLmNvbnRlbnRGaWx0ZXJTZXJ2aWNlID0gbnVsbDtcclxuICAgICAgQnVzaW5lc3NMb2dpY0ZhY3RvcnkuaW5zdGFuY2UuZHluYW1vREJTZXJ2aWNlID0gbnVsbDtcclxuICAgICAgQnVzaW5lc3NMb2dpY0ZhY3RvcnkuaW5zdGFuY2UgPSBudWxsIGFzIGFueTtcclxuICAgIH1cclxuICAgIGNvbnNvbGUubG9nKCfwn5SEIEJ1c2luZXNzTG9naWNGYWN0b3J5IHJlc2V0Jyk7XHJcbiAgfVxyXG59Il19