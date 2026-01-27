import { IsString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VoteType } from '../../../domain/entities/interaction.entity';

export class CreateVoteDto {
  @ApiProperty({
    description: 'ID del contenido multimedia a votar',
    example: '12345',
  })
  @IsString()
  mediaId: string;

  @ApiProperty({
    description: 'Tipo de voto',
    enum: VoteType,
    example: VoteType.LIKE,
  })
  @IsEnum(VoteType)
  voteType: VoteType;

  @ApiProperty({
    description: 'ID de sesión opcional para tracking',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
