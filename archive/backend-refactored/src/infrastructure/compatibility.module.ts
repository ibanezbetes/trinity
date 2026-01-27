import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppSyncCompatibilityMiddleware, AppSyncResponseTransformer, AppSyncSubscriptionCompatibilityHandler } from './middleware/appsync-compatibility.middleware';
import { AppSyncCompatibilityService } from './appsync/appsync-compatibility.service';
import { AppSyncCompatibilityController } from './appsync/appsync-compatibility.controller';

/**
 * Compatibility Module
 * 
 * Módulo que proporciona toda la funcionalidad de compatibilidad
 * para mantener la aplicación móvil funcionando durante la migración.
 * 
 * **Valida: Requirements 4.2, 4.5**
 */
@Module({
  imports: [ConfigModule],
  controllers: [AppSyncCompatibilityController],
  providers: [
    AppSyncCompatibilityService,
    AppSyncCompatibilityMiddleware,
    AppSyncResponseTransformer,
    AppSyncSubscriptionCompatibilityHandler
  ],
  exports: [
    AppSyncCompatibilityService,
    AppSyncResponseTransformer,
    AppSyncSubscriptionCompatibilityHandler
  ]
})
export class CompatibilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Aplicar middleware de compatibilidad a todas las rutas GraphQL
    consumer
      .apply(AppSyncCompatibilityMiddleware)
      .forRoutes('*');
  }
}

/**
 * Configuración de compatibilidad para AppSync
 */
export const AppSyncCompatibilityConfig = {
  // Configuración de la región y endpoints existentes
  aws: {
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_6UxioIj4z',
    userPoolClientId: '59dpqsm580j14ulkcha19shl64'
  },
  
  // Operaciones GraphQL soportadas
  supportedOperations: {
    queries: [
      'getUserRooms',
      'getRoom', 
      'getMovies',
      'getMovieDetails',
      'getChatRecommendations'
    ],
    mutations: [
      'createRoom',
      'createRoomDebug', // Deprecado
      'createRoomSimple', // Deprecado
      'joinRoomByInvite',
      'vote'
    ],
    subscriptions: [
      'onVoteUpdate',
      'onMatchFound',
      'onMemberUpdate',
      'onVoteUpdateEnhanced', // Mejorado
      'onMatchFoundEnhanced', // Mejorado
      'onConnectionStatusChange', // Nuevo
      'onRoomStateSync' // Nuevo
    ]
  },
  
  // Configuración de transformaciones
  transformations: {
    enabled: true,
    logTransformations: true,
    
    // Reglas específicas por operación
    rules: {
      'createRoom': ['remove_genre_preferences'],
      'createRoomDebug': ['debug_to_standard'],
      'createRoomSimple': ['simple_to_standard'],
      'getMovies': ['add_pagination'],
      'getChatRecommendations': ['enhance_context']
    }
  },
  
  // Configuración de deprecación
  deprecation: {
    enabled: true,
    logWarnings: true,
    
    // Operaciones deprecadas
    operations: {
      'createRoomDebug': {
        replacement: 'createRoom',
        deadline: '2024-06-01',
        severity: 'warning'
      },
      'createRoomSimple': {
        replacement: 'createRoom', 
        deadline: '2024-06-01',
        severity: 'warning'
      },
      'getAllMovies': {
        replacement: 'getMovies',
        deadline: '2024-06-01',
        severity: 'warning'
      }
    }
  },
  
  // Configuración de suscripciones en tiempo real
  subscriptions: {
    enabled: true,
    enhancedEnabled: true,
    
    // Mapeo de suscripciones a mutaciones de publicación
    mappings: {
      'onVoteUpdate': 'publishVoteEvent',
      'onMatchFound': 'publishMatchEvent', 
      'onMemberUpdate': 'publishMemberEvent',
      'onVoteUpdateEnhanced': 'publishVoteUpdateEvent',
      'onMatchFoundEnhanced': 'publishMatchFoundEvent',
      'onConnectionStatusChange': 'publishConnectionStatusEvent',
      'onRoomStateSync': 'publishRoomStateEvent'
    }
  },
  
  // Configuración de monitoreo
  monitoring: {
    enabled: true,
    logOperations: true,
    trackDeprecatedUsage: true,
    
    // Métricas a rastrear
    metrics: [
      'operation_count',
      'deprecated_operation_usage',
      'transformation_count',
      'subscription_connections',
      'error_rate'
    ]
  }
};