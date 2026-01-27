import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * AppSync Compatibility Middleware
 * 
 * Maneja la compatibilidad entre las operaciones GraphQL existentes de la app móvil
 * y el nuevo backend, usando AppSync como capa de comunicación en tiempo real.
 * 
 * **Valida: Requirements 4.2, 4.5**
 */
@Injectable()
export class AppSyncCompatibilityMiddleware implements NestMiddleware {
  
  use(req: Request, res: Response, next: NextFunction) {
    // Interceptar operaciones GraphQL para transformaciones
    if (req.body && req.body.query) {
      this.handleGraphQLOperation(req, res);
    }
    
    next();
  }
  
  /**
   * Maneja operaciones GraphQL y aplica transformaciones de compatibilidad
   */
  private handleGraphQLOperation(req: Request, res: Response) {
    const { query, variables } = req.body;
    
    // Detectar operación específica
    const operationName = this.extractOperationName(query);
    
    switch (operationName) {
      case 'createRoom':
        this.handleCreateRoomCompatibility(req, variables);
        break;
        
      case 'createRoomDebug':
        this.handleDeprecatedCreateRoom(req, variables, 'createRoomDebug');
        break;
        
      case 'createRoomSimple':
        this.handleDeprecatedCreateRoom(req, variables, 'createRoomSimple');
        break;
        
      case 'getAllMovies':
        this.handleDeprecatedGetAllMovies(req, variables);
        break;
        
      case 'getMovies':
        this.handleGetMoviesCompatibility(req, variables);
        break;
        
      case 'getChatRecommendations':
        this.handleAIRecommendationsCompatibility(req, variables);
        break;
    }
    
    // Agregar headers de compatibilidad
    this.addCompatibilityHeaders(res, operationName);
  }
  
