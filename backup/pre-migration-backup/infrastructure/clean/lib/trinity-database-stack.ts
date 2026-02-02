/**
 * Trinity Database Stack
 * Defines all 12 DynamoDB tables matching existing AWS infrastructure
 * Prepared for CDK import with RemovalPolicy.RETAIN for data protection
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from '../config/environments';

interface TrinityDatabaseStackProps extends cdk.StackProps {
  config: TrinityEnvironmentConfig;
}

export class TrinityDatabaseStack extends cdk.Stack {
  public readonly tables: { [key: string]: dynamodb.Table } = {};

  constructor(scope: Construct, id: string, props: TrinityDatabaseStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Create all 12 DynamoDB tables matching existing schemas exactly
    this.createUsersTable(config);
    this.createRoomsTable(config);
    this.createRoomMembersTable(config);
    this.createRoomInvitesTable(config);
    this.createVotesTable(config);
    this.createMoviesCacheTable(config);
    this.createRoomMatchesTable(config);
    this.createConnectionsTable(config);
    this.createRoomMovieCacheTable(config);
    this.createRoomCacheMetadataTable(config);
    this.createMatchmakingTable(config);
    this.createFilterCacheTable(config);

    // Add stack-level tags
    cdk.Tags.of(this).add('Project', 'Trinity');
    cdk.Tags.of(this).add('Environment', config.environment);
    cdk.Tags.of(this).add('Stack', 'Database');
  }

  private createUsersTable(config: TrinityEnvironmentConfig): void {
    this.tables.users = new dynamodb.Table(this, 'trinity-users-dev', {
      tableName: 'trinity-users-dev',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: config.dynamodb.encryption ? dynamodb.TableEncryption.AWS_MANAGED : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: Protect existing data
    });
  }

  private createRoomsTable(config: TrinityEnvironmentConfig): void {
    this.tables.rooms = new dynamodb.Table(this, 'trinity-rooms-dev-v2', {
      tableName: 'trinity-rooms-dev-v2',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: config.dynamodb.encryption ? dynamodb.TableEncryption.AWS_MANAGED : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: Protect existing data
    });

    // Add InviteCodeIndex GSI
    this.tables.rooms.addGlobalSecondaryIndex({
      indexName: 'InviteCodeIndex',
      partitionKey: { name: 'inviteCode', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }

  private createRoomMembersTable(config: TrinityEnvironmentConfig): void {
    this.tables.roomMembers = new dynamodb.Table(this, 'trinity-room-members-dev', {
      tableName: 'trinity-room-members-dev',
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: config.dynamodb.encryption ? dynamodb.TableEncryption.AWS_MANAGED : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: Protect existing data
    });

    // Add UserHistoryIndex GSI
    this.tables.roomMembers.addGlobalSecondaryIndex({
      indexName: 'UserHistoryIndex',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }

  private createRoomInvitesTable(config: TrinityEnvironmentConfig): void {
    this.tables.roomInvites = new dynamodb.Table(this, 'trinity-room-invites-dev-v2', {
      tableName: 'trinity-room-invites-dev-v2',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: config.dynamodb.encryption ? dynamodb.TableEncryption.AWS_MANAGED : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: Protect existing data
    });
  }

  private createVotesTable(config: TrinityEnvironmentConfig): void {
    this.tables.votes = new dynamodb.Table(this, 'trinity-votes-dev', {
      tableName: 'trinity-votes-dev',
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId#movieId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: config.dynamodb.encryption ? dynamodb.TableEncryption.AWS_MANAGED : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: Protect existing data
    });
  }

  private createMoviesCacheTable(config: TrinityEnvironmentConfig): void {
    this.tables.moviesCache = new dynamodb.Table(this, 'trinity-movies-cache-dev', {
      tableName: 'trinity-movies-cache-dev',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: config.dynamodb.encryption ? dynamodb.TableEncryption.AWS_MANAGED : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: Protect existing data
    });
  }

  private createRoomMatchesTable(config: TrinityEnvironmentConfig): void {
    this.tables.roomMatches = new dynamodb.Table(this, 'trinity-room-matches-dev', {
      tableName: 'trinity-room-matches-dev',
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'movieId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: config.dynamodb.encryption ? dynamodb.TableEncryption.AWS_MANAGED : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: Protect existing data
    });
  }

  private createConnectionsTable(config: TrinityEnvironmentConfig): void {
    this.tables.connections = new dynamodb.Table(this, 'trinity-connections-dev', {
      tableName: 'trinity-connections-dev',
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: config.dynamodb.encryption ? dynamodb.TableEncryption.AWS_MANAGED : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: Protect existing data
    });
  }

  private createRoomMovieCacheTable(config: TrinityEnvironmentConfig): void {
    this.tables.roomMovieCache = new dynamodb.Table(this, 'trinity-room-movie-cache-dev', {
      tableName: 'trinity-room-movie-cache-dev',
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sequenceIndex', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: config.dynamodb.encryption ? dynamodb.TableEncryption.AWS_MANAGED : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      timeToLiveAttribute: config.dynamodb.ttlEnabled ? config.dynamodb.ttlAttributeName : undefined,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: Protect existing data
    });

    // Add BatchIndex GSI
    this.tables.roomMovieCache.addGlobalSecondaryIndex({
      indexName: 'BatchIndex',
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'batchNumber', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add TTLIndex GSI
    this.tables.roomMovieCache.addGlobalSecondaryIndex({
      indexName: 'TTLIndex',
      partitionKey: { name: 'ttl', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });
  }

  private createRoomCacheMetadataTable(config: TrinityEnvironmentConfig): void {
    this.tables.roomCacheMetadata = new dynamodb.Table(this, 'trinity-room-cache-metadata-dev', {
      tableName: 'trinity-room-cache-metadata-dev',
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: config.dynamodb.encryption ? dynamodb.TableEncryption.AWS_MANAGED : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      timeToLiveAttribute: config.dynamodb.ttlEnabled ? config.dynamodb.ttlAttributeName : undefined,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: Protect existing data
    });

    // Add StatusIndex GSI
    this.tables.roomCacheMetadata.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add TTLCleanupIndex GSI
    this.tables.roomCacheMetadata.addGlobalSecondaryIndex({
      indexName: 'TTLCleanupIndex',
      partitionKey: { name: 'ttl', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });
  }

  private createMatchmakingTable(config: TrinityEnvironmentConfig): void {
    this.tables.matchmaking = new dynamodb.Table(this, 'trinity-matchmaking-dev', {
      tableName: 'trinity-matchmaking-dev',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: config.dynamodb.encryption ? dynamodb.TableEncryption.AWS_MANAGED : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: Protect existing data
    });

    // Add GSI1
    this.tables.matchmaking.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }

  private createFilterCacheTable(config: TrinityEnvironmentConfig): void {
    this.tables.filterCache = new dynamodb.Table(this, 'trinity-filter-cache', {
      tableName: 'trinity-filter-cache',
      partitionKey: { name: 'cacheKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: config.dynamodb.encryption ? dynamodb.TableEncryption.AWS_MANAGED : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: Protect existing data
    });
  }
}