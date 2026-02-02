"use strict";
/**
 * Trinity API Stack - AppSync GraphQL APIs
 * Manages both main API and real-time API with exact schema matching
 * Designed for CDK import of existing resources
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
exports.TrinityApiStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const appsync = __importStar(require("aws-cdk-lib/aws-appsync"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class TrinityApiStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Create Main GraphQL API (matches existing trinity-api-dev)
        this.mainApi = new appsync.GraphqlApi(this, 'TrinityMainApi', {
            name: 'trinity-api-dev',
            schema: appsync.SchemaFile.fromAsset(path.join(__dirname, '../../../api/schemas/trinity-main-schema.graphql')),
            authorizationConfig: {
                defaultAuthorization: {
                    authorizationType: appsync.AuthorizationType.USER_POOL,
                    userPoolConfig: {
                        userPool: props.userPool,
                        defaultAction: appsync.UserPoolDefaultAction.ALLOW,
                    },
                },
                additionalAuthorizationModes: [
                    {
                        authorizationType: appsync.AuthorizationType.IAM,
                    },
                ],
            },
            logConfig: {
                fieldLogLevel: appsync.FieldLogLevel.ALL,
            },
            xrayEnabled: true,
        });
        // Create Real-time GraphQL API (matches existing trinity-realtime-api)
        this.realtimeApi = new appsync.GraphqlApi(this, 'TrinityRealtimeApi', {
            name: 'trinity-realtime-api',
            schema: appsync.SchemaFile.fromAsset(path.join(__dirname, '../../../api/schemas/trinity-realtime-schema.graphql')),
            authorizationConfig: {
                defaultAuthorization: {
                    authorizationType: appsync.AuthorizationType.API_KEY,
                },
                additionalAuthorizationModes: [
                    {
                        authorizationType: appsync.AuthorizationType.USER_POOL,
                        userPoolConfig: {
                            userPool: props.userPool,
                            defaultAction: appsync.UserPoolDefaultAction.ALLOW,
                        },
                    },
                ],
            },
            logConfig: {
                fieldLogLevel: appsync.FieldLogLevel.ALL,
            },
            xrayEnabled: true,
        });
        // Create API Key for real-time API
        const realtimeApiKey = new appsync.CfnApiKey(this, 'RealtimeApiKeyResource', {
            apiId: this.realtimeApi.apiId,
            description: 'API Key for Trinity Real-time subscriptions',
            expires: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year from now
        });
        // Create data sources for main API
        this.createMainApiDataSources(props);
        // Create resolvers for main API
        this.createMainApiResolvers(props);
        // Create data sources and resolvers for real-time API
        this.createRealtimeApiDataSources(props);
        this.createRealtimeApiResolvers(props);
        // Grant Lambda functions access to invoke AppSync - REMOVED to fix circular dependency
        // this.grantLambdaAppSyncAccess(props);
        // Output important values
        new cdk.CfnOutput(this, 'MainApiUrl', {
            value: this.mainApi.graphqlUrl,
            description: 'Trinity Main GraphQL API URL',
            exportName: `${props.config.environment}-trinity-main-api-url`,
        });
        new cdk.CfnOutput(this, 'MainApiId', {
            value: this.mainApi.apiId,
            description: 'Trinity Main GraphQL API ID',
            exportName: `${props.config.environment}-trinity-main-api-id`,
        });
        new cdk.CfnOutput(this, 'RealtimeApiUrl', {
            value: this.realtimeApi.graphqlUrl,
            description: 'Trinity Real-time GraphQL API URL',
            exportName: `${props.config.environment}-trinity-realtime-api-url`,
        });
        new cdk.CfnOutput(this, 'RealtimeApiId', {
            value: this.realtimeApi.apiId,
            description: 'Trinity Real-time GraphQL API ID',
            exportName: `${props.config.environment}-trinity-realtime-api-id`,
        });
        new cdk.CfnOutput(this, 'RealtimeApiKeyOutput', {
            value: realtimeApiKey.attrApiKey,
            description: 'Trinity Real-time API Key',
            exportName: `${props.config.environment}-trinity-realtime-api-key`,
        });
        // Add tags
        cdk.Tags.of(this).add('Project', 'Trinity');
        cdk.Tags.of(this).add('Environment', props.config.environment);
        cdk.Tags.of(this).add('ManagedBy', 'CDK');
    }
    /**
     * Create data sources for main API
     */
    createMainApiDataSources(props) {
        // Lambda data sources
        const authDataSource = this.mainApi.addLambdaDataSource('AuthDataSource', props.lambdaFunctions.auth, {
            description: 'Authentication and user management',
        });
        const roomDataSource = this.mainApi.addLambdaDataSource('RoomDataSource', props.lambdaFunctions.room, {
            description: 'Room management and operations',
        });
        const voteDataSource = this.mainApi.addLambdaDataSource('VoteDataSource', props.lambdaFunctions.vote, {
            description: 'Voting system and match detection',
        });
        const movieDataSource = this.mainApi.addLambdaDataSource('MovieDataSource', props.lambdaFunctions.movie, {
            description: 'Movie data and TMDB integration',
        });
        const cacheDataSource = this.mainApi.addLambdaDataSource('CacheDataSource', props.lambdaFunctions.cache, {
            description: 'Movie caching and pre-loading',
        });
        const realtimeDataSource = this.mainApi.addLambdaDataSource('RealtimeDataSource', props.lambdaFunctions.realtime, {
            description: 'Real-time notifications and events',
        });
        // DynamoDB data sources for direct access (used by some resolvers)
        const matchmakingDataSource = this.mainApi.addDynamoDbDataSource('MatchmakingDataSource', props.tables['matchmaking'], {
            description: 'Direct access to matchmaking table for vote consensus',
        });
        // Store data sources for resolver creation
        this.dataSources = {
            auth: authDataSource,
            room: roomDataSource,
            vote: voteDataSource,
            movie: movieDataSource,
            cache: cacheDataSource,
            realtime: realtimeDataSource,
            matchmaking: matchmakingDataSource,
        };
    }
    /**
     * Create resolvers for main API
     */
    createMainApiResolvers(props) {
        const dataSources = this.dataSources;
        // Query resolvers
        dataSources.movie.createResolver('GetAvailableGenresResolver', {
            typeName: 'Query',
            fieldName: 'getAvailableGenres',
        });
        dataSources.movie.createResolver('GetFilteredContentResolver', {
            typeName: 'Query',
            fieldName: 'getFilteredContent',
        });
        dataSources.room.createResolver('GetMovieDetailsResolver', {
            typeName: 'Query',
            fieldName: 'getMovieDetails',
        });
        dataSources.room.createResolver('GetMyHistoryResolver', {
            typeName: 'Query',
            fieldName: 'getMyHistory',
        });
        dataSources.room.createResolver('GetRoomResolver', {
            typeName: 'Query',
            fieldName: 'getRoom',
        });
        dataSources.auth.createResolver('GetRoomMembersResolver', {
            typeName: 'Query',
            fieldName: 'getRoomMembers',
        });
        dataSources.room.createResolver('GetRoomVotesResolver', {
            typeName: 'Query',
            fieldName: 'getRoomVotes',
        });
        dataSources.movie.createResolver('GetUserResolver', {
            typeName: 'Query',
            fieldName: 'getUser',
        });
        dataSources.room.createResolver('GetUserRoomsResolver', {
            typeName: 'Query',
            fieldName: 'getUserRooms',
        });
        // Individual voting system queries
        dataSources.movie.createResolver('GetNextMovieForUserResolver', {
            typeName: 'Query',
            fieldName: 'getNextMovieForUser',
        });
        dataSources.vote.createResolver('GetUserVotingProgressResolver', {
            typeName: 'Query',
            fieldName: 'getUserVotingProgress',
        });
        dataSources.cache.createResolver('CheckMatchBeforeActionResolver', {
            typeName: 'Query',
            fieldName: 'checkMatchBeforeAction',
        });
        // Mutation resolvers
        dataSources.vote.createResolver('ConnectResolver', {
            typeName: 'Mutation',
            fieldName: 'connect',
        });
        dataSources.auth.createResolver('CreateRoomResolver', {
            typeName: 'Mutation',
            fieldName: 'createRoom',
        });
        dataSources.room.createResolver('CreateRoomDebugResolver', {
            typeName: 'Mutation',
            fieldName: 'createRoomDebug',
        });
        dataSources.room.createResolver('CreateRoomSimpleResolver', {
            typeName: 'Mutation',
            fieldName: 'createRoomSimple',
        });
        dataSources.auth.createResolver('CreateUserResolver', {
            typeName: 'Mutation',
            fieldName: 'createUser',
        });
        dataSources.realtime.createResolver('DisconnectResolver', {
            typeName: 'Mutation',
            fieldName: 'disconnect',
        });
        dataSources.room.createResolver('JoinRoomByInviteResolver', {
            typeName: 'Mutation',
            fieldName: 'joinRoomByInvite',
        });
        dataSources.room.createResolver('LeaveRoomResolver', {
            typeName: 'Mutation',
            fieldName: 'leaveRoom',
        });
        // Real-time event publishing mutations
        dataSources.realtime.createResolver('PublishChatEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishChatEvent',
        });
        dataSources.realtime.createResolver('PublishConnectionStatusEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishConnectionStatusEvent',
        });
        dataSources.realtime.createResolver('PublishMatchEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishMatchEvent',
        });
        dataSources.realtime.createResolver('PublishMatchFoundEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishMatchFoundEvent',
        });
        dataSources.realtime.createResolver('PublishMemberEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishMemberEvent',
        });
        dataSources.realtime.createResolver('PublishModerationEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishModerationEvent',
        });
        dataSources.realtime.createResolver('PublishRoleEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishRoleEvent',
        });
        dataSources.realtime.createResolver('PublishRoomEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishRoomEvent',
        });
        dataSources.realtime.createResolver('PublishRoomStateEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishRoomStateEvent',
        });
        dataSources.realtime.createResolver('PublishScheduleEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishScheduleEvent',
        });
        dataSources.realtime.createResolver('PublishSettingsEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishSettingsEvent',
        });
        dataSources.realtime.createResolver('PublishSuggestionEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishSuggestionEvent',
        });
        dataSources.realtime.createResolver('PublishThemeEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishThemeEvent',
        });
        dataSources.realtime.createResolver('PublishVoteEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishVoteEvent',
        });
        dataSources.realtime.createResolver('PublishVoteUpdateEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishVoteUpdateEvent',
        });
        dataSources.room.createResolver('StartVotingResolver', {
            typeName: 'Mutation',
            fieldName: 'startVoting',
        });
        dataSources.room.createResolver('UpdateRoomFiltersResolver', {
            typeName: 'Mutation',
            fieldName: 'updateRoomFilters',
        });
        dataSources.auth.createResolver('UpdateUserResolver', {
            typeName: 'Mutation',
            fieldName: 'updateUser',
        });
        dataSources.vote.createResolver('VoteResolver', {
            typeName: 'Mutation',
            fieldName: 'vote',
        });
        // Special resolvers with custom JavaScript code (matching existing resolvers)
        this.createCustomResolvers(props);
    }
    /**
     * Create custom resolvers with JavaScript code (matching existing resolver files)
     */
    createCustomResolvers(props) {
        const dataSources = this.dataSources;
        // Load resolver code from files
        const voteForMovieCode = fs.readFileSync(path.join(__dirname, '../../../api/resolvers/voteForMovie.js'), 'utf8');
        const publishConsensusReachedCode = fs.readFileSync(path.join(__dirname, '../../../api/resolvers/publishConsensusReached.js'), 'utf8');
        const onVoteUpdateCode = fs.readFileSync(path.join(__dirname, '../../../api/resolvers/onVoteUpdate.js'), 'utf8');
        // VoteForMovie resolver (uses DynamoDB directly for transactions)
        dataSources.matchmaking.createResolver('VoteForMovieResolver', {
            typeName: 'Mutation',
            fieldName: 'voteForMovie',
            code: appsync.Code.fromInline(voteForMovieCode),
            runtime: appsync.FunctionRuntime.JS_1_0_0,
        });
        // PublishConsensusReached resolver (IAM protected)
        dataSources.matchmaking.createResolver('PublishConsensusReachedResolver', {
            typeName: 'Mutation',
            fieldName: 'publishConsensusReached',
            code: appsync.Code.fromInline(publishConsensusReachedCode),
            runtime: appsync.FunctionRuntime.JS_1_0_0,
        });
        // OnVoteUpdate subscription resolver (with filtering)
        this.mainApi.createResolver('OnVoteUpdateResolver', {
            typeName: 'Subscription',
            fieldName: 'onVoteUpdate',
            code: appsync.Code.fromInline(onVoteUpdateCode),
            runtime: appsync.FunctionRuntime.JS_1_0_0,
        });
    }
    /**
     * Create data sources for real-time API
     */
    createRealtimeApiDataSources(props) {
        // Lambda data source for real-time operations
        const realtimeDataSource = this.realtimeApi.addLambdaDataSource('RealtimeDataSource', props.lambdaFunctions.realtime, {
            description: 'Real-time operations and room status',
        });
        // Store data source for resolver creation
        this.realtimeDataSources = {
            realtime: realtimeDataSource,
        };
    }
    /**
     * Create resolvers for real-time API
     */
    createRealtimeApiResolvers(props) {
        const dataSources = this.realtimeDataSources;
        // Query resolvers
        dataSources.realtime.createResolver('GetRoomStatusResolver', {
            typeName: 'Query',
            fieldName: 'getRoomStatus',
        });
        // Mutation resolvers
        dataSources.realtime.createResolver('UpdateRoomStatusResolver', {
            typeName: 'Mutation',
            fieldName: 'updateRoomStatus',
        });
    }
}
exports.TrinityApiStack = TrinityApiStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbml0eS1hcGktc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0cmluaXR5LWFwaS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7R0FJRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsaURBQW1DO0FBQ25DLGlFQUFtRDtBQVFuRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBUzdCLE1BQWEsZUFBZ0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUk1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDZEQUE2RDtRQUM3RCxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDNUQsSUFBSSxFQUFFLGlCQUFpQjtZQUN2QixNQUFNLEVBQUUsT0FBTyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsa0RBQWtELENBQUMsQ0FBQztZQUM5RyxtQkFBbUIsRUFBRTtnQkFDbkIsb0JBQW9CLEVBQUU7b0JBQ3BCLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO29CQUN0RCxjQUFjLEVBQUU7d0JBQ2QsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRO3dCQUN4QixhQUFhLEVBQUUsT0FBTyxDQUFDLHFCQUFxQixDQUFDLEtBQUs7cUJBQ25EO2lCQUNGO2dCQUNELDRCQUE0QixFQUFFO29CQUM1Qjt3QkFDRSxpQkFBaUIsRUFBRSxPQUFPLENBQUMsaUJBQWlCLENBQUMsR0FBRztxQkFDakQ7aUJBQ0Y7YUFDRjtZQUNELFNBQVMsRUFBRTtnQkFDVCxhQUFhLEVBQUUsT0FBTyxDQUFDLGFBQWEsQ0FBQyxHQUFHO2FBQ3pDO1lBQ0QsV0FBVyxFQUFFLElB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QzlELDhDQUE4QztRQUM5QyxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsb0JBQW9CLEVBQUUsS0FBSyxDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUU7WUFDcEgsV0FBVyxFQUFFLHNDQUFzQztTQUNwRCxDQUFDLENBQUM7UUFFSCwwQ0FBMEM7UUFDekMsSUFBWSxDQUFDLG1CQUFtQixHQUFHO1lBQ2xDLFFBQVEsRUFBRSxrQkFBa0I7U0FDN0IsQ0FBQztJQUNKLENBQUM7SUFFRDs7T0FFRztJQUNLLDBCQUEwQixDQUFDLEtBQTJCO1FBQzVELE1BQU0sV0FBVyxHQUFJLElBQVksQ0FBQyxtQkFBbUIsQ0FBQztRQUV0RCxrQkFBa0I7UUFDbEIsV0FBVyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLEVBQUU7WUFDM0QsUUFBUSxFQUFFLE9BQU87WUFDakIsU0FBUyxFQUFFLGVBQWU7U0FDM0IsQ0FBQyxDQUFDO1FBRUgscUJBQXFCO1FBQ3JCLFdBQVcsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLDBCQUEwQixFQUFFO1lBQzlELFFBQVEsRUFBRSxVQUFVO1lBQ3BCLFNBQVMsRUFBRSxrQkFBa0I7U0FDOUIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQTZCRjtBQTNkRCwwQ0EyZEMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogVHJpbml0eSBBUEkgU3RhY2sgLSBBcHBTeW5jIEdyYXBoUUwgQVBJc1xyXG4gKiBNYW5hZ2VzIGJvdGggbWFpbiBBUEkgYW5kIHJlYWwtdGltZSBBUEkgd2l0aCBleGFjdCBzY2hlbWEgbWF0Y2hpbmdcclxuICogRGVzaWduZWQgZm9yIENESyBpbXBvcnQgb2YgZXhpc3RpbmcgcmVzb3VyY2VzXHJcbiAqL1xyXG5cclxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgYXBwc3luYyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBwc3luYyc7XHJcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcbmltcG9ydCB7IFRyaW5pdHlFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4uL2NvbmZpZy9lbnZpcm9ubWVudHMnO1xyXG5pbXBvcnQgeyBQYXJhbWV0ZXJTdG9yZVV0aWxzIH0gZnJvbSAnLi4vY29uZmlnL3BhcmFtZXRlci1zdG9yZSc7XHJcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgVHJpbml0eUFwaVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XHJcbiAgY29uZmlnOiBUcmluaXR5RW52aXJvbm1lbnRDb25maWc7XHJcbiAgdXNlclBvb2w6IGNvZ25pdG8uSVVzZXJQb29sO1xyXG4gIHRhYmxlczogUmVjb3JkPHN0cmluZywgZHluYW1vZGIuSVRhYmxlPjtcclxuICBsYW1iZGFGdW5jdGlvbnM6IFJlY29yZDxzdHJpbmcsIGxhbWJkYS5JRnVuY3Rpb24+O1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVHJpbml0eUFwaVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBwdWJsaWMgcmVhZG9ubHkgbWFpbkFwaTogYXBwc3luYy5HcmFwaHFsQXBpO1xyXG4gIHB1YmxpYyByZWFkb25seSByZWFsdGltZUFwaTogYXBwc3luYy5HcmFwaHFsQXBpO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogVHJpbml0eUFwaVN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIC8vIENyZWF0ZSBNYWluIEdyYXBoUUwgQVBJIChtYXRjaGVzIGV4aXN0aW5nIHRyaW5pdHktYXBpLWRldilcclxuICAgIHRoaXMubWFpbkFwaSA9IG5ldyBhcHBzeW5jLkdyYXBocWxBcGkodGhpcywgJ1RyaW5pdHlNYWluQXBpJywge1xyXG4gICAgICBuYW1lOiAndHJpbml0eS1hcGktZGV2JyxcclxuICAgICAgc2NoZW1hOiBhcHBzeW5jLlNjaGVtYUZpbGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9hcGkvc2NoZW1hcy90cmluaXR5LW1haW4tc2NoZW1hLmdyYXBocWwnKSksXHJcbiAgICAgIGF1dGhvcml6YXRpb25Db25maWc6IHtcclxuICAgICAgICBkZWZhdWx0QXV0aG9yaXphdGlvbjoge1xyXG4gICAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwcHN5bmMuQXV0aG9yaXphdGlvblR5cGUuVVNFUl9QT09MLFxyXG4gICAgICAgICAgdXNlclBvb2xDb25maWc6IHtcclxuICAgICAgICAgICAgdXNlclBvb2w6IHByb3BzLnVzZXJQb29sLFxyXG4gICAgICAgICAgICBkZWZhdWx0QWN0aW9uOiBhcHBzeW5jLlVzZXJQb29sRGVmYXVsdEFjdGlvbi5BTExPVyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICBhZGRpdGlvbmFsQXV0aG9yaXphdGlvbk1vZGVzOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcHBzeW5jLkF1dGhvcml6YXRpb25UeXBlLklBTSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgfSxcclxuICAgICAgbG9nQ29uZmlnOiB7XHJcbiAgICAgICAgZmllbGRMb2dMZXZlbDogYXBwc3luYy5GaWVsZExvZ0xldmVsLkFMTCxcclxuICAgICAgfSxcclxuICAgICAgeHJheUVuYWJsZWQ6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgUmVhbC10aW1lIEdyYXBoUUwgQVBJIChtYXRjaGVzIGV4aXN0aW5nIHRyaW5pdHktcmVhbHRpbWUtYXBpKVxyXG4gICAgdGhpcy5yZWFsdGltZUFwaSA9IG5ldyBhcHBzeW5jLkdyYXBocWxBcGkodGhpcywgJ1RyaW5pdHlSZWFsdGltZUFwaScsIHtcclxuICAgICAgbmFtZTogJ3RyaW5pdHktcmVhbHRpbWUtYXBpJyxcclxuICAgICAgc2NoZW1hOiBhcHBzeW5jLlNjaGVtYUZpbGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9hcGkvc2NoZW1hcy90cmluaXR5LXJlYWx0aW1lLXNjaGVtYS5ncmFwaHFsJykpLFxyXG4gICAgICBhdXRob3JpemF0aW9uQ29uZmlnOiB7XHJcbiAgICAgICAgZGVmYXVsdEF1dGhvcml6YXRpb246IHtcclxuICAgICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcHBzeW5jLkF1dGhvcml6YXRpb25UeXBlLkFQSV9LRVksXHJcbiAgICAgICAgfSxcclxuICAgICAgICBhZGRpdGlvbmFsQXV0aG9yaXphdGlvbk1vZGVzOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcHBzeW5jLkF1dGhvcml6YXRpb25UeXBlLlVTRVJfUE9PTCxcclxuICAgICAgICAgICAgdXNlclBvb2xDb25maWc6IHtcclxuICAgICAgICAgICAgICB1c2VyUG9vbDogcHJvcHMudXNlclBvb2wsXHJcbiAgICAgICAgICAgICAgZGVmYXVsdEFjdGlvbjogYXBwc3luYy5Vc2VyUG9vbERlZmF1bHRBY3Rpb24uQUxMT1csXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0sXHJcbiAgICAgIGxvZ0NvbmZpZzoge1xyXG4gICAgICAgIGZpZWxkTG9nTGV2ZWw6IGFwcHN5bmMuRmllbGRMb2dMZXZlbC5BTEwsXHJcbiAgICAgIH0sXHJcbiAgICAgIHhyYXlFbmFibGVkOiB0cnVlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIEFQSSBLZXkgZm9yIHJlYWwtdGltZSBBUElcclxuICAgIGNvbnN0IHJlYWx0aW1lQXBpS2V5ID0gbmV3IGFwcHN5bmMuQ2ZuQXBpS2V5KHRoaXMsICdSZWFsdGltZUFwaUtleVJlc291cmNlJywge1xyXG4gICAgICBhcGlJZDogdGhpcy5yZWFsdGltZUFwaS5hcGlJZCxcclxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgS2V5IGZvciBUcmluaXR5IFJlYWwtdGltZSBzdWJzY3JpcHRpb25zJyxcclxuICAgICAgZXhwaXJlczogTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkgKyAoMzY1ICogMjQgKiA2MCAqIDYwKSwgLy8gMSB5ZWFyIGZyb20gbm93XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgZGF0YSBzb3VyY2VzIGZvciBtYWluIEFQSVxyXG4gICAgdGhpcy5jcmVhdGVNYWluQXBpRGF0YVNvdXJjZXMocHJvcHMpO1xyXG5cclxuICAgIC8vIENyZWF0ZSByZXNvbHZlcnMgZm9yIG1haW4gQVBJXHJcbiAgICB0aGlzLmNyZWF0ZU1haW5BcGlSZXNvbHZlcnMocHJvcHMpO1xyXG5cclxuICAgIC8vIENyZWF0ZSBkYXRhIHNvdXJjZXMgYW5kIHJlc29sdmVycyBmb3IgcmVhbC10aW1lIEFQSVxyXG4gICAgdGhpcy5jcmVhdGVSZWFsdGltZUFwaURhdGFTb3VyY2VzKHByb3BzKTtcclxuICAgIHRoaXMuY3JlYXRlUmVhbHRpbWVBcGlSZXNvbHZlcnMocHJvcHMpO1xyXG5cclxuICAgIC8vIEdyYW50IExhbWJkYSBmdW5jdGlvbnMgYWNjZXNzIHRvIGludm9rZSBBcHBTeW5jIC0gUkVNT1ZFRCB0byBmaXggY2lyY3VsYXIgZGVwZW5kZW5jeVxyXG4gICAgLy8gdGhpcy5ncmFudExhbWJkYUFwcFN5bmNBY2Nlc3MocHJvcHMpO1xyXG5cclxuICAgIC8vIE91dHB1dCBpbXBvcnRhbnQgdmFsdWVzXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTWFpbkFwaVVybCcsIHtcclxuICAgICAgdmFsdWU6IHRoaXMubWFpbkFwaS5ncmFwaHFsVXJsLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1RyaW5pdHkgTWFpbiBHcmFwaFFMIEFQSSBVUkwnLFxyXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5jb25maWcuZW52aXJvbm1lbnR9LXRyaW5pdHktbWFpbi1hcGktdXJsYCxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNYWluQXBpSWQnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLm1haW5BcGkuYXBpSWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVHJpbml0eSBNYWluIEdyYXBoUUwgQVBJIElEJyxcclxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuY29uZmlnLmVudmlyb25tZW50fS10cmluaXR5LW1haW4tYXBpLWlkYCxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdSZWFsdGltZUFwaVVybCcsIHtcclxuICAgICAgdmFsdWU6IHRoaXMucmVhbHRpbWVBcGkuZ3JhcGhxbFVybCxcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmluaXR5IFJlYWwtdGltZSBHcmFwaFFMIEFQSSBVUkwnLFxyXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5jb25maWcuZW52aXJvbm1lbnR9LXRyaW5pdHktcmVhbHRpbWUtYXBpLXVybGAsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUmVhbHRpbWVBcGlJZCcsIHtcclxuICAgICAgdmFsdWU6IHRoaXMucmVhbHRpbWVBcGkuYXBpSWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVHJpbml0eSBSZWFsLXRpbWUgR3JhcGhRTCBBUEkgSUQnLFxyXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5jb25maWcuZW52aXJvbm1lbnR9LXRyaW5pdHktcmVhbHRpbWUtYXBpLWlkYCxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdSZWFsdGltZUFwaUtleU91dHB1dCcsIHtcclxuICAgICAgdmFsdWU6IHJlYWx0aW1lQXBpS2V5LmF0dHJBcGlLZXksXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVHJpbml0eSBSZWFsLXRpbWUgQVBJIEtleScsXHJcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmNvbmZpZy5lbnZpcm9ubWVudH0tdHJpbml0eS1yZWFsdGltZS1hcGkta2V5YCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCB0YWdzXHJcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ1Byb2plY3QnLCAnVHJpbml0eScpO1xyXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdFbnZpcm9ubWVudCcsIHByb3BzLmNvbmZpZy5lbnZpcm9ubWVudCk7XHJcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ01hbmFnZWRCeScsICdDREsnKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBkYXRhIHNvdXJjZXMgZm9yIG1haW4gQVBJXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBjcmVhdGVNYWluQXBpRGF0YVNvdXJjZXMocHJvcHM6IFRyaW5pdHlBcGlTdGFja1Byb3BzKTogdm9pZCB7XHJcbiAgICAvLyBMYW1iZGEgZGF0YSBzb3VyY2VzXHJcbiAgICBjb25zdCBhdXRoRGF0YVNvdXJjZSA9IHRoaXMubWFpbkFwaS5hZGRMYW1iZGFEYXRhU291cmNlKCdBdXRoRGF0YVNvdXJjZScsIHByb3BzLmxhbWJkYUZ1bmN0aW9ucy5hdXRoLCB7XHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXV0aGVudGljYXRpb24gYW5kIHVzZXIgbWFuYWdlbWVudCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCByb29tRGF0YVNvdXJjZSA9IHRoaXMubWFpbkFwaS5hZGRMYW1iZGFEYXRhU291cmNlKCdSb29tRGF0YVNvdXJjZScsIHByb3BzLmxhbWJkYUZ1bmN0aW9ucy5yb29tLCB7XHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnUm9vbSBtYW5hZ2VtZW50IGFuZCBvcGVyYXRpb25zJyxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHZvdGVEYXRhU291cmNlID0gdGhpcy5tYWluQXBpLmFkZExhbWJkYURhdGFTb3VyY2UoJ1ZvdGVEYXRhU291cmNlJywgcHJvcHMubGFtYmRhRnVuY3Rpb25zLnZvdGUsIHtcclxuICAgICAgZGVzY3JpcHRpb246ICdWb3Rpbmcgc3lzdGVtIGFuZCBtYXRjaCBkZXRlY3Rpb24nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgbW92aWVEYXRhU291cmNlID0gdGhpcy5tYWluQXBpLmFkZExhbWJkYURhdGFTb3VyY2UoJ01vdmllRGF0YVNvdXJjZScsIHByb3BzLmxhbWJkYUZ1bmN0aW9ucy5tb3ZpZSwge1xyXG4gICAgICBkZXNjcmlwdGlvbjogJ01vdmllIGRhdGEgYW5kIFRNREIgaW50ZWdyYXRpb24nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgY2FjaGVEYXRhU291cmNlID0gdGhpcy5tYWluQXBpLmFkZExhbWJkYURhdGFTb3VyY2UoJ0NhY2hlRGF0YVNvdXJjZScsIHByb3BzLmxhbWJkYUZ1bmN0aW9ucy5jYWNoZSwge1xyXG4gICAgICBkZXNjcmlwdGlvbjogJ01vdmllIGNhY2hpbmcgYW5kIHByZS1sb2FkaW5nJyxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHJlYWx0aW1lRGF0YVNvdXJjZSA9IHRoaXMubWFpbkFwaS5hZGRMYW1iZGFEYXRhU291cmNlKCdSZWFsdGltZURhdGFTb3VyY2UnLCBwcm9wcy5sYW1iZGFGdW5jdGlvbnMucmVhbHRpbWUsIHtcclxuICAgICAgZGVzY3JpcHRpb246ICdSZWFsLXRpbWUgbm90aWZpY2F0aW9ucyBhbmQgZXZlbnRzJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIER5bmFtb0RCIGRhdGEgc291cmNlcyBmb3IgZGlyZWN0IGFjY2VzcyAodXNlZCBieSBzb21lIHJlc29sdmVycylcclxuICAgIGNvbnN0IG1hdGNobWFraW5nRGF0YVNvdXJjZSA9IHRoaXMubWFpbkFwaS5hZGREeW5hbW9EYkRhdGFTb3VyY2UoJ01hdGNobWFraW5nRGF0YVNvdXJjZScsIHByb3BzLnRhYmxlc1snbWF0Y2htYWtpbmcnXSwge1xyXG4gICAgICBkZXNjcmlwdGlvbjogJ0RpcmVjdCBhY2Nlc3MgdG8gbWF0Y2htYWtpbmcgdGFibGUgZm9yIHZvdGUgY29uc2Vuc3VzJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFN0b3JlIGRhdGEgc291cmNlcyBmb3IgcmVzb2x2ZXIgY3JlYXRpb25cclxuICAgICh0aGlzIGFzIGFueSkuZGF0YVNvdXJjZXMgPSB7XHJcbiAgICAgIGF1dGg6IGF1dGhEYXRhU291cmNlLFxyXG4gICAgICByb29tOiByb29tRGF0YVNvdXJjZSxcclxuICAgICAgdm90ZTogdm90ZURhdGFTb3VyY2UsXHJcbiAgICAgIG1vdmllOiBtb3ZpZURhdGFTb3VyY2UsXHJcbiAgICAgIGNhY2hlOiBjYWNoZURhdGFTb3VyY2UsXHJcbiAgICAgIHJlYWx0aW1lOiByZWFsdGltZURhdGFTb3VyY2UsXHJcbiAgICAgIG1hdGNobWFraW5nOiBtYXRjaG1ha2luZ0RhdGFTb3VyY2UsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIHJlc29sdmVycyBmb3IgbWFpbiBBUElcclxuICAgKi9cclxuICBwcml2YXRlIGNyZWF0ZU1haW5BcGlSZXNvbHZlcnMocHJvcHM6IFRyaW5pdHlBcGlTdGFja1Byb3BzKTogdm9pZCB7XHJcbiAgICBjb25zdCBkYXRhU291cmNlcyA9ICh0aGlzIGFzIGFueSkuZGF0YVNvdXJjZXM7XHJcblxyXG4gICAgLy8gUXVlcnkgcmVzb2x2ZXJzXHJcbiAgICBkYXRhU291cmNlcy5tb3ZpZS5jcmVhdGVSZXNvbHZlcignR2V0QXZhaWxhYmxlR2VucmVzUmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnUXVlcnknLFxyXG4gICAgICBmaWVsZE5hbWU6ICdnZXRBdmFpbGFibGVHZW5yZXMnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgZGF0YVNvdXJjZXMubW92aWUuY3JlYXRlUmVzb2x2ZXIoJ0dldEZpbHRlcmVkQ29udGVudFJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ1F1ZXJ5JyxcclxuICAgICAgZmllbGROYW1lOiAnZ2V0RmlsdGVyZWRDb250ZW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLnJvb20uY3JlYXRlUmVzb2x2ZXIoJ0dldE1vdmllRGV0YWlsc1Jlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ1F1ZXJ5JyxcclxuICAgICAgZmllbGROYW1lOiAnZ2V0TW92aWVEZXRhaWxzJyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLnJvb20uY3JlYXRlUmVzb2x2ZXIoJ0dldE15SGlzdG9yeVJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ1F1ZXJ5JyxcclxuICAgICAgZmllbGROYW1lOiAnZ2V0TXlIaXN0b3J5JyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLnJvb20uY3JlYXRlUmVzb2x2ZXIoJ0dldFJvb21SZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdRdWVyeScsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2dldFJvb20nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgZGF0YVNvdXJjZXMuYXV0aC5jcmVhdGVSZXNvbHZlcignR2V0Um9vbU1lbWJlcnNSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdRdWVyeScsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2dldFJvb21NZW1iZXJzJyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLnJvb20uY3JlYXRlUmVzb2x2ZXIoJ0dldFJvb21Wb3Rlc1Jlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ1F1ZXJ5JyxcclxuICAgICAgZmllbGROYW1lOiAnZ2V0Um9vbVZvdGVzJyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLm1vdmllLmNyZWF0ZVJlc29sdmVyKCdHZXRVc2VyUmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnUXVlcnknLFxyXG4gICAgICBmaWVsZE5hbWU6ICdnZXRVc2VyJyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLnJvb20uY3JlYXRlUmVzb2x2ZXIoJ0dldFVzZXJSb29tc1Jlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ1F1ZXJ5JyxcclxuICAgICAgZmllbGROYW1lOiAnZ2V0VXNlclJvb21zJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEluZGl2aWR1YWwgdm90aW5nIHN5c3RlbSBxdWVyaWVzXHJcbiAgICBkYXRhU291cmNlcy5tb3ZpZS5jcmVhdGVSZXNvbHZlcignR2V0TmV4dE1vdmllRm9yVXNlclJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ1F1ZXJ5JyxcclxuICAgICAgZmllbGROYW1lOiAnZ2V0TmV4dE1vdmllRm9yVXNlcicsXHJcbiAgICB9KTtcclxuXHJcbiAgICBkYXRhU291cmNlcy52b3RlLmNyZWF0ZVJlc29sdmVyKCdHZXRVc2VyVm90aW5nUHJvZ3Jlc3NSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdRdWVyeScsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2dldFVzZXJWb3RpbmdQcm9ncmVzcycsXHJcbiAgICB9KTtcclxuXHJcbiAgICBkYXRhU291cmNlcy5jYWNoZS5jcmVhdGVSZXNvbHZlcignQ2hlY2tNYXRjaEJlZm9yZUFjdGlvblJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ1F1ZXJ5JyxcclxuICAgICAgZmllbGROYW1lOiAnY2hlY2tNYXRjaEJlZm9yZUFjdGlvbicsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBNdXRhdGlvbiByZXNvbHZlcnNcclxuICAgIGRhdGFTb3VyY2VzLnZvdGUuY3JlYXRlUmVzb2x2ZXIoJ0Nvbm5lY3RSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2Nvbm5lY3QnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgZGF0YVNvdXJjZXMuYXV0aC5jcmVhdGVSZXNvbHZlcignQ3JlYXRlUm9vbVJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAnY3JlYXRlUm9vbScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBkYXRhU291cmNlcy5yb29tLmNyZWF0ZVJlc29sdmVyKCdDcmVhdGVSb29tRGVidWdSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2NyZWF0ZVJvb21EZWJ1ZycsXHJcbiAgICB9KTtcclxuXHJcbiAgICBkYXRhU291cmNlcy5yb29tLmNyZWF0ZVJlc29sdmVyKCdDcmVhdGVSb29tU2ltcGxlUmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnTXV0YXRpb24nLFxyXG4gICAgICBmaWVsZE5hbWU6ICdjcmVhdGVSb29tU2ltcGxlJyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLmF1dGguY3JlYXRlUmVzb2x2ZXIoJ0NyZWF0ZVVzZXJSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2NyZWF0ZVVzZXInLFxyXG4gICAgfSk7XHJcblxyXG4gICAgZGF0YVNvdXJjZXMucmVhbHRpbWUuY3JlYXRlUmVzb2x2ZXIoJ0Rpc2Nvbm5lY3RSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2Rpc2Nvbm5lY3QnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgZGF0YVNvdXJjZXMucm9vbS5jcmVhdGVSZXNvbHZlcignSm9pblJvb21CeUludml0ZVJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAnam9pblJvb21CeUludml0ZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBkYXRhU291cmNlcy5yb29tLmNyZWF0ZVJlc29sdmVyKCdMZWF2ZVJvb21SZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2xlYXZlUm9vbScsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBSZWFsLXRpbWUgZXZlbnQgcHVibGlzaGluZyBtdXRhdGlvbnNcclxuICAgIGRhdGFTb3VyY2VzLnJlYWx0aW1lLmNyZWF0ZVJlc29sdmVyKCdQdWJsaXNoQ2hhdEV2ZW50UmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnTXV0YXRpb24nLFxyXG4gICAgICBmaWVsZE5hbWU6ICdwdWJsaXNoQ2hhdEV2ZW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLnJlYWx0aW1lLmNyZWF0ZVJlc29sdmVyKCdQdWJsaXNoQ29ubmVjdGlvblN0YXR1c0V2ZW50UmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnTXV0YXRpb24nLFxyXG4gICAgICBmaWVsZE5hbWU6ICdwdWJsaXNoQ29ubmVjdGlvblN0YXR1c0V2ZW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLnJlYWx0aW1lLmNyZWF0ZVJlc29sdmVyKCdQdWJsaXNoTWF0Y2hFdmVudFJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAncHVibGlzaE1hdGNoRXZlbnQnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgZGF0YVNvdXJjZXMucmVhbHRpbWUuY3JlYXRlUmVzb2x2ZXIoJ1B1Ymxpc2hNYXRjaEZvdW5kRXZlbnRSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3B1Ymxpc2hNYXRjaEZvdW5kRXZlbnQnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgZGF0YVNvdXJjZXMucmVhbHRpbWUuY3JlYXRlUmVzb2x2ZXIoJ1B1Ymxpc2hNZW1iZXJFdmVudFJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAncHVibGlzaE1lbWJlckV2ZW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLnJlYWx0aW1lLmNyZWF0ZVJlc29sdmVyKCdQdWJsaXNoTW9kZXJhdGlvbkV2ZW50UmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnTXV0YXRpb24nLFxyXG4gICAgICBmaWVsZE5hbWU6ICdwdWJsaXNoTW9kZXJhdGlvbkV2ZW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLnJlYWx0aW1lLmNyZWF0ZVJlc29sdmVyKCdQdWJsaXNoUm9sZUV2ZW50UmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnTXV0YXRpb24nLFxyXG4gICAgICBmaWVsZE5hbWU6ICdwdWJsaXNoUm9sZUV2ZW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLnJlYWx0aW1lLmNyZWF0ZVJlc29sdmVyKCdQdWJsaXNoUm9vbUV2ZW50UmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnTXV0YXRpb24nLFxyXG4gICAgICBmaWVsZE5hbWU6ICdwdWJsaXNoUm9vbUV2ZW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLnJlYWx0aW1lLmNyZWF0ZVJlc29sdmVyKCdQdWJsaXNoUm9vbVN0YXRlRXZlbnRSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3B1Ymxpc2hSb29tU3RhdGVFdmVudCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBkYXRhU291cmNlcy5yZWFsdGltZS5jcmVhdGVSZXNvbHZlcignUHVibGlzaFNjaGVkdWxlRXZlbnRSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3B1Ymxpc2hTY2hlZHVsZUV2ZW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLnJlYWx0aW1lLmNyZWF0ZVJlc29sdmVyKCdQdWJsaXNoU2V0dGluZ3NFdmVudFJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAncHVibGlzaFNldHRpbmdzRXZlbnQnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgZGF0YVNvdXJjZXMucmVhbHRpbWUuY3JlYXRlUmVzb2x2ZXIoJ1B1Ymxpc2hTdWdnZXN0aW9uRXZlbnRSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3B1Ymxpc2hTdWdnZXN0aW9uRXZlbnQnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgZGF0YVNvdXJjZXMucmVhbHRpbWUuY3JlYXRlUmVzb2x2ZXIoJ1B1Ymxpc2hUaGVtZUV2ZW50UmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnTXV0YXRpb24nLFxyXG4gICAgICBmaWVsZE5hbWU6ICdwdWJsaXNoVGhlbWVFdmVudCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBkYXRhU291cmNlcy5yZWFsdGltZS5jcmVhdGVSZXNvbHZlcignUHVibGlzaFZvdGVFdmVudFJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAncHVibGlzaFZvdGVFdmVudCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBkYXRhU291cmNlcy5yZWFsdGltZS5jcmVhdGVSZXNvbHZlcignUHVibGlzaFZvdGVVcGRhdGVFdmVudFJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAncHVibGlzaFZvdGVVcGRhdGVFdmVudCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBkYXRhU291cmNlcy5yb29tLmNyZWF0ZVJlc29sdmVyKCdTdGFydFZvdGluZ1Jlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAnc3RhcnRWb3RpbmcnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgZGF0YVNvdXJjZXMucm9vbS5jcmVhdGVSZXNvbHZlcignVXBkYXRlUm9vbUZpbHRlcnNSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3VwZGF0ZVJvb21GaWx0ZXJzJyxcclxuICAgIH0pO1xyXG5cclxuICAgIGRhdGFTb3VyY2VzLmF1dGguY3JlYXRlUmVzb2x2ZXIoJ1VwZGF0ZVVzZXJSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3VwZGF0ZVVzZXInLFxyXG4gICAgfSk7XHJcblxyXG4gICAgZGF0YVNvdXJjZXMudm90ZS5jcmVhdGVSZXNvbHZlcignVm90ZVJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAndm90ZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBTcGVjaWFsIHJlc29sdmVycyB3aXRoIGN1c3RvbSBKYXZhU2NyaXB0IGNvZGUgKG1hdGNoaW5nIGV4aXN0aW5nIHJlc29sdmVycylcclxuICAgIHRoaXMuY3JlYXRlQ3VzdG9tUmVzb2x2ZXJzKHByb3BzKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBjdXN0b20gcmVzb2x2ZXJzIHdpdGggSmF2YVNjcmlwdCBjb2RlIChtYXRjaGluZyBleGlzdGluZyByZXNvbHZlciBmaWxlcylcclxuICAgKi9cclxuICBwcml2YXRlIGNyZWF0ZUN1c3RvbVJlc29sdmVycyhwcm9wczogVHJpbml0eUFwaVN0YWNrUHJvcHMpOiB2b2lkIHtcclxuICAgIGNvbnN0IGRhdGFTb3VyY2VzID0gKHRoaXMgYXMgYW55KS5kYXRhU291cmNlcztcclxuXHJcbiAgICAvLyBMb2FkIHJlc29sdmVyIGNvZGUgZnJvbSBmaWxlc1xyXG4gICAgY29uc3Qgdm90ZUZvck1vdmllQ29kZSA9IGZzLnJlYWRGaWxlU3luYyhcclxuICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uLy4uL2FwaS9yZXNvbHZlcnMvdm90ZUZvck1vdmllLmpzJyksXHJcbiAgICAgICd1dGY4J1xyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBwdWJsaXNoQ29uc2Vuc3VzUmVhY2hlZENvZGUgPSBmcy5yZWFkRmlsZVN5bmMoXHJcbiAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9hcGkvcmVzb2x2ZXJzL3B1Ymxpc2hDb25zZW5zdXNSZWFjaGVkLmpzJyksXHJcbiAgICAgICd1dGY4J1xyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBvblZvdGVVcGRhdGVDb2RlID0gZnMucmVhZEZpbGVTeW5jKFxyXG4gICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vLi4vYXBpL3Jlc29sdmVycy9vblZvdGVVcGRhdGUuanMnKSxcclxuICAgICAgJ3V0ZjgnXHJcbiAgICApO1xyXG5cclxuICAgIC8vIFZvdGVGb3JNb3ZpZSByZXNvbHZlciAodXNlcyBEeW5hbW9EQiBkaXJlY3RseSBmb3IgdHJhbnNhY3Rpb25zKVxyXG4gICAgZGF0YVNvdXJjZXMubWF0Y2htYWtpbmcuY3JlYXRlUmVzb2x2ZXIoJ1ZvdGVGb3JNb3ZpZVJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAndm90ZUZvck1vdmllJyxcclxuICAgICAgY29kZTogYXBwc3luYy5Db2RlLmZyb21JbmxpbmUodm90ZUZvck1vdmllQ29kZSksXHJcbiAgICAgIHJ1bnRpbWU6IGFwcHN5bmMuRnVuY3Rpb25SdW50aW1lLkpTXzFfMF8wLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUHVibGlzaENvbnNlbnN1c1JlYWNoZWQgcmVzb2x2ZXIgKElBTSBwcm90ZWN0ZWQpXHJcbiAgICBkYXRhU291cmNlcy5tYXRjaG1ha2luZy5jcmVhdGVSZXNvbHZlcignUHVibGlzaENvbnNlbnN1c1JlYWNoZWRSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3B1Ymxpc2hDb25zZW5zdXNSZWFjaGVkJyxcclxuICAgICAgY29kZTogYXBwc3luYy5Db2RlLmZyb21JbmxpbmUocHVibGlzaENvbnNlbnN1c1JlYWNoZWRDb2RlKSxcclxuICAgICAgcnVudGltZTogYXBwc3luYy5GdW5jdGlvblJ1bnRpbWUuSlNfMV8wXzAsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBPblZvdGVVcGRhdGUgc3Vic2NyaXB0aW9uIHJlc29sdmVyICh3aXRoIGZpbHRlcmluZylcclxuICAgIHRoaXMubWFpbkFwaS5jcmVhdGVSZXNvbHZlcignT25Wb3RlVXBkYXRlUmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnU3Vic2NyaXB0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAnb25Wb3RlVXBkYXRlJyxcclxuICAgICAgY29kZTogYXBwc3luYy5Db2RlLmZyb21JbmxpbmUob25Wb3RlVXBkYXRlQ29kZSksXHJcbiAgICAgIHJ1bnRpbWU6IGFwcHN5bmMuRnVuY3Rpb25SdW50aW1lLkpTXzFfMF8wLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDcmVhdGUgZGF0YSBzb3VyY2VzIGZvciByZWFsLXRpbWUgQVBJXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBjcmVhdGVSZWFsdGltZUFwaURhdGFTb3VyY2VzKHByb3BzOiBUcmluaXR5QXBpU3RhY2tQcm9wcyk6IHZvaWQge1xyXG4gICAgLy8gTGFtYmRhIGRhdGEgc291cmNlIGZvciByZWFsLXRpbWUgb3BlcmF0aW9uc1xyXG4gICAgY29uc3QgcmVhbHRpbWVEYXRhU291cmNlID0gdGhpcy5yZWFsdGltZUFwaS5hZGRMYW1iZGFEYXRhU291cmNlKCdSZWFsdGltZURhdGFTb3VyY2UnLCBwcm9wcy5sYW1iZGFGdW5jdGlvbnMucmVhbHRpbWUsIHtcclxuICAgICAgZGVzY3JpcHRpb246ICdSZWFsLXRpbWUgb3BlcmF0aW9ucyBhbmQgcm9vbSBzdGF0dXMnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gU3RvcmUgZGF0YSBzb3VyY2UgZm9yIHJlc29sdmVyIGNyZWF0aW9uXHJcbiAgICAodGhpcyBhcyBhbnkpLnJlYWx0aW1lRGF0YVNvdXJjZXMgPSB7XHJcbiAgICAgIHJlYWx0aW1lOiByZWFsdGltZURhdGFTb3VyY2UsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIHJlc29sdmVycyBmb3IgcmVhbC10aW1lIEFQSVxyXG4gICAqL1xyXG4gIHByaXZhdGUgY3JlYXRlUmVhbHRpbWVBcGlSZXNvbHZlcnMocHJvcHM6IFRyaW5pdHlBcGlTdGFja1Byb3BzKTogdm9pZCB7XHJcbiAgICBjb25zdCBkYXRhU291cmNlcyA9ICh0aGlzIGFzIGFueSkucmVhbHRpbWVEYXRhU291cmNlcztcclxuXHJcbiAgICAvLyBRdWVyeSByZXNvbHZlcnNcclxuICAgIGRhdGFTb3VyY2VzLnJlYWx0aW1lLmNyZWF0ZVJlc29sdmVyKCdHZXRSb29tU3RhdHVzUmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnUXVlcnknLFxyXG4gICAgICBmaWVsZE5hbWU6ICdnZXRSb29tU3RhdHVzJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE11dGF0aW9uIHJlc29sdmVyc1xyXG4gICAgZGF0YVNvdXJjZXMucmVhbHRpbWUuY3JlYXRlUmVzb2x2ZXIoJ1VwZGF0ZVJvb21TdGF0dXNSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3VwZGF0ZVJvb21TdGF0dXMnLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHcmFudCBMYW1iZGEgZnVuY3Rpb25zIGFjY2VzcyB0byBpbnZva2UgQXBwU3luYyBBUElzXHJcbiAgICogUkVNT1ZFRDogVGhpcyBtZXRob2QgY3JlYXRlZCBhIGNpcmN1bGFyIGRlcGVuZGVuY3kgYmV0d2VlbiBBUEkgYW5kIExhbWJkYSBzdGFja3NcclxuICAgKiBBcHBTeW5jIGNhbGxzIExhbWJkYSBmdW5jdGlvbnMsIG5vdCB0aGUgb3RoZXIgd2F5IGFyb3VuZCwgc28gdGhpcyBwZXJtaXNzaW9uIGlzIG5vdCBuZWVkZWRcclxuICAgKi9cclxuICAvLyBwcml2YXRlIGdyYW50TGFtYmRhQXBwU3luY0FjY2Vzcyhwcm9wczogVHJpbml0eUFwaVN0YWNrUHJvcHMpOiB2b2lkIHtcclxuICAvLyAgIC8vIENyZWF0ZSBJQU0gcG9saWN5IGZvciBBcHBTeW5jIGFjY2Vzc1xyXG4gIC8vICAgY29uc3QgYXBwU3luY1BvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAvLyAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxyXG4gIC8vICAgICBhY3Rpb25zOiBbXHJcbiAgLy8gICAgICAgJ2FwcHN5bmM6R3JhcGhRTCcsXHJcbiAgLy8gICAgICAgJ2FwcHN5bmM6R2V0R3JhcGhxbEFwaScsXHJcbiAgLy8gICAgICAgJ2FwcHN5bmM6TGlzdEdyYXBocWxBcGlzJyxcclxuICAvLyAgICAgXSxcclxuICAvLyAgICAgcmVzb3VyY2VzOiBbXHJcbiAgLy8gICAgICAgdGhpcy5tYWluQXBpLmFybixcclxuICAvLyAgICAgICB0aGlzLnJlYWx0aW1lQXBpLmFybixcclxuICAvLyAgICAgICBgJHt0aGlzLm1haW5BcGkuYXJufS8qYCxcclxuICAvLyAgICAgICBgJHt0aGlzLnJlYWx0aW1lQXBpLmFybn0vKmAsXHJcbiAgLy8gICAgIF0sXHJcbiAgLy8gICB9KTtcclxuXHJcbiAgLy8gICAvLyBHcmFudCBhY2Nlc3MgdG8gYWxsIExhbWJkYSBmdW5jdGlvbnNcclxuICAvLyAgIE9iamVjdC52YWx1ZXMocHJvcHMubGFtYmRhRnVuY3Rpb25zKS5mb3JFYWNoKGxhbWJkYUZ1bmN0aW9uID0+IHtcclxuICAvLyAgICAgbGFtYmRhRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KGFwcFN5bmNQb2xpY3kpO1xyXG4gIC8vICAgfSk7XHJcbiAgLy8gfVxyXG59Il19