  /**
   * Extrae el nombre de la operación GraphQL
   */
  private extractOperationName(query: string): string {
    const operationMatch = query.match(/(?:query|mutation|subscription)\s+(\w+)/);
    if (operationMatch) {
      return operationMatch[1];
    }
    
    // Fallback: buscar por nombre de campo
    const fieldMatch = query.match(/{\s*(\w+)/);
    return fieldMatch ? fieldMatch[1] : 'unknown';
  }
  
  /**
   * Maneja compatibilidad para createRoom - remueve genrePreferences
   */
  private handleCreateRoomCompatibility(req: Request, variables: any) {
    if (variables && variables.input && variables.input.genrePreferences) {
      console.log('🔄 Compatibility: Removing genrePreferences from createRoom input');
      
      // Guardar genrePreferences para logging pero remover del input
      const removedPreferences = variables.input.genrePreferences;
      delete variables.input.genrePreferences;
      
      // Log para debugging
      console.log('📝 Removed genrePreferences:', removedPreferences);
      
      // Actualizar el request
      req.body.variables = variables;
    }
  }
  
  /**
   * Maneja operaciones createRoom deprecadas
   */
  private handleDeprecatedCreateRoom(req: Request, variables: any, operationType: string) {
    console.log(`⚠️ Deprecated operation used: ${operationType}`);
    
    // Transformar a createRoom estándar
    let transformedInput: any = {};
    
    if (operationType === 'createRoomDebug') {
      // Obtener nombre del input o usar valor por defecto
      const roomName = variables?.input?.name || variables?.name || 'Debug Room';
      transformedInput = {
        name: roomName,
        description: `Debug room - ${roomName}`,
        isPrivate: false,
        maxMembers: 10
      };
    } else if (operationType === 'createRoomSimple') {
      // Obtener nombre de variables.name o usar valor por defecto
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
    
    // Actualizar query y variables para usar createRoom
    req.body.query = req.body.query.replace(operationType, 'createRoom');
    req.body.variables = { input: transformedInput };
    
    console.log('🔄 Transformed deprecated operation to createRoom:', transformedInput);
  }
  
  /**
   * Maneja getAllMovies deprecado - convertir a getMovies paginado
   */
  private handleDeprecatedGetAllMovies(req: Request, variables: any) {
    console.log('⚠️ Deprecated operation used: getAllMovies');
    
    // Transformar a getMovies con paginación
    req.body.query = req.body.query.replace('getAllMovies', 'getMovies');
    req.body.variables = {
      ...variables,
      page: 1,
      limit: 100 // Obtener muchas películas para simular "all"
    };
    
    console.log('🔄 Transformed getAllMovies to paginated getMovies');
  }
  
  /**
   * Maneja compatibilidad para getMovies - agregar paginación por defecto
   */
  private handleGetMoviesCompatibility(req: Request, variables: any) {
    if (!variables) {
      variables = {};
    }
    
    // Agregar paginación por defecto si no existe
    if (!variables.page) {
      variables.page = 1;
    }
    if (!variables.limit) {
      variables.limit = 20;
    }
    
    req.body.variables = variables;
    console.log('🔄 Added default pagination to getMovies:', { page: variables.page, limit: variables.limit });
  }
  
  /**
   * Maneja compatibilidad para recomendaciones AI
   */
  private handleAIRecommendationsCompatibility(req: Request, variables: any) {
    if (variables && variables.text) {
      // Agregar contexto adicional para mejores recomendaciones
      const enhancedVariables = {
        ...variables,
        includeGenreAnalysis: true,
        maxRecommendations: 10,
        confidenceThreshold: 0.5
      };
      
      req.body.variables = enhancedVariables;
      console.log('🔄 Enhanced AI recommendations request with additional context');
    }
  }
  
  /**
   * Agrega headers de compatibilidad a la respuesta
   */
  private addCompatibilityHeaders(res: Response, operationName: string) {
    res.setHeader('X-Trinity-Compatibility', 'enabled');
    res.setHeader('X-Trinity-Operation', operationName);
    res.setHeader('X-Trinity-Version', '2.0.0');
    
    // Headers específicos para operaciones deprecadas
    const deprecatedOperations = ['createRoomDebug', 'createRoomSimple', 'getAllMovies'];
    if (deprecatedOperations.includes(operationName)) {
      res.setHeader('X-Trinity-Deprecated', 'true');
      res.setHeader('X-Trinity-Migration-Deadline', '2024-06-01');
      res.setHeader('X-Trinity-Replacement', this.getReplacementOperation(operationName));
    }
  }
  
  /**
   * Obtiene la operación de reemplazo para operaciones deprecadas
   */
  private getReplacementOperation(deprecatedOperation: string): string {
    const replacements: Record<string, string> = {
      'createRoomDebug': 'createRoom',
      'createRoomSimple': 'createRoom',
      'getAllMovies': 'getMovies'
    };
    
    return replacements[deprecatedOperation] || 'unknown';
  }
}

/**
 * AppSync Response Transformer
 * 
 * Transforma las respuestas de AppSync para mantener compatibilidad
 * con el formato esperado por la aplicación móvil.
 */
@Injectable()
export class AppSyncResponseTransformer {
  
  /**
   * Transforma respuesta de createRoom para compatibilidad
   */
  transformCreateRoomResponse(response: any): any {
    if (response && response.data && response.data.createRoom) {
      const room = response.data.createRoom;
      
      // Agregar campos que la app móvil espera pero que pueden no estar
      return {
        ...response,
        data: {
          createRoom: {
            ...room,
            genrePreferences: [], // Campo removido pero la app lo espera
            inviteUrl: room.inviteCode ? `https://trinity.app/join/${room.inviteCode}` : null
          }
        }
      };
    }
    
    return response;
  }
  
  /**
   * Transforma respuesta de getMovies para compatibilidad
   */
  transformGetMoviesResponse(response: any): any {
    if (response && response.data && response.data.getMovies) {
      const movies = response.data.getMovies;
      
      // Asegurar que cada película tenga todos los campos esperados
      const transformedMovies = movies.map((movie: any) => ({
        ...movie,
        vote_average: movie.vote_average || movie.rating || 0,
        release_date: movie.release_date || movie.year ? `${movie.year}-01-01` : null,
        genres: movie.genres || []
      }));
      
      return {
        ...response,
        data: {
          getMovies: transformedMovies
        }
      };
    }
    
    return response;
  }
  
  /**
   * Transforma respuesta de AI para compatibilidad
   */
  transformAIResponse(response: any): any {
    if (response && response.data && response.data.getChatRecommendations) {
      const aiResponse = response.data.getChatRecommendations;
      
      // Asegurar que todos los campos esperados estén presentes
      return {
        ...response,
        data: {
          getChatRecommendations: {
            chatResponse: aiResponse.chatResponse || 'No recommendations available',
            recommendedGenres: aiResponse.recommendedGenres || [],
            confidence: aiResponse.confidence || 0.5,
            reasoning: aiResponse.reasoning || 'Standard recommendation',
            genreAlignment: aiResponse.genreAlignment || 0.5,
            fallbackUsed: aiResponse.fallbackUsed || false
          }
        }
      };
    }
    
    return response;
  }
}

/**
 * AppSync Subscription Compatibility Handler
 * 
 * Maneja la compatibilidad de las suscripciones en tiempo real de AppSync
 * para asegurar que la app móvil reciba los eventos en el formato correcto.
 */
@Injectable()
export class AppSyncSubscriptionCompatibilityHandler {
  
  /**
   * Transforma eventos de votación para compatibilidad
   */
  transformVoteUpdateEvent(event: any): any {
    // Asegurar compatibilidad con el formato esperado por la app móvil
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
   * Transforma eventos de match encontrado para compatibilidad
   */
  transformMatchFoundEvent(event: any): any {
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
   * Transforma eventos de miembros para compatibilidad
   */
  transformMemberUpdateEvent(event: any): any {
    return {
      id: event.id || `member-${Date.now()}`,
      timestamp: event.timestamp || new Date().toISOString(),
      roomId: event.roomId,
      eventType: 'MEMBER_UPDATE',
      userId: event.userId,
      action: event.action || 'JOINED',
      memberCount: event.memberCount || 1,
      memberData: event.memberData || {
        role: 'member',
        status: 'active',
        permissions: ['vote'],
        lastActivity: new Date().toISOString()
      }
    };
  }
}