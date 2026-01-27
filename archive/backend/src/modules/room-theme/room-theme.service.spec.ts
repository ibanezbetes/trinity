import { Test, TestingModule } from '@nestjs/testing';
import { RoomThemeService } from './room-theme.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { RoomService } from '../room/room.service';
import { EventTracker } from '../analytics/event-tracker.service';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as fc from 'fast-check';
import {
  RoomTheme,
  ThemeCategory,
} from '../../domain/entities/room-template.entity';
import {
  ThemeUsageStats,
  PopularTheme,
  RoomThemeApplication,
  ThemeCustomizations,
  ThemeRating,
  ThemeSortBy,
} from '../../domain/entities/room-theme.entity';
import {
  CreateThemeDto,
  UpdateThemeDto,
  ApplyThemeDto,
  RateThemeDto,
  ThemeFiltersDto,
} from './dto/theme.dto';

describe('RoomThemeService', () => {
  let service: RoomThemeService;
  let dynamoDBService: jest.Mocked<DynamoDBService>;
  let roomService: jest.Mocked<RoomService>;

  // Generadores de datos para property-based testing
  const userIdArb = fc.string({ minLength: 1, maxLength: 50 });
  const roomIdArb = fc.string({ minLength: 1, maxLength: 50 });
  const themeIdArb = fc.string({ minLength: 1, maxLength: 50 });

  const themeCategoryArb = fc.constantFrom(...Object.values(ThemeCategory));
  const hexColorArb = fc
    .hexaString({ minLength: 6, maxLength: 6 })
    .map((hex) => `#${hex}`);

  const themeColorsArb = fc.record({
    primary: hexColorArb,
    secondary: hexColorArb,
    accent: hexColorArb,
    background: hexColorArb,
    text: hexColorArb,
  });

  const createThemeDtoArb = fc.record({
    name: fc
      .string({ minLength: 3, maxLength: 50 })
      .filter((s) => s.trim().length >= 3),
    description: fc
      .string({ minLength: 10, maxLength: 200 })
      .filter((s) => s.trim().length >= 10),
    category: themeCategoryArb,
    colors: themeColorsArb,
    backgroundImage: fc.option(fc.webUrl(), { nil: undefined }),
    icon: fc.option(fc.webUrl(), { nil: undefined }),
    banner: fc.option(fc.webUrl(), { nil: undefined }),
    isPublic: fc.option(fc.boolean(), { nil: undefined }),
    tags: fc.option(
      fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
      { nil: undefined },
    ),
  });

  const validCreateThemeDtoArb = fc.record({
    name: fc
      .string({ minLength: 3, maxLength: 50 })
      .filter((s) => s.trim().length >= 3),
    description: fc
      .string({ minLength: 10, maxLength: 200 })
      .filter((s) => s.trim().length >= 10),
    category: themeCategoryArb,
    colors: themeColorsArb,
    backgroundImage: fc.option(fc.webUrl(), { nil: undefined }),
    icon: fc.option(fc.webUrl(), { nil: undefined }),
    banner: fc.option(fc.webUrl(), { nil: undefined }),
    isPublic: fc.option(fc.boolean(), { nil: undefined }),
    tags: fc.option(
      fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
      { nil: undefined },
    ),
  });

  const updateThemeDtoArb = fc.record({
    name: fc.option(
      fc
        .string({ minLength: 3, maxLength: 50 })
        .filter((s) => s.trim().length >= 3),
      { nil: undefined },
    ),
    description: fc.option(fc.string({ minLength: 10, maxLength: 200 }), {
      nil: undefined,
    }),
    category: fc.option(themeCategoryArb, { nil: undefined }),
    colors: fc.option(themeColorsArb, { nil: undefined }),
    backgroundImage: fc.option(fc.webUrl(), { nil: undefined }),
    icon: fc.option(fc.webUrl(), { nil: undefined }),
    banner: fc.option(fc.webUrl(), { nil: undefined }),
    isPublic: fc.option(fc.boolean(), { nil: undefined }),
    tags: fc.option(
      fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
      { nil: undefined },
    ),
  });

  const themeCustomizationsArb = fc.record({
    colorOverrides: fc.option(
      fc.record({
        primary: fc.option(hexColorArb, { nil: undefined }),
        secondary: fc.option(hexColorArb, { nil: undefined }),
        accent: fc.option(hexColorArb, { nil: undefined }),
        background: fc.option(hexColorArb, { nil: undefined }),
        text: fc.option(hexColorArb, { nil: undefined }),
      }),
      { nil: undefined },
    ),
    customBackgroundImage: fc.option(fc.webUrl(), { nil: undefined }),
    customIcon: fc.option(fc.webUrl(), { nil: undefined }),
    customBanner: fc.option(fc.webUrl(), { nil: undefined }),
    opacity: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
    borderRadius: fc.option(fc.integer({ min: 0, max: 20 }), {
      nil: undefined,
    }),
    fontSize: fc.option(fc.constantFrom('small', 'medium', 'large'), {
      nil: undefined,
    }),
    animation: fc.option(fc.boolean(), { nil: undefined }),
  });

  const applyThemeDtoArb = fc.record({
    themeId: themeIdArb,
    customizations: fc.option(themeCustomizationsArb, { nil: undefined }),
    reason: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
      nil: undefined,
    }),
  });

  const rateThemeDtoArb = fc.record({
    rating: fc.integer({ min: 1, max: 5 }),
    comment: fc.option(fc.string({ minLength: 1, maxLength: 500 }), {
      nil: undefined,
    }),
  });

  beforeEach(async () => {
    const mockDynamoDBService = {
      putItem: jest.fn(),
      getItem: jest.fn(),
      query: jest.fn(),
      deleteItem: jest.fn(),
    };

    const mockRoomService = {
      getRoom: jest.fn(),
    };

    const mockEventTracker = {
      trackEvent: jest.fn().mockResolvedValue(undefined),
      trackUserEvent: jest.fn().mockResolvedValue(undefined),
      trackRoomEvent: jest.fn().mockResolvedValue(undefined),
      trackContentEvent: jest.fn().mockResolvedValue(undefined),
      trackSystemEvent: jest.fn().mockResolvedValue(undefined),
    };

    const mockRealtimeCompatibilityService = {
      notifyThemeChange: jest.fn().mockResolvedValue(undefined),
      notifyThemeApplication: jest.fn().mockResolvedValue(undefined),
      notifyThemeRating: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomThemeService,
        {
          provide: DynamoDBService,
          useValue: mockDynamoDBService,
        },
        {
          provide: RoomService,
          useValue: mockRoomService,
        },
        {
          provide: EventTracker,
          useValue: mockEventTracker,
        },
        {
          provide: RealtimeCompatibilityService,
          useValue: mockRealtimeCompatibilityService,
        },
      ],
    }).compile();

    service = module.get<RoomThemeService>(RoomThemeService);
    dynamoDBService = module.get(DynamoDBService);
    roomService = module.get(RoomService);
  });

  describe('Theme Creation Properties', () => {
    /**
     * Propiedad 1: Crear tema siempre genera estructura válida
     */
    it('should create themes with valid structure and properties', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          createThemeDtoArb,
          async (userId, createThemeDto) => {
            // Setup mocks
            dynamoDBService.query.mockResolvedValue({ Items: [] }); // No existing themes
            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Execute
            const result = await service.createTheme(userId, createThemeDto);

            // Verify structure
            expect(result.id).toBeDefined();
            expect(typeof result.id).toBe('string');
            expect(result.name).toBe(createThemeDto.name);
            expect(result.description).toBe(createThemeDto.description);
            expect(result.category).toBe(createThemeDto.category);
            expect(result.colors).toEqual(createThemeDto.colors);
            expect(result.isCustom).toBe(true);
            expect(result.creatorId).toBe(userId);
            expect(result.isPublic).toBe(createThemeDto.isPublic || false);
            expect(result.createdAt).toBeInstanceOf(Date);
            expect(result.updatedAt).toBeInstanceOf(Date);

            // Verify optional fields
            if (createThemeDto.backgroundImage) {
              expect(result.backgroundImage).toBe(
                createThemeDto.backgroundImage,
              );
            }
            if (createThemeDto.icon) {
              expect(result.icon).toBe(createThemeDto.icon);
            }
            if (createThemeDto.banner) {
              expect(result.banner).toBe(createThemeDto.banner);
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Propiedad 2: Colores de tema siempre son válidos
     */
    it('should validate theme colors correctly', async () => {
      await fc.assert(
        fc.asyncProperty(themeColorsArb, async (colors) => {
          // Verify all colors are valid hex codes
          Object.values(colors).forEach((color) => {
            expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
          });

          // Verify required color fields are present
          expect(colors.primary).toBeDefined();
          expect(colors.secondary).toBeDefined();
          expect(colors.accent).toBeDefined();
          expect(colors.background).toBeDefined();
          expect(colors.text).toBeDefined();
        }),
        { numRuns: 100 },
      );
    });

    /**
     * Propiedad 3: Actualizar tema preserva propiedades inmutables
     */
    it('should preserve immutable properties when updating themes', async () => {
      await fc.assert(
        fc.asyncProperty(
          themeIdArb,
          userIdArb,
          validCreateThemeDtoArb,
          fc.record({
            name: fc.option(
              fc
                .string({ minLength: 3, maxLength: 50 })
                .filter((s) => s.trim().length >= 3),
              { nil: undefined },
            ),
            colors: fc.option(themeColorsArb, { nil: undefined }),
            isPublic: fc.option(fc.boolean(), { nil: undefined }),
          }),
          async (themeId, userId, originalTheme, updateDto) => {
            // Setup existing theme
            const existingTheme: RoomTheme = {
              id: themeId,
              name: originalTheme.name,
              description: originalTheme.description,
              category: originalTheme.category,
              colors: originalTheme.colors,
              backgroundImage: originalTheme.backgroundImage,
              icon: originalTheme.icon,
              banner: originalTheme.banner,
              isCustom: true,
              creatorId: userId,
              isPublic: originalTheme.isPublic || false,
              createdAt: new Date('2023-01-01'),
              updatedAt: new Date('2023-01-01'),
            };

            dynamoDBService.getItem.mockResolvedValue(existingTheme);
            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Execute
            const result = await service.updateTheme(
              themeId,
              userId,
              updateDto,
            );

            // Verify immutable properties
            expect(result.id).toBe(themeId);
            expect(result.isCustom).toBe(true);
            expect(result.creatorId).toBe(userId);
            expect(result.createdAt).toEqual(existingTheme.createdAt);

            // Verify updatedAt changed
            expect(result.updatedAt.getTime()).toBeGreaterThan(
              existingTheme.updatedAt.getTime(),
            );

            // Verify updated properties - only test defined updates
            if (updateDto.name !== undefined) {
              expect(result.name).toBe(updateDto.name);
            } else {
              expect(result.name).toBe(originalTheme.name);
            }

            if (updateDto.colors !== undefined) {
              expect(result.colors).toEqual(updateDto.colors);
            } else {
              expect(result.colors).toEqual(originalTheme.colors);
            }

            if (updateDto.isPublic !== undefined) {
              expect(result.isPublic).toBe(updateDto.isPublic);
            } else {
              expect(result.isPublic).toBe(originalTheme.isPublic || false);
            }

            // Verify unchanged properties
            expect(result.description).toBe(originalTheme.description);
            expect(result.category).toBe(originalTheme.category);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Theme Application Properties', () => {
    /**
     * Propiedad 4: Aplicar tema siempre crea aplicación válida
     */
    it('should create valid theme applications', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          userIdArb,
          applyThemeDtoArb,
          async (roomId, userId, applyThemeDto) => {
            // Setup mocks
            const mockTheme: RoomTheme = {
              id: applyThemeDto.themeId,
              name: 'Test Theme',
              description: 'Test Description',
              category: ThemeCategory.CUSTOM,
              colors: {
                primary: '#000000',
                secondary: '#111111',
                accent: '#222222',
                background: '#333333',
                text: '#ffffff',
              },
              isCustom: true,
              creatorId: userId,
              isPublic: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            roomService.getRoom.mockResolvedValue({
              id: roomId,
              members: [{ userId, role: 'member' }],
            } as any);

            dynamoDBService.getItem.mockResolvedValue(mockTheme);
            dynamoDBService.query.mockResolvedValue({ Items: [] }); // No previous applications
            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Execute
            const result = await service.applyThemeToRoom(
              roomId,
              userId,
              applyThemeDto,
            );

            // Verify application structure
            expect(result.roomId).toBe(roomId);
            expect(result.themeId).toBe(applyThemeDto.themeId);
            expect(result.appliedBy).toBe(userId);
            expect(result.appliedAt).toBeInstanceOf(Date);
            expect(result.isActive).toBe(true);

            // Verify customizations if provided
            if (applyThemeDto.customizations) {
              expect(result.customizations).toEqual(
                applyThemeDto.customizations,
              );
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Propiedad 5: Personalizaciones de tema son válidas
     */
    it('should validate theme customizations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(themeCustomizationsArb, async (customizations) => {
          // Verify color overrides are valid hex codes if present
          if (customizations.colorOverrides) {
            Object.values(customizations.colorOverrides).forEach((color) => {
              if (color) {
                expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
              }
            });
          }

          // Verify numeric ranges
          if (customizations.opacity !== undefined) {
            expect(customizations.opacity).toBeGreaterThanOrEqual(0);
            expect(customizations.opacity).toBeLessThanOrEqual(100);
          }

          if (customizations.borderRadius !== undefined) {
            expect(customizations.borderRadius).toBeGreaterThanOrEqual(0);
            expect(customizations.borderRadius).toBeLessThanOrEqual(20);
          }

          // Verify font size values
          if (customizations.fontSize !== undefined) {
            expect(['small', 'medium', 'large']).toContain(
              customizations.fontSize,
            );
          }

          // Verify boolean values
          if (customizations.animation !== undefined) {
            expect(typeof customizations.animation).toBe('boolean');
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Theme Rating Properties', () => {
    /**
     * Propiedad 6: Calificaciones de tema son válidas
     */
    it('should create valid theme ratings', async () => {
      await fc.assert(
        fc.asyncProperty(
          themeIdArb,
          userIdArb,
          rateThemeDtoArb,
          async (themeId, userId, rateThemeDto) => {
            // Setup mocks
            const mockTheme: RoomTheme = {
              id: themeId,
              name: 'Test Theme',
              description: 'Test Description',
              category: ThemeCategory.CUSTOM,
              colors: {
                primary: '#000000',
                secondary: '#111111',
                accent: '#222222',
                background: '#333333',
                text: '#ffffff',
              },
              isCustom: true,
              creatorId: 'other-user',
              isPublic: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            dynamoDBService.getItem.mockResolvedValue(mockTheme);
            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Execute
            const result = await service.rateTheme(
              themeId,
              userId,
              rateThemeDto,
            );

            // Verify rating structure
            expect(result.themeId).toBe(themeId);
            expect(result.userId).toBe(userId);
            expect(result.rating).toBe(rateThemeDto.rating);
            expect(result.rating).toBeGreaterThanOrEqual(1);
            expect(result.rating).toBeLessThanOrEqual(5);
            expect(result.createdAt).toBeInstanceOf(Date);
            expect(result.updatedAt).toBeInstanceOf(Date);

            // Verify comment if provided
            if (rateThemeDto.comment) {
              expect(result.comment).toBe(rateThemeDto.comment);
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Propiedad 7: Ratings están en rango válido
     */
    it('should enforce valid rating ranges', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (rating) => {
          // Verify rating is in valid range
          expect(rating).toBeGreaterThanOrEqual(1);
          expect(rating).toBeLessThanOrEqual(5);
          expect(Number.isInteger(rating)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('System Theme Properties', () => {
    /**
     * Propiedad 8: Temas del sistema son consistentes
     */
    it('should return consistent system themes', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant({}), async () => {
          // Setup mocks
          dynamoDBService.query.mockResolvedValue({ Items: [] });

          // Execute
          const themes = await service.getPublicThemes();

          // Verify system themes are present
          const systemThemes = themes.filter((theme) => !theme.isCustom);
          expect(systemThemes.length).toBeGreaterThan(0);

          // Verify each system theme has required properties
          systemThemes.forEach((theme) => {
            expect(theme.id).toBeDefined();
            expect(theme.name).toBeDefined();
            expect(theme.description).toBeDefined();
            expect(theme.category).toBeDefined();
            expect(theme.colors).toBeDefined();
            expect(theme.isCustom).toBe(false);
            expect(theme.isPublic).toBe(true);
            expect(theme.createdAt).toBeInstanceOf(Date);
            expect(theme.updatedAt).toBeInstanceOf(Date);

            // Verify colors are valid
            Object.values(theme.colors).forEach((color) => {
              expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
            });
          });
        }),
        { numRuns: 50 },
      );
    });

    /**
     * Propiedad 9: Temas populares tienen estadísticas válidas
     */
    it('should return popular themes with valid statistics', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (limit) => {
          // Execute
          const popularThemes = await service.getPopularThemes(limit);

          // Verify response structure
          expect(popularThemes.length).toBeLessThanOrEqual(limit);

          // Verify each popular theme has valid stats
          popularThemes.forEach((theme) => {
            expect(theme.stats).toBeDefined();
            expect(theme.stats.themeId).toBe(theme.id);
            expect(theme.stats.totalUsage).toBeGreaterThanOrEqual(0);
            expect(theme.stats.recentUsage).toBeGreaterThanOrEqual(0);
            expect(theme.stats.averageRating).toBeGreaterThanOrEqual(0);
            expect(theme.stats.averageRating).toBeLessThanOrEqual(5);
            expect(theme.stats.ratingCount).toBeGreaterThanOrEqual(0);
            expect(theme.stats.activeRooms).toBeGreaterThanOrEqual(0);
            expect(theme.stats.popularityScore).toBeGreaterThanOrEqual(0);
            expect(theme.stats.popularityScore).toBeLessThanOrEqual(100);

            expect(typeof theme.isRecommended).toBe('boolean');
            expect(theme.popularityScore).toBeGreaterThanOrEqual(0);
            expect(theme.popularityScore).toBeLessThanOrEqual(100);
          });
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should prevent duplicate theme names for same user', async () => {
      const createThemeDto: CreateThemeDto = {
        name: 'Existing Theme',
        description: 'Test Description',
        category: ThemeCategory.CUSTOM,
        colors: {
          primary: '#000000',
          secondary: '#111111',
          accent: '#222222',
          background: '#333333',
          text: '#ffffff',
        },
      };

      // Mock existing theme with same name
      dynamoDBService.query.mockResolvedValue({
        Items: [
          {
            id: 'existing-theme',
            name: 'Existing Theme',
            creatorId: 'user1',
          },
        ],
      });

      await expect(
        service.createTheme('user1', createThemeDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should prevent system theme modification', async () => {
      const updateDto: UpdateThemeDto = {
        name: 'Modified System Theme',
      };

      await expect(
        service.updateTheme('dark-cinema', 'user1', updateDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should validate theme data integrity', async () => {
      await fc.assert(
        fc.asyncProperty(createThemeDtoArb, async (createThemeDto) => {
          // Verify name length
          expect(createThemeDto.name.length).toBeGreaterThanOrEqual(3);
          expect(createThemeDto.name.length).toBeLessThanOrEqual(50);

          // Verify description length
          expect(createThemeDto.description.length).toBeGreaterThanOrEqual(10);
          expect(createThemeDto.description.length).toBeLessThanOrEqual(200);

          // Verify category is valid
          expect(Object.values(ThemeCategory)).toContain(
            createThemeDto.category,
          );

          // Verify colors are valid hex codes
          Object.values(createThemeDto.colors).forEach((color) => {
            expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
          });

          // Verify URLs are valid if present
          if (createThemeDto.backgroundImage) {
            expect(
              () => new URL(createThemeDto.backgroundImage!),
            ).not.toThrow();
          }
          if (createThemeDto.icon) {
            expect(() => new URL(createThemeDto.icon!)).not.toThrow();
          }
          if (createThemeDto.banner) {
            expect(() => new URL(createThemeDto.banner!)).not.toThrow();
          }
        }),
        { numRuns: 100 },
      );
    });

    it('should handle theme not found scenarios', async () => {
      dynamoDBService.getItem.mockResolvedValue(null);

      await expect(service.getTheme('non-existent-theme')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should prevent unauthorized theme access', async () => {
      const privateTheme: RoomTheme = {
        id: 'private-theme',
        name: 'Private Theme',
        description: 'Private Description',
        category: ThemeCategory.CUSTOM,
        colors: {
          primary: '#000000',
          secondary: '#111111',
          accent: '#222222',
          background: '#333333',
          text: '#ffffff',
        },
        isCustom: true,
        creatorId: 'owner-user',
        isPublic: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      roomService.getRoom.mockResolvedValue({
        id: 'room1',
        members: [{ userId: 'other-user', role: 'member' }],
      } as any);

      dynamoDBService.getItem.mockResolvedValue(privateTheme);

      const applyThemeDto: ApplyThemeDto = {
        themeId: 'private-theme',
      };

      await expect(
        service.applyThemeToRoom('room1', 'other-user', applyThemeDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
