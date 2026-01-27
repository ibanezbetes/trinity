/**
 * Redis Pub/Sub Service Implementation
 * Handles Redis pub/sub for multi-instance coordination
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IRedisService, RedisMessage } from './websocket.interface';

@Injectable()
export class RedisService implements IRedisService, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private publishClient: any = null;
  private subscribeClient: any = null;
  private subscribers = new Map<string, Set<(message: RedisMessage) => void>>();
  private patternSubscribers = new Map<string, Set<(message: RedisMessage) => void>>();
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    this.initializeClients();
  }

  async onModuleDestroy() {
    await this.close();
  }

  private async initializeClients() {
    try {
      // In a real implementation, you would use ioredis or redis client
      // For now, we'll create a mock implementation
      this.publishClient = this.createMockRedisClient();
      this.subscribeClient = this.createMockRedisClient();
      
      this.isConnected = true;
      this.logger.log('Redis clients initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Redis clients:', error);
      this.isConnected = false;
    }
  }

  private createMockRedisClient() {
    // Mock Redis client for testing
    // In production, this would be: new Redis(this.configService.get('REDIS_URL'))
    return {
      publish: async (channel: string, message: string) => {
        this.logger.debug(`Publishing to ${channel}: ${message}`);
        // Simulate Redis publish
        setTimeout(() => {
          this.handleMessage(channel, message);
        }, 1);
      },
      subscribe: async (channel: string) => {
        this.logger.debug(`Subscribing to ${channel}`);
      },
      psubscribe: async (pattern: string) => {
        this.logger.debug(`Pattern subscribing to ${pattern}`);
      },
      unsubscribe: async (channel: string) => {
        this.logger.debug(`Unsubscribing from ${channel}`);
      },
      punsubscribe: async (pattern: string) => {
        this.logger.debug(`Pattern unsubscribing from ${pattern}`);
      },
      quit: async () => {
        this.logger.debug('Redis client disconnected');
      },
    };
  }

  private handleMessage(channel: string, messageData: string) {
    try {
      const data = JSON.parse(messageData);
      const message: RedisMessage = {
        channel,
        data,
        timestamp: new Date(),
      };

      // Notify channel subscribers
      const channelSubscribers = this.subscribers.get(channel);
      if (channelSubscribers) {
        for (const callback of channelSubscribers) {
          try {
            callback(message);
          } catch (error) {
            this.logger.error(`Error in subscriber callback for channel ${channel}:`, error);
          }
        }
      }

      // Notify pattern subscribers
      for (const [pattern, callbacks] of this.patternSubscribers) {
        if (this.matchPattern(pattern, channel)) {
          const patternMessage = { ...message, pattern };
          for (const callback of callbacks) {
            try {
              callback(patternMessage);
            } catch (error) {
              this.logger.error(`Error in pattern subscriber callback for pattern ${pattern}:`, error);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error parsing Redis message from channel ${channel}:`, error);
    }
  }

  private matchPattern(pattern: string, channel: string): boolean {
    // Simple pattern matching (in production, use proper Redis pattern matching)
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(channel);
  }

  async publish(channel: string, data: any): Promise<void> {
    if (!this.isConnected || !this.publishClient) {
      throw new Error('Redis publish client not connected');
    }

    try {
      const message = JSON.stringify(data);
      await this.publishClient.publish(channel, message);
      this.logger.debug(`Published message to channel ${channel}`);
    } catch (error) {
      this.logger.error(`Failed to publish to channel ${channel}:`, error);
      throw error;
    }
  }

  async subscribe(channel: string, callback: (message: RedisMessage) => void): Promise<void> {
    if (!this.isConnected || !this.subscribeClient) {
      throw new Error('Redis subscribe client not connected');
    }

    try {
      if (!this.subscribers.has(channel)) {
        this.subscribers.set(channel, new Set());
        await this.subscribeClient.subscribe(channel);
      }

      this.subscribers.get(channel)!.add(callback);
      this.logger.debug(`Subscribed to channel ${channel}`);
    } catch (error) {
      this.logger.error(`Failed to subscribe to channel ${channel}:`, error);
      throw error;
    }
  }

  async psubscribe(pattern: string, callback: (message: RedisMessage) => void): Promise<void> {
    if (!this.isConnected || !this.subscribeClient) {
      throw new Error('Redis subscribe client not connected');
    }

    try {
      if (!this.patternSubscribers.has(pattern)) {
        this.patternSubscribers.set(pattern, new Set());
        await this.subscribeClient.psubscribe(pattern);
      }

      this.patternSubscribers.get(pattern)!.add(callback);
      this.logger.debug(`Pattern subscribed to ${pattern}`);
    } catch (error) {
      this.logger.error(`Failed to pattern subscribe to ${pattern}:`, error);
      throw error;
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.isConnected || !this.subscribeClient) {
      return;
    }

    try {
      const subscribers = this.subscribers.get(channel);
      if (subscribers) {
        subscribers.clear();
        this.subscribers.delete(channel);
        await this.subscribeClient.unsubscribe(channel);
        this.logger.debug(`Unsubscribed from channel ${channel}`);
      }
    } catch (error) {
      this.logger.error(`Failed to unsubscribe from channel ${channel}:`, error);
      throw error;
    }
  }

  async punsubscribe(pattern: string): Promise<void> {
    if (!this.isConnected || !this.subscribeClient) {
      return;
    }

    try {
      const subscribers = this.patternSubscribers.get(pattern);
      if (subscribers) {
        subscribers.clear();
        this.patternSubscribers.delete(pattern);
        await this.subscribeClient.punsubscribe(pattern);
        this.logger.debug(`Pattern unsubscribed from ${pattern}`);
      }
    } catch (error) {
      this.logger.error(`Failed to pattern unsubscribe from ${pattern}:`, error);
      throw error;
    }
  }

  async getStatus(): Promise<'connected' | 'disconnected' | 'connecting'> {
    return this.isConnected ? 'connected' : 'disconnected';
  }

  async close(): Promise<void> {
    try {
      if (this.publishClient) {
        await this.publishClient.quit();
      }
      if (this.subscribeClient) {
        await this.subscribeClient.quit();
      }
      
      this.subscribers.clear();
      this.patternSubscribers.clear();
      this.isConnected = false;
      
      this.logger.log('Redis clients closed successfully');
    } catch (error) {
      this.logger.error('Error closing Redis clients:', error);
    }
  }
}