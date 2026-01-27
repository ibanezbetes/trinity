# Análisis del Sistema de Votación en Tiempo Real - Trinity TFG

**Fecha:** 15 de Enero de 2026  
**Estado:** Sistema implementado pero NO funcional en producción

---

## 📋 RESUMEN EJECUTIVO

El sistema de votación en tiempo real está **completamente implementado** en el código, pero **NO está funcionando** porque:

1. ✅ **Backend (NestJS)**: NO tiene integración con AppSync - solo usa Cognito para autenticación
2. ✅ **Infrastructure (AWS CDK)**: Tiene toda la infraestructura AppSync desplegada
3. ✅ **Mobile App**: Tiene el cliente AppSync implementado con subscripciones
4. ❌ **PROBLEMA**: El backend NO publica eventos a AppSync, solo la app mobile intenta conectarse

---

## 🏗️ ARQUITECTURA ACTUAL

### 1. **AWS Infrastructure (CDK)**

**Ubicación:** `trinity_tfg/infrastructure/`

#### Servicios Desplegados:
- ✅ **AppSync GraphQL API**: `epjtt2y3fzh53ii6omzj6n6h5a`
- ✅ **Cognito User Pool**: `eu-west-1_6UxioIj4z`
- ✅ **DynamoDB Tables**:
  - `ROOMS_TABLE` - Almacena salas (PK: roomId, SK: 'ROOM')
  - `ROOM_MEMBERS_TABLE` - Miembros de salas (PK: roomId, SK: userId)
  - `VOTES_TABLE` - Votos por película (PK: roomId, SK: movieId)
  - `USER_VOTES_TABLE` - Votos individuales (PK: userId, SK: roomMovieId)

#### Lambda Handlers Implementados:
- ✅ `vote.ts` - Procesa votos con algoritmo "Stop-on-Match"
- ✅ `room.ts` - Gestiona creación y unión a salas
- ✅ `connection.ts` - Maneja conexiones WebSocket
- ✅ `realtime.ts` - Publica eventos en tiempo real

#### GraphQL Schema:
```graphql
# Mutations
vote(input: VoteInput!): Room
createRoom(input: CreateRoomInput!): Room
joinRoom(roomId: ID!): Room

# Subscriptions (IMPLEMENTADAS)
onVoteUpdateEnhanced(roomId: ID!): VoteUpdateEvent
onMatchFoundEnhanced(roomId: ID!): MatchFoundEvent
onConnectionStatusChange(roomId: ID!): ConnectionStatusEvent
onRoomStateSync(roomId: ID!): RoomStateEvent
```

### 2. **Backend (NestJS)**

**Ubicación:** `trinity_tfg/backend/`

#### Estado Actual:
- ✅ Autenticación con Cognito funcionando
- ✅ Endpoints REST para auth
- ❌ **NO tiene integración con AppSync**
- ❌ **NO publica eventos en tiempo real**
- ❌ **NO tiene módulo de votación**

#### Dependencias Instaladas:
```json
{
  "@aws-sdk/client-appsync": "^3.958.0",
  "graphql": "^16.12.0",
  "graphql-request": "^7.4.0"
}
```

**Nota:** Las dependencias están instaladas pero NO se usan.

### 3. **Mobile App (React Native + Expo)**

**Ubicación:** `trinity_tfg/mobile/`

#### Cliente AppSync:
- ✅ `appSyncService.ts` - Cliente GraphQL completo
- ✅ WebSocket subscriptions implementadas
- ✅ Circuit breaker para prevenir sobrecarga
- ✅ Token caching para evitar rate limiting
- ✅ Reconnection logic con exponential backoff

#### Servicios Implementados:
- ✅ `voteService.ts` - Registra votos y se suscribe a actualizaciones
- ✅ `roomService.ts` - Crea y gestiona salas
- ✅ `mediaService.ts` - Obtiene películas

#### Subscripciones Activas:
```typescript
// La app mobile intenta suscribirse a:
- onVoteUpdateEnhanced(roomId)
- onMatchFoundEnhanced(roomId)
- onConnectionStatusChange(roomId)
- onRoomStateSync(roomId)
```

---

## 🔍 FLUJO ACTUAL (NO FUNCIONAL)

### Flujo Esperado:
```
1. Usuario vota en Mobile App
   ↓
2. Mobile App → AppSync Mutation (vote)
   ↓
3. AppSync → Lambda Handler (vote.ts)
   ↓
4. Lambda procesa voto en DynamoDB
   ↓
5. Lambda publica evento → AppSync Subscription
   ↓
6. AppSync → Mobile App (todos los usuarios en la sala)
   ↓
7. UI se actualiza en tiempo real
```

