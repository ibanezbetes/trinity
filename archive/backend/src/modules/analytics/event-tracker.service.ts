import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import {
  AnalyticsEvent,
  EventType,
  EventContext,
} from './interfaces/analytics.interfaces';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EventTracker {
  private readonly logger = new Logger(EventTracker.name);
  private readonly ANALYTICS_EVENTS_TABLE: string;

  constructor(
    private readonly multiTableService: MultiTableService,
    private readonly configService: ConfigService,
  ) {
    // NOTA: trinity-analytics-dev fue eliminada durante optimización de tablas
    // Este servicio está deshabilitado hasta que se implemente una nueva solución de analytics
    this.ANALYTICS_EVENTS_TABLE = this.configService.get('ANALYTICS_TABLE', 'trinity-analytics-dev-DISABLED');
  }

  /**
   * 📝 Track a single analytics event
   */
  async trackEvent(event: Partial<AnalyticsEvent>): Promise<void> {
    try {
      const fullEvent: AnalyticsEvent = {
        eventId: event.eventId || uuidv4(),
        eventType: event.eventType!,
        timestamp: event.timestamp || new Date(),
        userId: event.userId,
        roomId: event.roomId,
        sessionId: event.sessionId || this.generateSessionId(),
        properties: event.properties || {},
        context: event.context || {},
        processed: false,
        ttl: this.calculateTTL(event.eventType || EventType.USER_LOGIN),
      };

      // Store event in analytics events table
      await this.storeEvent(fullEvent);

      this.logger.log(
        `📝 Event tracked: ${fullEvent.eventType} for ${fullEvent.userId || 'anonymous'}`,
      );
    } catch (error) {
      this.logger.error('❌ Error tracking event:', error);
      // Don't throw - analytics failures shouldn't break main functionality
    }
  }

  /**
   * 👤 Track user action events
   */
  async trackUserAction(
    userId: string,
    actionType: EventType,
    properties: Record<string, any> = {},
    context: EventContext = {},
  ): Promise<void> {
    await this.trackEvent({
      eventType: actionType,
      userId,
      properties: {
        ...properties,
        actionCategory: 'user_action',
      },
      context,
    });
  }

  /**
   * 🏠 Track room-related events
   */
  async trackRoomEvent(
    roomId: string,
    eventType: EventType,
    userId?: string,
    properties: Record<string, any> = {},
    context: EventContext = {},
  ): Promise<void> {
    await this.trackEvent({
      eventType,
      userId,
      roomId,
      properties: {
        ...properties,
        eventCategory: 'room_event',
      },
      context,
    });
  }

  /**
   * 🎬 Track content interaction events
   */
  async trackContentInteraction(
    userId: string,
    roomId: string,
    contentId: string,
    interactionType: 'vote' | 'view' | 'match',
    properties: Record<string, any> = {},
    context: EventContext = {},
  ): Promise<void> {
    const eventType = this.mapContentInteractionToEventType(interactionType);

    await this.trackEvent({
      eventType,
      userId,
      roomId,
      properties: {
        ...properties,
        contentId,
        interactionType,
        eventCategory: 'content_interaction',
      },
      context,
    });
  }

  /**
   * 🤖 Track AI-related events
   */
  async trackAIEvent(
    userId: string,
    aiEventType:
      | 'recommendation_requested'
      | 'recommendation_accepted'
      | 'recommendation_rejected',
    properties: Record<string, any> = {},
    context: EventContext = {},
  ): Promise<void> {
    const eventType =
      aiEventType === 'recommendation_requested'
        ? EventType.AI_RECOMMENDATION_REQUESTED
        : EventType.AI_RECOMMENDATION_ACCEPTED;

    await this.trackEvent({
      eventType,
      userId,
      properties: {
        ...properties,
        aiEventType,
        eventCategory: 'ai_interaction',
      },
      context,
    });
  }

  /**
   * ⚡ Track system performance events
   */
  async trackSystemEvent(
    eventType: EventType,
    properties: Record<string, any> = {},
    context: EventContext = {},
  ): Promise<void> {
    await this.trackEvent({
      eventType,
      properties: {
        ...properties,
        eventCategory: 'system_event',
      },
      context,
    });
  }

  /**
   * 📊 Batch track multiple events for efficiency
   */
  async batchTrackEvents(events: Partial<AnalyticsEvent>[]): Promise<void> {
    try {
      const fullEvents = events.map((event) => ({
        eventId: event.eventId || uuidv4(),
        eventType: event.eventType!,
        timestamp: event.timestamp || new Date(),
        userId: event.userId,
        roomId: event.roomId,
        sessionId: event.sessionId || this.generateSessionId(),
        properties: event.properties || {},
        context: event.context || {},
        processed: false,
        ttl: this.calculateTTL(event.eventType!),
      }));

      // Store all events in batch
      await this.storeBatchEvents(fullEvents);

      this.logger.log(`📊 Batch tracked ${fullEvents.length} events`);
    } catch (error) {
      this.logger.error('❌ Error batch tracking events:', error);
      // Don't throw - analytics failures shouldn't break main functionality
    }
  }

  /**
   * 🔍 Get events for analysis (with pagination)
   */
  async getEvents(
    filters: {
      eventType?: EventType;
      userId?: string;
      roomId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    limit: number = 100,
    lastEvaluatedKey?: any,
  ): Promise<{
    events: AnalyticsEvent[];
    lastEvaluatedKey?: any;
    count: number;
  }> {
    try {
      // Mock implementation - in real scenario, query DynamoDB with filters
      const mockEvents: AnalyticsEvent[] = [];

      return {
        events: mockEvents,
        lastEvaluatedKey: undefined,
        count: mockEvents.length,
      };
    } catch (error) {
      this.logger.error('❌ Error retrieving events:', error);
      throw new Error('Failed to retrieve events');
    }
  }

  // Private helper methods

  private async storeEvent(event: AnalyticsEvent): Promise<void> {
    try {
      // DESHABILITADO: trinity-analytics-dev fue eliminada durante optimización
      // TODO: Implementar nueva solución de analytics si es necesaria
      this.logger.warn('⚠️ Analytics storage disabled - table was removed during optimization');
      return;
      
      // Store event in DynamoDB using MultiTableService
      // await this.multiTableService.putItem(this.ANALYTICS_EVENTS_TABLE, event);
    } catch (error) {
      this.logger.error('❌ Error storing event:', error);
      // Don't throw - analytics failures shouldn't break main functionality
      // Just log the error and continue
    }
  }

  private async storeBatchEvents(events: AnalyticsEvent[]): Promise<void> {
    try {
      // DESHABILITADO: trinity-analytics-dev fue eliminada durante optimización
      // TODO: Implementar nueva solución de analytics si es necesaria
      this.logger.warn('⚠️ Analytics batch storage disabled - table was removed during optimization');
      return;
      
      // Store batch events in DynamoDB using MultiTableService
      // await this.multiTableService.batchWriteItems(
      //   this.ANALYTICS_EVENTS_TABLE,
      //   events,
      // );
    } catch (error) {
      this.logger.error('❌ Error storing batch events:', error);
      // Don't throw - analytics failures shouldn't break main functionality
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateTTL(eventType: EventType): number {
    // Set TTL based on event type (in seconds from now)
    const now = Math.floor(Date.now() / 1000);

    switch (eventType) {
      case EventType.API_REQUEST:
      case EventType.PERFORMANCE_METRIC:
        return now + 7 * 24 * 60 * 60; // 7 days

      case EventType.USER_LOGIN:
      case EventType.USER_LOGOUT:
      case EventType.CONTENT_VOTED:
        return now + 90 * 24 * 60 * 60; // 90 days

      case EventType.ROOM_CREATED:
      case EventType.MATCH_FOUND:
        return now + 365 * 24 * 60 * 60; // 1 year

      default:
        return now + 30 * 24 * 60 * 60; // 30 days default
    }
  }

  private mapContentInteractionToEventType(interactionType: string): EventType {
    switch (interactionType) {
      case 'vote':
        return EventType.CONTENT_VOTED;
      case 'match':
        return EventType.MATCH_FOUND;
      default:
        return EventType.API_REQUEST; // Fallback
    }
  }

  /**
   * 🧹 Clean up processed events (called by cron job)
   */
  async cleanupProcessedEvents(): Promise<number> {
    try {
      // Mock implementation - in real scenario, delete processed events older than TTL
      const deletedCount = 0;

      this.logger.log(`🧹 Cleaned up ${deletedCount} processed events`);
      return deletedCount;
    } catch (error) {
      this.logger.error('❌ Error cleaning up events:', error);
      return 0;
    }
  }

  /**
   * 📈 Get event statistics
   */
  async getEventStatistics(timeRange?: {
    startDate: Date;
    endDate: Date;
  }): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsPerHour: number;
    processingRate: number;
  }> {
    try {
      // Mock implementation
      return {
        totalEvents: 15420,
        eventsByType: {
          [EventType.CONTENT_VOTED]: 5200,
          [EventType.ROOM_JOINED]: 2100,
          [EventType.USER_LOGIN]: 1800,
          [EventType.MATCH_FOUND]: 850,
          [EventType.AI_RECOMMENDATION_REQUESTED]: 650,
        },
        eventsPerHour: 642,
        processingRate: 0.98, // 98% processing rate
      };
    } catch (error) {
      this.logger.error('❌ Error getting event statistics:', error);
      throw new Error('Failed to get event statistics');
    }
  }
}
