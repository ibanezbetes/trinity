import { Controller, Get, Post, Body, Param, Logger } from '@nestjs/common';
import { AppSyncCompatibilityService } from './appsync-compatibility.service';

/**
 * AppSync Compatibility Controller
 * 
 * Controlador para probar y monitorear la compatibilidad con AppSync.
 * Proporciona endpoints para verificar el estado de la integración.
 */
@Controller('appsync-compatibility')
export class AppSyncCompatibilityController {
  private readonly logger = new Logger(AppSyncCompatibilityController.name);

  constructor(
    private readonly appSyncCompatibilityService: AppSyncCompatibilityService
  ) {}

  /**
   * Obtiene estadísticas de compatibilidad
   */
  @Get('stats')
  getCompatibilityStats() {
    this.logger.log('Getting compatibility stats');
    return this.appSyncCompatibilityService.getCompatibilityStats();
  }

  /**
   * Valida la configuración de AppSync
   */
  @Get('validate')
  validateConfiguration() {
    this.logger.log('Validating AppSync configuration');
    return this.appSyncCompatibilityService.validateAppSyncConfiguration();
  }

  /**
   * Verifica si una operación está soportada
   */
  @Get('operation/:type/:name/supported')
  checkOperationSupport(
    @Param('type') type: 'query' | 'mutation' | 'subscription',
    @Param('name') name: string
  ) {
    const isSupported = this.appSyncCompatibilityService.isOperationSupported(type, name);
    const isDeprecated = this.appSyncCompatibilityService.isOperationDeprecated(type, name);
    const replacement = this.appSyncCompatibilityService.getOperationReplacement(type, name);
    const transformations = this.appSyncCompatibilityService.getOperationTransformations(type, name);

    return {
      operationType: type,
      operationName: name,
      isSupported,
      isDeprecated,
      replacement,
      transformations
    };
  }

  /**
   * Prueba la transformación de createRoom
   */
  @Post('test/createRoom')
  testCreateRoomTransformation(@Body() input: any) {
    this.logger.log('Testing createRoom transformation');
    
    const originalInput = { ...input };
    const transformedInput = this.appSyncCompatibilityService.transformCreateRoomInput(input);
    
    return {
      original: originalInput,
      transformed: transformedInput,
      genrePreferencesRemoved: 'genrePreferences' in originalInput && !('genrePreferences' in transformedInput)
    };
  }

  /**
   * Prueba la transformación de operaciones deprecadas
   */
  @Post('test/deprecated/:operation')
  testDeprecatedTransformation(
    @Param('operation') operation: string,
    @Body() variables: any
  ) {
    this.logger.log(`Testing deprecated operation transformation: ${operation}`);
    
    if (!['createRoomDebug', 'createRoomSimple'].includes(operation)) {
      return {
        error: 'Operation not supported for testing',
        supportedOperations: ['createRoomDebug', 'createRoomSimple']
      };
    }
    
    const transformedVariables = this.appSyncCompatibilityService.transformDeprecatedCreateRoom(operation, variables);
    
    return {
      operation,
      original: variables,
      transformed: transformedVariables
    };
  }

  /**
   * Prueba la transformación de paginación
   */
  @Post('test/pagination')
  testPaginationTransformation(@Body() variables: any) {
    this.logger.log('Testing pagination transformation');
    
    const originalVariables = { ...variables };
    const transformedVariables = this.appSyncCompatibilityService.addDefaultPagination(variables);
    
    return {
      original: originalVariables,
      transformed: transformedVariables,
      paginationAdded: (!originalVariables.page && transformedVariables.page) ? true : false
    };
  }

  /**
   * Prueba la transformación de contexto AI
   */
  @Post('test/ai-context')
  testAIContextTransformation(@Body() variables: any) {
    this.logger.log('Testing AI context transformation');
    
    const originalVariables = { ...variables };
    const transformedVariables = this.appSyncCompatibilityService.enhanceAIContext(variables);
    
    return {
      original: originalVariables,
      transformed: transformedVariables,
      contextEnhanced: Object.keys(transformedVariables).length > Object.keys(originalVariables).length
    };
  }

  /**
   * Prueba la transformación de respuestas
   */
  @Post('test/response/createRoom')
  testCreateRoomResponseTransformation(@Body() response: any) {
    this.logger.log('Testing createRoom response transformation');
    
    const originalResponse = { ...response };
    const transformedResponse = this.appSyncCompatibilityService.transformCreateRoomResponse(response);
    
    return {
      original: originalResponse,
      transformed: transformedResponse,
      fieldsAdded: transformedResponse?.data?.createRoom?.genrePreferences !== undefined
    };
  }

  /**
   * Prueba la transformación de eventos de votación
   */
  @Post('test/event/vote')
  testVoteEventTransformation(@Body() event: any) {
    this.logger.log('Testing vote event transformation');
    
    const originalEvent = { ...event };
    const transformedEvent = this.appSyncCompatibilityService.transformVoteEvent(event);
    
    return {
      original: originalEvent,
      transformed: transformedEvent,
      eventType: transformedEvent.eventType
    };
  }

  /**
   * Prueba la transformación de eventos de match
   */
  @Post('test/event/match')
  testMatchEventTransformation(@Body() event: any) {
    this.logger.log('Testing match event transformation');
    
    const originalEvent = { ...event };
    const transformedEvent = this.appSyncCompatibilityService.transformMatchEvent(event);
    
    return {
      original: originalEvent,
      transformed: transformedEvent,
      eventType: transformedEvent.eventType
    };
  }

  /**
   * Health check para la compatibilidad
   */
  @Get('health')
  healthCheck() {
    const stats = this.appSyncCompatibilityService.getCompatibilityStats();
    const validation = this.appSyncCompatibilityService.validateAppSyncConfiguration();
    
    return {
      status: validation.isValid ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      compatibility: stats,
      validation,
      version: '2.0.0'
    };
  }
}