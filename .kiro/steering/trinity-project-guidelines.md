---
inclusion: always
---

# Trinity Project Guidelines

## 🎬 Contexto del Proyecto
Trinity es una aplicación móvil React Native para votación de películas en tiempo real con backend serverless en AWS.

### Arquitectura Principal
- **Frontend**: React Native + Expo
- **Backend**: AWS Lambda (Node.js 18.x)
- **Base de Datos**: DynamoDB (8 tablas)
- **APIs**: GraphQL (AppSync)
- **Autenticación**: AWS Cognito
- **Región**: eu-west-1 (SIEMPRE)

## 📁 Estructura del Repositorio

```
trinity/
├── mobile/                    # App React Native
├── lambdas/                   # 6 Funciones Lambda (código actual de AWS)
├── database/                  # Esquemas DynamoDB y scripts
├── api/                       # Esquemas GraphQL y Cognito
├── infrastructure/clean/      # CDK para deployment
└── scripts/                   # Scripts de utilidad
```

## 🚨 REGLAS CRÍTICAS DE DESARROLLO

### 📖 ANTES DE CUALQUIER CAMBIO
1. **SIEMPRE leer la documentación completa** en README.md
2. **REVISAR la estructura actual** del componente a modificar
3. **ANALIZAR dependencias** y conexiones con otros servicios
4. **VERIFICAR configuración existente** antes de hacer cambios

### 🔒 PRESERVACIÓN DE FUNCIONALIDAD
- **NUNCA eliminar** funcionalidades existentes sin confirmación explícita
- **NUNCA romper** integraciones entre servicios (Lambda ↔ DynamoDB ↔ AppSync)
- **SIEMPRE mantener** compatibilidad con código móvil existente
- **PRESERVAR** todas las variables de entorno y configuraciones

### 🛠️ METODOLOGÍA DE CAMBIOS

#### Para Modificar Lambdas:
1. **Leer código existente** completamente
2. **Identificar todas las funciones** y sus propósitos
3. **Verificar integraciones** con DynamoDB y AppSync
4. **Mantener handlers existentes** y estructura de respuesta
5. **Añadir funcionalidad** sin eliminar la existente
6. **Preservar manejo de errores** y logging

#### Para Modificar DynamoDB:
1. **Revisar esquemas actuales** en `database/schemas/`
2. **Verificar todas las consultas** en lambdas que usan la tabla
3. **Mantener claves primarias** y GSIs existentes
4. **Añadir campos** sin eliminar existentes
5. **Actualizar scripts** de creación si es necesario

#### Para Modificar AppSync:
1. **Revisar esquema GraphQL** completo
2. **Verificar resolvers existentes** y sus conexiones
3. **Mantener queries y mutations** actuales
4. **Preservar subscripciones** en tiempo real
5. **Añadir nuevos campos** sin romper existentes

#### Para Modificar App Móvil:
1. **Revisar componentes existentes** y navegación
2. **Mantener funcionalidad actual** de pantallas
3. **Preservar integraciones** con APIs GraphQL
4. **Verificar compatibilidad** con Expo y React Native

## 🛠️ Comandos Principales

### Deployment
```bash
# Deployment completo con CDK
node scripts/deploy-with-cdk/deploy-with-cdk.js

# Solo lambdas (rápido)
node scripts/deploy-all-lambdas/deploy-all-lambdas.js

# Lambdas + CDK sync
node scripts/update-lambda-and-deploy/update-lambda-and-deploy.js

# CDK individual
cd infrastructure/clean
npm run deploy:database    # Solo DynamoDB
npm run deploy:lambda      # Solo Lambdas
npm run deploy:api         # Solo APIs
```

### Base de Datos
```bash
# Crear todas las tablas
node database/scripts/create-all-tables.js

# Backup de datos
node database/scripts/migrate-data.js
```

### Desarrollo Móvil
```bash
cd mobile
npm start                  # Expo dev server
npm run android           # Android
npm run ios               # iOS
```

## ⚡ Funciones Lambda

