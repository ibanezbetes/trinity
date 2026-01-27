import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { AuthService } from '../auth.service';

@Injectable()
export class CognitoJwtStrategy extends PassportStrategy(Strategy, 'cognito-jwt') {
  private readonly logger = new Logger(CognitoJwtStrategy.name);

  constructor(private authService: AuthService) {
    super();
    this.logger.log('CognitoJwtStrategy inicializada');
  }

  async validate(req: any): Promise<any> {
    // Extraer token del header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('No authorization header');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization format');
    }

    const accessToken = authHeader.replace('Bearer ', '');
    if (!accessToken) {
      throw new UnauthorizedException('Token vacío');
    }

    try {
      // Extraer refresh token del header si está disponible
      const refreshToken = req.headers['x-refresh-token'];
      
      // Intentar validación con refresh automático si es necesario
      const result = await this.authService.validateAndRefreshToken(accessToken, refreshToken);
      
      if (!result.user) {
        throw new UnauthorizedException('Token inválido');
      }

      // Si el token fue refrescado, agregar los nuevos tokens a la respuesta
      if (result.tokenRefreshed && result.newTokens) {
        // Agregar nuevos tokens al request para que el controlador pueda acceder a ellos
        req.newTokens = result.newTokens;
        req.tokenRefreshed = true;
        
        this.logger.log(`✅ Token refrescado automáticamente para usuario: ${result.user.id}`);
      }

      return result.user;
    } catch (error) {
      this.logger.warn(`Error validando token: ${error.message}`);
      throw new UnauthorizedException('Token inválido');
    }
  }
}
