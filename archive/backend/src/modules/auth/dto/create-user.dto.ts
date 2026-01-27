import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'Email del usuario',
    example: 'usuario@ejemplo.com',
  })
  @IsEmail({}, { message: 'Debe ser un email válido' })
  @Matches(/^[^<>'"&]*$/, {
    message: 'El email contiene caracteres no permitidos',
  })
  email: string;

  @ApiProperty({
    description: 'Nombre de usuario',
    example: 'usuario123',
    minLength: 3,
    maxLength: 20,
  })
  @IsString()
  @MinLength(3, {
    message: 'El nombre de usuario debe tener al menos 3 caracteres',
  })
  @MaxLength(20, {
    message: 'El nombre de usuario no puede tener más de 20 caracteres',
  })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message:
      'El nombre de usuario solo puede contener letras, números y guiones bajos',
  })
  username: string;

  @ApiProperty({
    description: 'Nombre completo del usuario (opcional)',
    example: 'Juan García López',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, {
    message: 'El nombre completo debe tener al menos 2 caracteres',
  })
  @MaxLength(100, {
    message: 'El nombre completo no puede tener más de 100 caracteres',
  })
  displayName?: string;

  @ApiProperty({
    description: 'Contraseña del usuario',
    example: 'MiContraseña123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
    {
      message:
        'La contraseña debe contener al menos una letra minúscula, una mayúscula, un número y un carácter especial',
    },
  )
  @Matches(/^[^<>'"&%]*$/, {
    message: 'La contraseña contiene caracteres no permitidos',
  })
  password: string;

  @ApiProperty({
    description: 'Número de teléfono (opcional)',
    example: '+34612345678',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message:
      'El número de teléfono debe estar en formato internacional (+34612345678)',
  })
  phoneNumber?: string;
}
