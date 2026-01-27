import { IsEmail, IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginUserDto {
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
    description: 'Contraseña del usuario',
    example: 'MiContraseña123!',
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(1, { message: 'La contraseña no puede estar vacía' })
  @Matches(/^[^<>'"&%]*$/, {
    message: 'La contraseña contiene caracteres no permitidos',
  })
  password: string;
}
