#!/usr/bin/env node
/**
 * Test script for API and Cognito stacks validation
 * This validates the CDK constructs without bundling Lambda functions
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { TrinityApiStack } from './lib/trinity-api-stack';
import { TrinityCognitoStack } from './lib/trinity-cognito-stack';
import { getEnvironmentConfig } from './config/environments';

const app = new cdk.App();

// Get environment configuration
const environment = 'dev';
const config = getEnvironmentConfig(environment);

// Environment configuration
const defaultEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region,
};

// Test Cognito Stack
const cognitoStack = new TrinityCognitoStack(app, 'TestTrinityCognitoStack', {
  env: defaultEnv,
  description: 'Test Trinity - Cognito User Pool and Authentication',
  config,
});

// Create mock User Pool from the Cognito stack
const mockUserPool = cognitoStack.getUserPool();

// Create mock tables for testing (within a stack context)
const mockTables: Record<string, dynamodb.ITable> = {
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
const mockLambdaFunctions: Record<string, lambda.IFunction> = {
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
  const apiStack = new TrinityApiStack(app, 'TestTrinityApiStack', {
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
} catch (error) {
  console.error('❌ Error creating API stack:', error instanceof Error ? error.message : String(error));
  console.log('✅ Cognito stack created successfully');
  console.log('📊 Cognito Stack constructs:', Object.keys(cognitoStack.node.children).length);
}