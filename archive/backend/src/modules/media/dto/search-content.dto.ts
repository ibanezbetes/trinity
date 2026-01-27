import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SearchContentDto {
  @ApiProperty({
    description: 'Texto de búsqueda',
    example: 'Avengers',
  })
  @IsString()
  q: string;

  @ApiProperty({
    description: 'Número de página',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  page?: number;
}
