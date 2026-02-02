/**
 * Trinity Resource Naming Conventions
 *
 * Centralized naming conventions and utilities for all Trinity resources
 * Ensures consistent naming across all AWS resources
 */
export interface NamingConfig {
    project: string;
    environment: string;
    region: string;
    version?: string;
}
export interface ResourceNaming {
    tables: {
        users: string;
        rooms: string;
        roomMembers: string;
        roomInvites: string;
        votes: string;
        moviesCache: string;
        roomMatches: string;
        connections: string;
        roomMovieCache: string;
        roomCacheMetadata: string;
        matchmaking: string;
        filterCache: string;
    };
    lambdas: {
        auth: string;
        cache: string;
        vote: string;
        room: string;
        movie: string;
        realtime: string;
        matchmaker: string;
    };
    apis: {
        main: string;
        realtime: string;
    };
    cognito: {
        userPool: string;
        userPoolClient: string;
        identityPool: string;
    };
    stacks: {
        config: string;
        database: string;
        lambda: string;
        api: string;
        cognito: string;
        main: string;
    };
    cloudWatch: {
        logGroups: {
            lambda: (functionName: string) => string;
            api: (apiName: string) => string;
        };
        dashboards: {
            main: string;
            lambda: string;
            database: string;
            api: string;
        };
        alarms: {
            lambdaErrors: (functionName: string) => string;
            lambdaDuration: (functionName: string) => string;
            dynamodbThrottles: (tableName: string) => string;
            apiErrors: (apiName: string) => string;
        };
    };
}
/**
 * Generate resource names based on naming conventions
 */
export declare function generateResourceNames(config: NamingConfig): ResourceNaming;
/**
 * Validate resource name against conventions
 */
export declare function validateResourceName(resourceName: string, resourceType: string, config: NamingConfig): {
    valid: boolean;
    issues: string[];
    expected?: string;
};
/**
 * Get expected resource names for current configuration
 */
export declare function getExpectedResourceNames(): ResourceNaming;
/**
 * Naming convention rules
 */
export declare const NAMING_RULES: {
    general: string[];
    dynamodb: string[];
    lambda: string[];
    cloudformation: string[];
    cloudwatch: string[];
};
/**
 * Generate tags for resources
 */
export declare function generateResourceTags(config: NamingConfig, resourceType: string, resourceName: string): Record<string, string>;
/**
 * Validate all resource names in a stack
 */
export declare function validateStackResourceNames(stackResources: Record<string, string>, config: NamingConfig): {
    valid: boolean;
    issues: Array<{
        resource: string;
        issues: string[];
    }>;
};
