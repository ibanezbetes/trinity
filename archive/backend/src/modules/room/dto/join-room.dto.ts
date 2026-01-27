import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinRoomDto {
  @ApiProperty({
    description: 'Código de invitación de la sala',
    example: 'ABC123',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @Length(6, 6, {
    message: 'El código de invitación debe tener exactamente 6 caracteres',
  })
  @Matches(/^[A-Z0-9]+$/, {
    message:
      'El código de invitación solo puede contener letras mayúsculas y números',
  })
  inviteCode: string;
}
