/**
 * Trinity API Stack - AppSync GraphQL APIs
 * Manages both main API and real-time API with exact schema matching
 * Designed for CDK import of existing resources
 */

import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from '../config/environments';
import { ParameterStoreUtils } from '../config/parameter-store';
import * as fs from 'fs';
import * as path from 'path';

export interface TrinityApiStackProps extends cdk.StackProps {
  config: TrinityEnvironmentConfig;
  userPool: cognito.IUserPool;
  tables: Record<string, dynamodb.ITable>;
  lambdaFunctions: Record<string, lambda.IFunction>;
}

export class TrinityApiStack extends cdk.Stack {
  public readonly mainApi: appsync.GraphqlApi;
  public readonly realtimeApi: appsync.GraphqlApi;

  constructor(scope: Construct, id: string, props: TrinityApiStackProps) {
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
  private createMainApiDataSources(props: TrinityApiStackProps): void {
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
    (this as any).dataSources = {
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
  private createMainApiResolvers(props: TrinityApiStackProps): void {
    const dataSources = (this as any).dataSources;

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
  private createCustomResolvers(props: TrinityApiStackProps): void {
    const dataSources = (this as any).dataSources;

    // Load resolver code from files
    const voteForMovieCode = fs.readFileSync(
      path.join(__dirname, '../../../api/resolvers/voteForMovie.js'),
      'utf8'
    );

    const publishConsensusReachedCode = fs.readFileSync(
      path.join(__dirname, '../../../api/resolvers/publishConsensusReached.js'),
      'utf8'
    );

    const onVoteUpdateCode = fs.readFileSync(
      path.join(__dirname, '../../../api/resolvers/onVoteUpdate.js'),
      'utf8'
    );

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
  private createRealtimeApiDataSources(props: TrinityApiStackProps): void {
    // Lambda data source for real-time operations
    const realtimeDataSource = this.realtimeApi.addLambdaDataSource('RealtimeDataSource', props.lambdaFunctions.realtime, {
      description: 'Real-time operations and room status',
    });

    // Store data source for resolver creation
    (this as any).realtimeDataSources = {
      realtime: realtimeDataSource,
    };
  }

  /**
   * Create resolvers for real-time API
   */
  private createRealtimeApiResolvers(props: TrinityApiStackProps): void {
    const dataSources = (this as any).realtimeDataSources;

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

  /**
   * Grant Lambda functions access to invoke AppSync APIs
   * REMOVED: This method created a circular dependency between API and Lambda stacks
   * AppSync calls Lambda functions, not the other way around, so this permission is not needed
   */
  // private grantLambdaAppSyncAccess(props: TrinityApiStackProps): void {
  //   // Create IAM policy for AppSync access
  //   const appSyncPolicy = new iam.PolicyStatement({
  //     effect: iam.Effect.ALLOW,
  //     actions: [
  //       'appsync:GraphQL',
  //       'appsync:GetGraphqlApi',
  //       'appsync:ListGraphqlApis',
  //     ],
  //     resources: [
  //       this.mainApi.arn,
  //       this.realtimeApi.arn,
  //       `${this.mainApi.arn}/*`,
  //       `${this.realtimeApi.arn}/*`,
  //     ],
  //   });

  //   // Grant access to all Lambda functions
  //   Object.values(props.lambdaFunctions).forEach(lambdaFunction => {
  //     lambdaFunction.addToRolePolicy(appSyncPolicy);
  //   });
  // }
}