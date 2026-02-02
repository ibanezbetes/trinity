#!/usr/bin/env node
"use strict";
/**
 * Test script for API and Cognito stacks validation
 * This validates the CDK constructs without bundling Lambda functions
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const trinity_api_stack_1 = require("./lib/trinity-api-stack");
const trinity_cognito_stack_1 = require("./lib/trinity-cognito-stack");
const environments_1 = require("./config/environments");
const app = new cdk.App();
// Get environment configuration
const environment = 'dev';
const config = (0, environments_1.getEnvironmentConfig)(environment);
// Environment configuration
const defaultEnv = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.region,
};
// Test Cognito Stack
const cognitoStack = new trinity_cognito_stack_1.TrinityCognitoStack(app, 'TestTrinityCognitoStack', {
    env: defaultEnv,
    description: 'Test Trinity - Cognito User Pool and Authentication',
    config,
});
// Create mock User Pool from the Cognito stack
const mockUserPool = cognitoStack.getUserPool();
// Create mock tables for testing (within a stack context)
const mockTables = {
    users: dynamodb.Table.fromTableName(cognitoStack, 'MockUsersTable', 'trinity-users-dev'),
    rooms: dynamodb.Table.fromTableName(cognitoStack, 'MockRoomsTable', 'trinity-rooms-dev-v2'),
    roomMembers: dynamodb.Table.fromTableName(cognitoStack, 'MockRoomMembersTable', 'trinity-room-members-dev'),
    roomInvites: dynamodb.Table.fromTableName(cognitoStack, 'MockRoomInvitesTable', 'trinity-room-invites-dev-v2'),
    votes: dynamodb.Table.fromTableName(cognitoStack, 'MockVotesTable', 'trinity-votes-dev'),
    moviesCache: dynamodb.Table.fromTableName(cognitoStack, 'MockMoviesCacheTable', 'trinity-movies-cache-dev'),
    roomMatches: dynamodb.Table.fromTableName(cognitoStack, 'MockRoomMatchesTable', 'trinity-room-matches-dev'),
    connections: dynamodb.Table.fromTableName(cognitoStack, 'MockConnectionsTable', 'trinity-connections-dev'),
    roomMovieCache: dynamodb.Table.fromTableName(cognitoStack, 'MockRoomMovieCacheTable', 'trinity-room-movie-cache-dev'),
    roomCacheMetadata: dynamodb.Table.fromTableName(cognitoStack, 'MockRoomCacheMetadataTable', 'trinity-room-cache-metadata-dev'),
    matchmaking: dynamodb.Table.fromTableName(cognitoStack, 'MockMatchmakingTable', 'trinity-matchmaking-dev'),
    filterCache: dynamodb.Table.fromTableName(cognitoStack, 'MockFilterCacheTable', 'trinity-filter-cache'),
};
// Create mock Lambda functions for testing (within a stack context)
const mockLambdaFunctions = {
    authHandler: lambda.Function.fromFunctionName(cognitoStack, 'MockAuthFunction', 'trinity-auth-dev'),
    roomHandler: lambda.Function.fromFunctionName(cognitoStack, 'MockRoomFunction', 'trinity-room-dev'),
    voteHandler: lambda.Function.fromFunctionName(cognitoStack, 'MockVoteFunction', 'trinity-vote-dev'),
    movieHandler: lambda.Function.fromFunctionName(cognitoStack, 'MockMovieFunction', 'trinity-movie-dev'),
    cacheHandler: lambda.Function.fromFunctionName(cognitoStack, 'MockCacheFunction', 'trinity-cache-dev'),
    realtimeHandler: lambda.Function.fromFunctionName(cognitoStack, 'MockRealtimeFunction', 'trinity-realtime-dev'),
    matchmakerHandler: lambda.Function.fromFunctionName(cognitoStack, 'MockMatchmakerFunction', 'trinity-vote-consensus-dev'),
};
try {
    // Test API Stack
    const apiStack = new trinity_api_stack_1.TrinityApiStack(app, 'TestTrinityApiStack', {
        env: defaultEnv,
        description: 'Test Trinity - GraphQL APIs (AppSync)',
        config,
        userPool: mockUserPool,
        tables: mockTables,
        lambdaFunctions: mockLambdaFunctions,
    });
    console.log('✅ API and Cognito stacks validated successfully!');
    console.log('📊 Cognito Stack constructs:', Object.keys(cognitoStack.node.children).length);
    console.log('📊 API Stack constructs:', Object.keys(apiStack.node.children).length);
}
catch (error) {
    console.error('❌ Error creating API stack:', error instanceof Error ? error.message : String(error));
    console.log('✅ Cognito stack created successfully');
    console.log('📊 Cognito Stack constructs:', Object.keys(cognitoStack.node.children).length);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC1hcGktY29nbml0by5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRlc3QtYXBpLWNvZ25pdG8udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7O0dBR0c7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsdUNBQXFDO0FBQ3JDLGlEQUFtQztBQUVuQyxtRUFBcUQ7QUFDckQsK0RBQWlEO0FBQ2pELCtEQUEwRDtBQUMxRCx1RUFBa0U7QUFDbEUsd0RBQTZEO0FBRTdELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLGdDQUFnQztBQUNoQyxNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUM7QUFDMUIsTUFBTSxNQUFNLEdBQUcsSUFBQSxtQ0FBb0IsRUFBQyxXQUFXLENBQUMsQ0FBQztBQUVqRCw0QkFBNEI7QUFDNUIsTUFBTSxVQUFVLEdBQUc7SUFDakIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO0lBQ3hDLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTTtDQUN0QixDQUFDO0FBRUYscUJBQXFCO0FBQ3JCLE1BQU0sWUFBWSxHQUFHLElBQUksMkNBQW1CLENBQUMsR0FBRyxFQUFFLHlCQUF5QixFQUFFO0lBQzNFLEdBQUcsRUFBRSxVQUFVO0lBQ2YsV0FBVyxFQUFFLHFEQUFxRDtJQUNsRSxNQUFNO0NBQ1AsQ0FBQyxDQUFDO0FBRUgsK0NBQStDO0FBQy9DLE1BQU0sWUFBWSxHQUFHLFlBQVksQ0FBQyxXQUFXLEVBQUUsQ0FBQztBQUVoRCwwREFBMEQ7QUFDMUQsTUFBTSxVQUFVLEdBQW9DO0lBQ2xELEtBQUssRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxZQUFZLEVBQUUsZ0JBQWdCLEVBQUUsbUJBQW1CLENBQUM7SUFDeEYsS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLFlBQVksRUFBRSxnQkFBZ0IsRUFB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Q0FBQyxNQUFNLENBQUMsQ0FBQztJQUM1RixPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN0RixDQUFDO0FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztJQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDckcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO0lBQ3BELE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQzlGLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXHJcbi8qKlxyXG4gKiBUZXN0IHNjcmlwdCBmb3IgQVBJIGFuZCBDb2duaXRvIHN0YWNrcyB2YWxpZGF0aW9uXHJcbiAqIFRoaXMgdmFsaWRhdGVzIHRoZSBDREsgY29uc3RydWN0cyB3aXRob3V0IGJ1bmRsaW5nIExhbWJkYSBmdW5jdGlvbnNcclxuICovXHJcblxyXG5pbXBvcnQgJ3NvdXJjZS1tYXAtc3VwcG9ydC9yZWdpc3Rlcic7XHJcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xyXG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCB7IFRyaW5pdHlBcGlTdGFjayB9IGZyb20gJy4vbGliL3RyaW5pdHktYXBpLXN0YWNrJztcclxuaW1wb3J0IHsgVHJpbml0eUNvZ25pdG9TdGFjayB9IGZyb20gJy4vbGliL3RyaW5pdHktY29nbml0by1zdGFjayc7XHJcbmltcG9ydCB7IGdldEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi9jb25maWcvZW52aXJvbm1lbnRzJztcclxuXHJcbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XHJcblxyXG4vLyBHZXQgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxyXG5jb25zdCBlbnZpcm9ubWVudCA9ICdkZXYnO1xyXG5jb25zdCBjb25maWcgPSBnZXRFbnZpcm9ubWVudENvbmZpZyhlbnZpcm9ubWVudCk7XHJcblxyXG4vLyBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXHJcbmNvbnN0IGRlZmF1bHRFbnYgPSB7XHJcbiAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcclxuICByZWdpb246IGNvbmZpZy5yZWdpb24sXHJcbn07XHJcblxyXG4vLyBUZXN0IENvZ25pdG8gU3RhY2tcclxuY29uc3QgY29nbml0b1N0YWNrID0gbmV3IFRyaW5pdHlDb2duaXRvU3RhY2soYXBwLCAnVGVzdFRyaW5pdHlDb2duaXRvU3RhY2snLCB7XHJcbiAgZW52OiBkZWZhdWx0RW52LFxyXG4gIGRlc2NyaXB0aW9uOiAnVGVzdCBUcmluaXR5IC0gQ29nbml0byBVc2VyIFBvb2wgYW5kIEF1dGhlbnRpY2F0aW9uJyxcclxuICBjb25maWcsXHJcbn0pO1xyXG5cclxuLy8gQ3JlYXRlIG1vY2sgVXNlciBQb29sIGZyb20gdGhlIENvZ25pdG8gc3RhY2tcclxuY29uc3QgbW9ja1VzZXJQb29sID0gY29nbml0b1N0YWNrLmdldFVzZXJQb29sKCk7XHJcblxyXG4vLyBDcmVhdGUgbW9jayB0YWJsZXMgZm9yIHRlc3RpbmcgKHdpdGhpbiBhIHN0YWNrIGNvbnRleHQpXHJcbmNvbnN0IG1vY2tUYWJsZXM6IFJlY29yZDxzdHJpbmcsIGR5bmFtb2RiLklUYWJsZT4gPSB7XHJcbiAgdXNlcnM6IGR5bmFtb2RiLlRhYmxlLmZyb21UYWJsZU5hbWUoY29nbml0b1N0YWNrLCAnTW9ja1VzZXJzVGFibGUnLCAndHJpbml0eS11c2Vycy1kZXYnKSxcclxuICByb29tczogZHluYW1vZGIuVGFibGUuZnJvbVRhYmxlTmFtZShjb2duaXRvU3RhY2ssICdNb2NrUm9vbXNUYWJsZScsICd0cmluaXR5LXJvb21zLWRldi12MicpLFxyXG4gIHJvb21NZW1iZXJzOiBkeW5hbW9kYi5UYWJsZS5mcm9tVGFibGVOYW1lKGNvZ25pdG9TdGFjaywgJ01vY2tSb29tTWVtYmVyc1RhYmxlJywgJ3RyaW5pdHktcm9vbS1tZW1iZXJzLWRldicpLFxyXG4gIHJvb21JbnZpdGVzOiBkeW5hbW9kYi5UYWJsZS5mcm9tVGFibGVOYW1lKGNvZ25pdG9TdGFjaywgJ01vY2tSb29tSW52aXRlc1RhYmxlJywgJ3RyaW5pdHktcm9vbS1pbnZpdGVzLWRldi12MicpLFxyXG4gIHZvdGVzOiBkeW5hbW9kYi5UYWJsZS5mcm9tVGFibGVOYW1lKGNvZ25pdG9TdGFjaywgJ01vY2tWb3Rlc1RhYmxlJywgJ3RyaW5pdHktdm90ZXMtZGV2JyksXHJcbiAgbW92aWVzQ2FjaGU6IGR5bmFtb2RiLlRhYmxlLmZyb21UYWJsZU5hbWUoY29nbml0b1N0YWNrLCAnTW9ja01vdmllc0NhY2hlVGFibGUnLCAndHJpbml0eS1tb3ZpZXMtY2FjaGUtZGV2JyksXHJcbiAgcm9vbU1hdGNoZXM6IGR5bmFtb2RiLlRhYmxlLmZyb21UYWJsZU5hbWUoY29nbml0b1N0YWNrLCAnTW9ja1Jvb21NYXRjaGVzVGFibGUnLCAndHJpbml0eS1yb29tLW1hdGNoZXMtZGV2JyksXHJcbiAgY29ubmVjdGlvbnM6IGR5bmFtb2RiLlRhYmxlLmZyb21UYWJsZU5hbWUoY29nbml0b1N0YWNrLCAnTW9ja0Nvbm5lY3Rpb25zVGFibGUnLCAndHJpbml0eS1jb25uZWN0aW9ucy1kZXYnKSxcclxuICByb29tTW92aWVDYWNoZTogZHluYW1vZGIuVGFibGUuZnJvbVRhYmxlTmFtZShjb2duaXRvU3RhY2ssICdNb2NrUm9vbU1vdmllQ2FjaGVUYWJsZScsICd0cmluaXR5LXJvb20tbW92aWUtY2FjaGUtZGV2JyksXHJcbiAgcm9vbUNhY2hlTWV0YWRhdGE6IGR5bmFtb2RiLlRhYmxlLmZyb21UYWJsZU5hbWUoY29nbml0b1N0YWNrLCAnTW9ja1Jvb21DYWNoZU1ldGFkYXRhVGFibGUnLCAndHJpbml0eS1yb29tLWNhY2hlLW1ldGFkYXRhLWRldicpLFxyXG4gIG1hdGNobWFraW5nOiBkeW5hbW9kYi5UYWJsZS5mcm9tVGFibGVOYW1lKGNvZ25pdG9TdGFjaywgJ01vY2tNYXRjaG1ha2luZ1RhYmxlJywgJ3RyaW5pdHktbWF0Y2htYWtpbmctZGV2JyksXHJcbiAgZmlsdGVyQ2FjaGU6IGR5bmFtb2RiLlRhYmxlLmZyb21UYWJsZU5hbWUoY29nbml0b1N0YWNrLCAnTW9ja0ZpbHRlckNhY2hlVGFibGUnLCAndHJpbml0eS1maWx0ZXItY2FjaGUnKSxcclxufTtcclxuXHJcbi8vIENyZWF0ZSBtb2NrIExhbWJkYSBmdW5jdGlvbnMgZm9yIHRlc3RpbmcgKHdpdGhpbiBhIHN0YWNrIGNvbnRleHQpXHJcbmNvbnN0IG1vY2tMYW1iZGFGdW5jdGlvbnM6IFJlY29yZDxzdHJpbmcsIGxhbWJkYS5JRnVuY3Rpb24+ID0ge1xyXG4gIGF1dGhIYW5kbGVyOiBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uTmFtZShjb2duaXRvU3RhY2ssICdNb2NrQXV0aEZ1bmN0aW9uJywgJ3RyaW5pdHktYXV0aC1kZXYnKSxcclxuICByb29tSGFuZGxlcjogbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbk5hbWUoY29nbml0b1N0YWNrLCAnTW9ja1Jvb21GdW5jdGlvbicsICd0cmluaXR5LXJvb20tZGV2JyksXHJcbiAgdm90ZUhhbmRsZXI6IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25OYW1lKGNvZ25pdG9TdGFjaywgJ01vY2tWb3RlRnVuY3Rpb24nLCAndHJpbml0eS12b3RlLWRldicpLFxyXG4gIG1vdmllSGFuZGxlcjogbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbk5hbWUoY29nbml0b1N0YWNrLCAnTW9ja01vdmllRnVuY3Rpb24nLCAndHJpbml0eS1tb3ZpZS1kZXYnKSxcclxuICBjYWNoZUhhbmRsZXI6IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25OYW1lKGNvZ25pdG9TdGFjaywgJ01vY2tDYWNoZUZ1bmN0aW9uJywgJ3RyaW5pdHktY2FjaGUtZGV2JyksXHJcbiAgcmVhbHRpbWVIYW5kbGVyOiBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uTmFtZShjb2duaXRvU3RhY2ssICdNb2NrUmVhbHRpbWVGdW5jdGlvbicsICd0cmluaXR5LXJlYWx0aW1lLWRldicpLFxyXG4gIG1hdGNobWFrZXJIYW5kbGVyOiBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uTmFtZShjb2duaXRvU3RhY2ssICdNb2NrTWF0Y2htYWtlckZ1bmN0aW9uJywgJ3RyaW5pdHktdm90ZS1jb25zZW5zdXMtZGV2JyksXHJcbn07XHJcblxyXG50cnkge1xyXG4gIC8vIFRlc3QgQVBJIFN0YWNrXHJcbiAgY29uc3QgYXBpU3RhY2sgPSBuZXcgVHJpbml0eUFwaVN0YWNrKGFwcCwgJ1Rlc3RUcmluaXR5QXBpU3RhY2snLCB7XHJcbiAgICBlbnY6IGRlZmF1bHRFbnYsXHJcbiAgICBkZXNjcmlwdGlvbjogJ1Rlc3QgVHJpbml0eSAtIEdyYXBoUUwgQVBJcyAoQXBwU3luYyknLFxyXG4gICAgY29uZmlnLFxyXG4gICAgdXNlclBvb2w6IG1vY2tVc2VyUG9vbCxcclxuICAgIHRhYmxlczogbW9ja1RhYmxlcyxcclxuICAgIGxhbWJkYUZ1bmN0aW9uczogbW9ja0xhbWJkYUZ1bmN0aW9ucyxcclxuICB9KTtcclxuXHJcbiAgY29uc29sZS5sb2coJ+KchSBBUEkgYW5kIENvZ25pdG8gc3RhY2tzIHZhbGlkYXRlZCBzdWNjZXNzZnVsbHkhJyk7XHJcbiAgY29uc29sZS5sb2coJ/Cfk4ogQ29nbml0byBTdGFjayBjb25zdHJ1Y3RzOicsIE9iamVjdC5rZXlzKGNvZ25pdG9TdGFjay5ub2RlLmNoaWxkcmVuKS5sZW5ndGgpO1xyXG4gIGNvbnNvbGUubG9nKCfwn5OKIEFQSSBTdGFjayBjb25zdHJ1Y3RzOicsIE9iamVjdC5rZXlzKGFwaVN0YWNrLm5vZGUuY2hpbGRyZW4pLmxlbmd0aCk7XHJcbn0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGNyZWF0aW5nIEFQSSBzdGFjazonLCBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcikpO1xyXG4gIGNvbnNvbGUubG9nKCfinIUgQ29nbml0byBzdGFjayBjcmVhdGVkIHN1Y2Nlc3NmdWxseScpO1xyXG4gIGNvbnNvbGUubG9nKCfwn5OKIENvZ25pdG8gU3RhY2sgY29uc3RydWN0czonLCBPYmplY3Qua2V5cyhjb2duaXRvU3RhY2subm9kZS5jaGlsZHJlbikubGVuZ3RoKTtcclxufSJdfQ==