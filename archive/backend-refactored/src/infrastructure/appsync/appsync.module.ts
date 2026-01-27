/**
 * AppSync Infrastructure Module
 * Provides AppSync GraphQL real-time services
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppSyncService } from './appsync.service';
import { ConnectionStoreService } from './connection-store.service';
import { AppSyncGraphQLService } from './appsync-graphql.service';
import { ConnectionResilienceService } from './connection-resilience.service';

@Module({
  imports: [ConfigModule],
  providers: [
    ConnectionStoreService,
    {
      provide: 'IConnectionStore',
      useClass: ConnectionStoreService,
    },
    AppSyncGraphQLService,
    {
      provide: 'IAppSyncGraphQL',
      useClass: AppSyncGraphQLService,
    },
    ConnectionResilienceService,
    AppSyncService,
    {
      provide: 'IAppSyncManager',
      useClass: AppSyncService,
    },
  ],
  exports: [
    'IConnectionStore',
    'IAppSyncGraphQL',
    'IAppSyncManager',
    ConnectionStoreService,
    AppSyncGraphQLService,
    ConnectionResilienceService,
    AppSyncService,
  ],
})
export class AppSyncModule {}