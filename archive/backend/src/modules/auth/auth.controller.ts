import {
    Body,
    Controller,
    Get,
    Headers,
    Logger,
    Post,
    Put,
    Request,
    UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { UserContext, UserId } from './decorators/user-context.decorator';
import { ConfirmSignUpDto } from './dto/confirm-signup.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { EnhancedUserContext } from './middleware/user-context.middleware';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  
  constructor(private authService: AuthService, private configService: ConfigService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo usuario con Cognito' })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente' })
  @ApiResponse({ status: 409, description: 'El email ya está registrado' })
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post('confirm-signup')
  @ApiOperation({ summary: 'Confirmar registro de usuario' })
  @ApiResponse({ status: 200, description: 'Usuario confirmado exitosamente' })
  @ApiResponse({ status: 400, description: 'Código de confirmación inválido' })
  async confirmSignUp(@Body() confirmSignUpDto: ConfirmSignUpDto) {
    return this.authService.confirmSignUp(confirmSignUpDto);
  }

  @Post('resend-confirmation')
  @ApiOperation({ summary: 'Reenviar código de confirmación' })
  @ApiResponse({ status: 200, description: 'Código reenviado exitosamente' })
  async resendConfirmation(@Body() resendDto: ResendConfirmationDto) {
    return this.authService.resendConfirmation(resendDto);
  }

  @Post('dev-login')
  @ApiOperation({ summary: 'Login de desarrollo (solo para testing)' })
  @ApiResponse({ status: 200, description: 'Login de desarrollo exitoso' })
  async devLogin(@Body() body: { email: string; password: string }) {
    // Solo permitir en desarrollo
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Endpoint de desarrollo no disponible en producción');
    }

    this.logger.log(`🧪 Dev Login attempt for: ${body.email}`);

    // Credenciales de desarrollo hardcodeadas
    const devCredentials = [
      { email: 'test@example.com', password: 'password123' },
      { email: 'admin@trinity.com', password: 'admin123' },
      { email: 'user@trinity.com', password: 'user123' },
    ];

    const validCredential = devCredentials.find(
      cred => cred.email === body.email && cred.password === body.password
    );

    if (!validCredential) {
      throw new Error('Credenciales de desarrollo inválidas');
    }

    // Crear un usuario mock
    const mockUser = {
      id: `dev-user-${Date.now()}`,
      email: body.email,
      username: body.email.split('@')[0],
      displayName: `Usuario ${body.email.split('@')[0]}`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Generar un token JWT simple para desarrollo
    const mockToken = Buffer.from(JSON.stringify({
      sub: mockUser.id,
      email: mockUser.email,
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 horas
    })).toString('base64');

    this.logger.log(`✅ Dev Login successful for: ${body.email}`);

    return {
      user: mockUser,
      tokens: {
        accessToken: `dev-token-${mockToken}`,
        idToken: `dev-id-${mockToken}`,
        refreshToken: `dev-refresh-${mockToken}`,
      },
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión con Cognito' })
  @ApiResponse({ status: 200, description: 'Login exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Iniciar recuperación de contraseña' })
  @ApiResponse({ status: 200, description: 'Código de recuperación enviado' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Confirmar nueva contraseña' })
  @ApiResponse({
    status: 200,
    description: 'Contraseña restablecida exitosamente',
  })
  @ApiResponse({ status: 400, description: 'Código de confirmación inválido' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getProfile(@UserContext() user: EnhancedUserContext) {
    return user;
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async updateProfile(
    @UserId() userId: string,
    @Body() updateProfileDto: UpdateProfileDto
  ) {
    return this.authService.updateProfile(userId, updateProfileDto);
  }

  @Post('refresh-token')
  @ApiOperation({ summary: 'Refrescar tokens de autenticación' })
  @ApiResponse({ status: 200, description: 'Tokens refrescados exitosamente' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido o expirado' })
  async refreshToken(@Body() body: { refreshToken: string }) {
    try {
      const newTokens = await this.authService.refreshTokens(body.refreshToken);
      
      this.logger.log('✅ Tokens refrescados exitosamente');
      
      return {
        message: 'Tokens refrescados exitosamente',
        tokens: newTokens,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Error refrescando tokens: ${error.message}`);
      throw error;
    }
  }

  @Get('config-health')
  @ApiOperation({ summary: 'Verificar estado de configuración de autenticación' })
  @ApiResponse({ status: 200, description: 'Estado de configuración de autenticación' })
  async getConfigHealth() {
    this.logger.log('🔍 Configuration health check requested');
    
    try {
      const healthStatus = await this.authService.getConfigurationHealthStatus();
      
      this.logger.log(`✅ Configuration health check completed - Status: ${healthStatus.status}`);
      
      return {
        timestamp: new Date().toISOString(),
        ...healthStatus,
      };
    } catch (error) {
      this.logger.error(`❌ Configuration health check failed: ${error.message}`);
      
      return {
        timestamp: new Date().toISOString(),
        status: 'critical',
        score: 0,
        issues: [`Configuration health check failed: ${error.message}`],
        recommendations: ['Check server logs for detailed error information'],
        cognito: {
          configured: false,
          userPoolId: 'ERROR',
          clientId: 'ERROR',
          region: 'ERROR',
        },
        google: {
          configured: false,
          clientId: 'ERROR',
        },
        overall: {
          ready: false,
          message: 'Authentication system configuration is not healthy',
        },
      };
    }
  }

  @Get('debug-env')
  @ApiOperation({ summary: 'Debug: Verificar variables de entorno (solo desarrollo)' })
  async debugEnv() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Endpoint de debug no disponible en producción');
    }

    return {
      NODE_ENV: process.env.NODE_ENV,
      COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
      COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
      COGNITO_REGION: process.env.COGNITO_REGION,
      AWS_REGION: process.env.AWS_REGION,
      configServiceValues: {
        COGNITO_USER_POOL_ID: this.configService.get('COGNITO_USER_POOL_ID'),
        COGNITO_CLIENT_ID: this.configService.get('COGNITO_CLIENT_ID'),
        COGNITO_REGION: this.configService.get('COGNITO_REGION'),
      }
    };
  }

  @Get('test-auth')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Endpoint de prueba para autenticación' })
  @ApiResponse({ status: 200, description: 'Autenticación exitosa' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async testAuth(@Request() req) {
    this.logger.log(`🧪 Test Auth - Usuario: ${req.user?.email || 'undefined'}`);
    this.logger.log(`🧪 Test Auth - Sub: ${req.user?.sub || 'undefined'}`);
    return { 
      message: 'Autenticación exitosa', 
      user: req.user,
      timestamp: new Date().toISOString()
    };
  }

  @Get('verify-token')
  @ApiOperation({ summary: 'Verificar token de autenticación (debug)' })
  @ApiResponse({ status: 200, description: 'Token verificado' })
  async verifyToken(@Headers('authorization') authHeader: string) {
    this.logger.log(`Verificando token: ${authHeader ? 'presente' : 'ausente'}`);
    
    if (!authHeader) {
      return { valid: false, error: 'No authorization header' };
    }
    
    const token = authHeader.replace('Bearer ', '');
    this.logger.log(`Token length: ${token.length}`);
    this.logger.log(`Token preview: ${token.substring(0, 50)}...`);
    
    try {
      const user = await this.authService.validateUserByToken(token);
      if (user) {
        this.logger.log(`Token válido para usuario: ${user.email}`);
        return { valid: true, user };
      } else {
        this.logger.warn('Token inválido - usuario no encontrado');
        return { valid: false, error: 'Token inválido' };
      }
    } catch (error) {
      this.logger.error(`Error verificando token: ${error.message}`);
      return { valid: false, error: error.message };
    }
  }
}
