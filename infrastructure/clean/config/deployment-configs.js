"use strict";
/**
 * Trinity Deployment Configurations
 *
 * Environment-specific deployment configurations for Trinity infrastructure
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMPORT_CONFIG = exports.PRODUCTION_CONFIG = exports.STAGING_CONFIG = exports.DEV_CONFIG = void 0;
exports.getDeploymentConfig = getDeploymentConfig;
exports.validateDeploymentConfig = validateDeploymentConfig;
/**
 * Development Environment Configuration
 */
exports.DEV_CONFIG = {
    environment: 'dev',
    region: 'eu-west-1',
    stacks: [
        'TrinityConfigStack',
        'TrinityDatabaseStack',
        'TrinityLambdaStack',
        'TrinityApiStack',
        'TrinityMainStack'
    ],
    validation: {
        preDeployment: true,
        postDeployment: true,
        importCompatibility: true,
    },
    deployment: {
        requireApproval: false,
        hotswapEnabled: true,
        rollbackOnFailure: true,
        timeoutMinutes: 30,
    },
    monitoring: {
        enableCloudWatch: true,
        enableXRay: false,
        logRetentionDays: 7,
    },
    security: {
        enableEncryption: false,
        enablePointInTimeRecovery: false,
        enableVpcEndpoints: false,
    },
};
/**
 * Staging Environment Configuration
 */
exports.STAGING_CONFIG = {
    environment: 'staging',
    region: 'eu-west-1',
    stacks: [
        'TrinityConfigStack',
        'TrinityDatabaseStack',
        'TrinityLambdaStack',
        'TrinityApiStack',
        'TrinityMainStack'
    ],
    validation: {
        preDeployment: true,
        postDeployment: true,
        importCompatibility: true,
    },
    deployment: {
        requireApproval: true,
        hotswapEnabled: false,
        rollbackOnFailure: true,
        timeoutMinutes: 45,
    },
    monitoring: {
        enableCloudWatch: true,
        enableXRay: true,
        logRetentionDays: 30,
    },
    security: {
        enableEncryption: true,
        enablePointInTimeRecovery: true,
        enableVpcEndpoints: false,
    },
};
/**
 * Production Environment Configuration
 */
exports.PRODUCTION_CONFIG = {
    environment: 'production',
    region: 'eu-west-1',
    stacks: [
        'TrinityConfigStack',
        'TrinityDatabaseStack',
        'TrinityLambdaStack',
        'TrinityApiStack',
        'TrinityMainStack'
    ],
    validation: {
        preDeployment: true,
        postDeployment: true,
        importCompatibility: true,
    },
    deployment: {
        requireApproval: true,
        hotswapEnabled: false,
        rollbackOnFailure: true,
        timeoutMinutes: 60,
    },
    monitoring: {
        enableCloudWatch: true,
        enableXRay: true,
        logRetentionDays: 90,
    },
    security: {
        enableEncryption: true,
        enablePointInTimeRecovery: true,
        enableVpcEndpoints: true,
    },
};
/**
 * Get deployment configuration for environment
 */
function getDeploymentConfig(environment) {
    switch (environment.toLowerCase()) {
        case 'dev':
        case 'development':
            return exports.DEV_CONFIG;
        case 'staging':
        case 'stage':
            return exports.STAGING_CONFIG;
        case 'prod':
        case 'production':
            return exports.PRODUCTION_CONFIG;
        default:
            throw new Error(`Unknown environment: ${environment}`);
    }
}
/**
 * Validate deployment configuration
 */
