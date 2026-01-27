import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class GoogleTokenDto {
  @ApiProperty({
    description: 'Google ID Token obtenido del cliente',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjE2NzAyN...',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

export class LinkGoogleAccountDto {
  @ApiProperty({
    description: 'Google ID Token para vincular cuenta',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjE2NzAyN...',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

export class GoogleAuthResponseDto {
  @ApiProperty({
    description: 'Indica si la operación fue exitosa',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Mensaje descriptivo del resultado',
    example: 'Login con Google exitoso',
  })
  message: string;

  @ApiProperty({
    description: 'Datos del usuario y token de acceso',
    example: {
      user: {
        id: 'user-123',
        email: 'usuario@gmail.com',
        name: 'Usuario Ejemplo',
        isGoogleLinked: true,
      },
      accessToken: 'jwt-token-here',
    },
  })
  data: {
    user: {
      id: string;
      email: string;
      name: string;
      isGoogleLinked: boolean;
    };
    accessToken: string;
  };
}