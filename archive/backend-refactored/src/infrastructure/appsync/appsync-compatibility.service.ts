import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * AppSync Compatibility Service
 * 
 * Servicio que maneja la compatibilidad entre el nuevo backend refactorizado
 * y la infraestructura AppSync existente, asegurando que las operaciones
 * GraphQL de la app móvil sigan funcionando sin cambios.
 * 
 * **Valida: Requirements 4.2, 4.5**
 */
@Injectable()
export class AppSyncCompatibilityService {
  private readonly logger = new Logger(AppSyncCompatibilityService.name);
  
  // Configuración de AWS existente
  private readonly awsConfig = {
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_6UxioIj4z',
    userPoolClientId: '59dpqsm580j14ulkcha19shl64'
  };

  // Mapeo de operaciones GraphQL
  private readonly operationMappings = {
    // Queries
    query: {
      'getUserRooms': {
        supported: true,
        transformation: 'none',
        backendService: 'RoomService.getUserRooms'
      },
      'getRoom': {
        supported: true,
        transformation: 'none',
        backendService: 'RoomService.getRoom'
      },
      'getMovies': {
        supported: true,
        transformation: 'add_pagination',
        backendService: 'MovieService.getMovies'
      },
      'getMovieDetails': {
        supported: true,
        transformation: 'none',
        backendService: 'MovieService.getMovieDetails'
      },
      'getChatRecommendations': {
        supported: true,
        transformation: 'enhance_context',
        backendService: 'AIService.getChatRecommendations'
      }
    },
    
    // Mutations
    mutation: {
      'createRoom': {
        supported: true,
        transformation: 'remove_genre_preferences',
        backendService: 'RoomService.createRoom'
      },
      'createRoomDebug': {
        supported: false,
        deprecated: true,
        replacement: 'createRoom',
        transformation: 'debug_to_standard'
      },
      'createRoomSimple': {
        supported: false,
        deprecated: true,
        replacement: 'createRoom',
        transformation: 'simple_to_standard'
      },
      'joinRoomByInvite': {
        supported: true,
        transformation: 'none',
        backendService: 'RoomService.joinRoomByInvite'
      },
      'vote': {
        supported: true,
        transformation: 'none',
        backendService: 'VotingService.vote'
      }
    },
    
    // Subscriptions
    subscription: {
      'onVoteUpdate': {
        supported: true,
        transformation: 'basic_format',
        backendService: 'RealtimeService.publishVoteUpdate'
      },
      'onMatchFound': {
        supported: true,
        transformation: 'basic_format',
        backendService: 'RealtimeService.publishMatchFound'
      },
      'onMemberUpdate': {
        supported: true,
        transformation: 'basic_format',
        backendService: 'RealtimeService.publishMemberUpdate'
      },
      'onVoteUpdateEnhanced': {
        supported: true,
        transformation: 'enhanced_format',
        backendService: 'RealtimeService.publishVoteUpdateEnhanced'
      },
      'onMatchFoundEnhanced': {
        supported: true,
        transformation: 'enhanced_format',
        backendService: 'RealtimeService.publishMatchFoundEnhanced'
      },
      'onConnectionStatusChange': {
        supported: true,
        transformation: 'connection_format',
        backendService: 'RealtimeService.publishConnectionStatus'
      },
      'onRoomStateSync': {
        supported: true,
        transformation: 'state_sync_format',
        backendService: 'RealtimeService.publishRoomStateSync'
      }
    }
  };

  constructor(private configService: ConfigService) {
    this.logger.log('AppSync Compatibility Service initialized');
    this.logger.log(`AWS Configuration: ${JSON.stringify(this.awsConfig)}`);
  }

  /**
   * Verifica si una operación GraphQL está soportada
   */
  isOperationSupported(operationType: 'query' | 'mutation' | 'subscription', operationName: string): boolean {
    const operations = this.operationMappings[operationType] as any;
    
    if (!operations) {
      return false;
    }
    
    return operations[operationName]?.supported || false;
  }