### Flujo Real (PROBLEMA):
```
1. Usuario vota en Mobile App
   ↓
2. Mobile App → AppSync Mutation (vote)
   ↓
3. ❌ AppSync NO está configurado correctamente
   ↓
4. ❌ Lambda NO se ejecuta o NO publica eventos
   ↓
5. ❌ Subscriptions NO reciben datos
   ↓
6. ❌ UI NO se actualiza
```

---

## 🚨 PROBLEMAS IDENTIFICADOS

### 1. **AppSync NO está conectado a las Lambdas**

**Evidencia:**
- El código de las Lambdas existe en `infrastructure/src/handlers/`
- Pero NO hay evidencia de que estén desplegadas
- NO hay resolvers configurados en AppSync

**Solución Necesaria:**
```typescript
// En infrastructure/lib/trinity-stack.ts
// Necesitas crear:
1. Lambda Functions para cada handler
2. Data Sources en AppSync
3. Resolvers que conecten GraphQL → Lambda
```

### 2. **DynamoDB Streams NO están habilitados**

**Problema:**
- Para eventos en tiempo real, necesitas DynamoDB Streams
- Los Streams detectan cambios en las tablas
- Activan Lambdas que publican a AppSync

**Solución:**
```typescript
// Habilitar streams en las tablas
const votesTable = new dynamodb.Table(this, 'VotesTable', {
  stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
});

// Lambda que escucha el stream
const streamHandler = new lambda.Function(this, 'VoteStreamHandler', {
  // Publica eventos a AppSync cuando hay cambios
});

votesTable.grantStreamRead(streamHandler);
```

### 3. **Backend NestJS NO usa AppSync**

**Problema:**
- El backend solo hace autenticación
- NO tiene lógica de votación
- NO se comunica con AppSync

**Opciones:**
1. **Opción A (Recomendada):** Usar solo AppSync + Lambda
   - Eliminar backend de la ecuación para votación
   - Mobile App → AppSync directamente
   
2. **Opción B:** Backend como proxy
   - Mobile App → Backend → AppSync
   - Más complejo, sin beneficios claros

### 4. **Configuración de AppSync Incompleta**

**Falta verificar:**
- ✅ API ID: `epjtt2y3fzh53ii6omzj6n6h5a`
- ❓ Resolvers configurados
- ❓ Data Sources (Lambda, DynamoDB)
- ❓ Permisos IAM
- ❓ Schema desplegado

---

## ✅ PLAN DE ACCIÓN

### Fase 1: Verificar Infraestructura Actual (NO HACER CAMBIOS)

```bash
# 1. Verificar AppSync API
aws appsync get-graphql-api --api-id epjtt2y3fzh53ii6omzj6n6h5a

# 2. Listar Data Sources
aws appsync list-data-sources --api-id epjtt2y3fzh53ii6omzj6n6h5a

# 3. Listar Resolvers
aws appsync list-resolvers --api-id epjtt2y3fzh53ii6omzj6n6h5a --type-name Mutation
aws appsync list-resolvers --api-id epjtt2y3fzh53ii6omzj6n6h5a --type-name Subscription

# 4. Verificar Lambdas desplegadas
aws lambda list-functions --query 'Functions[?contains(FunctionName, `trinity`) || contains(FunctionName, `vote`) || contains(FunctionName, `room`)]'

# 5. Verificar DynamoDB Tables
aws dynamodb list-tables --query 'TableNames[?contains(@, `trinity`) || contains(@, `ROOM`) || contains(@, `VOTE`)]'

# 6. Verificar DynamoDB Streams
aws dynamodb describe-table --table-name <ROOMS_TABLE_NAME>
aws dynamodb describe-table --table-name <VOTES_TABLE_NAME>
```

### Fase 2: Identificar Qué Falta

Después de ejecutar los comandos de Fase 1, necesitamos:

1. **Si NO hay Lambdas desplegadas:**
   - Desplegar handlers desde `infrastructure/src/handlers/`
   
2. **Si NO hay Data Sources:**
   - Crear Data Sources para Lambda y DynamoDB
   
3. **Si NO hay Resolvers:**
   - Configurar resolvers para mutations y subscriptions
   
4. **Si NO hay Streams:**
   - Habilitar DynamoDB Streams en las tablas

### Fase 3: Implementar Solución (REQUIERE APROBACIÓN)

**Opción Recomendada: AppSync + Lambda (Sin Backend)**

