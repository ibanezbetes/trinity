import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Simplified inline implementations to avoid dependency issues
const appsyncPublisher = {
  publishMatchFoundEvent: async (roomId: string, matchData: any) => {
    console.log(`📡 Publishing match found event for room ${roomId}:`, matchData);
    // In a real implementation, this would publish to AppSync subscriptions
  },
  publishVoteUpdateEvent: async (roomId: string, voteData: any) => {
    console.log(`📡 Publishing vote update event for room ${roomId}:`, voteData);
    // In a real implementation, this would publish to AppSync subscriptions
  },
  getMovieTitle: async (movieId: string) => {
    console.log(`🎬 Getting movie title for ${movieId}`);
    return `Movie ${movieId}`;
  }
};

const metrics = {
  logBusinessMetric: (name: string, value: number, unit?: string) => {
    console.log(`📊 Business Metric: ${name} = ${value} ${unit || ''}`);
  },
  logError: (operation: string, error: any) => {
    console.error(`❌ Error in ${operation}:`, error);
  },
  PerformanceTimer: class {
    private startTime: number;
    constructor(private operation: string) {
      this.startTime = Date.now();
    }
    end() {
      const duration = Date.now() - this.startTime;
      console.log(`⏱️ ${this.operation} completed in ${duration}ms`);
    }
  }
};

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient as any);

interface Room {
  id: string;
  status: string;
  resultMovieId?: string;
  hostId: string;
}