| Función | Propósito | Handler | Timeout | NUNCA Modificar |
|---------|-----------|---------|---------|-----------------|
| `trinity-ai-dev` | Recomendaciones IA | index.handler | 30s | Handler principal |
| `trinity-auth-dev` | Autenticación | index.handler | 15s | Flujo de auth |
| `trinity-movie-dev` | Gestión películas | movie.handler | 30s | Integración TMDB |
| `trinity-realtime-dev` | Tiempo real | index.handler | 15s | WebSocket logic |
| `trinity-room-dev` | Gestión salas | index.handler | 20s | Lógica de salas |
| `trinity-vote-dev` | Sistema votación | index.handler | 20s | Algoritmo de votos |

## 🗄️ Tablas DynamoDB

| Tabla | Clave Primaria | GSI Principal | NUNCA Modificar |
|-------|----------------|---------------|-----------------|
| `trinity-users-dev` | userId | email-index | Estructura de usuario |
| `trinity-rooms-dev-v2` | roomId | hostId-index | Lógica de salas |
| `trinity-room-members-dev` | roomId, userId | userId-index | Relaciones miembros |
| `trinity-votes-dev` | voteId | roomId-movieId-index | Sistema de votos |
| `trinity-movies-cache-dev` | movieId | - | Cache TMDB |
| `trinity-room-matches-dev` | roomId, movieId | - | Algoritmo matches |
| `trinity-room-invites-dev-v2` | inviteId | roomId-index | Sistema invitaciones |
| `trinity-connections-dev` | connectionId | roomId-index | WebSocket connections |

## 🔗 APIs GraphQL

### APIs Desplegadas
- **trinity-api-dev**: API principal CRUD
- **trinity-realtime-api**: Subscripciones tiempo real

### Esquemas Principales
- `api/schemas/trinity-main-schema.graphql` - Esquema principal
- `api/schemas/trinity-api-dev.graphql` - API de desarrollo

### NUNCA Modificar Sin Revisar:
- Queries existentes usadas por móvil
- Mutations críticas (createRoom, joinRoom, voteMovie)
- Subscriptions en tiempo real
- Tipos GraphQL base (Room, User, Vote)

## 🎯 Estándares de Desarrollo

### Naming Conventions
- **Lambdas**: `trinity-[purpose]-dev`
- **Tablas**: `trinity-[entity]-dev[-version]`
- **APIs**: `trinity-[purpose]-api`
- **Stacks CDK**: `Trinity[Purpose]Stack`

### Configuración AWS
- **Región**: SIEMPRE eu-west-1
- **Environment**: dev
- **Billing**: PAY_PER_REQUEST para DynamoDB
- **Runtime**: Node.js 18.x para Lambdas

### Variables de Entorno CRÍTICAS
```env
AWS_REGION=eu-west-1
TMDB_API_KEY=tu_api_key
COGNITO_USER_POOL_ID=eu-west-1_xxxxxxxxx
APPSYNC_API_URL=https://xxxxxxxxxx.appsync-api.eu-west-1.amazonaws.com/graphql
```

### 🔑 GESTIÓN DE CREDENCIALES
- **TODAS las credenciales** deben estar en `.env` en la raíz del proyecto
- **NUNCA** duplicar credenciales en otros archivos
- **SIEMPRE** mantener `.env` organizado, ordenado y actualizado
- **PROHIBIDO** hardcodear credenciales en código
- **OBLIGATORIO** usar variables de entorno desde `.env` únicamente

## 🔄 Workflow de Desarrollo

### Para Cambios en Lambdas
1. **LEER código completo** de la lambda
2. **IDENTIFICAR todas las funciones** y dependencias
3. **VERIFICAR integraciones** con DynamoDB y AppSync
4. Editar código en `lambdas/[function-name]/`
5. **MANTENER estructura** de respuesta existente
6. Ejecutar: `node scripts/update-lambda-and-deploy/update-lambda-and-deploy.js`
7. **VERIFICAR logs** y funcionalidad

