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
export declare class TrinityDatabaseStack extends cdk.Stack {
    readonly tables: {
        [key: string]: dynamodb.Table;
    };
    constructor(scope: Construct, id: string, props: TrinityDatabaseStackProps);
    private createUsersTable;
    private createRoomsTable;
    private createRoomMembersTable;
    private createRoomInvitesTable;
    private createVotesTable;
    private createMoviesCacheTable;
    private createRoomMatchesTable;
    private createConnectionsTable;
    private createRoomMovieCacheTable;
    private createRoomCacheMetadataTable;
    private createMatchmakingTable;
    private createFilterCacheTable;
}
export {};