interface Vote {
  roomId: string;
  movieId: string;
  votes: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * VoteHandler: Lógica Stop-on-Match
 * Implementa el algoritmo de votación que termina cuando todos los miembros votan
 */
export const handler: AppSyncResolverHandler<any, any> = async (event: AppSyncResolverEvent<any>) => {
  console.log('🗳️ Vote Handler:', JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const args = event.arguments;
  const { sub: userId } = event.identity as any; // Usuario autenticado

  try {
    switch (fieldName) {
      case 'vote':
        // Extraer parámetros del input según el schema GraphQL
        const { roomId, movieId, voteType } = args.input;
        return await processVote(userId, roomId, movieId, voteType);

      default:
        throw new Error(`Operación no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`❌ Error en ${fieldName}:`, error);

    // Mejorar mensajes de error para el usuario
    if (error instanceof Error) {
      // Si es un error de sistema interno, no exponer detalles técnicos
      if (error.message.includes('Error interno del sistema')) {
        throw error; // Ya tiene un mensaje amigable
      }

      // Para otros errores, proporcionar contexto adicional
      if (error.message.includes('Sala no encontrada')) {
        throw new Error('La sala especificada no existe o no tienes acceso a ella.');
      }

      if (error.message.includes('Usuario no es miembro activo')) {
        throw new Error('No eres miembro de esta sala o tu membresía no está activa.');
      }

      if (error.message.includes('ya votó por la película')) {
        throw new Error('Ya has votado por esta película en esta sala.');
      }

      if (error.message.includes('no está disponible para votar')) {
        throw new Error('Esta sala no está disponible para votar en este momento.');
      }

      // Errores de red o conectividad
      if (error.message.includes('Network') || error.message.includes('timeout')) {
        throw new Error('Problema de conexión. Por favor, verifica tu conexión a internet e inténtalo de nuevo.');
      }

      // Errores de autorización
      if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
        throw new Error('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
      }

      // Errores de validación de datos
      if (error.message.includes('ValidationException') || error.message.includes('Invalid')) {
        throw new Error('Los datos enviados no son válidos. Por favor, inténtalo de nuevo.');
      }

      // Error genérico para casos no manejados específicamente
      throw new Error('Ocurrió un error inesperado. Por favor, inténtalo de nuevo más tarde.');
    }

    throw error;
  }
};

/**
 * Procesar voto con algoritmo Stop-on-Match
 * Solo procesa votos LIKE - los DISLIKE se ignoran según el algoritmo
 */
async function processVote(userId: string, roomId: string, movieId: string, voteType: string): Promise<Room> {
  const timer = new metrics.PerformanceTimer('ProcessVote');
  console.log(`🗳️ Procesando voto: Usuario ${userId}, Sala ${roomId}, Película ${movieId}, Tipo: ${voteType}`);

  try {
    // 1. Verificar que la sala existe y está ACTIVE
    const room = await getRoomAndValidate(roomId);

    // 2. Verificar que el usuario es miembro de la sala
    await validateUserMembership(userId, roomId);

    // 3. Registrar que la película ha sido mostrada (INDIFERENTE del tipo de voto)
    // Esto evita que vuelva a aparecer para cualquier usuario de la sala
    await trackShownMovie(roomId, movieId);

    // 4. Solo procesar votos LIKE - ignorar DISLIKE según algoritmo Stop-on-Match
    if (voteType !== 'LIKE') {
      console.log(`⏭️ Ignorando voto ${voteType} según algoritmo Stop-on-Match`);
      return {
        id: roomId,
        status: room.status,
        resultMovieId: room.resultMovieId,
        hostId: room.hostId,
      };
    }

    // 4. Prevenir votos duplicados del mismo usuario para la misma película
    await preventDuplicateVote(userId, roomId, movieId);

    // 5. Incrementar contador atómico en VotesTable
    const currentVotes = await incrementVoteCount(roomId, movieId);

    // 6. Obtener maxMembers de la sala (no miembros activos actuales)
    // IMPORTANTE: Usamos maxMembers para saber cuántos votos se necesitan para consenso
    const totalMembers = room.maxMembers || 2; // Fallback a 2 si no está definido

    console.log(`📊 Votos actuales: ${currentVotes}, Miembros requeridos: ${totalMembers}`);

    // 7. Publicar evento de actualización de voto en tiempo real
    await appsyncPublisher.publishVoteUpdateEvent(roomId, {
      userId,
      movieId,
      voteType: 'LIKE',
      currentVotes,
      totalMembers
    });

    // Log business metric
    metrics.logBusinessMetric('VOTE_CAST', 1, 'count');

    // 8. Verificar si se alcanzó el consenso (Stop-on-Match)
    if (currentVotes >= totalMembers) {
      console.log('🎉 ¡Match encontrado! Actualizando sala y notificando...');

      // Actualizar sala con resultado
      await updateRoomWithMatch(roomId, movieId);

      // Obtener participantes para la notificación
      const participants = await getRoomParticipants(roomId);

      // Obtener título de la película
      const movieTitle = await appsyncPublisher.getMovieTitle(movieId);

      // Get voting start time for duration calculation
      const votingStartTime = await getVotingStartTime(roomId, movieId);

      // Publicar evento de match encontrado en tiempo real con información detallada
      await appsyncPublisher.publishMatchFoundEvent(roomId, {
        movieId,
        movieTitle,
        participants,
        votingStartTime
      });

      // Log business metric for match
      metrics.logBusinessMetric('MATCH_FOUND', 1, 'count');

      timer.end();

      return {
        ...room, // Return full room object
        status: 'MATCHED',
        resultMovieId: movieId,
      };
    }

    // 9. Si no hay match, retornar sala actualizada
    timer.end();

    return {
      ...room, // Return full room object
      // No status change for normal vote
    };

  } catch (error) {
    metrics.logError('ProcessVote', error as Error);
    timer.end();
    throw error;
  }
}

/**
 * Obtener y validar sala
 */
async function getRoomAndValidate(roomId: string): Promise<any> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      console.log('🔍 DEBUG: getRoomAndValidate usando clave:', { PK: roomId, SK: 'ROOM' });
      const response = await docClient.send(new GetCommand({
        TableName: process.env.ROOMS_TABLE!,
        Key: { PK: roomId, SK: 'ROOM' },
      }));

      if (!response.Item) {
        throw new Error('Sala no encontrada');
      }

      const room = response.Item;

      console.log(`🔍 Room Status Check: ID=${room.id}, Status=${room.status}, Type=${typeof room.status}, ResultMovieId=${room.resultMovieId}`);
      
      // Prevent voting if room already has a match
      if (room.status === 'MATCHED' || room.resultMovieId) {
        console.log(`🚫 Sala ya tiene match: Estado=${room.status}, ResultMovieId=${room.resultMovieId}`);
        throw new Error('Esta sala ya encontró una película perfecta. No se pueden realizar más votos.');
      }
      
      // Only allow voting in ACTIVE or WAITING states
      if (room.status !== 'ACTIVE' && room.status !== 'WAITING') {
        console.log(`🚫 Sala no disponible para votar: Estado=${room.status}, ResultMovieId=${room.resultMovieId}`);
        throw new Error(`La sala no está disponible para votar. Estado actual: ${room.status}`);
      }

      return room;
    } catch (error: any) {
      // Distinguir entre errores de clave y errores de negocio
      if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
        console.error('❌ Error de estructura de clave en ROOMS_TABLE:', error.message);
        throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
      }

      // Errores de red o temporales - reintentar
      if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
        attempt++;
        if (attempt >= maxRetries) {
          console.error('❌ Máximo de reintentos alcanzado para getRoomAndValidate');
          throw new Error('Error interno del sistema. Servicio temporalmente no disponible.');
        }

        console.log(`🔄 Reintentando getRoomAndValidate (intento ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt))); // Exponential backoff
        continue;
      }

      // Re-lanzar errores de negocio tal como están
      throw error;
    }
  }

