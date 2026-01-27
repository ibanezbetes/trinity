/**
 * Configuración de Compatibilidad para Trinity Mobile App
 * 
 * Esta configuración asegura que la app móvil funcione correctamente
 * con el nuevo backend mientras mantiene compatibilidad con AppSync.
 */

export const CompatibilityConfig = {
  // Configuración de AppSync existente (mantener igual)
  appSync: {
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_EMnWISSRn',
    userPoolClientId: '4svfit1a4muis95knfa8uh841r',
    // El endpoint se obtiene dinámicamente de aws-exports.ts
  },

  // Configuración de compatibilidad
  compatibility: {
    enabled: true,
    version: '2.0.0',

    // Operaciones deprecadas - mostrar warnings pero seguir funcionando
    deprecatedOperations: {
      'createRoomDebug': {
        replacement: 'createRoom',
        showWarning: true,
        autoMigrate: true
      },
      'createRoomSimple': {
        replacement: 'createRoom',
        showWarning: true,
        autoMigrate: true
      },
      'getAllMovies': {
        replacement: 'getMovies',
        showWarning: true,
        autoMigrate: true
      }
    },

    // Transformaciones automáticas
    transformations: {
      // Remover genrePreferences automáticamente
      removeGenrePreferences: true,

      // Agregar paginación por defecto
      addDefaultPagination: true,

      // Mejorar contexto de AI
      enhanceAIContext: true
    },

    // Configuración de suscripciones
    subscriptions: {
      // Usar suscripciones básicas por defecto
      useBasicSubscriptions: true,

      // Habilitar suscripciones mejoradas (opcional)
      enableEnhancedSubscriptions: false,

      // Configuración de reconexión
      reconnection: {
        enabled: true,
        maxAttempts: 5,
        backoffDelay: 1000
      }
    }
  },

  // Configuración de logging para debugging
  logging: {
    enabled: __DEV__,
    logCompatibilityWarnings: true,
    logTransformations: __DEV__,
    logSubscriptionEvents: __DEV__
  }
};

/**
 * Helper para verificar si una operación está deprecada
 */
export function isOperationDeprecated(operationName: string): boolean {
  return operationName in CompatibilityConfig.compatibility.deprecatedOperations;
}

/**
 * Helper para obtener el reemplazo de una operación deprecada
 */
export function getOperationReplacement(operationName: string): string | null {
  const deprecated = CompatibilityConfig.compatibility.deprecatedOperations[operationName];
  return deprecated ? deprecated.replacement : null;
}

/**
 * Helper para mostrar warning de operación deprecada
 */
export function showDeprecationWarning(operationName: string): void {
  if (__DEV__ && isOperationDeprecated(operationName)) {
    const replacement = getOperationReplacement(operationName);
    console.warn(
      `⚠️ Trinity Compatibility Warning: Operation "${operationName}" is deprecated. ` +
      `Please use "${replacement}" instead. This operation will be removed in a future version.`
    );
  }
}

/**
 * Configuración específica para diferentes entornos
 */
export const EnvironmentConfig = {
  development: {
    ...CompatibilityConfig,
    logging: {
      enabled: true,
      logCompatibilityWarnings: true,
      logTransformations: true,
      logSubscriptionEvents: true
    }
  },

  production: {
    ...CompatibilityConfig,
    logging: {
      enabled: false,
      logCompatibilityWarnings: false,
      logTransformations: false,
      logSubscriptionEvents: false
    }
  }
};

/**
 * Obtener configuración según el entorno
 */
export function getEnvironmentConfig() {
  return __DEV__ ? EnvironmentConfig.development : EnvironmentConfig.production;
}