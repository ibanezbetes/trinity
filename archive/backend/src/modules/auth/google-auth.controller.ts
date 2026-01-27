import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Request,
  Logger,
  Get,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleTokenDto, LinkGoogleAccountDto, GoogleAuthResponseDto } from './dto/google-token.dto';

@ApiTags('auth/google')
@Controller('auth/google')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);
  
  constructor(private authService: AuthService) {}

  @Get('available')
  @ApiOperation({ summary: 'Verificar si Google Auth está disponible' })
  @ApiResponse({ status: 200, description: 'Estado de disponibilidad de Google Auth' })
  async checkGoogleAuthAvailability() {
    const isAvailable = this.authService.isGoogleAuthAvailable();
    
    return {
      available: isAvailable,
      message: isAvailable 
        ? 'Google Auth está configurado y disponible'
        : 'Google Auth no está configurado. Verifica GOOGLE_CLIENT_ID en variables de entorno.',
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión con Google usando ID Token (Federado)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Login exitoso con Google usando Cognito Identity Pool',
    type: GoogleAuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Token de Google inválido' })
  @ApiResponse({ status: 400, description: 'Google Auth no está disponible' })
  async loginWithGoogle(@Body() googleTokenDto: GoogleTokenDto) {
    this.logger.log('🔐 Iniciando login federado con Google...');
    
    if (!this.authService.isGoogleAuthAvailable()) {
      this.logger.error('❌ Google Auth no está disponible');
      throw new Error('Google Auth no está configurado');
    }

    try {
      // Intentar autenticación federada primero
      const result = await this.authService.loginWithGoogleFederated(googleTokenDto.idToken);
      
      this.logger.log(`✅ Login federado con Google exitoso: ${result.user.email}`);
      
      return {
        success: true,
        message: 'Login federado con Google exitoso',
        data: result,
        federatedAuth: true,
      };
      
    } catch (federatedError) {
      this.logger.warn(`⚠️ Autenticación federada falló, intentando método legacy: ${federatedError.message}`);
      
      try {
        // Fallback al método legacy
        const result = await this.authService.loginWithGoogle(googleTokenDto.idToken);
        
        this.logger.log(`✅ Login legacy con Google exitoso: ${result.user.email}`);
        
        return {
          success: true,
          message: 'Login con Google exitoso (modo legacy)',
          data: result,
          federatedAuth: false,
        };
        
      } catch (legacyError) {
        this.logger.error(`❌ Error en ambos métodos de login: federado=${federatedError.message}, legacy=${legacyError.message}`);
        throw legacyError;
      }
    }
  }

  @Post('link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vincular cuenta de Google a usuario autenticado (Federado)' })
  @ApiResponse({ status: 200, description: 'Cuenta de Google vinculada exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado o token de Google inválido' })
  @ApiResponse({ status: 409, description: 'Cuenta de Google ya vinculada a otro usuario' })
  async linkGoogleAccount(@Request() req, @Body() linkGoogleDto: LinkGoogleAccountDto) {
    this.logger.log(`🔗 Vinculando cuenta de Google al usuario: ${req.user.id}`);
    
    if (!this.authService.isGoogleAuthAvailable()) {
      this.logger.error('❌ Google Auth no está disponible');
      throw new Error('Google Auth no está configurado');
    }

    try {
      // Intentar vinculación federada primero
      const updatedUser = await this.authService.linkGoogleAccountFederated(
        req.user.id,
        linkGoogleDto.idToken
      );
      
      this.logger.log(`✅ Cuenta de Google vinculada exitosamente (federado): ${req.user.id}`);
      
      return {
        success: true,
        message: 'Cuenta de Google vinculada exitosamente',
        user: updatedUser,
        federatedAuth: true,
      };
      
    } catch (federatedError) {
      this.logger.warn(`⚠️ Vinculación federada falló, intentando método legacy: ${federatedError.message}`);
      
      try {
        // Fallback al método legacy
        const updatedUser = await this.authService.linkGoogleAccount(
          req.user.id,
          linkGoogleDto.idToken
        );
        
        this.logger.log(`✅ Cuenta de Google vinculada exitosamente (legacy): ${req.user.id}`);
        
        return {
          success: true,
          message: 'Cuenta de Google vinculada exitosamente (modo legacy)',
          user: updatedUser,
          federatedAuth: false,
        };
        
      } catch (legacyError) {
        this.logger.error(`❌ Error en ambos métodos de vinculación: federado=${federatedError.message}, legacy=${legacyError.message}`);
        
        if (legacyError.message.includes('ya está vinculada')) {
          throw new Error('Esta cuenta de Google ya está vinculada a otro usuario');
        }
        
        throw legacyError;
      }
    }
  }

  @Delete('unlink')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desvincular cuenta de Google del usuario autenticado (Federado)' })
  @ApiResponse({ status: 200, description: 'Cuenta de Google desvinculada exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 400, description: 'No se puede desvincular: único método de autenticación' })
  async unlinkGoogleAccount(@Request() req) {
    this.logger.log(`🔓 Desvinculando cuenta de Google del usuario: ${req.user.id}`);
    
    try {
      // Intentar desvinculación federada primero
      const updatedUser = await this.authService.unlinkGoogleAccountFederated(req.user.id);
      
      this.logger.log(`✅ Cuenta de Google desvinculada exitosamente (federado): ${req.user.id}`);
      
      return {
        success: true,
        message: 'Cuenta de Google desvinculada exitosamente',
        user: updatedUser,
        federatedAuth: true,
      };
      
    } catch (federatedError) {
      this.logger.warn(`⚠️ Desvinculación federada falló, intentando método legacy: ${federatedError.message}`);
      
      try {
        // Fallback al método legacy
        const updatedUser = await this.authService.unlinkGoogleAccount(req.user.id);
        
        this.logger.log(`✅ Cuenta de Google desvinculada exitosamente (legacy): ${req.user.id}`);
        
        return {
          success: true,
          message: 'Cuenta de Google desvinculada exitosamente (modo legacy)',
          user: updatedUser,
          federatedAuth: false,
        };
        
      } catch (legacyError) {
        this.logger.error(`❌ Error en ambos métodos de desvinculación: federado=${federatedError.message}, legacy=${legacyError.message}`);
        
        if (legacyError.message.includes('único método')) {
          throw new Error('No se puede desvincular Google: es el único método de autenticación. Configura una contraseña primero.');
        }
        
        throw legacyError;
      }
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener estado de vinculación con Google del usuario' })
  @ApiResponse({ status: 200, description: 'Estado de vinculación con Google' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getGoogleLinkStatus(@Request() req) {
    this.logger.log(`📊 Obteniendo estado de Google para usuario: ${req.user.id}`);
    
    const isGoogleLinked = req.user.isGoogleLinked || false;
    const authProviders = req.user.authProviders || ['email'];
    const canUnlinkGoogle = await this.authService.canUnlinkGoogle(req.user.id);
    
    return {
      isGoogleLinked,
      authProviders,
      canUnlinkGoogle,
      googleAuthAvailable: this.authService.isGoogleAuthAvailable(),
      federatedAuthConfigured: await this.checkFederatedAuthConfiguration(),
    };
  }

  @Post('exchange-token')
  @ApiOperation({ summary: 'Intercambiar token de Google por tokens de Cognito' })
  @ApiResponse({ status: 200, description: 'Tokens de Cognito obtenidos exitosamente' })
  @ApiResponse({ status: 401, description: 'Token de Google inválido' })
  @ApiResponse({ status: 400, description: 'Autenticación federada no configurada' })
  async exchangeGoogleToken(@Body() googleTokenDto: GoogleTokenDto) {
    this.logger.log('🔄 Intercambiando token de Google por tokens de Cognito...');
    
    try {
      const cognitoTokens = await this.authService.exchangeGoogleTokenForCognito(googleTokenDto.idToken);
      
      this.logger.log('✅ Intercambio de tokens exitoso');
      
      return {
        success: true,
        message: 'Token intercambiado exitosamente',
        tokens: cognitoTokens,
      };
      
    } catch (error) {
      this.logger.error(`❌ Error intercambiando token: ${error.message}`);
      throw error;
    }
  }

  @Get('federated-config')
  @ApiOperation({ summary: 'Verificar configuración de autenticación federada' })
  @ApiResponse({ status: 200, description: 'Estado de configuración federada' })
  async getFederatedConfiguration() {
    const federatedConfigured = await this.checkFederatedAuthConfiguration();
    const googleAvailable = this.authService.isGoogleAuthAvailable();
    
    return {
      federatedAuthConfigured: federatedConfigured,
      googleAuthAvailable: googleAvailable,
      capabilities: {
        tokenExchange: federatedConfigured,
        federatedLogin: federatedConfigured && googleAvailable,
        legacyLogin: googleAvailable,
      },
      message: federatedConfigured 
        ? 'Autenticación federada completamente configurada'
        : 'Autenticación federada no configurada - usando modo legacy',
    };
  }

  /**
   * Verificar si la autenticación federada está configurada
   */
  private async checkFederatedAuthConfiguration(): Promise<boolean> {
    try {
      // Verificar si CognitoService tiene configuración federada
      const cognitoService = this.authService['cognitoService'];
      return cognitoService?.validateProviderConfiguration() || false;
    } catch (error) {
      this.logger.error(`Error verificando configuración federada: ${error.message}`);
      return false;
    }
  }
}