import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// Import content filtering services
import { ContentFilterService } from '../services/content-filter-service';
import { EnhancedTMDBClient } from '../services/enhanced-tmdb-client';
import { PriorityAlgorithmEngine } from '../services/priority-algorithm';
import { FilterCacheManager } from '../services/filter-cache-manager';
import { movieCacheService } from '../services/movieCacheService';
import { MediaType, FilterCriteria, CreateRoomInput, UpdateRoomFiltersInput, FilterImmutabilityError, FilterValidationError } from '../types/content-filtering-types';

// Simple replacements for metrics and utilities
const logBusinessMetric = (event: string, roomId: string, userId: string, data: any) => {
  console.log(`📊 Business Metric: ${event}`, { roomId, userId, data });
};

const logError = (operation: string, error: Error, context: any) => {
  console.error(`❌ Error in ${operation}:`, error, context);
};

class PerformanceTimer {
  private startTime: number;
  private operation: string;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = Date.now();
  }

  finish(success: boolean, errorType?: string, data?: any) {
    const duration = Date.now() - this.startTime;
    console.log(`⏱️ ${this.operation}: ${duration}ms (${success ? 'SUCCESS' : 'FAILED'})`, { errorType, data });
  }
}

// Simple deep link service replacement
const deepLinkService = {
  async generateInviteLink(roomId: string, hostId: string, options: any) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    return {
      code,
      url: `https://trinity-app.com/invite/${code}`
    };
  },
  
  async validateInviteCode(code: string) {
    // For now, return null - this will be implemented later
    return null;
  }
};

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Initialize content filtering services
let contentFilterService: ContentFilterService | null = null;

function getContentFilterService(): ContentFilterService {
  if (!contentFilterService) {
    contentFilterService = new ContentFilterService();
  }
  return contentFilterService;
}

interface Room {
  id: string;
  name: string;
  description?: string;
  status: string;
  resultMovieId?: string;
  hostId: string;
  inviteCode?: string;
  inviteUrl?: string;
  genrePreferences?: string[]; // DEPRECATED: Mantener por compatibilidad
  mediaType?: 'MOVIE' | 'TV'; // NUEVO: Tipo de contenido
  genreIds?: number[]; // NUEVO: IDs de géneros TMDB
  genreNames?: string[]; // NUEVO: Nombres de géneros (para UI)
  contentIds?: string[]; // NUEVO: IDs de los 30 títulos pre-cargados
  shownContentIds?: string[]; // NUEVO: IDs de títulos ya mostrados (para recarga)
  currentContentIndex?: number; // NUEVO: Índice actual en contentIds
  filterCriteria?: FilterCriteria; // NUEVO: Criterios de filtrado aplicados
  excludedContentIds?: string[]; // NUEVO: IDs de contenido excluido
  lastContentRefresh?: string; // NUEVO: Última actualización del pool de contenido
  isActive: boolean;
  isPrivate: boolean;
  memberCount: number;
  maxMembers?: number;
  matchCount?: number;
  createdAt: string;
  updatedAt?: string;
}

interface CreateRoomInputDebug {
  name: string;
}

interface RoomMember {
  roomId: string;
  userId: string;
  role: 'HOST' | 'MEMBER';
  joinedAt: string;
  isActive: boolean;
}

/**
 * RoomHandler: Gestiona salas
 * Maneja createRoom, joinRoom y getMyHistory
 */
