import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsObject,
  ValidateNested,
  Min,
  Max,
  IsUrl,
  IsHexColor,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ThemeCategory } from '../../../domain/entities/room-template.entity';
import { ThemeSortBy } from '../../../domain/entities/room-theme.entity';

/**
 * DTO para colores de tema
 */
export class ThemeColorsDto {
  @IsHexColor()
  primary: string;

  @IsHexColor()
  secondary: string;

  @IsHexColor()
  accent: string;

  @IsHexColor()
  background: string;

  @IsHexColor()
  text: string;
}

/**
 * DTO para crear un tema
 */
export class CreateThemeDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsEnum(ThemeCategory)
  category: ThemeCategory;

  @ValidateNested()
  @Type(() => ThemeColorsDto)
  colors: ThemeColorsDto;

  @IsUrl()
  @IsOptional()
  backgroundImage?: string;

  @IsUrl()
  @IsOptional()
  icon?: string;

  @IsUrl()
  @IsOptional()
  banner?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean = false;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[] = [];
}

/**
 * DTO para actualizar un tema
 */
export class UpdateThemeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ThemeCategory)
  @IsOptional()
  category?: ThemeCategory;

  @ValidateNested()
  @Type(() => ThemeColorsDto)
  @IsOptional()
  colors?: ThemeColorsDto;

  @IsUrl()
  @IsOptional()
  backgroundImage?: string;

  @IsUrl()
  @IsOptional()
  icon?: string;

  @IsUrl()
  @IsOptional()
  banner?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

/**
 * DTO para personalizaciones de tema
 */
export class ThemeCustomizationsDto {
  @ValidateNested()
  @Type(() => ThemeColorsDto)
  @IsOptional()
  colorOverrides?: Partial<ThemeColorsDto>;

  @IsUrl()
  @IsOptional()
  customBackgroundImage?: string;

  @IsUrl()
  @IsOptional()
  customIcon?: string;

  @IsUrl()
  @IsOptional()
  customBanner?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  opacity?: number;

  @IsNumber()
  @Min(0)
  @Max(20)
  @IsOptional()
  borderRadius?: number;

  @IsEnum(['small', 'medium', 'large'])
  @IsOptional()
  fontSize?: 'small' | 'medium' | 'large';

  @IsBoolean()
  @IsOptional()
  animation?: boolean;
}

/**
 * DTO para aplicar tema a sala
 */
export class ApplyThemeDto {
  @IsString()
  themeId: string;

  @ValidateNested()
  @Type(() => ThemeCustomizationsDto)
  @IsOptional()
  customizations?: ThemeCustomizationsDto;

  @IsString()
  @IsOptional()
  reason?: string;
}

/**
 * DTO para calificar tema
 */
export class RateThemeDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @IsOptional()
  comment?: string;
}

/**
 * DTO para filtros de búsqueda de temas
 */
export class ThemeFiltersDto {
  @IsEnum(ThemeCategory)
  @IsOptional()
  category?: ThemeCategory;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsString()
  @IsOptional()
  creatorId?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  minRating?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsEnum(ThemeSortBy)
  @IsOptional()
  sortBy?: ThemeSortBy = ThemeSortBy.POPULARITY;

  @IsEnum(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @IsNumber()
  @Min(0)
  @IsOptional()
  offset?: number = 0;
}

/**
 * DTO de respuesta para tema
 */
export class ThemeResponseDto {
  id: string;
  name: string;
  description: string;
  category: ThemeCategory;
  colors: ThemeColorsDto;
  backgroundImage?: string;
  icon?: string;
  banner?: string;
  isCustom: boolean;
  creatorId?: string;
  creatorName?: string;
  isPublic: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;

  // Estadísticas opcionales
  usageCount?: number;
  rating?: number;
  ratingCount?: number;
  popularityScore?: number;
}

/**
 * DTO de respuesta para tema aplicado
 */
export class AppliedThemeResponseDto {
  roomId: string;
  theme: ThemeResponseDto;
  customizations?: ThemeCustomizationsDto;
  appliedAt: Date;
  appliedBy: string;
  appliedByName?: string;
}

/**
 * DTO de respuesta para estadísticas de tema
 */
export class ThemeStatsResponseDto {
  themeId: string;
  totalUsage: number;
  recentUsage: number;
  averageRating: number;
  ratingCount: number;
  activeRooms: number;
  popularityScore: number;

  // Métricas adicionales
  averageLoadTime?: number;
  errorRate?: number;
  userSatisfaction?: number;
  retentionRate?: number;
  conversionRate?: number;
}

/**
 * DTO de respuesta para temas populares
 */
export class PopularThemesResponseDto {
  themes: ThemeResponseDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * DTO de respuesta para recomendaciones de tema
 */
export class ThemeRecommendationResponseDto {
  themeId: string;
  theme: ThemeResponseDto;
  score: number;
  reason: string;
  basedOn: string;
}

/**
 * DTO para configuración de tema automático
 */
export class AutoThemeConfigDto {
  @IsBoolean()
  enabled: boolean;

  @IsObject()
  @IsOptional()
  rules?: {
    contentBasedThemes?: {
      genreThemeMapping: Record<string, string>;
      moodThemeMapping: Record<string, string>;
    };
    timeBasedThemes?: {
      seasonalThemes: boolean;
      holidayThemes: boolean;
      timeOfDayThemes: boolean;
    };
    eventBasedThemes?: {
      memberMilestones: boolean;
      roomMilestones: boolean;
    };
  };

  @IsEnum(['never', 'daily', 'weekly', 'monthly', 'event_based'])
  @IsOptional()
  changeFrequency?: 'never' | 'daily' | 'weekly' | 'monthly' | 'event_based' =
    'never';

  @IsBoolean()
  @IsOptional()
  requireApproval?: boolean = true;

  @IsBoolean()
  @IsOptional()
  notifyMembers?: boolean = true;
}

/**
 * DTO de respuesta para validación de tema
 */
export class ThemeValidationResponseDto {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: string[];
}

/**
 * DTO para crear colección de temas
 */
export class CreateThemeCollectionDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsArray()
  @IsString({ each: true })
  themeIds: string[];

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean = false;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[] = [];
}

/**
 * DTO de respuesta para colección de temas
 */
export class ThemeCollectionResponseDto {
  id: string;
  name: string;
  description: string;
  curatorId: string;
  curatorName?: string;
  themes: ThemeResponseDto[];
  isPublic: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
