/**
 * WebSocket Infrastructure Module
 * Provides WebSocket and Redis pub/sub services
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebSocketGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { RedisService } from './redis.service';

@Module({
  imports: [ConfigModule],
  providers: [
    RedisService,
    {
      provide: 'IRedisService',
      useClass: RedisService,
    },
    WebSocketService,
    {
      provide: 'IWebSocketManager',
      useClass: WebSocketService,
    },
    WebSocketGateway,
  ],
  exports: [
    'IRedisService',
    'IWebSocketManager',
    RedisService,
    WebSocketService,
    WebSocketGateway,
  ],
})
export class WebSocketModule {}