  /**
   * Verifica si una operación está deprecada
   */
  isOperationDeprecated(operationType: 'query' | 'mutation' | 'subscription', operationName: string): boolean {
    const operations = this.operationMappings[operationType] as any;
    
    if (!operations) {
      return false;
    }
    
    return operations[operationName]?.deprecated || false;
  }

  /**
   * Obtiene el reemplazo para una operación deprecada
   */
  getOperationReplacement(operationType: 'query' | 'mutation' | 'subscription', operationName: string): string | null {
    const operations = this.operationMappings[operationType] as any;
    
    if (!operations) {
      return null;
    }
    
    return operations[operationName]?.replacement || null;
  }

  /**
   * Obtiene las transformaciones necesarias para una operación
   */
  getOperationTransformations(operationType: 'query' | 'mutation' | 'subscription', operationName: string): string[] {
    const operations = this.operationMappings[operationType] as any;
    
    if (!operations) {
      return [];
    }
    
    const transformation = operations[operationName]?.transformation;
    
    if (!transformation || transformation === 'none') {
      return [];
    }
    
    return [transformation];
  }

  /**
   * Transforma input de createRoom removiendo genrePreferences
   */
  transformCreateRoomInput(input: any): any {
    if (!input) return input;
    
    const { genrePreferences, ...sanitizedInput } = input;
    
    if (genrePreferences) {
      this.logger.debug(`Removed genrePreferences from createRoom input: ${JSON.stringify(genrePreferences)}`);
    }
    
    return sanitizedInput;
  }

  /**
   * Transforma operaciones deprecadas de createRoom
   */
  transformDeprecatedCreateRoom(operationType: string, variables: any): any {
    let transformedInput: any = {};
    
    if (operationType === 'createRoomDebug') {
      const roomName = variables?.input?.name || variables?.name || 'Debug Room';
      transformedInput = {
        name: roomName,
        description: `Debug room - ${roomName}`,
        isPrivate: false,
        maxMembers: 10
      };
    } else if (operationType === 'createRoomSimple') {
      const roomName = variables?.name || variables?.input?.name || 'Simple Room';
      transformedInput = {
        name: roomName,
        description: `Simple room - ${roomName}`,
        isPrivate: false,
        maxMembers: 10
      };
    }
    
    // Asegurar que siempre tenemos un nombre válido
    if (!transformedInput.name || transformedInput.name.trim() === '') {
      transformedInput.name = `${operationType} - ${Date.now()}`;
      transformedInput.description = `Auto-generated room from ${operationType}`;
    }
    
    this.logger.debug(`Transformed ${operationType} to createRoom: ${JSON.stringify(transformedInput)}`);
    
    return { input: transformedInput };
  }

  /**
   * Agrega paginación por defecto a getMovies
   */
  addDefaultPagination(variables: any): any {
    const enhanced = { ...variables };
    
    if (!enhanced.page) {
      enhanced.page = 1;
    }
    if (!enhanced.limit) {
      enhanced.limit = 20;
    }
    
    this.logger.debug(`Added default pagination: page=${enhanced.page}, limit=${enhanced.limit}`);
    
    return enhanced;
  }

  /**
   * Mejora el contexto para recomendaciones AI
   */
  enhanceAIContext(variables: any): any {
    if (!variables || !variables.text) {
      return variables;
    }
    
    const enhanced = {
      ...variables,
      includeGenreAnalysis: true,
      maxRecommendations: 10,
      confidenceThreshold: 0.5
    };
    
    this.logger.debug('Enhanced AI recommendations context');
    
    return enhanced;
  }

  /**
   * Transforma respuesta de createRoom para compatibilidad móvil
   */
  transformCreateRoomResponse(response: any): any {
    // Manejar tanto response.createRoom como response.data.createRoom
    let room = null;
    let isNestedData = false;
    
    if (response?.data?.createRoom) {
      room = response.data.createRoom;
      isNestedData = true;
    } else if (response?.createRoom) {
      room = response.createRoom;
      isNestedData = false;
    } else {
      return response;
    }
    
    const transformedRoom = {
      ...room,
      genrePreferences: [], // Campo esperado por la app móvil
      inviteUrl: room.inviteCode ? `https://trinity.app/join/${room.inviteCode}` : null
    };
    
    if (isNestedData) {
      return {
        ...response,
        data: {
          ...response.data,
          createRoom: transformedRoom
        }
      };
    } else {
      return {
        ...response,
        createRoom: transformedRoom
      };
    }
  }

