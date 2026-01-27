import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('cognito-jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      this.logger.warn('Autenticación fallida');
      throw err || new Error('Usuario no autenticado');
    }
    
    // Si hay nuevos tokens disponibles, agregarlos a la respuesta
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    if (request.tokenRefreshed && request.newTokens) {
      // Agregar headers con los nuevos tokens para que el cliente los pueda usar
      response.setHeader('X-New-Access-Token', request.newTokens.accessToken);
      response.setHeader('X-New-Id-Token', request.newTokens.idToken);
      response.setHeader('X-New-Refresh-Token', request.newTokens.refreshToken);
      response.setHeader('X-Token-Refreshed', 'true');
      response.setHeader('X-Token-Expires-In', request.newTokens.expiresIn.toString());
      
      this.logger.log(`📤 Nuevos tokens enviados al cliente para usuario: ${user.id}`);
    }
    
    return user;
  }
}
