import {
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
  ValidateNested,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class ContentFiltersDto {
  @ApiProperty({
    description: 'Géneros de contenido',
    example: ['Action', 'Comedy', 'Drama'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @ApiProperty({
    description: 'Año de lanzamiento desde',
    example: 2020,
    required: false,
  })
  @IsOptional()
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
  @IsNumber()
  @Min(0)
  @Max(10)
  minRating?: number;

  @ApiProperty({
    description: 'Tipos de contenido',
    example: ['movie', 'tv'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contentTypes?: ('movie' | 'tv')[];
}

export class UpdateFiltersDto {
  @ApiProperty({
    description: 'Nuevos filtros de contenido para la sala',
    type: ContentFiltersDto,
  })
  @ValidateNested()
  @Type(() => ContentFiltersDto)
  filters: ContentFiltersDto;
}