export const handler: AppSyncResolverHandler<any, any> = async (event: AppSyncResolverEvent<any>) => {
  console.log('🏠 Room Handler:', JSON.stringify(event, null, 2));

  const { fieldName } = event.info;
  const { sub: userId } = event.identity as any; // Usuario autenticado

  try {
    switch (fieldName) {
      case 'createRoom':
        console.log('🔍 Room Handler - createRoom arguments:', JSON.stringify(event.arguments, null, 2));
        return await createRoom(userId, event.arguments.input);

      case 'createRoomDebug':
        console.log('🔍 Room Handler - createRoomDebug arguments:', JSON.stringify(event.arguments, null, 2));
        return await createRoomDebug(userId, event.arguments.input);

      case 'createRoomSimple':
        console.log('🔍 Room Handler - createRoomSimple arguments:', JSON.stringify(event.arguments, null, 2));
        return await createRoomSimple(userId, event.arguments.name);

      case 'joinRoom':
        return await joinRoom(userId, event.arguments.roomId);

      case 'joinRoomByInvite':
        return await joinRoomByInvite(userId, event.arguments.inviteCode);

      case 'getMyHistory':
        return await getMyHistory(userId);

      case 'getUserRooms':
        return await getMyHistory(userId); // getUserRooms is an alias for getMyHistory

      case 'getRoom':
        return await getRoom(userId, event.arguments.roomId);

      case 'getAvailableGenres':
        return await getAvailableGenres(event.arguments.mediaType);

      case 'updateRoomFilters':
        return await updateRoomFilters(userId, event.arguments.roomId, event.arguments.input);

      default:
        throw new Error(`Operación no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`❌ Error en ${fieldName}:`, error);
    throw error;
  }
};

/**
 * Crear nueva sala
 */
async function createRoom(hostId: string, input: CreateRoomInput): Promise<Room> {
  const timer = new PerformanceTimer('CreateRoom');
  const roomId = uuidv4();
  const now = new Date().toISOString();

  console.log('🔍 createRoom - hostId:', hostId);
  console.log('🔍 createRoom - input:', JSON.stringify(input, null, 2));

  try {
    // Validate input
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('Room name is required');
    }

    // Validate genre limits for new filtering system
    if (input.genreIds && input.genreIds.length > 3) {
      throw new FilterValidationError(
        'Maximum 3 genres allowed'
      );
    }

    // Generate unique invite link using DeepLinkService
    const inviteLink = await deepLinkService.generateInviteLink(roomId, hostId, {
      expiryHours: 168, // 7 days
      maxUsage: undefined, // No usage limit
    });

    // Handle legacy genre preferences (DEPRECATED)
    let validatedGenres: string[] = [];
    if (input.genrePreferences && input.genrePreferences.length > 0) {
      const genreValidation = movieCacheService.validateGenres(input.genrePreferences);
      validatedGenres = genreValidation.valid;

      if (genreValidation.invalid.length > 0) {
        console.warn(`⚠️ Invalid genres ignored: ${genreValidation.invalid.join(', ')}`);
      }

      console.log(`🎭 Validated legacy genres for room ${roomId}: ${validatedGenres.join(', ')}`);
    }

    // Initialize room data
    let contentIds: string[] = [];
    let genreNames: string[] = [];
    let filterCriteria: FilterCriteria | undefined;
    let excludedContentIds: string[] = [];

    // NEW: Handle content filtering with mediaType and genreIds
    if (input.mediaType && input.genreIds !== undefined) {
      console.log(`🎯 New filtering system: ${input.mediaType}, genres: [${input.genreIds.join(', ')}]`);

      try {
        // Create filter criteria
        filterCriteria = {
          mediaType: input.mediaType as MediaType,
          genres: input.genreIds,
          roomId
        };

        // Get content filtering service
        const contentService = getContentFilterService();

        // Load genre names for UI
        if (input.genreIds.length > 0 && filterCriteria) {
          const availableGenres = await contentService.getAvailableGenres(filterCriteria.mediaType);
          const genreMap = new Map(availableGenres.map(g => [g.id, g.name]));
          genreNames = input.genreIds.map(id => genreMap.get(id) || 'Unknown');
          console.log(`✅ Genre names mapped: ${genreNames.join(', ')}`);
        }

        // Load initial content pool using content filtering service
        const contentPool = await contentService.createFilteredRoom(filterCriteria);
        contentIds = contentPool.map(content => content.tmdbId);
        
        console.log(`✅ Content filtering: loaded ${contentIds.length} titles for ${input.mediaType} with genres [${input.genreIds.join(', ')}]`);

      } catch (error) {
        console.error('❌ Content filtering failed:', error);
        
        // For backward compatibility, don't fail room creation if content filtering fails
        // Just log the error and continue with empty content
        if (error instanceof FilterValidationError) {
          console.warn(`⚠️ Content filtering error: ${error.message}`);
        } else {
          console.warn(`⚠️ Unexpected content filtering error:`, error);
        }
        
        // Reset to empty state
        contentIds = [];
        genreNames = [];
        filterCriteria = undefined;
      }
    }

    // LEGACY: Handle old genre preferences system for backward compatibility
    else if (validatedGenres.length > 0) {
      console.log(`🎭 Using legacy genre system for room ${roomId}`);
      
      // Trigger legacy movie pre-caching in background
      movieCacheService.preCacheMovies(roomId, validatedGenres)
        .then((cachedMovies) => {
          console.log(`✅ Legacy movie pre-cache completed for room ${roomId}: ${cachedMovies.length} movies cached`);
        })
        .catch((error) => {
          console.error(`❌ Legacy movie pre-cache failed for room ${roomId}:`, error);
        });
    }

    // Create room object
    const room: Room = {
      id: roomId,
      name: input.name.trim(),
      description: input.description,
      status: 'WAITING',
      hostId,
      inviteCode: inviteLink.code,
      inviteUrl: inviteLink.url,
      // Legacy fields (for backward compatibility)
      genrePreferences: validatedGenres.length > 0 ? validatedGenres : undefined,
      // New filtering fields
      mediaType: input.mediaType,
      genreIds: input.genreIds || [],
      genreNames: genreNames.length > 0 ? genreNames : [],
      contentIds: contentIds.length > 0 ? contentIds : [],
      shownContentIds: [], // Initialize empty
      currentContentIndex: 0, // Start at 0
      filterCriteria,
      excludedContentIds,
      lastContentRefresh: contentIds.length > 0 ? now : undefined,
      // Standard fields
      isActive: true,
      isPrivate: input.isPrivate || false,
      memberCount: 1, // Host counts as member
      maxMembers: input.maxMembers,
      matchCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Save room to DynamoDB
    await docClient.send(new PutCommand({
      TableName: process.env.ROOMS_TABLE!,
      Item: {
        PK: roomId,
        SK: 'ROOM',
        roomId,
        ...room,
      },
    }));

    // Add host as member
    const hostMember: RoomMember = {
      roomId,
      userId: hostId,
      role: 'HOST',
      joinedAt: now,
      isActive: true,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Item: hostMember,
    }));

    // Log business metric
    logBusinessMetric('ROOM_CREATED', roomId, hostId, {
      roomStatus: 'WAITING',
      roomName: input.name,
      isPrivate: input.isPrivate || false,
      // Legacy metrics
      genrePreferences: validatedGenres,
      genreCount: validatedGenres.length,
      // New filtering metrics
      mediaType: input.mediaType,
      genreIds: input.genreIds,
      contentCount: contentIds.length,
      hasFiltering: !!filterCriteria,
      filteringSuccess: contentIds.length > 0 || !input.mediaType
    });

    console.log(`✅ Room created: ${roomId} (${input.name}) by ${hostId} with ${contentIds.length} pre-loaded titles`);
    timer.finish(true, undefined, { 
      roomId, 
      hostId, 
      roomName: input.name, 
      contentCount: contentIds.length,
      hasFiltering: !!filterCriteria
    });
    
    return room;

  } catch (error) {
    logError('CreateRoom', error as Error, { hostId, roomId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Get available genres for a media type
 * NEW: Content filtering system
 */
async function getAvailableGenres(mediaType: MediaType): Promise<Array<{id: number, name: string}>> {
  const timer = new PerformanceTimer('GetAvailableGenres');

  try {
    console.log(`🎭 Getting available genres for ${mediaType}`);

    const contentService = getContentFilterService();
    const genres = await contentService.getAvailableGenres(mediaType);

    console.log(`✅ Retrieved ${genres.length} genres for ${mediaType}`);
    timer.finish(true, undefined, { mediaType, genreCount: genres.length });
    
    return genres;

  } catch (error) {
    logError('GetAvailableGenres', error as Error, { mediaType });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Update room filters (with immutability enforcement)
 * NEW: Content filtering system
 */
async function updateRoomFilters(userId: string, roomId: string, input: UpdateRoomFiltersInput): Promise<Room> {
  const timer = new PerformanceTimer('UpdateRoomFilters');

  try {
    console.log(`🔄 User ${userId} attempting to update filters for room ${roomId}:`, input);

    // Get room to check current state
    const roomResponse = await docClient.send(new GetCommand({
      TableName: process.env.ROOMS_TABLE!,
      Key: { PK: roomId, SK: 'ROOM' },
    }));

    if (!roomResponse.Item) {
      throw new Error('Room not found');
    }

    const room = roomResponse.Item as any;

    // Check if user is host
    if (room.hostId !== userId) {
      throw new Error('Only room host can update filters');
    }

    // Enforce filter immutability (Requirements: 6.1, 6.2, 6.3)
    if (room.filterCriteria || room.mediaType || room.genreIds) {
      throw new FilterImmutabilityError(
        'Room filters cannot be modified after creation. Please create a new room with different filters.'
      );
    }

    // This should never be reached due to immutability, but kept for completeness
    throw new Error('Filter updates are not allowed');

  } catch (error) {
    logError('UpdateRoomFilters', error as Error, { userId, roomId, input });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Unirse a una sala existente
 */
async function joinRoom(userId: string, roomId: string): Promise<Room> {
  const timer = new PerformanceTimer('JoinRoom');

  try {
    // Verificar que la sala existe y está disponible
    const maxRetries = 3;
    let attempt = 0;
    let roomResponse;

    while (attempt < maxRetries) {
      try {
        roomResponse = await docClient.send(new GetCommand({
          TableName: process.env.ROOMS_TABLE!,
          Key: { PK: roomId, SK: 'ROOM' },
        }));
        break; // Success, exit retry loop
      } catch (error: any) {
        if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
          console.error('❌ Error de estructura de clave en ROOMS_TABLE (joinRoom):', error.message);
          throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
        }

        // Errores de red o temporales - reintentar
        if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
          attempt++;
          if (attempt >= maxRetries) {
            console.error('❌ Máximo de reintentos alcanzado para joinRoom getRoomAndValidate');
            throw new Error('Error interno del sistema. Servicio temporalmente no disponible.');
          }

          console.log(`🔄 Reintentando joinRoom getRoomAndValidate (intento ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt))); // Exponential backoff
          continue;
        }

        throw error; // Re-throw other errors
      }
    }

    if (!roomResponse || !roomResponse.Item) {
      throw new Error('Sala no encontrada');
    }

    const room = roomResponse.Item as any;

    if (room.status !== 'WAITING') {
      throw new Error('La sala no está disponible para nuevos miembros');
    }

    // Verificar si el usuario ya está en la sala
    const existingMember = await docClient.send(new GetCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Key: { roomId, userId },
    }));

    if (existingMember.Item) {
      // Usuario ya está en la sala, solo actualizar como activo
      await docClient.send(new UpdateCommand({
        TableName: process.env.ROOM_MEMBERS_TABLE!,
        Key: { roomId, userId },
        UpdateExpression: 'SET isActive = :active, joinedAt = :joinedAt',
        ExpressionAttributeValues: {
          ':active': true,
          ':joinedAt': new Date().toISOString(),
        },
      }));
    } else {
      // Añadir nuevo miembro
      const newMember: RoomMember = {
        roomId,
        userId,
        role: 'MEMBER',
        joinedAt: new Date().toISOString(),
        isActive: true,
      };

      await docClient.send(new PutCommand({
        TableName: process.env.ROOM_MEMBERS_TABLE!,
        Item: newMember,
      }));
    }

    // Actualizar timestamp de la sala
    const maxRetriesUpdate = 3;
    let attemptUpdate = 0;

    while (attemptUpdate < maxRetriesUpdate) {
      try {
        await docClient.send(new UpdateCommand({
          TableName: process.env.ROOMS_TABLE!,
          Key: { PK: roomId, SK: 'ROOM' },
          UpdateExpression: 'SET updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':updatedAt': new Date().toISOString(),
          },
        }));
        break; // Success, exit retry loop
      } catch (error: any) {
        if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
          console.error('❌ Error de estructura de clave en ROOMS_TABLE (joinRoom update):', error.message);
          throw new Error('Error interno del sistema al actualizar la sala.');
        }

        // Errores de red o temporales - reintentar
        if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
          attemptUpdate++;
          if (attemptUpdate >= maxRetriesUpdate) {
            console.error('❌ Máximo de reintentos alcanzado para joinRoom updateRoom');
            throw new Error('Error interno del sistema. No se pudo actualizar la sala después de múltiples intentos.');
          }

          console.log(`🔄 Reintentando joinRoom updateRoom (intento ${attemptUpdate + 1}/${maxRetriesUpdate})`);
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attemptUpdate))); // Exponential backoff
          continue;
        }

        throw error; // Re-throw other errors
      }
    }

    // Log business metric
    logBusinessMetric('ROOM_JOINED', roomId, userId, {
      roomStatus: room.status,
      wasExistingMember: !!existingMember.Item
    });

    console.log(`✅ Usuario ${userId} se unió a sala ${roomId}`);

    timer.finish(true, undefined, { roomId, userId, wasExisting: !!existingMember.Item });

    return {
      id: roomId,
      name: room.name,
      description: room.description,
      status: room.status,
      resultMovieId: room.resultMovieId,
      hostId: room.hostId,
      inviteCode: room.inviteCode,
      inviteUrl: room.inviteUrl,
      genrePreferences: room.genrePreferences,
      mediaType: room.mediaType,
      genreIds: room.genreIds,
      genreNames: room.genreNames,
      contentIds: room.contentIds,
      shownContentIds: room.shownContentIds,
      currentContentIndex: room.currentContentIndex,
      filterCriteria: room.filterCriteria,
      excludedContentIds: room.excludedContentIds,
      lastContentRefresh: room.lastContentRefresh,
      isActive: room.isActive,
      isPrivate: room.isPrivate,
      memberCount: room.memberCount,
      maxMembers: room.maxMembers,
      matchCount: room.matchCount || 0,
      createdAt: room.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

  } catch (error) {
    logError('JoinRoom', error as Error, { userId, roomId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Unirse a una sala por código de invitación
 */
async function joinRoomByInvite(userId: string, inviteCode: string): Promise<Room> {
  const timer = new PerformanceTimer('JoinRoomByInvite');

  try {
    console.log(`🔗 User ${userId} attempting to join room with invite code: ${inviteCode}`);

    // Find room by invite code using GSI
    const roomQuery = await docClient.send(new QueryCommand({
      TableName: process.env.ROOMS_TABLE!,
      IndexName: 'InviteCodeIndex',
      KeyConditionExpression: 'inviteCode = :inviteCode',
      ExpressionAttributeValues: {
        ':inviteCode': inviteCode,
      },
    }));

    if (!roomQuery.Items || roomQuery.Items.length === 0) {
      throw new Error('Código de invitación inválido o expirado');
    }

    const roomData = roomQuery.Items[0];
    const roomId = roomData.roomId;

    console.log(`✅ Found room ${roomId} for invite code ${inviteCode}`);

    // Use existing joinRoom function
    return await joinRoom(userId, roomId);

  } catch (error) {
    logError('JoinRoomByInvite', error as Error, { userId, inviteCode });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Obtener historial de salas del usuario
 */
async function getMyHistory(userId: string): Promise<Room[]> {
  // Consultar GSI UserHistoryIndex para obtener salas del usuario
  const response = await docClient.send(new QueryCommand({
    TableName: process.env.ROOM_MEMBERS_TABLE!,
    IndexName: 'UserHistoryIndex',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
    ScanIndexForward: false, // Ordenar por joinedAt descendente (más recientes primero)
    Limit: 50, // Limitar a últimas 50 salas
  }));

  if (!response.Items || response.Items.length === 0) {
    return [];
  }

  // Obtener detalles de cada sala
  const rooms: Room[] = [];

  for (const member of response.Items) {
    try {
      const maxRetriesHistory = 3;
      let attemptHistory = 0;
      let roomResponse;

      while (attemptHistory < maxRetriesHistory) {
        try {
          roomResponse = await docClient.send(new GetCommand({
            TableName: process.env.ROOMS_TABLE!,
            Key: { PK: member.roomId, SK: 'ROOM' },
          }));
          break; // Success, exit retry loop
        } catch (error: any) {
          if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
            console.error('❌ Error de estructura de clave en ROOMS_TABLE (getMyHistory):', error.message);
            // Skip this room and continue with others
            break;
          }

          // Errores de red o temporales - reintentar
          if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
            attemptHistory++;
            if (attemptHistory >= maxRetriesHistory) {
              console.warn(`⚠️ Error obteniendo sala ${member.roomId} después de múltiples intentos:`, error);
              break; // Skip this room and continue with others
            }

            console.log(`🔄 Reintentando getMyHistory getRoomDetails (intento ${attemptHistory + 1}/${maxRetriesHistory})`);
            await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attemptHistory))); // Exponential backoff
            continue;
          }

          throw error; // Re-throw other errors
        }
      }

      if (roomResponse && roomResponse.Item) {
        const room = roomResponse.Item;
        rooms.push({
          id: room.roomId,
          name: room.name || 'Sala sin nombre',
          description: room.description,
          status: room.status,
          resultMovieId: room.resultMovieId,
          hostId: room.hostId,
          inviteCode: room.inviteCode,
          inviteUrl: room.inviteUrl,
          genrePreferences: room.genrePreferences,
          mediaType: room.mediaType,
          genreIds: room.genreIds,
          genreNames: room.genreNames,
          contentIds: room.contentIds,
          shownContentIds: room.shownContentIds,
          currentContentIndex: room.currentContentIndex,
          filterCriteria: room.filterCriteria,
          excludedContentIds: room.excludedContentIds,
          lastContentRefresh: room.lastContentRefresh,
          isActive: room.isActive !== false, // Default to true if not set
          isPrivate: room.isPrivate || false,
          memberCount: room.memberCount || 1,
          maxMembers: room.maxMembers,
          matchCount: room.matchCount || 0,
          createdAt: room.createdAt || new Date().toISOString(),
          updatedAt: room.updatedAt || new Date().toISOString(),
        });
      }
    } catch (error) {
      console.warn(`⚠️ Error obteniendo sala ${member.roomId}:`, error);
      // Continuar con las demás salas
    }
  }

  console.log(`📋 Historial obtenido para ${userId}: ${rooms.length} salas`);
  return rooms;
}