function validateDeploymentConfig(config) {
    const issues = [];
    // Validate required fields
    if (!config.environment) {
        issues.push('Environment is required');
    }
    if (!config.region) {
        issues.push('Region is required');
    }
    if (!config.stacks || config.stacks.length === 0) {
        issues.push('At least one stack must be specified');
    }
    // Validate production constraints
    if (config.environment === 'production') {
        if (!config.deployment.requireApproval) {
            issues.push('Production deployments must require approval');
        }
        if (config.deployment.hotswapEnabled) {
            issues.push('Hotswap should not be enabled in production');
        }
        if (!config.security.enableEncryption) {
            issues.push('Encryption must be enabled in production');
        }
        if (!config.security.enablePointInTimeRecovery) {
            issues.push('Point-in-time recovery must be enabled in production');
        }
        if (config.monitoring.logRetentionDays < 30) {
            issues.push('Production log retention should be at least 30 days');
        }
    }
    // Validate timeout
    if (config.deployment.timeoutMinutes < 10 || config.deployment.timeoutMinutes > 120) {
        issues.push('Deployment timeout must be between 10 and 120 minutes');
    }
    return issues;
}
exports.IMPORT_CONFIG = {
    databaseStack: {
        enabled: true,
        tables: [
            'trinity-users-dev',
            'trinity-rooms-dev-v2',
            'trinity-room-members-dev',
            'trinity-votes-dev',
            'trinity-movies-cache-dev',
            'trinity-room-matches-dev',
            'trinity-room-invites-dev-v2',
            'trinity-connections-dev',
            'trinity-room-movie-cache-dev',
            'trinity-room-cache-metadata-dev',
            'trinity-matchmaking-dev',
            'trinity-filter-cache'
        ],
        validateSchema: true,
    },
    apiStack: {
        enabled: true,
        apis: [
            'trinity-api-dev',
            'trinity-realtime-api'
        ],
        validateEndpoints: true,
    },
    cognitoStack: {
        enabled: true,
        userPools: [
            'trinity-users-dev'
        ],
        validateConfiguration: true,
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVwbG95bWVudC1jb25maWdzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGVwbG95bWVudC1jb25maWdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7OztHQUlHOzs7QUE0SUgsa0RBY0M7QUFLRCw0REE2Q0M7QUEvS0Q7O0dBRUc7QUFDVSxRQUFBLFVBQVUsR0FBZ0M7SUFDckQsV0FBVyxFQUFFLEtBQUs7SUFDbEIsTUFBTSxFQUFFLFdBQVc7SUFDbkIsTUFBTSxFQUFFO1FBQ04sb0JBQW9CO1FBQ3BCLHNCQUFzQjtRQUN0QixvQkFBb0I7UUFDcEIsaUJBQWlCO1FBQ2pCLGtCQUFrQjtLQUNuQjtJQUNELFVBQVUsRUFBRTtRQUNWLGFBQWEsRUFBRSxJQUFJO1FBQ25CLGNBQWMsRUFBRSxJQUFJO1FBQ3BCLG1CQUFtQixFQUFFLElBQUk7S0FDMUI7SUFDRCxVQUFVLEVBQUU7UUFDVixlQUFlLEVBQUUsS0FBSztRQUN0QixjQUFjLEVBQUUsSUFBSTtRQUNwQixpQkFBaUIsRUFBRSxJQUFJO1FBQ3ZCLGNBQWMsRUFBRSxFQUFFO0tBQ25CO0lBQ0QsVUFBVSxFQUFFO1FBQ1YsZ0JBQWdCLEVBQUUsSUFBSTtRQUN0QixVQUFVLEVBQUUsS0FBSztRQUNqQixnQkFBZ0IsRUFBRSxDQUFDO0tBQ3BCO0lBQ0QsUUFBUSxFQUFFO1FBQ1IsZ0JBQWdCLEVBQUUsS0FBSztRQUN2Qix5QkFBeUIsRUFBRSxLQUFLO1FBQ2hDLGtCQUFrQixFQUFFLEtBQUs7S0FDMUI7Q0FDRixDQUFDO0FBRUY7O0dBRUc7QUFDVSxRQUFBLGNBQWMsR0FBZ0M7SUFDekQsV0FBVyxFQUFFLFNBQVM7SUFDdEIsTUFBTSxFQUFFLFdBQVc7SUFDbkIsTUFBTSxFQUFFO1FBQ04sb0JBQW9CO1FBQ3BCLHNCQUFzQjtRQUN0QixvQkFBb0I7UUFDcEIsaUJBQWlCO1FBQ2pCLGtCQUFrQjtLQUNuQjtJQUNELFVBQVUsRUFBRTtRQUNWLGFBQWEsRUFBRSxJQUFJO1FBQ25CLGNB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LElBQUksRUFBRTtZQUNKLGlCQUFpQjtZQUNqQixzQkFBc0I7U0FDdkI7UUFDRCxpQkFBaUIsRUFBRSxJQUFJO0tBQ3hCO0lBQ0QsWUFBWSxFQUFFO1FBQ1osT0FBTyxFQUFFLElBQUk7UUFDYixTQUFTLEVBQUU7WUFDVCxtQkFBbUI7U0FDcEI7UUFDRCxxQkFBcUIsRUFBRSxJQUFJO0tBQzVCO0NBQ0YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBUcmluaXR5IERlcGxveW1lbnQgQ29uZmlndXJhdGlvbnNcclxuICogXHJcbiAqIEVudmlyb25tZW50LXNwZWNpZmljIGRlcGxveW1lbnQgY29uZmlndXJhdGlvbnMgZm9yIFRyaW5pdHkgaW5mcmFzdHJ1Y3R1cmVcclxuICovXHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIERlcGxveW1lbnRFbnZpcm9ubWVudENvbmZpZyB7XHJcbiAgZW52aXJvbm1lbnQ6ICdkZXYnIHwgJ3N0YWdpbmcnIHwgJ3Byb2R1Y3Rpb24nO1xyXG4gIHJlZ2lvbjogc3RyaW5nO1xyXG4gIHN0YWNrczogc3RyaW5nW107XHJcbiAgdmFsaWRhdGlvbjoge1xyXG4gICAgcHJlRGVwbG95bWVudDogYm9vbGVhbjtcclxuICAgIHBvc3REZXBsb3ltZW50OiBib29sZWFuO1xyXG4gICAgaW1wb3J0Q29tcGF0aWJpbGl0eTogYm9vbGVhbjtcclxuICB9O1xyXG4gIGRlcGxveW1lbnQ6IHtcclxuICAgIHJlcXVpcmVBcHByb3ZhbDogYm9vbGVhbjtcclxuICAgIGhvdHN3YXBFbmFibGVkOiBib29sZWFuO1xyXG4gICAgcm9sbGJhY2tPbkZhaWx1cmU6IGJvb2xlYW47XHJcbiAgICB0aW1lb3V0TWludXRlczogbnVtYmVyO1xyXG4gIH07XHJcbiAgbW9uaXRvcmluZzoge1xyXG4gICAgZW5hYmxlQ2xvdWRXYXRjaDogYm9vbGVhbjtcclxuICAgIGVuYWJsZVhSYXk6IGJvb2xlYW47XHJcbiAgICBsb2dSZXRlbnRpb25EYXlzOiBudW1iZXI7XHJcbiAgfTtcclxuICBzZWN1cml0eToge1xyXG4gICAgZW5hYmxlRW5jcnlwdGlvbjogYm9vbGVhbjtcclxuICAgIGVuYWJsZVBvaW50SW5UaW1lUmVjb3Zlcnk6IGJvb2xlYW47XHJcbiAgICBlbmFibGVWcGNFbmRwb2ludHM6IGJvb2xlYW47XHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIERldmVsb3BtZW50IEVudmlyb25tZW50IENvbmZpZ3VyYXRpb25cclxuICovXHJcbmV4cG9ydCBjb25zdCBERVZfQ09ORklHOiBEZXBsb3ltZW50RW52aXJvbm1lbnRDb25maWcgPSB7XHJcbiAgZW52aXJvbm1lbnQ6ICdkZXYnLFxyXG4gIHJlZ2lvbjogJ2V1LXdlc3QtMScsXHJcbiAgc3RhY2tzOiBbXHJcbiAgICAnVHJpbml0eUNvbmZpZ1N0YWNrJyxcclxuICAgICdUcmluaXR5RGF0YWJhc2VTdGFjaycsXHJcbiAgICAnVHJpbml0eUxhbWJkYVN0YWNrJyxcclxuICAgICdUcmluaXR5QXBpU3RhY2snLFxyXG4gICAgJ1RyaW5pdHlNYWluU3RhY2snXHJcbiAgXSxcclxuICB2YWxpZGF0aW9uOiB7XHJcbiAgICBwcmVEZXBsb3ltZW50OiB0cnVlLFxyXG4gICAgcG9zdERlcGxveW1lbnQ6IHRydWUsXHJcbiAgICBpbXBvcnRDb21wYXRpYmlsaXR5OiB0cnVlLFxyXG4gIH0sXHJcbiAgZGVwbG95bWVudDoge1xyXG4gICAgcmVxdWlyZUFwcHJvdmFsOiBmYWxzZSxcclxuICAgIGhvdHN3YXBFbmFibGVkOiB0cnVlLFxyXG4gICAgcm9sbGJhY2tPbkZhaWx1cmU6IHRydWUsXHJcbiAgICB0aW1lb3V0TWludXRlczogMzAsXHJcbiAgfSxcclxuICBtb25pdG9yaW5nOiB7XHJcbiAgICBlbmFibGVDbG91ZFdhdGNoOiB0cnVlLFxyXG4gICAgZW5hYmxlWFJheTogZmFsc2UsXHJcbiAgICBsb2dSZXRlbnRpb25EYXlzOiA3LFxyXG4gIH0sXHJcbiAgc2VjdXJpdHk6IHtcclxuICAgIGVuYWJsZUVuY3J5cHRpb246IGZhbHNlLFxyXG4gICAgZW5hYmxlUG9pbnRJblRpbWVSZWNvdmVyeTogZmFsc2UsXHJcbiAgICBlbmFibGVWcGNFbmRwb2ludHM6IGZhbHNlLFxyXG4gIH0sXHJcbn07XHJcblxyXG4vKipcclxuICogU3RhZ2luZyBFbnZpcm9ubWVudCBDb25maWd1cmF0aW9uXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgU1RBR0lOR19DT05GSUc6IERlcGxveW1lbnRFbnZpcm9ubWVudENvbmZpZyA9IHtcclxuICBlbnZpcm9ubWVudDogJ3N0YWdpbmcnLFxyXG4gIHJlZ2lvbjogJ2V1LXdlc3QtMScsXHJcbiAgc3RhY2tzOiBbXHJcbiAgICAnVHJpbml0eUNvbmZpZ1N0YWNrJyxcclxuICAgICdUcmluaXR5RGF0YWJhc2VTdGFjaycsXHJcbiAgICAnVHJpbml0eUxhbWJkYVN0YWNrJyxcclxuICAgICdUcmluaXR5QXBpU3RhY2snLFxyXG4gICAgJ1RyaW5pdHlNYWluU3RhY2snXHJcbiAgXSxcclxuICB2YWxpZGF0aW9uOiB7XHJcbiAgICBwcmVEZXBsb3ltZW50OiB0cnVlLFxyXG4gICAgcG9zdERlcGxveW1lbnQ6IHRydWUsXHJcbiAgICBpbXBvcnRDb21wYXRpYmlsaXR5OiB0cnVlLFxyXG4gIH0sXHJcbiAgZGVwbG95bWVudDoge1xyXG4gICAgcmVxdWlyZUFwcHJvdmFsOiB0cnVlLFxyXG4gICAgaG90c3dhcEVuYWJsZWQ6IGZhbHNlLFxyXG4gICAgcm9sbGJhY2tPbkZhaWx1cmU6IHRydWUsXHJcbiAgICB0aW1lb3V0TWludXRlczogNDUsXHJcbiAgfSxcclxuICBtb25pdG9yaW5nOiB7XHJcbiAgICBlbmFibGVDbG91ZFdhdGNoOiB0cnVlLFxyXG4gICAgZW5hYmxlWFJheTogdHJ1ZSxcclxuICAgIGxvZ1JldGVudGlvbkRheXM6IDMwLFxyXG4gIH0sXHJcbiAgc2VjdXJpdHk6IHtcclxuICAgIGVuYWJsZUVuY3J5cHRpb246IHRydWUsXHJcbiAgICBlbmFibGVQb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxyXG4gICAgZW5hYmxlVnBjRW5kcG9pbnRzOiBmYWxzZSxcclxuICB9LFxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFByb2R1Y3Rpb24gRW52aXJvbm1lbnQgQ29uZmlndXJhdGlvblxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IFBST0RVQ1RJT05fQ09ORklHOiBEZXBsb3ltZW50RW52aXJvbm1lbnRDb25maWcgPSB7XHJcbiAgZW52aXJvbm1lbnQ6ICdwcm9kdWN0aW9uJyxcclxuICByZWdpb246ICdldS13ZXN0LTEnLFxyXG4gIHN0YWNrczogW1xyXG4gICAgJ1RyaW5pdHlDb25maWdTdGFjaycsXHJcbiAgICAnVHJpbml0eURhdGFiYXNlU3RhY2snLFxyXG4gICAgJ1RyaW5pdHlMYW1iZGFTdGFjaycsXHJcbiAgICAnVHJpbml0eUFwaVN0YWNrJyxcclxuICAgICdUcmluaXR5TWFpblN0YWNrJ1xyXG4gIF0sXHJcbiAgdmFsaWRhdGlvbjoge1xyXG4gICAgcHJlRGVwbG95bWVudDogdHJ1ZSxcclxuICAgIHBvc3REZXBsb3ltZW50OiB0cnVlLFxyXG4gICAgaW1wb3J0Q29tcGF0aWJpbGl0eTogdHJ1ZSxcclxuICB9LFxyXG4gIGRlcGxveW1lbnQ6IHtcclxuICAgIHJlcXVpcmVBcHByb3ZhbDogdHJ1ZSxcclxuICAgIGhvdHN3YXBFbmFibGVkOiBmYWxzZSxcclxuICAgIHJvbGxiYWNrT25GYWlsdXJlOiB0cnVlLFxyXG4gICAgdGltZW91dE1pbnV0ZXM6IDYwLFxyXG4gIH0sXHJcbiAgbW9uaXRvcmluZzoge1xyXG4gICAgZW5hYmxlQ2xvdWRXYXRjaDogdHJ1ZSxcclxuICAgIGVuYWJsZVhSYXk6IHRydWUsXHJcbiAgICBsb2dSZXRlbnRpb25EYXlzOiA5MCxcclxuICB9LFxyXG4gIHNlY3VyaXR5OiB7XHJcbiAgICBlbmFibGVFbmNyeXB0aW9uOiB0cnVlLFxyXG4gICAgZW5hYmxlUG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSxcclxuICAgIGVuYWJsZVZwY0VuZHBvaW50czogdHJ1ZSxcclxuICB9LFxyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldCBkZXBsb3ltZW50IGNvbmZpZ3VyYXRpb24gZm9yIGVudmlyb25tZW50XHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGVwbG95bWVudENvbmZpZyhlbnZpcm9ubWVudDogc3RyaW5nKTogRGVwbG95bWVudEVudmlyb25tZW50Q29uZmlnIHtcclxuICBzd2l0Y2ggKGVudmlyb25tZW50LnRvTG93ZXJDYXNlKCkpIHtcclxuICAgIGNhc2UgJ2Rldic6XHJcbiAgICBjYXNlICdkZXZlbG9wbWVudCc6XHJcbiAgICAgIHJldHVybiBERVZfQ09ORklHO1xyXG4gICAgY2FzZSAnc3RhZ2luZyc6XHJcbiAgICBjYXNlICdzdGFnZSc6XHJcbiAgICAgIHJldHVybiBTVEFHSU5HX0NPTkZJRztcclxuICAgIGNhc2UgJ3Byb2QnOlxyXG4gICAgY2FzZSAncHJvZHVjdGlvbic6XHJcbiAgICAgIHJldHVybiBQUk9EVUNUSU9OX0NPTkZJRztcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBlbnZpcm9ubWVudDogJHtlbnZpcm9ubWVudH1gKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBWYWxpZGF0ZSBkZXBsb3ltZW50IGNvbmZpZ3VyYXRpb25cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZURlcGxveW1lbnRDb25maWcoY29uZmlnOiBEZXBsb3ltZW50RW52aXJvbm1lbnRDb25maWcpOiBzdHJpbmdbXSB7XHJcbiAgY29uc3QgaXNzdWVzOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBmaWVsZHNcclxuICBpZiAoIWNvbmZpZy5lbnZpcm9ubWVudCkge1xyXG4gICAgaXNzdWVzLnB1c2goJ0Vudmlyb25tZW50IGlzIHJlcXVpcmVkJyk7XHJcbiAgfVxyXG5cclxuICBpZiAoIWNvbmZpZy5yZWdpb24pIHtcclxuICAgIGlzc3Vlcy5wdXNoKCdSZWdpb24gaXMgcmVxdWlyZWQnKTtcclxuICB9XHJcblxyXG4gIGlmICghY29uZmlnLnN0YWNrcyB8fCBjb25maWcuc3RhY2tzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgaXNzdWVzLnB1c2goJ0F0IGxlYXN0IG9uZSBzdGFjayBtdXN0IGJlIHNwZWNpZmllZCcpO1xyXG4gIH1cclxuXHJcbiAgLy8gVmFsaWRhdGUgcHJvZHVjdGlvbiBjb25zdHJhaW50c1xyXG4gIGlmIChjb25maWcuZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJykge1xyXG4gICAgaWYgKCFjb25maWcuZGVwbG95bWVudC5yZXF1aXJlQXBwcm92YWwpIHtcclxuICAgICAgaXNzdWVzLnB1c2goJ1Byb2R1Y3Rpb24gZGVwbG95bWVudHMgbXVzdCByZXF1aXJlIGFwcHJvdmFsJyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGNvbmZpZy5kZXBsb3ltZW50LmhvdHN3YXBFbmFibGVkKSB7XHJcbiAgICAgIGlzc3Vlcy5wdXNoKCdIb3Rzd2FwIHNob3VsZCBub3QgYmUgZW5hYmxlZCBpbiBwcm9kdWN0aW9uJyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFjb25maWcuc2VjdXJpdHkuZW5hYmxlRW5jcnlwdGlvbikge1xyXG4gICAgICBpc3N1ZXMucHVzaCgnRW5jcnlwdGlvbiBtdXN0IGJlIGVuYWJsZWQgaW4gcHJvZHVjdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghY29uZmlnLnNlY3VyaXR5LmVuYWJsZVBvaW50SW5UaW1lUmVjb3ZlcnkpIHtcclxuICAgICAgaXNzdWVzLnB1c2goJ1BvaW50LWluLXRpbWUgcmVjb3ZlcnkgbXVzdCBiZSBlbmFibGVkIGluIHByb2R1Y3Rpb24nKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoY29uZmlnLm1vbml0b3JpbmcubG9nUmV0ZW50aW9uRGF5cyA8IDMwKSB7XHJcbiAgICAgIGlzc3Vlcy5wdXNoKCdQcm9kdWN0aW9uIGxvZyByZXRlbnRpb24gc2hvdWxkIGJlIGF0IGxlYXN0IDMwIGRheXMnKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIFZhbGlkYXRlIHRpbWVvdXRcclxuICBpZiAoY29uZmlnLmRlcGxveW1lbnQudGltZW91dE1pbnV0ZXMgPCAxMCB8fCBjb25maWcuZGVwbG95bWVudC50aW1lb3V0TWludXRlcyA+IDEyMCkge1xyXG4gICAgaXNzdWVzLnB1c2goJ0RlcGxveW1lbnQgdGltZW91dCBtdXN0IGJlIGJldHdlZW4gMTAgYW5kIDEyMCBtaW51dGVzJyk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gaXNzdWVzO1xyXG59XHJcblxyXG4vKipcclxuICogSW1wb3J0LXNwZWNpZmljIGNvbmZpZ3VyYXRpb25zXHJcbiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIEltcG9ydENvbmZpZyB7XHJcbiAgZGF0YWJhc2VTdGFjazoge1xyXG4gICAgZW5hYmxlZDogYm9vbGVhbjtcclxuICAgIHRhYmxlczogc3RyaW5nW107XHJcbiAgICB2YWxpZGF0ZVNjaGVtYTogYm9vbGVhbjtcclxuICB9O1xyXG4gIGFwaVN0YWNrOiB7XHJcbiAgICBlbmFibGVkOiBib29sZWFuO1xyXG4gICAgYXBpczogc3RyaW5nW107XHJcbiAgICB2YWxpZGF0ZUVuZHBvaW50czogYm9vbGVhbjtcclxuICB9O1xyXG4gIGNvZ25pdG9TdGFjazoge1xyXG4gICAgZW5hYmxlZDogYm9vbGVhbjtcclxuICAgIHVzZXJQb29sczogc3RyaW5nW107XHJcbiAgICB2YWxpZGF0ZUNvbmZpZ3VyYXRpb246IGJvb2xlYW47XHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IElNUE9SVF9DT05GSUc6IEltcG9ydENvbmZpZyA9IHtcclxuICBkYXRhYmFzZVN0YWNrOiB7XHJcbiAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgdGFibGVzOiBbXHJcbiAgICAgICd0cmluaXR5LXVzZXJzLWRldicsXHJcbiAgICAgICd0cmluaXR5LXJvb21zLWRldi12MicsXHJcbiAgICAgICd0cmluaXR5LXJvb20tbWVtYmVycy1kZXYnLFxyXG4gICAgICAndHJpbml0eS12b3Rlcy1kZXYnLFxyXG4gICAgICAndHJpbml0eS1tb3ZpZXMtY2FjaGUtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktcm9vbS1tYXRjaGVzLWRldicsXHJcbiAgICAgICd0cmluaXR5LXJvb20taW52aXRlcy1kZXYtdjInLFxyXG4gICAgICAndHJpbml0eS1jb25uZWN0aW9ucy1kZXYnLFxyXG4gICAgICAndHJpbml0eS1yb29tLW1vdmllLWNhY2hlLWRldicsXHJcbiAgICAgICd0cmluaXR5LXJvb20tY2FjaGUtbWV0YWRhdGEtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktbWF0Y2htYWtpbmctZGV2JyxcclxuICAgICAgJ3RyaW5pdHktZmlsdGVyLWNhY2hlJ1xyXG4gICAgXSxcclxuICAgIHZhbGlkYXRlU2NoZW1hOiB0cnVlLFxyXG4gIH0sXHJcbiAgYXBpU3RhY2s6IHtcclxuICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICBhcGlzOiBbXHJcbiAgICAgICd0cmluaXR5LWFwaS1kZXYnLFxyXG4gICAgICAndHJpbml0eS1yZWFsdGltZS1hcGknXHJcbiAgICBdLFxyXG4gICAgdmFsaWRhdGVFbmRwb2ludHM6IHRydWUsXHJcbiAgfSxcclxuICBjb2duaXRvU3RhY2s6IHtcclxuICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICB1c2VyUG9vbHM6IFtcclxuICAgICAgJ3RyaW5pdHktdXNlcnMtZGV2J1xyXG4gICAgXSxcclxuICAgIHZhbGlkYXRlQ29uZmlndXJhdGlvbjogdHJ1ZSxcclxuICB9LFxyXG59OyJdfQ==