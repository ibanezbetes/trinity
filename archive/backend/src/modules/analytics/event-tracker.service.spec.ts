import { Test, TestingModule } from '@nestjs/testing';
import { EventTracker } from './event-tracker.service';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import { EventType, AnalyticsEvent } from './interfaces/analytics.interfaces';
import * as fc from 'fast-check';

describe('EventTracker', () => {
  let service: EventTracker;
  let multiTableService: jest.Mocked<MultiTableService>;

  beforeEach(async () => {
    const mockMultiTableService = {
      putItem: jest.fn(),
      batchWriteItems: jest.fn(),
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventTracker,
        {
          provide: MultiTableService,
          useValue: mockMultiTableService,
        },
      ],
    }).compile();

    service = module.get<EventTracker>(EventTracker);
    multiTableService = module.get(MultiTableService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Property Tests - Event Tracking Completeness', () => {
    /**
     * Property 1: Event Tracking Completeness
     * Validates: Requirements 1.1, 1.3, 1.4
     *
     * Property: All tracked events should have required fields and be stored properly
     */
    it('should track all events with complete required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            eventType: fc.constantFrom(...Object.values(EventType)),
            userId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            roomId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            properties: fc.dictionary(fc.string(), fc.anything()),
            context: fc.record({
              userAgent: fc.option(fc.string()),
              ipAddress: fc.option(fc.string()),
              deviceType: fc.option(fc.string()),
              platform: fc.option(fc.string()),
              source: fc.option(fc.string()),
            }),
          }),
          async (eventData) => {
            // Act: Track the event
            await service.trackEvent(eventData);

            // Assert: Event should be stored with all required fields
            expect(multiTableService.putItem).toHaveBeenCalledWith(
              'trinity-analytics-events',
              expect.objectContaining({
                eventId: expect.any(String),
                eventType: eventData.eventType,
                timestamp: expect.any(Date),
                sessionId: expect.any(String),
                properties: expect.any(Object),
                context: expect.any(Object),
                processed: false,
                ttl: expect.any(Number),
              }),
            );

            // Property: Event ID should be unique and valid UUID format
            const storedEvent = multiTableService.putItem.mock.calls[
              multiTableService.putItem.mock.calls.length - 1
            ][1] as AnalyticsEvent;

            expect(storedEvent.eventId).toMatch(
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            );

            // Property: TTL should be set based on event type
            expect(storedEvent.ttl).toBeGreaterThan(
              Math.floor(Date.now() / 1000),
            );

            // Property: Session ID should be generated if not provided
            expect(storedEvent.sessionId).toBeTruthy();
            expect(typeof storedEvent.sessionId).toBe('string');
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 2: User Action Tracking Consistency
     * Validates: Requirements 1.1, 1.3
     *
     * Property: User actions should be tracked with consistent structure
     */
    it('should track user actions with consistent structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // userId
          fc.constantFrom(...Object.values(EventType)), // actionType
          fc.dictionary(fc.string(), fc.anything()), // properties
          fc.record({
            userAgent: fc.option(fc.string()),
            source: fc.option(fc.string()),
          }), // context
          async (userId, actionType, properties, context) => {
            // Act: Track user action
            await service.trackUserAction(
              userId,
              actionType,
              properties,
              context,
            );

            // Assert: Event should be tracked with user action category
            expect(multiTableService.putItem).toHaveBeenCalledWith(
              'trinity-analytics-events',
              expect.objectContaining({
                eventType: actionType,
                userId: userId,
                properties: expect.objectContaining({
                  ...properties,
                  actionCategory: 'user_action',
                }),
                context: expect.objectContaining(context),
              }),
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 3: Room Event Tracking Consistency
     * Validates: Requirements 2.1, 2.2, 2.7
     *
     * Property: Room events should be tracked with room context
     */
    it('should track room events with consistent room context', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.constantFrom(...Object.values(EventType)), // eventType
          fc.option(fc.string({ minLength: 1, maxLength: 50 })), // userId
          fc.dictionary(fc.string(), fc.anything()), // properties
          async (roomId, eventType, userId, properties) => {
            // Act: Track room event
            await service.trackRoomEvent(roomId, eventType, userId, properties);

            // Assert: Event should be tracked with room event category
            expect(multiTableService.putItem).toHaveBeenCalledWith(
              'trinity-analytics-events',
              expect.objectContaining({
                eventType: eventType,
                roomId: roomId,
                userId: userId,
                properties: expect.objectContaining({
                  ...properties,
                  eventCategory: 'room_event',
                }),
              }),
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 4: Content Interaction Tracking Consistency
     * Validates: Requirements 1.1, 2.1
     *
     * Property: Content interactions should be tracked with content context
     */
    it('should track content interactions with consistent content context', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // userId
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // contentId
          fc.constantFrom('vote', 'view', 'match'), // interactionType
          fc.dictionary(fc.string(), fc.anything()), // properties
          async (userId, roomId, contentId, interactionType, properties) => {
            // Act: Track content interaction
            await service.trackContentInteraction(
              userId,
              roomId,
              contentId,
              interactionType,
              properties,
            );

            // Assert: Event should be tracked with content interaction category
            expect(multiTableService.putItem).toHaveBeenCalledWith(
              'trinity-analytics-events',
              expect.objectContaining({
                userId: userId,
                roomId: roomId,
                properties: expect.objectContaining({
                  ...properties,
                  contentId: contentId,
                  interactionType: interactionType,
                  eventCategory: 'content_interaction',
                }),
              }),
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 5: Batch Event Tracking Consistency
     * Validates: Requirements 1.3, 6.1
     *
     * Property: Batch events should maintain individual event integrity
     */
    it('should maintain event integrity in batch operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              eventType: fc.constantFrom(...Object.values(EventType)),
              userId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
              roomId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
              properties: fc.dictionary(fc.string(), fc.anything()),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          async (events) => {
            // Act: Batch track events
            await service.batchTrackEvents(events);

            // Assert: All events should be processed in batch
            expect(multiTableService.batchWriteItems).toHaveBeenCalledWith(
              'trinity-analytics-events',
              expect.arrayContaining(
                events.map((event) =>
                  expect.objectContaining({
                    eventType: event.eventType,
                    userId: event.userId,
                    roomId: event.roomId,
                    properties: event.properties,
                    eventId: expect.any(String),
                    timestamp: expect.any(Date),
                    sessionId: expect.any(String),
                    processed: false,
                    ttl: expect.any(Number),
                  }),
                ),
              ),
            );

            // Property: Batch should contain exactly the same number of events
            const batchedEvents = multiTableService.batchWriteItems.mock.calls[
              multiTableService.batchWriteItems.mock.calls.length - 1
            ][1] as AnalyticsEvent[];

            expect(batchedEvents).toHaveLength(events.length);

            // Property: Each event should have unique ID
            const eventIds = batchedEvents.map((e) => e.eventId);
            const uniqueIds = new Set(eventIds);
            expect(uniqueIds.size).toBe(eventIds.length);
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Property 6: Event TTL Calculation Consistency
     * Validates: Requirements 6.2, 6.3
     *
     * Property: TTL should be calculated consistently based on event type
     */
    it('should calculate TTL consistently based on event type', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...Object.values(EventType)),
          async (eventType) => {
            // Act: Track event
            await service.trackEvent({ eventType });

            // Assert: TTL should be set appropriately
            const storedEvent = multiTableService.putItem.mock.calls[
              multiTableService.putItem.mock.calls.length - 1
            ][1] as AnalyticsEvent;

            const now = Math.floor(Date.now() / 1000);
            const ttl = storedEvent.ttl!;

            // Property: TTL should be in the future
            expect(ttl).toBeGreaterThan(now);

            // Property: TTL should be within reasonable bounds based on event type
            const maxTTL = now + 365 * 24 * 60 * 60; // 1 year max
            const minTTL = now + 7 * 24 * 60 * 60; // 7 days min

            expect(ttl).toBeLessThanOrEqual(maxTTL);
            expect(ttl).toBeGreaterThanOrEqual(minTTL);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 7: Event Statistics Consistency
     * Validates: Requirements 1.5, 5.1
     *
     * Property: Event statistics should be consistent and accurate
     */
    it('should provide consistent event statistics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            startDate: fc.date({
              min: new Date('2023-01-01'),
              max: new Date(),
            }),
            endDate: fc.date({ min: new Date('2023-01-01'), max: new Date() }),
          }),
          async (timeRange) => {
            // Ensure endDate is after startDate
            if (timeRange.endDate < timeRange.startDate) {
              [timeRange.startDate, timeRange.endDate] = [
                timeRange.endDate,
                timeRange.startDate,
              ];
            }

            // Act: Get event statistics
            const stats = await service.getEventStatistics(timeRange);

            // Assert: Statistics should have consistent structure
            expect(stats).toEqual({
              totalEvents: expect.any(Number),
              eventsByType: expect.any(Object),
              eventsPerHour: expect.any(Number),
              processingRate: expect.any(Number),
            });

            // Property: Total events should be non-negative
            expect(stats.totalEvents).toBeGreaterThanOrEqual(0);

            // Property: Events per hour should be non-negative
            expect(stats.eventsPerHour).toBeGreaterThanOrEqual(0);

            // Property: Processing rate should be between 0 and 1
            expect(stats.processingRate).toBeGreaterThanOrEqual(0);
            expect(stats.processingRate).toBeLessThanOrEqual(1);

            // Property: Events by type should sum to reasonable total
            const eventsByTypeSum = Object.values(stats.eventsByType).reduce(
              (sum, count) => sum + count,
              0,
            );
            expect(eventsByTypeSum).toBeGreaterThanOrEqual(0);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Unit Tests - Specific Event Types', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should track AI events with correct structure', async () => {
      const userId = 'user123';
      const aiEventType = 'recommendation_requested';
      const properties = { contentType: 'movie', genre: 'action' };

      await service.trackAIEvent(userId, aiEventType, properties);

      expect(multiTableService.putItem).toHaveBeenCalledWith(
        'trinity-analytics-events',
        expect.objectContaining({
          eventType: EventType.AI_RECOMMENDATION_REQUESTED,
          userId: userId,
          properties: expect.objectContaining({
            ...properties,
            aiEventType: aiEventType,
            eventCategory: 'ai_interaction',
          }),
        }),
      );
    });

    it('should track system events with correct structure', async () => {
      const eventType = EventType.PERFORMANCE_METRIC;
      const properties = { metric: 'response_time', value: 150 };

      await service.trackSystemEvent(eventType, properties);

      expect(multiTableService.putItem).toHaveBeenCalledWith(
        'trinity-analytics-events',
        expect.objectContaining({
          eventType: eventType,
          properties: expect.objectContaining({
            ...properties,
            eventCategory: 'system_event',
          }),
        }),
      );
    });

    it('should handle event tracking failures gracefully', async () => {
      multiTableService.putItem.mockRejectedValue(new Error('Database error'));

      // Should not throw error - analytics failures shouldn't break main functionality
      await expect(
        service.trackEvent({ eventType: EventType.USER_LOGIN }),
      ).resolves.not.toThrow();
    });

    it('should generate unique session IDs', async () => {
      const sessionIds = new Set();

      for (let i = 0; i < 10; i++) {
        await service.trackEvent({ eventType: EventType.USER_LOGIN });
        const storedEvent = multiTableService.putItem.mock.calls[
          i
        ][1] as AnalyticsEvent;
        sessionIds.add(storedEvent.sessionId);
      }

      // All session IDs should be unique
      expect(sessionIds.size).toBe(10);
    });
  });
});