/**
 * Crear nueva sala (versión debug con solo name)
 */
async function createRoomDebug(hostId: string, input: CreateRoomInputDebug): Promise<Room> {
  const timer = new PerformanceTimer('CreateRoomDebug');
  const roomId = uuidv4();
  const now = new Date().toISOString();

  console.log('🔍 createRoomDebug - hostId:', hostId);
  console.log('🔍 createRoomDebug - input:', JSON.stringify(input, null, 2));

  try {
    // Generate unique invite link using DeepLinkService
    const inviteLink = await deepLinkService.generateInviteLink(roomId, hostId, {
      expiryHours: 168, // 7 days
      maxUsage: undefined, // No usage limit
    });

    // Crear sala en RoomsTable con valores por defecto
    const room: Room = {
      id: roomId,
      name: input.name,
      description: 'Sala de debug',
      status: 'WAITING',
      hostId,
      inviteCode: inviteLink.code,
      inviteUrl: inviteLink.url,
      isActive: true,
      isPrivate: false,
      memberCount: 1, // El host cuenta como miembro
      maxMembers: 10, // Valor por defecto
      matchCount: 0, // Initialize matchCount field
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ROOMS_TABLE!,
      Item: {
        PK: roomId, // Add PK for DynamoDB primary key
        SK: 'ROOM', // Add SK for DynamoDB sort key
        roomId,
        ...room,
      },
    }));

    // Añadir host como miembro
    const hostMember: RoomMember = {
      roomId,
      userId: hostId,
      role: 'HOST',
      joinedAt: now,
      isActive: true,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Item: hostMember,
    }));

    // Log business metric
    logBusinessMetric('ROOM_CREATED', roomId, hostId, {
      roomStatus: 'WAITING',
      roomName: input.name,
      isPrivate: false,
      debug: true
    });

    console.log(`✅ Sala debug creada: ${roomId} (${input.name}) por ${hostId}`);
    timer.finish(true, undefined, { roomId, hostId, roomName: input.name });
    return room;

  } catch (error) {
    logError('CreateRoomDebug', error as Error, { hostId, roomId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Crear nueva sala (versión simple sin input type)
 */
async function createRoomSimple(hostId: string, name: string): Promise<Room> {
  const timer = new PerformanceTimer('CreateRoomSimple');
  const roomId = uuidv4();
  const now = new Date().toISOString();

  console.log('🔍 createRoomSimple - hostId:', hostId);
  console.log('🔍 createRoomSimple - name:', name);
  console.log('🔍 createRoomSimple - roomId generated:', roomId);

  try {
    console.log('🔍 createRoomSimple - Step 1: Calling deepLinkService.generateInviteLink...');
    // Generate unique invite link using DeepLinkService
    const inviteLink = await deepLinkService.generateInviteLink(roomId, hostId, {
      expiryHours: 168, // 7 days
      maxUsage: undefined, // No usage limit
    });
    console.log('✅ createRoomSimple - Step 1 SUCCESS: Invite link generated:', inviteLink.code);

    console.log('🔍 createRoomSimple - Step 2: Creating room object...');
    // Crear sala en RoomsTable con valores por defecto
    const room: Room = {
      id: roomId,
      name: name,
      description: 'Sala simple',
      status: 'WAITING',
      hostId,
      inviteCode: inviteLink.code,
      inviteUrl: inviteLink.url,
      isActive: true,
      isPrivate: false,
      memberCount: 1, // El host cuenta como miembro
      maxMembers: 10, // Valor por defecto
      matchCount: 0, // Initialize matchCount field
      createdAt: now,
      updatedAt: now,
    };
    console.log('✅ createRoomSimple - Step 2 SUCCESS: Room object created');

    console.log('🔍 createRoomSimple - Step 3: Saving room to DynamoDB...');
    await docClient.send(new PutCommand({
      TableName: process.env.ROOMS_TABLE!,
      Item: {
        PK: roomId, // Add PK for DynamoDB primary key
        SK: 'ROOM', // Add SK for DynamoDB sort key
        roomId,
        ...room,
      },
    }));
    console.log('✅ createRoomSimple - Step 3 SUCCESS: Room saved to DynamoDB');

    console.log('🔍 createRoomSimple - Step 4: Adding host as member...');
    // Añadir host como miembro
    const hostMember: RoomMember = {
      roomId,
      userId: hostId,
      role: 'HOST',
      joinedAt: now,
      isActive: true,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Item: hostMember,
    }));
    console.log('✅ createRoomSimple - Step 4 SUCCESS: Host added as member');

    console.log('🔍 createRoomSimple - Step 5: Logging business metric...');
    // Log business metric
    logBusinessMetric('ROOM_CREATED', roomId, hostId, {
      roomStatus: 'WAITING',
      roomName: name,
      isPrivate: false,
      simple: true
    });
    console.log('✅ createRoomSimple - Step 5 SUCCESS: Business metric logged');

    console.log(`✅ Sala simple creada: ${roomId} (${name}) por ${hostId}`);
    console.log('🔍 createRoomSimple - Returning room object:', JSON.stringify(room, null, 2));
    timer.finish(true, undefined, { roomId, hostId, roomName: name });
    return room;

  } catch (error) {
    console.error('💥💥💥 createRoomSimple - EXCEPTION CAUGHT:', error);
    console.error('💥 Error name:', (error as Error).name);
    console.error('💥 Error message:', (error as Error).message);
    console.error('💥 Error stack:', (error as Error).stack);
    logError('CreateRoomSimple', error as Error, { hostId, roomId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}
async function getRoom(userId: string, roomId: string): Promise<Room | null> {
  try {
    // Verificar que el usuario es miembro de la sala
    const memberResponse = await docClient.send(new GetCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Key: { roomId, userId },
    }));

    if (!memberResponse.Item) {
      throw new Error('No tienes acceso a esta sala');
    }

    // Obtener detalles de la sala
    const maxRetriesGetRoom = 3;
    let attemptGetRoom = 0;
    let roomResponse;

    while (attemptGetRoom < maxRetriesGetRoom) {
      try {
        roomResponse = await docClient.send(new GetCommand({
          TableName: process.env.ROOMS_TABLE!,
          Key: { PK: roomId, SK: 'ROOM' },
        }));
        break; // Success, exit retry loop
      } catch (error: any) {
        if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
          console.error('❌ Error de estructura de clave en ROOMS_TABLE (getRoom):', error.message);
          throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
        }

        // Errores de red o temporales - reintentar
        if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
          attemptGetRoom++;
          if (attemptGetRoom >= maxRetriesGetRoom) {
            console.error('❌ Máximo de reintentos alcanzado para getRoom');
            throw new Error('Error interno del sistema. Servicio temporalmente no disponible.');
          }

          console.log(`🔄 Reintentando getRoom (intento ${attemptGetRoom + 1}/${maxRetriesGetRoom})`);
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attemptGetRoom))); // Exponential backoff
          continue;
        }

        throw error; // Re-throw other errors
      }
    }

    if (!roomResponse || !roomResponse.Item) {
      throw new Error('Sala no encontrada');
    }

    const room = roomResponse.Item;

    return {
      id: room.roomId,
      name: room.name || 'Sala sin nombre',
      description: room.description,
      status: room.status,
      resultMovieId: room.resultMovieId,
      hostId: room.hostId,
      inviteCode: room.inviteCode,
      inviteUrl: room.inviteUrl,
      genrePreferences: room.genrePreferences,
      mediaType: room.mediaType,
      genreIds: room.genreIds,
      genreNames: room.genreNames,
      contentIds: room.contentIds,
      shownContentIds: room.shownContentIds,
      currentContentIndex: room.currentContentIndex,
      filterCriteria: room.filterCriteria,
      excludedContentIds: room.excludedContentIds,
      lastContentRefresh: room.lastContentRefresh,
      isActive: room.isActive !== false,
      isPrivate: room.isPrivate || false,
      memberCount: room.memberCount || 1,
      maxMembers: room.maxMembers,
      matchCount: room.matchCount || 0,
      createdAt: room.createdAt || new Date().toISOString(),
      updatedAt: room.updatedAt || new Date().toISOString(),
    };

  } catch (error) {
    console.error(`❌ Error obteniendo sala ${roomId}:`, error);
    throw error;
  }
}