### Para Cambios en Infraestructura
1. **REVISAR stacks actuales** en `infrastructure/clean/lib/`
2. **VERIFICAR dependencias** entre stacks
3. Editar archivos en `infrastructure/clean/lib/`
4. **PROBAR con** `cdk diff` primero
5. Ejecutar: `node scripts/deploy-with-cdk/deploy-with-cdk.js`
6. **VERIFICAR outputs** de CDK

### Para Cambios en Base de Datos
1. **ANALIZAR esquemas actuales** en `database/schemas/`
2. **VERIFICAR uso** en todas las lambdas
3. Actualizar esquemas en `database/schemas/`
4. Regenerar scripts: `node database/scripts/create-tables-from-schemas.js`
5. **BACKUP antes** de aplicar cambios
6. Aplicar cambios: `node database/scripts/create-all-tables.js`

## 🧹 LIMPIEZA POST-CAMBIOS

### SIEMPRE Eliminar Después de Cambios:
- **Archivos .md temporales** (COMPLETE, SUMMARY, STATUS, etc.)
- **Scripts de testing** temporales (test-*.js)
- **Archivos de debug** (debug-*.js)
- **ZIPs temporales** (*.zip en raíz)
- **Logs temporales** (*.log en raíz)
- **Archivos de backup** temporales

### Comando de Limpieza:
```bash
# Eliminar archivos temporales
rm -f *-COMPLETE.md *-SUMMARY.md *-STATUS.md
rm -f test-*.js debug-*.js
rm -f *.zip *.log
```

## 🚨 Reglas Importantes

### NUNCA hacer:
- Cambiar región de eu-west-1
- Eliminar tablas en producción sin backup
- Hardcodear credenciales en código
- Usar `us-east-1` o cualquier otra región
- **Eliminar funcionalidades existentes sin confirmación**
- **Romper integraciones entre servicios**
- **Modificar handlers principales sin revisar**
- **Cambiar estructura de respuestas GraphQL**
- **Poner credenciales en archivos que no sean `.env` raíz**
- **Duplicar variables de entorno en múltiples archivos**

### SIEMPRE hacer:
- **Leer documentación completa antes de cambios**
- **Revisar código existente completamente**
- **Mantener funcionalidad actual**
- **Verificar integraciones después de cambios**
- Usar scripts de deployment automatizados
- Verificar cambios con `cdk diff` antes de deploy
- Mantener documentación actualizada en README.md
- Testear cambios localmente primero
- **Limpiar archivos temporales después de cambios**
- **Mantener todas las credenciales en `.env` raíz únicamente**
- **Organizar y actualizar `.env` después de cambios**

## 🔍 Debugging y Logs

### Ver Logs de Lambda
```bash
aws logs tail /aws/lambda/trinity-movie-dev --follow --region eu-west-1
```

### Verificar Configuración
```bash
node scripts/utils/verify-aws-config/verify-aws-config.js
```

### Analizar DynamoDB
```bash
node scripts/utils/analyze-dynamodb-usage/analyze-dynamodb-usage.js
```

## 📊 Monitoreo

### Métricas Clave
- Lambda execution duration y errors
- DynamoDB read/write capacity
- AppSync request count y latency
- Cognito sign-up/sign-in metrics

### Dashboards
- CloudWatch para métricas
- X-Ray para tracing (habilitado)
- AppSync console para GraphQL

## 🎯 Objetivos del Proyecto

### Funcionalidad Principal
1. **Crear salas** de votación de películas
2. **Invitar usuarios** a salas
3. **Votar películas** en tiempo real
4. **Calcular matches** basados en votos
5. **Notificaciones** en tiempo real

### Características Técnicas
- **Serverless** completamente
- **Tiempo real** con subscripciones
- **Escalable** automáticamente
- **Seguro** con Cognito JWT
- **Optimizado** para móvil

---

**RECUERDA**: 
1. **SIEMPRE leer documentación y código existente ANTES de cambios**
2. **MANTENER funcionalidad actual - NUNCA romper lo que funciona**
3. **VERIFICAR integraciones después de cada cambio**
4. **LIMPIAR archivos temporales al finalizar**
5. **CREDENCIALES SOLO en `.env` raíz - organizadas y actualizadas**
6. Trinity es un proyecto serverless en eu-west-1 con estructura organizada