  throw new Error('Error interno del sistema. No se pudo validar la sala después de múltiples intentos.');
}

/**
 * Validar que el usuario es miembro de la sala
 */
async function validateUserMembership(userId: string, roomId: string): Promise<void> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await docClient.send(new GetCommand({
        TableName: process.env.ROOM_MEMBERS_TABLE!,
        Key: { roomId, userId },
      }));

      if (!response.Item || !response.Item.isActive) {
        throw new Error('Usuario no es miembro activo de la sala');
      }

      return; // Success
    } catch (error: any) {
      // Distinguir entre errores de clave y errores de negocio
      if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
        console.error('❌ Error de estructura de clave en ROOM_MEMBERS_TABLE:', error.message);
        throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
      }

      // Errores de red o temporales - reintentar
      if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
        attempt++;
        if (attempt >= maxRetries) {
          console.error('❌ Máximo de reintentos alcanzado para validateUserMembership');
          throw new Error('Error interno del sistema. Servicio temporalmente no disponible.');
        }

        console.log(`🔄 Reintentando validateUserMembership (intento ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt))); // Exponential backoff
        continue;
      }

      // Re-lanzar errores de negocio tal como están
      throw error;
    }
  }

  throw new Error('Error interno del sistema. No se pudo validar la membresía después de múltiples intentos.');
}

/**
 * Incrementar contador atómico de votos con manejo mejorado de concurrencia
 */
async function incrementVoteCount(roomId: string, movieId: string): Promise<number> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // Intentar actualizar voto existente con operación atómica
      const response = await docClient.send(new UpdateCommand({
        TableName: process.env.ROOM_MATCHES_TABLE!, // Using Matches table for aggregation
        Key: { roomId, movieId },
        UpdateExpression: 'ADD votes :increment SET updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':increment': 1,
          ':updatedAt': new Date().toISOString(),
        },
        ReturnValues: 'ALL_NEW',
      }));

      const voteCount = response.Attributes?.votes || 1;
      console.log(`✅ Voto incrementado: Sala ${roomId}, Película ${movieId}, Total: ${voteCount}`);
      return voteCount;

    } catch (error: any) {
      // Manejar errores de clave
      if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
        console.error('❌ Error de estructura de clave en VOTES_TABLE:', error.message);
        throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
      }

      // Si el item no existe, intentar crearlo
      if (error.name === 'ResourceNotFoundException' || !error.name) {
        try {
          const newVote: Vote = {
            roomId,
            movieId,
            votes: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await docClient.send(new PutCommand({
            TableName: process.env.ROOM_MATCHES_TABLE!,
            Item: newVote,
            ConditionExpression: 'attribute_not_exists(roomId) AND attribute_not_exists(movieId)',
          }));

          console.log(`✅ Nuevo voto creado: Sala ${roomId}, Película ${movieId}, Total: 1`);
          return 1;

        } catch (putError: any) {
          if (putError.name === 'ValidationException' && putError.message.includes('key element does not match')) {
            console.error('❌ Error de estructura de clave en VOTES_TABLE (PUT):', putError.message);
            throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
          }

          // Si falla la condición, significa que otro proceso creó el item
          // Reintentar la operación UPDATE
          if (putError.name === 'ConditionalCheckFailedException') {
            attempt++;
            if (attempt >= maxRetries) {
              console.error('❌ Máximo de reintentos alcanzado para incrementar voto');
              throw new Error('Error interno del sistema. Demasiados intentos concurrentes.');
            }
            console.log(`🔄 Reintentando incremento de voto (intento ${attempt + 1}/${maxRetries})`);
            continue;
          }

          throw putError;
        }
      }

      // Para otros errores, reintentamos si no hemos alcanzado el máximo
      attempt++;
      if (attempt >= maxRetries) {
        console.error('❌ Error incrementando voto después de múltiples intentos:', error);
        throw error;
      }

      console.log(`🔄 Reintentando incremento de voto debido a error (intento ${attempt + 1}/${maxRetries}):`, error.name);
      // Pequeña pausa antes del reintento para evitar condiciones de carrera
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }

  throw new Error('Error interno del sistema. No se pudo procesar el voto después de múltiples intentos.');
}

/**
 * Obtener total de miembros activos en la sala
 */
async function getTotalActiveMembers(roomId: string): Promise<number> {
  const response = await docClient.send(new QueryCommand({
    TableName: process.env.ROOM_MEMBERS_TABLE!,
    KeyConditionExpression: 'roomId = :roomId',
    FilterExpression: 'isActive = :active',
    ExpressionAttributeValues: {
      ':roomId': roomId,
      ':active': true,
    },
    Select: 'COUNT',
  }));

  return response.Count || 0;
}

/**
 * Actualizar sala con resultado del match
 */
async function updateRoomWithMatch(roomId: string, movieId: string): Promise<void> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      console.log('🔍 DEBUG: updateRoomWithMatch usando clave:', { PK: roomId, SK: 'ROOM' });
      await docClient.send(new UpdateCommand({
        TableName: process.env.ROOMS_TABLE!,
        Key: { PK: roomId, SK: 'ROOM' },
        UpdateExpression: 'SET #status = :status, resultMovieId = :movieId, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status', // 'status' es palabra reservada en DynamoDB
        },
        ExpressionAttributeValues: {
          ':status': 'MATCHED',
          ':movieId': movieId,
          ':updatedAt': new Date().toISOString(),
        },
      }));

      console.log(`✅ Sala ${roomId} actualizada con match: película ${movieId}`);
      return; // Success
    } catch (error: any) {
      // Manejar errores de clave
      if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
        console.error('❌ Error de estructura de clave en ROOMS_TABLE (UPDATE):', error.message);
        throw new Error('Error interno del sistema al actualizar la sala.');
      }

      // Errores de red o temporales - reintentar
      if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
        attempt++;
        if (attempt >= maxRetries) {
          console.error('❌ Máximo de reintentos alcanzado para updateRoomWithMatch');
          throw new Error('Error interno del sistema. No se pudo actualizar la sala después de múltiples intentos.');
        }

        console.log(`🔄 Reintentando updateRoomWithMatch (intento ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt))); // Exponential backoff
        continue;
      }

      console.error('❌ Error actualizando sala con match:', error);
      throw error;
    }
  }

  throw new Error('Error interno del sistema. No se pudo actualizar la sala después de múltiples intentos.');
}

