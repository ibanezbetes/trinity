"use strict";
/**
 * Trinity Resource Naming Conventions
 *
 * Centralized naming conventions and utilities for all Trinity resources
 * Ensures consistent naming across all AWS resources
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NAMING_RULES = void 0;
exports.generateResourceNames = generateResourceNames;
exports.validateResourceName = validateResourceName;
exports.getExpectedResourceNames = getExpectedResourceNames;
exports.generateResourceTags = generateResourceTags;
exports.validateStackResourceNames = validateStackResourceNames;
/**
 * Generate resource names based on naming conventions
 */
function generateResourceNames(config) {
    const { project, environment, version } = config;
    const prefix = project.toLowerCase();
    const env = environment.toLowerCase();
    const versionSuffix = version ? `-${version}` : '';
    return {
        tables: {
            users: `${prefix}-users-${env}`,
            rooms: `${prefix}-rooms-${env}${versionSuffix}`,
            roomMembers: `${prefix}-room-members-${env}`,
            roomInvites: `${prefix}-room-invites-${env}${versionSuffix}`,
            votes: `${prefix}-votes-${env}`,
            moviesCache: `${prefix}-movies-cache-${env}`,
            roomMatches: `${prefix}-room-matches-${env}`,
            connections: `${prefix}-connections-${env}`,
            roomMovieCache: `${prefix}-room-movie-cache-${env}`,
            roomCacheMetadata: `${prefix}-room-cache-metadata-${env}`,
            matchmaking: `${prefix}-matchmaking-${env}`,
            filterCache: `${prefix}-filter-cache`,
        },
        lambdas: {
            auth: `${prefix}-auth-${env}`,
            cache: `${prefix}-cache-${env}`,
            vote: `${prefix}-vote-${env}`,
            room: `${prefix}-room-${env}`,
            movie: `${prefix}-movie-${env}`,
            realtime: `${prefix}-realtime-${env}`,
            matchmaker: `${prefix}-vote-consensus-${env}`, // Note: deployed as vote-consensus, not matchmaker
        },
        apis: {
            main: `${prefix}-api-${env}`,
            realtime: `${prefix}-realtime-api`,
        },
        cognito: {
            userPool: `${prefix}-users-${env}`,
            userPoolClient: `${prefix}-client-${env}`,
            identityPool: `${prefix}-identity-${env}`,
        },
        stacks: {
            config: `Trinity${capitalize(environment)}ConfigStack`,
            database: `Trinity${capitalize(environment)}DatabaseStack`,
            lambda: `Trinity${capitalize(environment)}LambdaStack`,
            api: `Trinity${capitalize(environment)}ApiStack`,
            cognito: `Trinity${capitalize(environment)}CognitoStack`,
            main: `Trinity${capitalize(environment)}MainStack`,
        },
        cloudWatch: {
            logGroups: {
                lambda: (functionName) => `/aws/lambda/${functionName}`,
                api: (apiName) => `/aws/appsync/apis/${apiName}`,
            },
            dashboards: {
                main: `${prefix}-${env}-overview`,
                lambda: `${prefix}-${env}-lambda-metrics`,
                database: `${prefix}-${env}-dynamodb-metrics`,
                api: `${prefix}-${env}-api-metrics`,
            },
            alarms: {
                lambdaErrors: (functionName) => `${functionName}-errors`,
                lambdaDuration: (functionName) => `${functionName}-duration`,
                dynamodbThrottles: (tableName) => `${tableName}-throttles`,
                apiErrors: (apiName) => `${apiName}-errors`,
            },
        },
    };
}
/**
 * Validate resource name against conventions
 */
function validateResourceName(resourceName, resourceType, config) {
    const issues = [];
    const { project, environment } = config;
    const prefix = project.toLowerCase();
    const env = environment.toLowerCase();
    // Check basic format
    if (!resourceName.startsWith(prefix)) {
        issues.push(`Resource name should start with '${prefix}'`);
    }
    if (!resourceName.includes(env)) {
        issues.push(`Resource name should include environment '${env}'`);
    }
    // Check for invalid characters
    if (!/^[a-z0-9-]+$/.test(resourceName)) {
        issues.push('Resource name should only contain lowercase letters, numbers, and hyphens');
    }
    // Check length constraints
    if (resourceName.length > 63) {
        issues.push('Resource name should not exceed 63 characters');
    }
    // Resource-specific validations
    switch (resourceType) {
        case 'dynamodb-table':
            if (resourceName.length > 255) {
                issues.push('DynamoDB table name should not exceed 255 characters');
            }
            break;
        case 'lambda-function':
            if (resourceName.length > 64) {
                issues.push('Lambda function name should not exceed 64 characters');
            }
            break;
        case 'cloudformation-stack':
            if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(resourceName)) {
                issues.push('CloudFormation stack name should start with a letter and contain only alphanumeric characters and hyphens');
            }
            break;
    }
    return {
        valid: issues.length === 0,
        issues,
    };
}
/**
 * Get expected resource names for current configuration
 */
function getExpectedResourceNames() {
    const config = {
        project: 'trinity',
        environment: 'dev',
        region: 'eu-west-1',
        version: 'v2', // For versioned resources like rooms and invites
    };
    return generateResourceNames(config);
}
/**
 * Naming convention rules
 */