  /**
   * Transforma respuesta de getMovies para compatibilidad móvil
   */
  transformGetMoviesResponse(response: any): any {
    if (!response?.getMovies) {
      return response;
    }
    
    const movies = response.getMovies.map((movie: any) => ({
      ...movie,
      vote_average: movie.vote_average || movie.rating || 0,
      release_date: movie.release_date || (movie.year ? `${movie.year}-01-01` : null),
      genres: movie.genres || []
    }));
    
    return {
      ...response,
      getMovies: movies
    };
  }

  /**
   * Transforma evento de votación para suscripciones
   */
  transformVoteEvent(event: any): any {
    return {
      id: event.id || `vote-${Date.now()}`,
      timestamp: event.timestamp || new Date().toISOString(),
      roomId: event.roomId,
      eventType: 'VOTE_UPDATE',
      userId: event.userId,
      mediaId: event.mediaId || event.movieId,
      voteType: event.voteType || 'LIKE',
      progress: {
        totalVotes: event.progress?.totalVotes || 0,
        likesCount: event.progress?.likesCount || 0,
        dislikesCount: event.progress?.dislikesCount || 0,
        skipsCount: event.progress?.skipsCount || 0,
        remainingUsers: event.progress?.remainingUsers || 0,
        percentage: event.progress?.percentage || 0,
        votingUsers: event.progress?.votingUsers || [],
        pendingUsers: event.progress?.pendingUsers || []
      }
    };
  }

  /**
   * Transforma evento de match encontrado para suscripciones
   */
  transformMatchEvent(event: any): any {
    return {
      id: event.id || `match-${Date.now()}`,
      timestamp: event.timestamp || new Date().toISOString(),
      roomId: event.roomId,
      eventType: 'MATCH_FOUND',
      matchId: event.matchId || `match-${event.roomId}-${Date.now()}`,
      mediaId: event.mediaId || event.movieInfo?.id,
      mediaTitle: event.mediaTitle || event.movieInfo?.title,
      participants: event.participants || [],
      consensusType: event.consensusType || 'MAJORITY',
      movieInfo: event.movieInfo ? {
        id: event.movieInfo.id,
        title: event.movieInfo.title,
        poster: event.movieInfo.poster,
        overview: event.movieInfo.overview,
        genres: event.movieInfo.genres || [],
        year: event.movieInfo.year,
        rating: event.movieInfo.rating,
        runtime: event.movieInfo.runtime
      } : null
    };
  }

  /**
   * Obtiene estadísticas de compatibilidad
   */
  getCompatibilityStats(): any {
    const totalOperations = 
      Object.keys(this.operationMappings.query).length +
      Object.keys(this.operationMappings.mutation).length +
      Object.keys(this.operationMappings.subscription).length;
    
    const supportedOperations = [
      ...Object.values(this.operationMappings.query),
      ...Object.values(this.operationMappings.mutation),
      ...Object.values(this.operationMappings.subscription)
    ].filter((op: any) => op.supported).length;
    
    const deprecatedOperations = [
      ...Object.values(this.operationMappings.query),
      ...Object.values(this.operationMappings.mutation),
      ...Object.values(this.operationMappings.subscription)
    ].filter((op: any) => op.deprecated).length;
    
    return {
      totalOperations,
      supportedOperations,
      deprecatedOperations,
      compatibilityPercentage: Math.round((supportedOperations / totalOperations) * 100),
      awsRegion: this.awsConfig.region,
      userPoolId: this.awsConfig.userPoolId
    };
  }

  /**
   * Valida configuración de AppSync
   */
  validateAppSyncConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!this.awsConfig.region) {
      errors.push('AWS region not configured');
    }
    
    if (!this.awsConfig.userPoolId) {
      errors.push('Cognito User Pool ID not configured');
    }
    
    if (!this.awsConfig.userPoolClientId) {
      errors.push('Cognito User Pool Client ID not configured');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}