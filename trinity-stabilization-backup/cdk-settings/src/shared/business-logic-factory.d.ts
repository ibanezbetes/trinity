/**
 * Business Logic Factory - Extracted from MONOLITH files
 *
 * Factory for creating and managing business logic components
 * Provides singleton instances and dependency injection
 *
 * Requirements: 1.4, 3.1, 3.5
 */
import { EnhancedTMDBClient } from './enhanced-tmdb-client.js';
import { ContentFilterService } from './content-filter-service.js';
import { DynamoDBService } from './dynamodb-service.js';
export interface BusinessLogicDependencies {
    tmdbClient: EnhancedTMDBClient;
    contentFilterService: ContentFilterService;
    dynamoDBService: DynamoDBService;
}
export declare class BusinessLogicFactory {
    private static instance;
    private tmdbClient;
    private contentFilterService;
    private dynamoDBService;
    private constructor();
    /**
     * Gets the singleton instance
     */
    static getInstance(): BusinessLogicFactory;
    /**
     * Creates or gets the TMDB client instance
     */
    getTMDBClient(apiKey?: string): EnhancedTMDBClient;
    /**
     * Creates or gets the content filter service instance
     */
    getContentFilterService(apiKey?: string): ContentFilterService;
    /**
     * Creates or gets the DynamoDB service instance
     */
    getDynamoDBService(): DynamoDBService;
    /**
     * Gets all business logic dependencies
     */
    getAllDependencies(apiKey?: string): BusinessLogicDependencies;
    /**
     * Validates that all required environment variables are present
     */
    validateEnvironment(): {
        isValid: boolean;
        missingVars: string[];
    };
    /**
     * Initializes all services with validation
     */
    initializeServices(apiKey?: string): Promise<BusinessLogicDependencies>;
    /**
     * Creates a room with 50-movie cache using extracted business logic
     */
    createRoomWithCache(roomData: {
        name: string;
        mediaType: 'MOVIE' | 'TV';
        genreIds: number[];
        hostId: string;
        maxMembers: number;
    }, apiKey?: string): Promise<{
        room: any;
        movies: any[];
    }>;
    /**
     * Validates business logic integrity
     */
    validateBusinessLogicIntegrity(apiKey?: string): Promise<{
        isValid: boolean;
        errors: string[];
        warnings: string[];
    }>;
    /**
     * Resets all singleton instances (for testing)
     */
    static reset(): void;
}