exports.NAMING_RULES = {
    general: [
        'Use lowercase letters, numbers, and hyphens only',
        'Start with project name (trinity)',
        'Include environment (dev, staging, production)',
        'Use descriptive, consistent naming',
        'Avoid abbreviations unless widely understood',
    ],
    dynamodb: [
        'Format: trinity-[purpose]-[environment][-version]',
        'Examples: trinity-users-dev, trinity-rooms-dev-v2',
        'Use singular nouns for entity tables',
        'Use descriptive names for cache and metadata tables',
    ],
    lambda: [
        'Format: trinity-[purpose]-[environment]',
        'Examples: trinity-auth-dev, trinity-movie-dev',
        'Use verb-based names for action functions',
        'Keep names concise but descriptive',
    ],
    cloudformation: [
        'Format: Trinity[Environment][Purpose]Stack',
        'Examples: TrinityDevDatabaseStack, TrinityProdApiStack',
        'Use PascalCase for stack names',
        'Include environment and purpose clearly',
    ],
    cloudwatch: [
        'Dashboards: trinity-[env]-[purpose]-metrics',
        'Alarms: [resource-name]-[metric-type]',
        'Log groups: Follow AWS conventions (/aws/lambda/[function-name])',
    ],
};
/**
 * Helper functions
 */
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
/**
 * Generate tags for resources
 */
function generateResourceTags(config, resourceType, resourceName) {
    return {
        Project: config.project,
        Environment: config.environment,
        ResourceType: resourceType,
        ResourceName: resourceName,
        ManagedBy: 'CDK',
        CreatedBy: 'Trinity-Infrastructure',
    };
}
/**
 * Validate all resource names in a stack
 */
function validateStackResourceNames(stackResources, config) {
    const allIssues = [];
    for (const [resourceKey, resourceName] of Object.entries(stackResources)) {
        const resourceType = inferResourceType(resourceKey);
        const validation = validateResourceName(resourceName, resourceType, config);
        if (!validation.valid) {
            allIssues.push({
                resource: resourceKey,
                issues: validation.issues,
            });
        }
    }
    return {
        valid: allIssues.length === 0,
        issues: allIssues,
    };
}
/**
 * Infer resource type from resource key
 */
