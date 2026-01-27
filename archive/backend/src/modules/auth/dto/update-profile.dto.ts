import { IsString, IsOptional, MinLength, MaxLength, Matches, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({
    description: 'Nombre de usuario',
    example: 'usuario123',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(50, { message: 'El nombre no puede tener más de 50 caracteres' })
  @Matches(/^[a-zA-Z0-9_\s]+$/, {
    message: 'El nombre solo puede contener letras, números, espacios y guiones bajos',
  })
  displayName?: string;

  @ApiProperty({
    description: 'URL del avatar',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'Debe ser una URL válida' })
  avatarUrl?: string;

  @ApiProperty({
    description: 'Número de teléfono en formato internacional',
    example: '+34612345678',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'El número de teléfono debe estar en formato internacional (+34612345678)',
  })
  phoneNumber?: string;
}