/**
 * Prevenir votos duplicados del mismo usuario para la misma película con manejo de concurrencia
 */
async function preventDuplicateVote(userId: string, roomId: string, movieId: string): Promise<void> {
  const roomMovieId = `${roomId}_${movieId}`;
  const maxRetries = 3;
  let attempt = 0;
  const userMovieKey = `${userId}#${movieId}`;

  while (attempt < maxRetries) {
    try {
      // Verificar si el usuario ya votó por esta película en esta sala
      // Using VOTES_TABLE (User Votes) with correct schema: PK=roomId, SK=userId#movieId

      const existingVote = await docClient.send(new GetCommand({
        TableName: process.env.VOTES_TABLE!,
        Key: {
          roomId,
          'userId#movieId': userMovieKey
        },
      }));

      if (existingVote.Item) {
        throw new Error(`Usuario ${userId} ya votó por la película ${movieId} en la sala ${roomId}`);
      }

      // Registrar el voto para prevenir duplicados con condición atómica
      await docClient.send(new PutCommand({
        TableName: process.env.VOTES_TABLE!,
        Item: {
          roomId,
          'userId#movieId': userMovieKey,
          userId,
          movieId,
          votedAt: new Date().toISOString(),
          voteType: 'LIKE' // Trinity solo tiene votos positivos
        },
        ConditionExpression: 'attribute_not_exists(roomId) AND attribute_not_exists(#sk)',
        ExpressionAttributeNames: {
          '#sk': 'userId#movieId'
        }
      }));

      console.log(`✅ Voto registrado: Usuario ${userId}, Sala ${roomId}, Película ${movieId}`);
      return; // Éxito, salir de la función

    } catch (error: any) {
      // Manejar errores de clave
      if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
        console.error('❌ Error de estructura de clave en USER_VOTES_TABLE:', error.message);
        throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
      }

      // Si falla la condición, significa que el usuario ya votó (condición de carrera)
      if (error.name === 'ConditionalCheckFailedException') {
        // Verificar nuevamente si realmente ya votó
        const doubleCheck = await docClient.send(new GetCommand({
          TableName: process.env.VOTES_TABLE!,
          Key: {
            roomId,
            'userId#movieId': userMovieKey
          },
        }));

        if (doubleCheck.Item) {
          throw new Error(`Usuario ${userId} ya votó por la película ${movieId} en la sala ${roomId}`);
        }

        // Si no existe el item pero falló la condición, reintentamos
        attempt++;
        if (attempt >= maxRetries) {
          console.error('❌ Máximo de reintentos alcanzado para prevenir voto duplicado');
          throw new Error('Error interno del sistema. Demasiados intentos concurrentes.');
        }

        console.log(`🔄 Reintentando registro de voto (intento ${attempt + 1}/${maxRetries})`);
        // Pequeña pausa antes del reintento
        await new Promise(resolve => setTimeout(resolve, 50 * attempt));
        continue;
      }

      // Para otros errores, reintentamos si no hemos alcanzado el máximo
      if (attempt < maxRetries - 1) {
        attempt++;
        console.log(`🔄 Reintentando prevención de voto duplicado (intento ${attempt + 1}/${maxRetries}):`, error.name);
        await new Promise(resolve => setTimeout(resolve, 50 * attempt));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Error interno del sistema. No se pudo registrar el voto después de múltiples intentos.');
}

/**
 * Obtener lista de participantes de la sala
 */
async function getRoomParticipants(roomId: string): Promise<string[]> {
  try {
    const response = await docClient.send(new QueryCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      KeyConditionExpression: 'roomId = :roomId',
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: {
        ':roomId': roomId,
        ':active': true,
      },
      ProjectionExpression: 'userId',
    }));

    return response.Items?.map(item => item.userId) || [];
  } catch (error) {
    console.warn('⚠️ Error obteniendo participantes:', error);
    return [];
  }
}
/**
 * Get voting start time for duration calculation
 */
async function getVotingStartTime(roomId: string, movieId: string): Promise<Date | undefined> {
  try {
    const response = await docClient.send(new GetCommand({
      TableName: process.env.ROOM_MATCHES_TABLE!,
      Key: { roomId, movieId },
    }));

    if (response.Item?.createdAt) {
      return new Date(response.Item.createdAt);
    }

    return undefined;
  } catch (error) {
    console.warn('⚠️ Error getting voting start time:', error);
    return undefined;
  }
}

/**
 * Registrar película como mostrada en la sala
 * Usa un Set en DynamoDB para evitar duplicados automáticamente
 */
async function trackShownMovie(roomId: string, movieId: string) {
  try {
    await docClient.send(new UpdateCommand({
      TableName: process.env.ROOMS_TABLE!,
      Key: { id: roomId },
      UpdateExpression: 'ADD shownMovieIds :movieSet',
      ExpressionAttributeValues: {
        ':movieSet': new Set([movieId]),
      },
    }));
  } catch (error) {
    console.error(`⚠️ Error al registrar película mostrada ${movieId}:`, error);
    // No fallamos el voto si esto falla, es secundario
  }
}