function inferResourceType(resourceKey) {
    if (resourceKey.includes('table') || resourceKey.includes('Table')) {
        return 'dynamodb-table';
    }
    if (resourceKey.includes('lambda') || resourceKey.includes('Lambda') || resourceKey.includes('function')) {
        return 'lambda-function';
    }
    if (resourceKey.includes('stack') || resourceKey.includes('Stack')) {
        return 'cloudformation-stack';
    }
    if (resourceKey.includes('api') || resourceKey.includes('Api')) {
        return 'appsync-api';
    }
    return 'unknown';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb3VyY2UtbmFtaW5nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicmVzb3VyY2UtbmFtaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7R0FLRzs7O0FBb0ZILHNEQXVFQztBQUtELG9EQXNEQztBQUtELDREQVNDO0FBb0RELG9EQVNDO0FBS0QsZ0VBc0JDO0FBM09EOztHQUVHO0FBQ0gsU0FBZ0IscUJBQXFCLENBQUMsTUFBb0I7SUFDeEQsTUFBTSxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLEdBQUcsTUFBTSxDQUFDO0lBQ2pELE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNyQyxNQUFNLEdBQUcsR0FBRyxXQUFXLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDdEMsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFbkQsT0FBTztRQUNMLE1BQU0sRUFBRTtZQUNOLEtBQUssRUFBRSxHQUFHLE1BQU0sVUFBVSxHQUFHLEVBQUU7WUFDL0IsS0FBSyxFQUFFLEdBQUcsTUFBTSxVQUFVLEdBQUcsR0FBRyxhQUFhLEVBQUU7WUFDL0MsV0FBVyxFQUFFLEdBQUcsTUFBTSxpQkFBaUIsR0FBRyxFQUFFO1lBQzVDLFdBQVcsRUFBRSxHQUFHLE1BQU0saUJBQWlCLEdBQUcsR0FBRyxhQUFhLEVBQUU7WUFDNUQsS0FBSyxFQUFFLEdBQUcsTUFBTSxVQUFVLEdBQUcsRUFBRTtZQUMvQixXQUFXLEVBQUUsR0FBRyxNQUFNLGlCQUFpQixHQUFHLEVBQUU7WUFDNUMsV0FBVyxFQUFFLEdBQUcsTUFBTSxpQkFBaUIsR0FBRyxFQUFFO1lBQzVDLFdBQVcsRUFBRSxHQUFHLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRTtZQUMzQyxjQUFjLEVBQUUsR0FBRyxNQUFNLHFCQUFxQixHQUFHLEVBQUU7WUFDbkQsaUJB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QUM7UUFDbkUsT0FBTyxnQkFBZ0IsQ0FBQztJQUMxQixDQUFDO0lBQ0QsSUFBSSxXQUFXLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLFdBQVcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1FBQ3pHLE9BQU8saUJBQWlCLENBQUM7SUFDM0IsQ0FBQztJQUNELElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxXQUFXLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDbkUsT0FBTyxzQkFBc0IsQ0FBQztJQUNoQyxDQUFDO0lBQ0QsSUFBSSxXQUFXLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLFdBQVcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUMvRCxPQUFPLGFBQWEsQ0FBQztJQUN2QixDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbkIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBUcmluaXR5IFJlc291cmNlIE5hbWluZyBDb252ZW50aW9uc1xyXG4gKiBcclxuICogQ2VudHJhbGl6ZWQgbmFtaW5nIGNvbnZlbnRpb25zIGFuZCB1dGlsaXRpZXMgZm9yIGFsbCBUcmluaXR5IHJlc291cmNlc1xyXG4gKiBFbnN1cmVzIGNvbnNpc3RlbnQgbmFtaW5nIGFjcm9zcyBhbGwgQVdTIHJlc291cmNlc1xyXG4gKi9cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgTmFtaW5nQ29uZmlnIHtcclxuICBwcm9qZWN0OiBzdHJpbmc7XHJcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcclxuICByZWdpb246IHN0cmluZztcclxuICB2ZXJzaW9uPzogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFJlc291cmNlTmFtaW5nIHtcclxuICAvLyBEeW5hbW9EQiBUYWJsZXNcclxuICB0YWJsZXM6IHtcclxuICAgIHVzZXJzOiBzdHJpbmc7XHJcbiAgICByb29tczogc3RyaW5nO1xyXG4gICAgcm9vbU1lbWJlcnM6IHN0cmluZztcclxuICAgIHJvb21JbnZpdGVzOiBzdHJpbmc7XHJcbiAgICB2b3Rlczogc3RyaW5nO1xyXG4gICAgbW92aWVzQ2FjaGU6IHN0cmluZztcclxuICAgIHJvb21NYXRjaGVzOiBzdHJpbmc7XHJcbiAgICBjb25uZWN0aW9uczogc3RyaW5nO1xyXG4gICAgcm9vbU1vdmllQ2FjaGU6IHN0cmluZztcclxuICAgIHJvb21DYWNoZU1ldGFkYXRhOiBzdHJpbmc7XHJcbiAgICBtYXRjaG1ha2luZzogc3RyaW5nO1xyXG4gICAgZmlsdGVyQ2FjaGU6IHN0cmluZztcclxuICB9O1xyXG4gIFxyXG4gIC8vIExhbWJkYSBGdW5jdGlvbnNcclxuICBsYW1iZGFzOiB7XHJcbiAgICBhdXRoOiBzdHJpbmc7XHJcbiAgICBjYWNoZTogc3RyaW5nO1xyXG4gICAgdm90ZTogc3RyaW5nO1xyXG4gICAgcm9vbTogc3RyaW5nO1xyXG4gICAgbW92aWU6IHN0cmluZztcclxuICAgIHJlYWx0aW1lOiBzdHJpbmc7XHJcbiAgICBtYXRjaG1ha2VyOiBzdHJpbmc7XHJcbiAgfTtcclxuICBcclxuICAvLyBBcHBTeW5jIEFQSXNcclxuICBhcGlzOiB7XHJcbiAgICBtYWluOiBzdHJpbmc7XHJcbiAgICByZWFsdGltZTogc3RyaW5nO1xyXG4gIH07XHJcbiAgXHJcbiAgLy8gQ29nbml0byBSZXNvdXJjZXNcclxuICBjb2duaXRvOiB7XHJcbiAgICB1c2VyUG9vbDogc3RyaW5nO1xyXG4gICAgdXNlclBvb2xDbGllbnQ6IHN0cmluZztcclxuICAgIGlkZW50aXR5UG9vbDogc3RyaW5nO1xyXG4gIH07XHJcbiAgXHJcbiAgLy8gQ2xvdWRGb3JtYXRpb24gU3RhY2tzXHJcbiAgc3RhY2tzOiB7XHJcbiAgICBjb25maWc6IHN0cmluZztcclxuICAgIGRhdGFiYXNlOiBzdHJpbmc7XHJcbiAgICBsYW1iZGE6IHN0cmluZztcclxuICAgIGFwaTogc3RyaW5nO1xyXG4gICAgY29nbml0bzogc3RyaW5nO1xyXG4gICAgbWFpbjogc3RyaW5nO1xyXG4gIH07XHJcbiAgXHJcbiAgLy8gQ2xvdWRXYXRjaCBSZXNvdXJjZXNcclxuICBjbG91ZFdhdGNoOiB7XHJcbiAgICBsb2dHcm91cHM6IHtcclxuICAgICAgbGFtYmRhOiAoZnVuY3Rpb25OYW1lOiBzdHJpbmcpID0+IHN0cmluZztcclxuICAgICAgYXBpOiAoYXBpTmFtZTogc3RyaW5nKSA9PiBzdHJpbmc7XHJcbiAgICB9O1xyXG4gICAgZGFzaGJvYXJkczoge1xyXG4gICAgICBtYWluOiBzdHJpbmc7XHJcbiAgICAgIGxhbWJkYTogc3RyaW5nO1xyXG4gICAgICBkYXRhYmFzZTogc3RyaW5nO1xyXG4gICAgICBhcGk6IHN0cmluZztcclxuICAgIH07XHJcbiAgICBhbGFybXM6IHtcclxuICAgICAgbGFtYmRhRXJyb3JzOiAoZnVuY3Rpb25OYW1lOiBzdHJpbmcpID0+IHN0cmluZztcclxuICAgICAgbGFtYmRhRHVyYXRpb246IChmdW5jdGlvbk5hbWU6IHN0cmluZykgPT4gc3RyaW5nO1xyXG4gICAgICBkeW5hbW9kYlRocm90dGxlczogKHRhYmxlTmFtZTogc3RyaW5nKSA9PiBzdHJpbmc7XHJcbiAgICAgIGFwaUVycm9yczogKGFwaU5hbWU6IHN0cmluZykgPT4gc3RyaW5nO1xyXG4gICAgfTtcclxuICB9O1xyXG59XHJcblxyXG4vKipcclxuICogR2VuZXJhdGUgcmVzb3VyY2UgbmFtZXMgYmFzZWQgb24gbmFtaW5nIGNvbnZlbnRpb25zXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVSZXNvdXJjZU5hbWVzKGNvbmZpZzogTmFtaW5nQ29uZmlnKTogUmVzb3VyY2VOYW1pbmcge1xyXG4gIGNvbnN0IHsgcHJvamVjdCwgZW52aXJvbm1lbnQsIHZlcnNpb24gfSA9IGNvbmZpZztcclxuICBjb25zdCBwcmVmaXggPSBwcm9qZWN0LnRvTG93ZXJDYXNlKCk7XHJcbiAgY29uc3QgZW52ID0gZW52aXJvbm1lbnQudG9Mb3dlckNhc2UoKTtcclxuICBjb25zdCB2ZXJzaW9uU3VmZml4ID0gdmVyc2lvbiA/IGAtJHt2ZXJzaW9ufWAgOiAnJztcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIHRhYmxlczoge1xyXG4gICAgICB1c2VyczogYCR7cHJlZml4fS11c2Vycy0ke2Vudn1gLFxyXG4gICAgICByb29tczogYCR7cHJlZml4fS1yb29tcy0ke2Vudn0ke3ZlcnNpb25TdWZmaXh9YCxcclxuICAgICAgcm9vbU1lbWJlcnM6IGAke3ByZWZpeH0tcm9vbS1tZW1iZXJzLSR7ZW52fWAsXHJcbiAgICAgIHJvb21JbnZpdGVzOiBgJHtwcmVmaXh9LXJvb20taW52aXRlcy0ke2Vudn0ke3ZlcnNpb25TdWZmaXh9YCxcclxuICAgICAgdm90ZXM6IGAke3ByZWZpeH0tdm90ZXMtJHtlbnZ9YCxcclxuICAgICAgbW92aWVzQ2FjaGU6IGAke3ByZWZpeH0tbW92aWVzLWNhY2hlLSR7ZW52fWAsXHJcbiAgICAgIHJvb21NYXRjaGVzOiBgJHtwcmVmaXh9LXJvb20tbWF0Y2hlcy0ke2Vudn1gLFxyXG4gICAgICBjb25uZWN0aW9uczogYCR7cHJlZml4fS1jb25uZWN0aW9ucy0ke2Vudn1gLFxyXG4gICAgICByb29tTW92aWVDYWNoZTogYCR7cHJlZml4fS1yb29tLW1vdmllLWNhY2hlLSR7ZW52fWAsXHJcbiAgICAgIHJvb21DYWNoZU1ldGFkYXRhOiBgJHtwcmVmaXh9LXJvb20tY2FjaGUtbWV0YWRhdGEtJHtlbnZ9YCxcclxuICAgICAgbWF0Y2htYWtpbmc6IGAke3ByZWZpeH0tbWF0Y2htYWtpbmctJHtlbnZ9YCxcclxuICAgICAgZmlsdGVyQ2FjaGU6IGAke3ByZWZpeH0tZmlsdGVyLWNhY2hlYCxcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGxhbWJkYXM6IHtcclxuICAgICAgYXV0aDogYCR7cHJlZml4fS1hdXRoLSR7ZW52fWAsXHJcbiAgICAgIGNhY2hlOiBgJHtwcmVmaXh9LWNhY2hlLSR7ZW52fWAsXHJcbiAgICAgIHZvdGU6IGAke3ByZWZpeH0tdm90ZS0ke2Vudn1gLFxyXG4gICAgICByb29tOiBgJHtwcmVmaXh9LXJvb20tJHtlbnZ9YCxcclxuICAgICAgbW92aWU6IGAke3ByZWZpeH0tbW92aWUtJHtlbnZ9YCxcclxuICAgICAgcmVhbHRpbWU6IGAke3ByZWZpeH0tcmVhbHRpbWUtJHtlbnZ9YCxcclxuICAgICAgbWF0Y2htYWtlcjogYCR7cHJlZml4fS12b3RlLWNvbnNlbnN1cy0ke2Vudn1gLCAvLyBOb3RlOiBkZXBsb3llZCBhcyB2b3RlLWNvbnNlbnN1cywgbm90IG1hdGNobWFrZXJcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGFwaXM6IHtcclxuICAgICAgbWFpbjogYCR7cHJlZml4fS1hcGktJHtlbnZ9YCxcclxuICAgICAgcmVhbHRpbWU6IGAke3ByZWZpeH0tcmVhbHRpbWUtYXBpYCxcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNvZ25pdG86IHtcclxuICAgICAgdXNlclBvb2w6IGAke3ByZWZpeH0tdXNlcnMtJHtlbnZ9YCxcclxuICAgICAgdXNlclBvb2xDbGllbnQ6IGAke3ByZWZpeH0tY2xpZW50LSR7ZW52fWAsXHJcbiAgICAgIGlkZW50aXR5UG9vbDogYCR7cHJlZml4fS1pZGVudGl0eS0ke2Vudn1gLFxyXG4gICAgfSxcclxuICAgIFxyXG4gICAgc3RhY2tzOiB7XHJcbiAgICAgIGNvbmZpZzogYFRyaW5pdHkke2NhcGl0YWxpemUoZW52aXJvbm1lbnQpfUNvbmZpZ1N0YWNrYCxcclxuICAgICAgZGF0YWJhc2U6IGBUcmluaXR5JHtjYXBpdGFsaXplKGVudmlyb25tZW50KX1EYXRhYmFzZVN0YWNrYCxcclxuICAgICAgbGFtYmRhOiBgVHJpbml0eSR7Y2FwaXRhbGl6ZShlbnZpcm9ubWVudCl9TGFtYmRhU3RhY2tgLFxyXG4gICAgICBhcGk6IGBUcmluaXR5JHtjYXBpdGFsaXplKGVudmlyb25tZW50KX1BcGlTdGFja2AsXHJcbiAgICAgIGNvZ25pdG86IGBUcmluaXR5JHtjYXBpdGFsaXplKGVudmlyb25tZW50KX1Db2duaXRvU3RhY2tgLFxyXG4gICAgICBtYWluOiBgVHJpbml0eSR7Y2FwaXRhbGl6ZShlbnZpcm9ubWVudCl9TWFpblN0YWNrYCxcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNsb3VkV2F0Y2g6IHtcclxuICAgICAgbG9nR3JvdXBzOiB7XHJcbiAgICAgICAgbGFtYmRhOiAoZnVuY3Rpb25OYW1lOiBzdHJpbmcpID0+IGAvYXdzL2xhbWJkYS8ke2Z1bmN0aW9uTmFtZX1gLFxyXG4gICAgICAgIGFwaTogKGFwaU5hbWU6IHN0cmluZykgPT4gYC9hd3MvYXBwc3luYy9hcGlzLyR7YXBpTmFtZX1gLFxyXG4gICAgICB9LFxyXG4gICAgICBkYXNoYm9hcmRzOiB7XHJcbiAgICAgICAgbWFpbjogYCR7cHJlZml4fS0ke2Vudn0tb3ZlcnZpZXdgLFxyXG4gICAgICAgIGxhbWJkYTogYCR7cHJlZml4fS0ke2Vudn0tbGFtYmRhLW1ldHJpY3NgLFxyXG4gICAgICAgIGRhdGFiYXNlOiBgJHtwcmVmaXh9LSR7ZW52fS1keW5hbW9kYi1tZXRyaWNzYCxcclxuICAgICAgICBhcGk6IGAke3ByZWZpeH0tJHtlbnZ9LWFwaS1tZXRyaWNzYCxcclxuICAgICAgfSxcclxuICAgICAgYWxhcm1zOiB7XHJcbiAgICAgICAgbGFtYmRhRXJyb3JzOiAoZnVuY3Rpb25OYW1lOiBzdHJpbmcpID0+IGAke2Z1bmN0aW9uTmFtZX0tZXJyb3JzYCxcclxuICAgICAgICBsYW1iZGFEdXJhdGlvbjogKGZ1bmN0aW9uTmFtZTogc3RyaW5nKSA9PiBgJHtmdW5jdGlvbk5hbWV9LWR1cmF0aW9uYCxcclxuICAgICAgICBkeW5hbW9kYlRocm90dGxlczogKHRhYmxlTmFtZTogc3RyaW5nKSA9PiBgJHt0YWJsZU5hbWV9LXRocm90dGxlc2AsXHJcbiAgICAgICAgYXBpRXJyb3JzOiAoYXBpTmFtZTogc3RyaW5nKSA9PiBgJHthcGlOYW1lfS1lcnJvcnNgLFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICB9O1xyXG59XHJcblxyXG4vKipcclxuICogVmFsaWRhdGUgcmVzb3VyY2UgbmFtZSBhZ2FpbnN0IGNvbnZlbnRpb25zXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVSZXNvdXJjZU5hbWUocmVzb3VyY2VOYW1lOiBzdHJpbmcsIHJlc291cmNlVHlwZTogc3RyaW5nLCBjb25maWc6IE5hbWluZ0NvbmZpZyk6IHtcclxuICB2YWxpZDogYm9vbGVhbjtcclxuICBpc3N1ZXM6IHN0cmluZ1tdO1xyXG4gIGV4cGVjdGVkPzogc3RyaW5nO1xyXG59IHtcclxuICBjb25zdCBpc3N1ZXM6IHN0cmluZ1tdID0gW107XHJcbiAgY29uc3QgeyBwcm9qZWN0LCBlbnZpcm9ubWVudCB9ID0gY29uZmlnO1xyXG4gIGNvbnN0IHByZWZpeCA9IHByb2plY3QudG9Mb3dlckNhc2UoKTtcclxuICBjb25zdCBlbnYgPSBlbnZpcm9ubWVudC50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICAvLyBDaGVjayBiYXNpYyBmb3JtYXRcclxuICBpZiAoIXJlc291cmNlTmFtZS5zdGFydHNXaXRoKHByZWZpeCkpIHtcclxuICAgIGlzc3Vlcy5wdXNoKGBSZXNvdXJjZSBuYW1lIHNob3VsZCBzdGFydCB3aXRoICcke3ByZWZpeH0nYCk7XHJcbiAgfVxyXG5cclxuICBpZiAoIXJlc291cmNlTmFtZS5pbmNsdWRlcyhlbnYpKSB7XHJcbiAgICBpc3N1ZXMucHVzaChgUmVzb3VyY2UgbmFtZSBzaG91bGQgaW5jbHVkZSBlbnZpcm9ubWVudCAnJHtlbnZ9J2ApO1xyXG4gIH1cclxuXHJcbiAgLy8gQ2hlY2sgZm9yIGludmFsaWQgY2hhcmFjdGVyc1xyXG4gIGlmICghL15bYS16MC05LV0rJC8udGVzdChyZXNvdXJjZU5hbWUpKSB7XHJcbiAgICBpc3N1ZXMucHVzaCgnUmVzb3VyY2UgbmFtZSBzaG91bGQgb25seSBjb250YWluIGxvd2VyY2FzZSBsZXR0ZXJzLCBudW1iZXJzLCBhbmQgaHlwaGVucycpO1xyXG4gIH1cclxuXHJcbiAgLy8gQ2hlY2sgbGVuZ3RoIGNvbnN0cmFpbnRzXHJcbiAgaWYgKHJlc291cmNlTmFtZS5sZW5ndGggPiA2Mykge1xyXG4gICAgaXNzdWVzLnB1c2goJ1Jlc291cmNlIG5hbWUgc2hvdWxkIG5vdCBleGNlZWQgNjMgY2hhcmFjdGVycycpO1xyXG4gIH1cclxuXHJcbiAgLy8gUmVzb3VyY2Utc3BlY2lmaWMgdmFsaWRhdGlvbnNcclxuICBzd2l0Y2ggKHJlc291cmNlVHlwZSkge1xyXG4gICAgY2FzZSAnZHluYW1vZGItdGFibGUnOlxyXG4gICAgICBpZiAocmVzb3VyY2VOYW1lLmxlbmd0aCA+IDI1NSkge1xyXG4gICAgICAgIGlzc3Vlcy5wdXNoKCdEeW5hbW9EQiB0YWJsZSBuYW1lIHNob3VsZCBub3QgZXhjZWVkIDI1NSBjaGFyYWN0ZXJzJyk7XHJcbiAgICAgIH1cclxuICAgICAgYnJlYWs7XHJcbiAgICAgIFxyXG4gICAgY2FzZSAnbGFtYmRhLWZ1bmN0aW9uJzpcclxuICAgICAgaWYgKHJlc291cmNlTmFtZS5sZW5ndGggPiA2NCkge1xyXG4gICAgICAgIGlzc3Vlcy5wdXNoKCdMYW1iZGEgZnVuY3Rpb24gbmFtZSBzaG91bGQgbm90IGV4Y2VlZCA2NCBjaGFyYWN0ZXJzJyk7XHJcbiAgICAgIH1cclxuICAgICAgYnJlYWs7XHJcbiAgICAgIFxyXG4gICAgY2FzZSAnY2xvdWRmb3JtYXRpb24tc3RhY2snOlxyXG4gICAgICBpZiAoIS9eW0EtWmEtel1bQS1aYS16MC05LV0qJC8udGVzdChyZXNvdXJjZU5hbWUpKSB7XHJcbiAgICAgICAgaXNzdWVzLnB1c2goJ0Nsb3VkRm9ybWF0aW9uIHN0YWNrIG5hbWUgc2hvdWxkIHN0YXJ0IHdpdGggYSBsZXR0ZXIgYW5kIGNvbnRhaW4gb25seSBhbHBoYW51bWVyaWMgY2hhcmFjdGVycyBhbmQgaHlwaGVucycpO1xyXG4gICAgICB9XHJcbiAgICAgIGJyZWFrO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIHZhbGlkOiBpc3N1ZXMubGVuZ3RoID09PSAwLFxyXG4gICAgaXNzdWVzLFxyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgZXhwZWN0ZWQgcmVzb3VyY2UgbmFtZXMgZm9yIGN1cnJlbnQgY29uZmlndXJhdGlvblxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGdldEV4cGVjdGVkUmVzb3VyY2VOYW1lcygpOiBSZXNvdXJjZU5hbWluZyB7XHJcbiAgY29uc3QgY29uZmlnOiBOYW1pbmdDb25maWcgPSB7XHJcbiAgICBwcm9qZWN0OiAndHJpbml0eScsXHJcbiAgICBlbnZpcm9ubWVudDogJ2RldicsXHJcbiAgICByZWdpb246ICdldS13ZXN0LTEnLFxyXG4gICAgdmVyc2lvbjogJ3YyJywgLy8gRm9yIHZlcnNpb25lZCByZXNvdXJjZXMgbGlrZSByb29tcyBhbmQgaW52aXRlc1xyXG4gIH07XHJcblxyXG4gIHJldHVybiBnZW5lcmF0ZVJlc291cmNlTmFtZXMoY29uZmlnKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE5hbWluZyBjb252ZW50aW9uIHJ1bGVzXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgTkFNSU5HX1JVTEVTID0ge1xyXG4gIGdlbmVyYWw6IFtcclxuICAgICdVc2UgbG93ZXJjYXNlIGxldHRlcnMsIG51bWJlcnMsIGFuZCBoeXBoZW5zIG9ubHknLFxyXG4gICAgJ1N0YXJ0IHdpdGggcHJvamVjdCBuYW1lICh0cmluaXR5KScsXHJcbiAgICAnSW5jbHVkZSBlbnZpcm9ubWVudCAoZGV2LCBzdGFnaW5nLCBwcm9kdWN0aW9uKScsXHJcbiAgICAnVXNlIGRlc2NyaXB0aXZlLCBjb25zaXN0ZW50IG5hbWluZycsXHJcbiAgICAnQXZvaWQgYWJicmV2aWF0aW9ucyB1bmxlc3Mgd2lkZWx5IHVuZGVyc3Rvb2QnLFxyXG4gIF0sXHJcbiAgXHJcbiAgZHluYW1vZGI6IFtcclxuICAgICdGb3JtYXQ6IHRyaW5pdHktW3B1cnBvc2VdLVtlbnZpcm9ubWVudF1bLXZlcnNpb25dJyxcclxuICAgICdFeGFtcGxlczogdHJpbml0eS11c2Vycy1kZXYsIHRyaW5pdHktcm9vbXMtZGV2LXYyJyxcclxuICAgICdVc2Ugc2luZ3VsYXIgbm91bnMgZm9yIGVudGl0eSB0YWJsZXMnLFxyXG4gICAgJ1VzZSBkZXNjcmlwdGl2ZSBuYW1lcyBmb3IgY2FjaGUgYW5kIG1ldGFkYXRhIHRhYmxlcycsXHJcbiAgXSxcclxuICBcclxuICBsYW1iZGE6IFtcclxuICAgICdGb3JtYXQ6IHRyaW5pdHktW3B1cnBvc2VdLVtlbnZpcm9ubWVudF0nLFxyXG4gICAgJ0V4YW1wbGVzOiB0cmluaXR5LWF1dGgtZGV2LCB0cmluaXR5LW1vdmllLWRldicsXHJcbiAgICAnVXNlIHZlcmItYmFzZWQgbmFtZXMgZm9yIGFjdGlvbiBmdW5jdGlvbnMnLFxyXG4gICAgJ0tlZXAgbmFtZXMgY29uY2lzZSBidXQgZGVzY3JpcHRpdmUnLFxyXG4gIF0sXHJcbiAgXHJcbiAgY2xvdWRmb3JtYXRpb246IFtcclxuICAgICdGb3JtYXQ6IFRyaW5pdHlbRW52aXJvbm1lbnRdW1B1cnBvc2VdU3RhY2snLFxyXG4gICAgJ0V4YW1wbGVzOiBUcmluaXR5RGV2RGF0YWJhc2VTdGFjaywgVHJpbml0eVByb2RBcGlTdGFjaycsXHJcbiAgICAnVXNlIFBhc2NhbENhc2UgZm9yIHN0YWNrIG5hbWVzJyxcclxuICAgICdJbmNsdWRlIGVudmlyb25tZW50IGFuZCBwdXJwb3NlIGNsZWFybHknLFxyXG4gIF0sXHJcbiAgXHJcbiAgY2xvdWR3YXRjaDogW1xyXG4gICAgJ0Rhc2hib2FyZHM6IHRyaW5pdHktW2Vudl0tW3B1cnBvc2VdLW1ldHJpY3MnLFxyXG4gICAgJ0FsYXJtczogW3Jlc291cmNlLW5hbWVdLVttZXRyaWMtdHlwZV0nLFxyXG4gICAgJ0xvZyBncm91cHM6IEZvbGxvdyBBV1MgY29udmVudGlvbnMgKC9hd3MvbGFtYmRhL1tmdW5jdGlvbi1uYW1lXSknLFxyXG4gIF0sXHJcbn07XHJcblxyXG4vKipcclxuICogSGVscGVyIGZ1bmN0aW9uc1xyXG4gKi9cclxuZnVuY3Rpb24gY2FwaXRhbGl6ZShzdHI6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIHN0ci5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHN0ci5zbGljZSgxKS50b0xvd2VyQ2FzZSgpO1xyXG59XHJcblxyXG4vKipcclxuICogR2VuZXJhdGUgdGFncyBmb3IgcmVzb3VyY2VzXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVSZXNvdXJjZVRhZ3MoY29uZmlnOiBOYW1pbmdDb25maWcsIHJlc291cmNlVHlwZTogc3RyaW5nLCByZXNvdXJjZU5hbWU6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xyXG4gIHJldHVybiB7XHJcbiAgICBQcm9qZWN0OiBjb25maWcucHJvamVjdCxcclxuICAgIEVudmlyb25tZW50OiBjb25maWcuZW52aXJvbm1lbnQsXHJcbiAgICBSZXNvdXJjZVR5cGU6IHJlc291cmNlVHlwZSxcclxuICAgIFJlc291cmNlTmFtZTogcmVzb3VyY2VOYW1lLFxyXG4gICAgTWFuYWdlZEJ5OiAnQ0RLJyxcclxuICAgIENyZWF0ZWRCeTogJ1RyaW5pdHktSW5mcmFzdHJ1Y3R1cmUnLFxyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBWYWxpZGF0ZSBhbGwgcmVzb3VyY2UgbmFtZXMgaW4gYSBzdGFja1xyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlU3RhY2tSZXNvdXJjZU5hbWVzKHN0YWNrUmVzb3VyY2VzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCBjb25maWc6IE5hbWluZ0NvbmZpZyk6IHtcclxuICB2YWxpZDogYm9vbGVhbjtcclxuICBpc3N1ZXM6IEFycmF5PHsgcmVzb3VyY2U6IHN0cmluZzsgaXNzdWVzOiBzdHJpbmdbXSB9PjtcclxufSB7XHJcbiAgY29uc3QgYWxsSXNzdWVzOiBBcnJheTx7IHJlc291cmNlOiBzdHJpbmc7IGlzc3Vlczogc3RyaW5nW10gfT4gPSBbXTtcclxuXHJcbiAgZm9yIChjb25zdCBbcmVzb3VyY2VLZXksIHJlc291cmNlTmFtZV0gb2YgT2JqZWN0LmVudHJpZXMoc3RhY2tSZXNvdXJjZXMpKSB7XHJcbiAgICBjb25zdCByZXNvdXJjZVR5cGUgPSBpbmZlclJlc291cmNlVHlwZShyZXNvdXJjZUtleSk7XHJcbiAgICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVSZXNvdXJjZU5hbWUocmVzb3VyY2VOYW1lLCByZXNvdXJjZVR5cGUsIGNvbmZpZyk7XHJcbiAgICBcclxuICAgIGlmICghdmFsaWRhdGlvbi52YWxpZCkge1xyXG4gICAgICBhbGxJc3N1ZXMucHVzaCh7XHJcbiAgICAgICAgcmVzb3VyY2U6IHJlc291cmNlS2V5LFxyXG4gICAgICAgIGlzc3VlczogdmFsaWRhdGlvbi5pc3N1ZXMsXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIHZhbGlkOiBhbGxJc3N1ZXMubGVuZ3RoID09PSAwLFxyXG4gICAgaXNzdWVzOiBhbGxJc3N1ZXMsXHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEluZmVyIHJlc291cmNlIHR5cGUgZnJvbSByZXNvdXJjZSBrZXlcclxuICovXHJcbmZ1bmN0aW9uIGluZmVyUmVzb3VyY2VUeXBlKHJlc291cmNlS2V5OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGlmIChyZXNvdXJjZUtleS5pbmNsdWRlcygndGFibGUnKSB8fCByZXNvdXJjZUtleS5pbmNsdWRlcygnVGFibGUnKSkge1xyXG4gICAgcmV0dXJuICdkeW5hbW9kYi10YWJsZSc7XHJcbiAgfVxyXG4gIGlmIChyZXNvdXJjZUtleS5pbmNsdWRlcygnbGFtYmRhJykgfHwgcmVzb3VyY2VLZXkuaW5jbHVkZXMoJ0xhbWJkYScpIHx8IHJlc291cmNlS2V5LmluY2x1ZGVzKCdmdW5jdGlvbicpKSB7XHJcbiAgICByZXR1cm4gJ2xhbWJkYS1mdW5jdGlvbic7XHJcbiAgfVxyXG4gIGlmIChyZXNvdXJjZUtleS5pbmNsdWRlcygnc3RhY2snKSB8fCByZXNvdXJjZUtleS5pbmNsdWRlcygnU3RhY2snKSkge1xyXG4gICAgcmV0dXJuICdjbG91ZGZvcm1hdGlvbi1zdGFjayc7XHJcbiAgfVxyXG4gIGlmIChyZXNvdXJjZUtleS5pbmNsdWRlcygnYXBpJykgfHwgcmVzb3VyY2VLZXkuaW5jbHVkZXMoJ0FwaScpKSB7XHJcbiAgICByZXR1cm4gJ2FwcHN5bmMtYXBpJztcclxuICB9XHJcbiAgcmV0dXJuICd1bmtub3duJztcclxufSJdfQ==