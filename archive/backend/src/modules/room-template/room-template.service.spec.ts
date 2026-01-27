import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as fc from 'fast-check';
import { RoomTemplateService } from './room-template.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { RoomService } from '../room/room.service';
import { EventTracker } from '../analytics/event-tracker.service';
import {
  RoomTemplate,
  TemplateCategory,
  ConsensusType,
  RoomPrivacy,
  AdvancedRoomSettings,
} from '../../domain/entities/room-template.entity';
import { CreateTemplateDto } from './dto/create-template.dto';

describe('RoomTemplateService Property Tests', () => {
  let service: RoomTemplateService;
  let dynamoDBService: jest.Mocked<DynamoDBService>;
  let roomService: jest.Mocked<RoomService>;
  let eventTracker: jest.Mocked<EventTracker>;

  beforeEach(async () => {
    const mockDynamoDBService = {
      putItem: jest.fn(),
      getItem: jest.fn(),
      query: jest.fn(),
      deleteItem: jest.fn(),
      conditionalUpdate: jest.fn(),
    };

    const mockRoomService = {
      createRoom: jest.fn(),
    };

    const mockEventTracker = {
      trackEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomTemplateService,
        { provide: DynamoDBService, useValue: mockDynamoDBService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: EventTracker, useValue: mockEventTracker },
      ],
    }).compile();

    service = module.get<RoomTemplateService>(RoomTemplateService);
    dynamoDBService = module.get(DynamoDBService);
    roomService = module.get(RoomService);
    eventTracker = module.get(EventTracker);
  });

  // Generadores para property-based testing
  const templateCategoryArb = fc.constantFrom(
    ...Object.values(TemplateCategory),
  );
  const consensusTypeArb = fc.constantFrom(...Object.values(ConsensusType));
  const roomPrivacyArb = fc.constantFrom(...Object.values(RoomPrivacy));

  const advancedSettingsArb = fc
    .record({
      votingTimeout: fc.option(fc.integer({ min: 30, max: 300 })),
      sessionTimeout: fc.option(fc.integer({ min: 15, max: 480 })),
      consensusThreshold: consensusTypeArb,
      customThreshold: fc.option(fc.integer({ min: 50, max: 100 })),
      privacy: roomPrivacyArb,
      maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
      requireApproval: fc.boolean(),
      allowGuestVoting: fc.boolean(),
      contentInjectionEnabled: fc.boolean(),
      injectionFrequency: fc.option(fc.integer({ min: 5, max: 50 })),
      allowMemberSuggestions: fc.boolean(),
      autoProgressEnabled: fc.boolean(),
      chatEnabled: fc.boolean(),
      anonymousVoting: fc.boolean(),
      showVotingProgress: fc.boolean(),
      enableReactions: fc.boolean(),
      autoInactiveHandling: fc.boolean(),
      smartOptimization: fc.boolean(),
      predictiveMatching: fc.boolean(),
    })
    .map((settings) => {
      // Asegurar que customThreshold esté presente cuando consensusThreshold es CUSTOM
      if (
        settings.consensusThreshold === ConsensusType.CUSTOM &&
        !settings.customThreshold
      ) {
        return { ...settings, customThreshold: 75 };
      }
      return settings;
    });

  const templateConfigurationArb = fc.record({
    filters: fc.record({
      genres: fc.array(fc.string({ minLength: 3, maxLength: 20 }), {
        minLength: 1,
        maxLength: 5,
      }),
      minYear: fc.option(fc.integer({ min: 1900, max: 2024 })),
      maxYear: fc.option(fc.integer({ min: 1900, max: 2024 })),
      minRating: fc.option(fc.float({ min: 0, max: 10 })),
      includeAdult: fc.boolean(),
    }),
    settings: advancedSettingsArb,
  });

  const createTemplateDtoArb = fc.record({
    name: fc
      .string({ minLength: 3, maxLength: 50 })
      .filter((s) => s.trim().length >= 3),
    description: fc
      .string({ minLength: 10, maxLength: 500 })
      .filter((s) => s.trim().length >= 10),
    isPublic: fc.boolean(),
    category: templateCategoryArb,
    configuration: templateConfigurationArb,
    tags: fc.option(
      fc.array(
        fc
          .string({ minLength: 2, maxLength: 20 })
          .filter((s) => s.trim().length >= 2),
        { maxLength: 10 },
      ),
    ),
  });

  const roomTemplateArb = fc.record({
    id: fc.uuid(),
    name: fc
      .string({ minLength: 3, maxLength: 50 })
      .filter((s) => s.trim().length >= 3),
    description: fc
      .string({ minLength: 10, maxLength: 500 })
      .filter((s) => s.trim().length >= 10),
    creatorId: fc.uuid(),
    isPublic: fc.boolean(),
    category: templateCategoryArb,
    configuration: templateConfigurationArb,
    usageCount: fc.integer({ min: 0, max: 1000 }),
    rating: fc.float({ min: 0, max: 5, noNaN: true }),
    ratingCount: fc.integer({ min: 0, max: 100 }),
    tags: fc.array(
      fc
        .string({ minLength: 2, maxLength: 20 })
        .filter((s) => s.trim().length >= 2),
      { maxLength: 10 },
    ),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
  });

  describe('Property 1: Template creation preserves all input data', () => {
    it('should preserve all template data when creating a template', async () => {
      await fc.assert(
        fc.asyncProperty(
          createTemplateDtoArb,
          fc.uuid(),
          async (templateData, creatorId) => {
            // Arrange
            dynamoDBService.putItem.mockResolvedValue(undefined);
            eventTracker.trackEvent.mockResolvedValue(undefined);

            // Act
            const result = await service.createTemplate(
              creatorId,
              templateData,
            );

            // Assert
            expect(result.name).toBe(templateData.name);
            expect(result.description).toBe(templateData.description);
            expect(result.creatorId).toBe(creatorId);
            expect(result.isPublic).toBe(templateData.isPublic);
            expect(result.category).toBe(templateData.category);
            expect(result.configuration).toEqual(templateData.configuration);
            expect(result.tags).toEqual(templateData.tags || []);
            expect(result.usageCount).toBe(0);
            expect(result.rating).toBe(0);
            expect(result.ratingCount).toBe(0);
            expect(result.id).toBeDefined();
            expect(result.createdAt).toBeInstanceOf(Date);
            expect(result.updatedAt).toBeInstanceOf(Date);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 2: Template validation correctly identifies invalid configurations', () => {
    it('should reject templates with invalid advanced settings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc
              .string({ minLength: 3, maxLength: 50 })
              .filter((s) => s.trim().length >= 3),
            description: fc
              .string({ minLength: 10, maxLength: 500 })
              .filter((s) => s.trim().length >= 10),
            isPublic: fc.boolean(),
            category: templateCategoryArb,
            configuration: fc.record({
              filters: fc.record({
                genres: fc.array(fc.string({ minLength: 3, maxLength: 20 }), {
                  minLength: 1,
                  maxLength: 5,
                }),
                minYear: fc.option(fc.integer({ min: 1900, max: 2024 })),
                maxYear: fc.option(fc.integer({ min: 1900, max: 2024 })),
                minRating: fc.option(fc.float({ min: 0, max: 10 })),
                includeAdult: fc.boolean(),
              }),
              settings: fc.record({
                votingTimeout: fc.option(
                  fc.oneof(
                    fc.integer({ max: 29 }), // Muy bajo
                    fc.integer({ min: 301 }), // Muy alto
                  ),
                ),
                sessionTimeout: fc.option(
                  fc.oneof(
                    fc.integer({ max: 14 }), // Muy bajo
                    fc.integer({ min: 481 }), // Muy alto
                  ),
                ),
                consensusThreshold: fc.constant(ConsensusType.CUSTOM),
                customThreshold: fc.constant(undefined), // Faltante cuando es requerido
                privacy: roomPrivacyArb,
                maxMembers: fc.option(
                  fc.oneof(
                    fc.integer({ max: 1 }), // Muy bajo
                    fc.integer({ min: 51 }), // Muy alto
                  ),
                ),
                requireApproval: fc.boolean(),
                allowGuestVoting: fc.boolean(),
                contentInjectionEnabled: fc.boolean(),
                injectionFrequency: fc.option(fc.integer({ min: 5, max: 50 })),
                allowMemberSuggestions: fc.boolean(),
                autoProgressEnabled: fc.boolean(),
                chatEnabled: fc.boolean(),
                anonymousVoting: fc.boolean(),
                showVotingProgress: fc.boolean(),
                enableReactions: fc.boolean(),
                autoInactiveHandling: fc.boolean(),
                smartOptimization: fc.boolean(),
                predictiveMatching: fc.boolean(),
              }),
            }),
            tags: fc.option(
              fc.array(fc.string({ minLength: 2, maxLength: 20 }), {
                maxLength: 10,
              }),
            ),
          }),
          fc.uuid(),
          async (invalidTemplateData, creatorId) => {
            // Act & Assert - Debe rechazar configuraciones inválidas
            await expect(
              service.createTemplate(creatorId, invalidTemplateData),
            ).rejects.toThrow(BadRequestException);
          },
        ),
        { numRuns: 50 },
      ); // Menos iteraciones para casos específicos de error
    });
  });

  describe('Property 3: Template usage count increments correctly', () => {
    it('should increment usage count when template is used', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomTemplateArb.filter((t) => t.isPublic), // Solo plantillas públicas para evitar problemas de acceso
          fc.uuid(),
          async (template, userId) => {
            // Arrange
            const initialUsageCount = template.usageCount;
            dynamoDBService.getItem.mockResolvedValue(template);
            dynamoDBService.conditionalUpdate.mockResolvedValue(undefined);
            roomService.createRoom.mockResolvedValue({
              id: 'room-id',
              name: 'Test Room',
              creatorId: userId,
              filters: template.configuration.filters,
              masterList: [],
              inviteCode: 'ABC123',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            eventTracker.trackEvent.mockResolvedValue(undefined);

            // Act
            await service.createRoomFromTemplate(template.id, userId);

            // Assert
            expect(dynamoDBService.conditionalUpdate).toHaveBeenCalledWith(
              expect.any(String),
              expect.any(String),
              'SET usageCount = usageCount + :inc, updatedAt = :updatedAt',
              'attribute_exists(PK)',
              undefined,
              expect.objectContaining({
                ':inc': 1,
              }),
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 4: Template rating calculation is mathematically correct', () => {
    it('should calculate average rating correctly when adding new ratings', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomTemplateArb,
          fc.uuid(),
          fc.integer({ min: 1, max: 5 }),
          async (template, userId, newRating) => {
            // Arrange
            dynamoDBService.getItem.mockResolvedValue(template);
            dynamoDBService.conditionalUpdate.mockResolvedValue(undefined);

            // Calculate expected new average
            const expectedRatingCount = template.ratingCount + 1;
            const expectedRating =
              (template.rating * template.ratingCount + newRating) /
              expectedRatingCount;
            const expectedRatingRounded =
              Math.round(expectedRating * 100) / 100;

            // Act
            await service.rateTemplate(template.id, userId, newRating);

            // Assert
            expect(dynamoDBService.conditionalUpdate).toHaveBeenCalledWith(
              expect.any(String),
              expect.any(String),
              'SET rating = :rating, ratingCount = :ratingCount, updatedAt = :updatedAt',
              'attribute_exists(PK)',
              undefined,
              expect.objectContaining({
                ':rating': expectedRatingRounded,
                ':ratingCount': expectedRatingCount,
              }),
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 5: Template access control is enforced correctly', () => {
    it('should enforce access control for private templates', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomTemplateArb.filter((t) => !t.isPublic), // Solo plantillas privadas
          fc.uuid(), // creatorId
          fc.uuid(), // differentUserId
          async (privateTemplate, creatorId, differentUserId) => {
            // Arrange
            const templateWithCreator = { ...privateTemplate, creatorId };
            dynamoDBService.getItem.mockResolvedValue(templateWithCreator);

            // Act & Assert - El creador debe poder usar la plantilla
            roomService.createRoom.mockResolvedValue({
              id: 'room-id',
              name: 'Test Room',
              creatorId,
              filters: templateWithCreator.configuration.filters,
              masterList: [],
              inviteCode: 'ABC123',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            await expect(
              service.createRoomFromTemplate(templateWithCreator.id, creatorId),
            ).resolves.toBeDefined();

            // Act & Assert - Un usuario diferente NO debe poder usar la plantilla
            if (differentUserId !== creatorId) {
              await expect(
                service.createRoomFromTemplate(
                  templateWithCreator.id,
                  differentUserId,
                ),
              ).rejects.toThrow(ForbiddenException);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 6: Template search returns relevant results', () => {
    it('should return templates that match search criteria', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(roomTemplateArb, { minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 3, maxLength: 10 }),
          async (templates, searchQuery) => {
            // Arrange
            const publicTemplates = templates.map((t) => ({
              ...t,
              isPublic: true,
            }));
            dynamoDBService.query.mockResolvedValue(publicTemplates);

            // Act
            const results = await service.searchTemplates(searchQuery);

            // Assert
            results.forEach((result) => {
              const searchableText =
                `${result.name} ${result.description} ${result.tags.join(' ')}`.toLowerCase();
              const searchTerms = searchQuery.toLowerCase().split(' ');
              const matchesSearch = searchTerms.every((term) =>
                searchableText.includes(term),
              );

              expect(matchesSearch).toBe(true);
            });
          },
        ),
        { numRuns: 50 },
      ); // Menos iteraciones para búsquedas complejas
    });
  });

  describe('Property 7: Template sorting produces consistent ordered results', () => {
    it('should sort templates consistently by different criteria', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(roomTemplateArb, { minLength: 3, maxLength: 10 }),
          fc.constantFrom('usageCount', 'rating', 'createdAt', 'name'),
          fc.constantFrom('asc', 'desc'),
          async (templates, sortBy, sortOrder) => {
            // Arrange
            const publicTemplates = templates.map((t) => ({
              ...t,
              isPublic: true,
            }));
            dynamoDBService.query.mockResolvedValue(publicTemplates);

            // Act
            const results = await service.getPublicTemplates({
              sortBy: sortBy as any,
              sortOrder,
            });

            // Assert - Verificar que los resultados están ordenados correctamente
            if (results.length > 1) {
              for (let i = 0; i < results.length - 1; i++) {
                const current = results[i];
                const next = results[i + 1];

                let comparison = 0;
                switch (sortBy) {
                  case 'usageCount':
                    comparison = current.usageCount - next.usageCount;
                    break;
                  case 'rating':
                    // Manejar valores NaN en rating
                    const currentRating = isNaN(current.rating)
                      ? 0
                      : current.rating;
                    const nextRating = isNaN(next.rating) ? 0 : next.rating;
                    comparison = currentRating - nextRating;
                    break;
                  case 'createdAt':
                    comparison =
                      new Date(current.createdAt).getTime() -
                      new Date(next.createdAt).getTime();
                    break;
                  case 'name':
                    comparison = current.name.localeCompare(next.name);
                    break;
                }

                if (sortOrder === 'asc') {
                  expect(comparison).toBeLessThanOrEqual(0);
                } else {
                  expect(comparison).toBeGreaterThanOrEqual(0);
                }
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 8: Template CRUD operations maintain data consistency', () => {
    it('should maintain data consistency across CRUD operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          createTemplateDtoArb,
          fc.uuid(),
          async (templateData, creatorId) => {
            // Arrange
            dynamoDBService.putItem.mockResolvedValue(undefined);
            dynamoDBService.getItem.mockResolvedValue(null);
            eventTracker.trackEvent.mockResolvedValue(undefined);

            // Act - Create
            const created = await service.createTemplate(
              creatorId,
              templateData,
            );

            // Mock the created template for subsequent operations
            dynamoDBService.getItem.mockResolvedValue(created);

            // Act - Read
            const retrieved = await service.getTemplate(created.id);

            // Assert - Data consistency after create and read
            expect(retrieved.name).toBe(created.name);
            expect(retrieved.description).toBe(created.description);
            expect(retrieved.creatorId).toBe(created.creatorId);
            expect(retrieved.configuration).toEqual(created.configuration);

            // Act - Update (con un pequeño delay para asegurar timestamp diferente)
            await new Promise((resolve) => setTimeout(resolve, 1));
            const updateData = {
              name: 'Updated Name',
              description: 'Updated description with more details',
            };

            const updated = await service.updateTemplate(
              created.id,
              creatorId,
              updateData,
            );

            // Assert - Data consistency after update
            expect(updated.name).toBe(updateData.name);
            expect(updated.description).toBe(updateData.description);
            expect(updated.creatorId).toBe(created.creatorId); // Should remain unchanged
            expect(updated.configuration).toEqual(created.configuration); // Should remain unchanged
            expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
              created.updatedAt.getTime(),
            );
          },
        ),
        { numRuns: 50 },
      ); // Menos iteraciones para operaciones con delay
    });
  });

  describe('Property 9: Template popularity score calculation is consistent', () => {
    it('should calculate popularity scores consistently and rank templates correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(roomTemplateArb, { minLength: 5, maxLength: 15 }),
          async (templates) => {
            // Arrange
            const publicTemplates = templates.map((t) => ({
              ...t,
              isPublic: true,
            }));
            dynamoDBService.query.mockResolvedValue(publicTemplates);

            // Act
            const popularTemplates = await service.getPopularTemplates(10);

            // Assert - Verificar que los templates están ordenados por popularidad
            if (popularTemplates.length > 1) {
              for (let i = 0; i < popularTemplates.length - 1; i++) {
                const current = popularTemplates[i];
                const next = popularTemplates[i + 1];

                // Manejar valores NaN en popularityScore
                const currentScore = isNaN(current.popularityScore)
                  ? 0
                  : current.popularityScore;
                const nextScore = isNaN(next.popularityScore)
                  ? 0
                  : next.popularityScore;

                expect(currentScore).toBeGreaterThanOrEqual(nextScore);
              }
            }

            // Assert - Verificar que el cálculo de popularidad es consistente
            popularTemplates.forEach((template) => {
              const expectedUsageScore = template.usageCount * 0.7;
              const templateRating = isNaN(template.rating)
                ? 0
                : template.rating;
              const expectedRatingScore =
                templateRating * template.ratingCount * 0.3;
              const expectedPopularityScore =
                expectedUsageScore + expectedRatingScore;

              const actualScore = isNaN(template.popularityScore)
                ? 0
                : template.popularityScore;
              expect(actualScore).toBeCloseTo(expectedPopularityScore, 2);
            });
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 10: Template filtering produces correct subsets', () => {
    it('should filter templates correctly based on provided criteria', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateCategoryArb,
          fc.float({ min: 1, max: 4, noNaN: true }), // Rating más bajo para que haya resultados
          async (filterCategory, minRating) => {
            // Arrange - Crear templates que cumplan los criterios
            const validTemplates = Array.from({ length: 5 }, (_, index) => ({
              id: `template-${index}`,
              name: `Template ${index}`,
              description: `Description for template ${index}`,
              creatorId: `creator-${index}`,
              isPublic: true,
              category: filterCategory,
              configuration: {
                filters: {
                  genres: ['Action'],
                  minYear: 2000,
                  maxYear: 2024,
                  minRating: null,
                  includeAdult: false,
                },
                settings: {} as any,
              },
              usageCount: index * 10,
              rating: minRating + 0.5 + index * 0.1, // Asegurar que supere el minRating
              ratingCount: 10,
              tags: [`tag-${index}`],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date('2020-01-01'),
            }));

            dynamoDBService.query.mockResolvedValue(validTemplates);

            // Act
            const filteredResults = await service.getPublicTemplates({
              category: filterCategory,
              minRating,
            });

            // Assert - Todos los resultados deben cumplir los criterios de filtro
            expect(filteredResults.length).toBeGreaterThan(0);
            filteredResults.forEach((result) => {
              expect(result.category).toBe(filterCategory);
              expect(result.rating).toBeGreaterThanOrEqual(minRating - 0.1); // Tolerancia para flotantes
              expect(result.isPublic).toBe(true);
            });
          },
        ),
        { numRuns: 50 },
      ); // Menos iteraciones para filtros complejos
    });
  });
});
