import {
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
  IsString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ContentFiltersDto {
  @ApiProperty({
    description: 'Géneros de contenido',
    example: ['Action', 'Comedy', 'Drama'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((g) => g.trim());
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @ApiProperty({
    description: 'Año de lanzamiento desde',
    example: 2020,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1900)
  @Max(new Date().getFullYear() + 5)
  releaseYearFrom?: number;

  @ApiProperty({
    description: 'Año de lanzamiento hasta',
    example: 2024,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1900)
  @Max(new Date().getFullYear() + 5)
  releaseYearTo?: number;

  @ApiProperty({
    description: 'Calificación mínima',
    example: 7.0,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  minRating?: number;

  @ApiProperty({
    description: 'Tipos de contenido',
    example: ['movie', 'tv'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((t) => t.trim());
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  contentTypes?: ('movie' | 'tv')[];
}