```typescript
// infrastructure/lib/trinity-stack.ts

// 1. Crear Lambdas
const voteHandler = new lambda.Function(this, 'VoteHandler', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'vote.handler',
  code: lambda.Code.fromAsset('src/handlers'),
  environment: {
    ROOMS_TABLE: roomsTable.tableName,
    VOTES_TABLE: votesTable.tableName,
    USER_VOTES_TABLE: userVotesTable.tableName,
    ROOM_MEMBERS_TABLE: roomMembersTable.tableName,
  }
});

// 2. Dar permisos a las Lambdas
roomsTable.grantReadWriteData(voteHandler);
votesTable.grantReadWriteData(voteHandler);
userVotesTable.grantReadWriteData(voteHandler);
roomMembersTable.grantReadData(voteHandler);

// 3. Crear Data Source en AppSync
const voteDataSource = api.addLambdaDataSource('VoteDataSource', voteHandler);

// 4. Crear Resolver para mutation
voteDataSource.createResolver('VoteMutationResolver', {
  typeName: 'Mutation',
  fieldName: 'vote',
});

// 5. Habilitar DynamoDB Streams
const votesTable = new dynamodb.Table(this, 'VotesTable', {
  stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
  // ... resto de configuración
});

// 6. Lambda para publicar eventos desde Stream
const realtimePublisher = new lambda.Function(this, 'RealtimePublisher', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'realtime-publisher.handler',
  code: lambda.Code.fromAsset('src/handlers'),
  environment: {
    APPSYNC_API_URL: api.graphqlUrl,
    APPSYNC_API_ID: api.apiId,
  }
});

// 7. Conectar Stream → Lambda
realtimePublisher.addEventSource(
  new lambdaEventSources.DynamoEventSource(votesTable, {
    startingPosition: lambda.StartingPosition.LATEST,
    batchSize: 1,
  })
);

// 8. Dar permisos a Lambda para publicar a AppSync
realtimePublisher.addToRolePolicy(new iam.PolicyStatement({
  actions: ['appsync:GraphQL'],
  resources: [`${api.arn}/*`],
}));
```

---

## 📊 ESTADO DE LAS TABLAS DYNAMODB

### Estructura Esperada:

#### ROOMS_TABLE
```
PK (String): roomId
SK (String): "ROOM"
Attributes:
- name, description, status, hostId
- inviteCode, isActive, isPrivate
- memberCount, maxMembers, matchCount
- createdAt, updatedAt
```

#### ROOM_MEMBERS_TABLE
```
PK (String): roomId
SK (String): userId
Attributes:
- role (HOST | MEMBER)
- joinedAt, isActive
```

#### VOTES_TABLE
```
PK (String): roomId
SK (String): movieId
Attributes:
- votes (Number) - contador atómico
- createdAt, updatedAt
```

#### USER_VOTES_TABLE
```
PK (String): userId
SK (String): roomMovieId (formato: "roomId_movieId")
Attributes:
- roomId, movieId
- votedAt, voteType
```

---

## 🎯 PRÓXIMOS PASOS

### Inmediato (Hoy):
1. ✅ Ejecutar comandos de verificación (Fase 1)
2. ✅ Documentar estado actual de AWS
3. ⏳ Identificar qué componentes faltan

### Corto Plazo (Esta Semana):
1. ⏳ Desplegar Lambdas faltantes
2. ⏳ Configurar Resolvers en AppSync
3. ⏳ Habilitar DynamoDB Streams
4. ⏳ Implementar Lambda publisher para eventos

### Medio Plazo (Próxima Semana):
1. ⏳ Probar flujo completo de votación
2. ⏳ Verificar subscriptions en tiempo real
3. ⏳ Optimizar rendimiento
4. ⏳ Agregar monitoreo y logs

---

## 🔐 SEGURIDAD Y PERMISOS

### Cognito → AppSync:
- ✅ User Pool configurado
- ✅ Mobile app obtiene tokens
- ❓ AppSync valida tokens (verificar)

### Lambda → DynamoDB:
- ❓ Permisos IAM necesarios
- ❓ VPC configuration (si aplica)

### Lambda → AppSync:
- ❓ Permisos para `appsync:GraphQL`
- ❓ API Key o IAM auth

---

## 📝 NOTAS IMPORTANTES

1. **NO hacer cambios sin aprobación** - El sistema está en producción
2. **Backup antes de cambios** - Exportar configuración actual de AppSync
3. **Testing incremental** - Probar cada componente por separado
4. **Monitoreo** - CloudWatch Logs para debugging
5. **Rollback plan** - Tener plan B si algo falla

---

## 🤝 COLABORACIÓN

**Siguiente reunión:**
- Revisar resultados de comandos de verificación
- Decidir enfoque (AppSync directo vs Backend proxy)
- Aprobar cambios en infraestructura
- Establecer timeline de implementación

---

**Generado por:** Kiro AI Assistant  
**Última actualización:** 15 de Enero de 2026
