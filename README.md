# Trinity - Aplicación de Votación de Películas 🎬

Una aplicación móvil React Native para crear salas de votación de películas en tiempo real, con backend completamente serverless en AWS.

## 🏗️ Arquitectura del Sistema

### Servicios AWS Desplegados
- **6 Funciones Lambda Activas** + 1 Legacy para lógica de negocio
- **9 Tablas DynamoDB** para almacenamiento (incluye chat sessions)
- **2 APIs GraphQL AppSync** para comunicación
- **Cognito** para autenticación
- **S3** para assets estáticos

### Stack Tecnológico
- **Frontend**: React Native + Expo
- **Backend**: AWS Lambda (Node.js)
- **Base de Datos**: DynamoDB
- **API**: GraphQL (AppSync)
- **Autenticación**: AWS Cognito
- **Tiempo Real**: AppSync Subscriptions

## 📁 Estructura del Proyecto

```
trinity/
├── 📱 mobile/                    # Aplicación móvil React Native
│   ├── app/                      # Pantallas y navegación
│   ├── src/                      # Componentes y servicios
│   ├── assets/                   # Imágenes y recursos
│   └── package.json              # Dependencias móviles
│
├── ⚡ lambdas/                   # Funciones Lambda (código actual de AWS)
│   ├── trinity-ai-dev/           # IA para recomendaciones de películas (ACTIVO)
│   ├── trinity-auth-dev/         # Autenticación y autorización
│   ├── trinity-movie-dev/        # Gestión de películas y TMDB
│   ├── trinity-realtime-dev/     # Comunicación en tiempo real
│   ├── trinity-room-dev/         # Gestión de salas de votación
│   ├── trinity-vote-dev/         # Sistema de votación
│   └── trinity-trini-dev/        # Chatbot IA (LEGACY - Python/Salamandra-2b)
│
├── 🗄️ database/                  # Base de datos
│   ├── schemas/                  # Esquemas de DynamoDB exportados
│   └── scripts/                  # Scripts de creación y migración
│       ├── create-all-tables.js  # Crear todas las tablas
│       ├── migrate-data.js       # Backup y migración
│       └── create-*.json         # Definiciones de tablas
│
├── 🔗 api/                       # APIs y configuración
│   ├── schemas/                  # Esquemas GraphQL y Cognito
│   │   ├── trinity-main-schema.graphql  # Esquema principal
│   │   ├── trinity-api-dev.graphql      # API de desarrollo
│   │   └── cognito-*.json               # Configuración Cognito
│   └── resolvers/                # Resolvers de AppSync
│
├── 🏗️ infrastructure/            # Infraestructura como código
│   ├── clean/                    # CDK y CloudFormation organizados
│   ├── package.json              # Dependencias CDK
│   └── cdk.json                  # Configuración CDK
│
└── 🛠️ scripts/                   # Scripts de utilidad y deployment
    ├── deploy-all-lambdas/         # Deployment masivo de lambdas
    │   ├── deploy-all-lambdas.js   # Script principal
    │   └── README.md               # Documentación individual
    ├── deploy-with-cdk/            # Deployment completo CDK
    ├── update-lambda-and-deploy/   # Deployment rápido lambdas + CDK
    ├── e2e-backend-test/           # Tests end-to-end
    ├── test-create-room/           # Test creación de salas
    ├── test-vote-backend/          # Test sistema de votación
    └── utils/                      # Utilidades AWS
        ├── verify-aws-config/      # Verificar configuración
        ├── analyze-dynamodb-usage/ # Análisis de DynamoDB
        └── check-lambda-code/      # Verificar código lambdas
        ├── analyze-dynamodb-usage.js  # Análisis DynamoDB
        └── check-lambda-code.js  # Verificar lambdas
```

## 🚀 Inicio Rápido

### Prerrequisitos
```bash
# Herramientas necesarias
- Node.js 18+
- AWS CLI configurado
- React Native development environment
- Expo CLI
```

### Configuración Inicial
```bash
# 1. Clonar y configurar
git clone <tu-repo>
cd trinity
npm install

# 2. Configurar AWS CLI
aws configure
# Region: eu-west-1

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores
```

### Variables de Entorno Requeridas
```env
# TMDB API
TMDB_API_KEY=tu_api_key_de_tmdb

# AWS
AWS_REGION=eu-west-1
COGNITO_USER_POOL_ID=eu-west-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

# AppSync
APPSYNC_API_URL=https://xxxxxxxxxx.appsync-api.eu-west-1.amazonaws.com/graphql
APPSYNC_REALTIME_URL=wss://xxxxxxxxxx.appsync-realtime-api.eu-west-1.amazonaws.com/graphql

# AI Chatbot (ACTIVO)
HF_API_TOKEN=tu_hugging_face_token
```

## 📱 Desarrollo Móvil

### Ejecutar la App
```bash
cd mobile
npm install
npm start

# Para dispositivos específicos
npm run android
npm run ios
```

### Build para Producción
```bash
cd mobile
npx expo build:android
npx expo build:ios
```

### Prueba app en expo emuladoir Android Studio
```bash
cd mobile
npx expo start --clear
```

## 🤖 AI Assistant "Trini"

### Arquitectura Actual (Enero 2026)
- **Lambda Activa**: `trinity-ai-dev` (Node.js 18.x)
- **Modelo IA**: Qwen/Qwen2.5-1.5B-Instruct via OpenAI SDK + HF Serverless
- **Fallback Inteligente**: Sistema de análisis de consultas en español
- **Funcionalidades**:
  - Análisis de géneros cinematográficos
  - Filtrado por contenido (bullying, violencia, etc.)
  - Recomendaciones contextuales
  - Respuestas en español

### Migración Completada
- ✅ **Migrado de**: HF Inference API (deprecated) → OpenAI SDK + HF Serverless
- ✅ **Modelo actualizado**: Salamandra-2b → Qwen2.5-1.5B-Instruct
- ✅ **Fallback implementado**: Sistema inteligente para casos sin acceso al modelo
- ✅ **Deployment exitoso**: Lambda actualizada con OpenAI SDK v4.28.0

### Testing
```bash
# Test del chatbot AI
aws lambda invoke --function-name trinity-ai-dev \
  --payload '{"query":"películas de comedia española","userId":"test"}' \
  --region eu-west-1 response.json

# Ver logs
aws logs tail /aws/lambda/trinity-ai-dev --follow --region eu-west-1
```

## ⚡ Funciones Lambda

### Funciones Desplegadas
| Función | Propósito | Runtime | Handler | Estado |
|---------|-----------|---------|---------|---------|
| `trinity-ai-dev` | Recomendaciones IA | Node.js 18.x | index.handler | ✅ **ACTIVO** |
| `trinity-auth-dev` | Autenticación | Node.js 18.x | index.handler | ✅ ACTIVO |
| `trinity-movie-dev` | Gestión películas | Node.js 18.x | movie.handler | ✅ ACTIVO |
| `trinity-realtime-dev` | Tiempo real | Node.js 18.x | index.handler | ✅ ACTIVO |
| `trinity-room-dev` | Gestión salas | Node.js 18.x | index.handler | ✅ ACTIVO |
| `trinity-vote-dev` | Sistema votación | Node.js 18.x | index.handler | ✅ ACTIVO |
| `trinity-trini-dev` | Chatbot IA (Legacy) | Python 3.10 | trini.handler | ⚠️ **LEGACY** |

> **Nota**: `trinity-trini-dev` está marcada como LEGACY. Fue superseded por `trinity-ai-dev` que usa Qwen2.5-1.5B con OpenAI SDK. La lambda legacy aún existe en AWS pero no se usa activamente.

### Deployment de Lambdas
```bash
# Desplegar todas las funciones
node scripts/deploy-all-lambdas/deploy-all-lambdas.js

# Desplegar función específica
cd lambdas/trinity-movie-dev
zip -r function.zip . -x "*.git*" "README.md" "lambda-config.json"
aws lambda update-function-code --function-name trinity-movie-dev --zip-file fileb://function.zip --region eu-west-1
```

## 🗄️ Base de Datos (DynamoDB)

### Tablas Principales
| Tabla | Propósito | Clave Primaria | GSI |
|-------|-----------|----------------|-----|
| `trinity-users-dev` | Usuarios | userId | email-index |
| `trinity-rooms-dev-v2` | Salas de votación | roomId | hostId-index |
| `trinity-room-members-dev` | Miembros de salas | roomId, userId | userId-index |
| `trinity-votes-dev` | Votos de usuarios | voteId | roomId-movieId-index |
| `trinity-movies-cache-dev` | Cache de películas | movieId | - |
| `trinity-room-matches-dev` | Matches de películas | roomId, movieId | - |
| `trinity-room-invites-dev-v2` | Invitaciones | inviteId | roomId-index |
| `trinity-connections-dev` | Conexiones WebSocket | connectionId | roomId-index |
| `trinity-chat-sessions-dev` | **Sesiones chat Trini** | sessionId | userId-index |

### Gestión de Tablas
```bash
# Crear todas las tablas desde esquemas
node database/scripts/create-all-tables.js

# Crear backup de datos existentes
node database/scripts/migrate-data.js

# Crear tabla específica
aws dynamodb create-table --cli-input-json file://database/scripts/create-trinity-rooms-dev-v2.json --region eu-west-1
```

## 🔗 APIs GraphQL

### APIs Desplegadas
- **trinity-api-dev**: API principal para operaciones CRUD
- **trinity-realtime-api**: API para subscripciones en tiempo real

### Operaciones Principales
```graphql
# Crear sala
mutation CreateRoom($input: CreateRoomInput!) {
  createRoom(input: $input) {
    roomId
    name
    hostId
    status
    inviteCode
  }
}

# Unirse a sala
mutation JoinRoom($roomId: String!) {
  joinRoom(roomId: $roomId) {
    success
    message
    room {
      roomId
      name
      status
    }
  }
}

# Votar película
mutation VoteMovie($roomId: String!, $movieId: String!) {
  voteMovie(roomId: $roomId, movieId: $movieId) {
    success
    voteCount
    totalVotes
  }
}

# Subscription para tiempo real
subscription OnRoomUpdate($roomId: String!) {
  onRoomUpdate(roomId: $roomId) {
    roomId
    status
    currentMovie
    votes
    members
  }
}
```

## 🔐 Autenticación (Cognito)

### User Pools Configurados
- **trinity-users-dev**: Pool principal
- **trinity-users-dev-v2**: Pool actualizado con configuración mejorada

### Flujo de Autenticación
1. **Registro/Login** via Cognito
2. **JWT token** para autorización
3. **Validación** en resolvers GraphQL
4. **Acceso a recursos** según permisos

### Configuración de Seguridad
- MFA opcional habilitado
- Políticas de contraseña robustas
- Verificación por email
- Tokens con expiración configurada

## 🛠️ Scripts Disponibles

Todos los scripts están organizados en carpetas individuales con documentación completa.

### Deployment y Gestión
```bash
# Deployment completo con CDK (infraestructura + lambdas)
node scripts/deploy-with-cdk/deploy-with-cdk.js

# Solo lambdas (rápido para desarrollo diario)
node scripts/update-lambda-and-deploy/update-lambda-and-deploy.js

# Deployment legacy individual de lambdas
node scripts/deploy-all-lambdas/deploy-all-lambdas.js

# Crear todas las tablas DynamoDB
node database/scripts/create-all-tables.js

# Crear backup de datos
node database/scripts/migrate-data.js

# CDK por stacks individuales
cd infrastructure/clean
npm run deploy:database    # Solo DynamoDB
npm run deploy:lambda      # Solo Lambdas
npm run deploy:api         # Solo APIs GraphQL
npm run hotswap            # Cambios urgentes (15-30s)
```

### Utilidades AWS
```bash
# Verificar configuración AWS
node scripts/utils/verify-aws-config/verify-aws-config.js

# Analizar uso de DynamoDB
node scripts/utils/analyze-dynamodb-usage/analyze-dynamodb-usage.js

# Verificar código de lambdas
node scripts/utils/check-lambda-code/check-lambda-code.js
```

### Testing y Desarrollo
```bash
# Test end-to-end del backend
node scripts/e2e-backend-test/e2e-backend-test.js

# Test de creación de salas
node scripts/test-create-room/test-create-room.js

# Test de votación
node scripts/test-vote-backend/test-vote-backend.js

# Test de unirse a sala
node scripts/test-join-room-aws/test-join-room-aws.js
```

### Gestión de Usuarios
```bash
# Confirmar usuario por email
node scripts/confirm-user-by-email/confirm-user-by-email.js

# Verificar sala específica
node scripts/check-room/check-room.js

# Crear sala de prueba
node scripts/create-room-only/create-room-only.js

# Simular unirse y votar
node scripts/join-and-vote/join-and-vote.js
```

### 📚 Documentación de Scripts
Cada script tiene su propia carpeta con:
- **Script principal**: `[nombre]/[nombre].js`
- **Documentación**: `[nombre]/README.md`
- **Descripción detallada** de funcionalidad
- **Ejemplos de uso** y configuración
- **Archivos relacionados** y dependencias

## 🔄 Flujo de Desarrollo Diario

### 📝 **Editando Código Lambda**
```bash
# 1. Editas archivo (ej: lambdas/trinity-movie-dev/services/deepLinkService.js)
# 2. Despliegas cambios
node scripts/update-lambda-and-deploy/update-lambda-and-deploy.js
# 3. Verificas logs
aws logs tail /aws/lambda/trinity-movie-dev --follow --region eu-west-1
```

### 🏗️ **Modificando Infraestructura**
```bash
# 1. Editas CDK (ej: infrastructure/clean/lib/trinity-lambda-stack.ts)
# 2. Verificas cambios
cd infrastructure/clean && cdk diff
# 3. Despliegas
node scripts/deploy-with-cdk/deploy-with-cdk.js
```

### 🗄️ **Actualizando Base de Datos**
```bash
# 1. Modificas esquema (ej: database/schemas/trinity-rooms-dev-v2.json)
# 2. Regeneras scripts
node database/scripts/create-tables-from-schemas.js
# 3. Aplicas cambios (con backup automático)
node database/scripts/create-all-tables.js
```

### ⚡ **Cambios Urgentes**
```bash
# Para fixes críticos en lambdas (súper rápido)
cd infrastructure/clean
npm run hotswap
```

## 🔄 Flujo de la Aplicación

### 1. Autenticación
- Usuario se registra/loguea via Cognito
- Recibe JWT token con claims personalizados
- Token se usa para autorizar requests GraphQL

### 2. Crear Sala
- Host crea sala via `trinity-room-dev` lambda
- Se almacena en `trinity-rooms-dev-v2` con configuración
- Se genera código de invitación único
- Se notifica via AppSync subscription

### 3. Unirse a Sala
- Usuario ingresa código de sala o link de invitación
- Se valida disponibilidad y permisos
- Se agrega a `trinity-room-members-dev`
- Recibe notificación en tiempo real de estado

### 4. Votación
- Sistema obtiene películas via `trinity-movie-dev` (TMDB API)
- Aplica filtros de contenido y preferencias
- Usuarios votan via `trinity-vote-dev` lambda
- Votos se almacenan en `trinity-votes-dev`
- Updates en tiempo real via AppSync subscriptions

### 5. Resultado
- Se calculan matches basados en algoritmo de votación
- Se almacenan en `trinity-room-matches-dev`
- Se notifica resultado final a todos los miembros
- Se actualiza estado de sala a "completed"

## 🚀 Deployment en Producción

### 🔄 **Flujo de CDK Automático**

CDK está configurado para leer automáticamente desde tu estructura organizada:
- **Lambdas**: Lee desde `lambdas/[function-name]/` y empaqueta todo el contenido
- **DynamoDB**: Usa esquemas de `database/schemas/`
- **GraphQL**: Usa esquemas de `api/schemas/`
- **Región**: Siempre despliega en `eu-west-1`

#### **Detección de Cambios**
CDK usa **hashing de contenido** para detectar cambios:
1. Calcula hash de carpetas completas
2. Compara con deployment anterior
3. Solo actualiza recursos que cambiaron
4. Skip automático si no hay cambios

### 📋 **Comandos de Deployment por Tipo de Cambio**

#### **Solo Código de Lambdas** ⚡ (30-60s)
```bash
# Para cambios en lambdas/[function-name]/ 
node scripts/update-lambda-and-deploy/update-lambda-and-deploy.js
```
- Despliega lambdas individualmente primero
- Sincroniza con CDK usando hotswap
- **Recomendado para desarrollo diario**

#### **Infraestructura Completa** 🏗️ (3-5min)
```bash
# Para cambios en infrastructure/clean/lib/
node scripts/deploy-with-cdk/deploy-with-cdk.js
```
- Despliega todos los stacks en orden
- Verifica dependencias entre recursos
- **Recomendado para cambios de infraestructura**

#### **Stacks Individuales** 🎯 (1-2min)
```bash
cd infrastructure/clean
npm run deploy:database    # Solo DynamoDB
npm run deploy:lambda      # Solo Lambdas  
npm run deploy:api         # Solo APIs GraphQL
npm run deploy:main        # Solo recursos compartidos
```

#### **Hotswap (Súper Rápido)** ⚡ (15-30s)
```bash
cd infrastructure/clean
npm run hotswap
```
- Solo para cambios en código Lambda
- No actualiza infraestructura
- **Para cambios urgentes**

### 🎯 **Guía de Comandos por Escenario**

| Cambio Realizado | Comando Recomendado | Tiempo |
|------------------|-------------------|---------|
| Editar código Lambda | `node scripts/update-lambda-and-deploy/update-lambda-and-deploy.js` | 30-60s |
| Añadir nueva tabla DynamoDB | `node scripts/deploy-with-cdk/deploy-with-cdk.js` | 3-5min |
| Modificar esquema GraphQL | `cd infrastructure/clean && npm run deploy:api` | 2-3min |
| Cambiar configuración CDK | `node scripts/deploy-with-cdk/deploy-with-cdk.js` | 3-5min |
| Fix urgente en Lambda | `cd infrastructure/clean && npm run hotswap` | 15-30s |
| Crear nuevos recursos | `node scripts/deploy-with-cdk/deploy-with-cdk.js` | 3-5min |

### 📁 **Lo que CDK Empaqueta Automáticamente**

Para cada Lambda en `lambdas/[function-name]/`:
```
✅ Todos los archivos .js
✅ Carpetas services/, types/, utils/
✅ package.json y dependencias
✅ Variables de entorno desde lambda-config.json
❌ README.md (excluido)
❌ lambda-config.json (excluido del ZIP)
❌ *.zip (excluido)
```

### 🔍 **Verificación Post-Deployment**

#### **Ver Logs de Lambda**
```bash
aws logs tail /aws/lambda/trinity-movie-dev --follow --region eu-west-1
```

#### **Verificar Estado de Stacks**
```bash
cd infrastructure/clean
cdk list                    # Ver todos los stacks
cdk diff                    # Ver diferencias pendientes
```

#### **Verificar Recursos Desplegados**
```bash
# Ver funciones Lambda
aws lambda list-functions --region eu-west-1

# Ver tablas DynamoDB  
aws dynamodb list-tables --region eu-west-1

# Ver APIs GraphQL
aws appsync list-graphql-apis --region eu-west-1
```

## 🐛 Troubleshooting

### Problemas Comunes

#### Lambda Timeout
```bash
# Aumentar timeout en lambda-config.json
# Verificar logs en CloudWatch
aws logs tail /aws/lambda/trinity-movie-dev --follow
```

#### DynamoDB Throttling
```bash
# Cambiar a billing mode ON_DEMAND
# Verificar métricas de consumo
node scripts/utils/analyze-dynamodb-usage/analyze-dynamodb-usage.js
```

#### AppSync Authorization
```bash
# Verificar JWT token y User Pool config
# Revisar resolvers de autorización
# Comprobar claims del token
```

#### TMDB API Limits
```bash
# Implementar rate limiting
# Usar cache de películas
# Verificar quotas de API
```

### Logs y Monitoreo
```bash
# Ver logs de Lambda específica
aws logs tail /aws/lambda/trinity-movie-dev --follow

# Métricas de DynamoDB
aws cloudwatch get-metric-statistics --namespace AWS/DynamoDB --metric-name ConsumedReadCapacityUnits

# Estado de AppSync
aws appsync get-graphql-api --api-id YOUR_API_ID

# Verificar configuración completa
node scripts/utils/verify-aws-config/verify-aws-config.js
```

## 🤝 Contribución

### Workflow de Desarrollo
1. **Fork** del repositorio
2. **Crear rama** feature: `git checkout -b feature/nueva-funcionalidad`
3. **Desarrollar** y testear localmente
4. **Commit** con conventional commits: `git commit -m "feat: nueva funcionalidad"`
5. **Push**: `git push origin feature/nueva-funcionalidad`
6. **Crear Pull Request** con descripción detallada

### Estándares de Código
- **ESLint** para JavaScript/TypeScript
- **Prettier** para formateo automático
- **Conventional Commits** para mensajes
- **Tests unitarios** requeridos para nuevas features
- **Documentación** actualizada en README

### Testing
```bash
# Tests de lambdas
cd lambdas/trinity-movie-dev
npm test

# Tests de app móvil
cd mobile
npm test

# Tests end-to-end
node scripts/e2e-backend-test/e2e-backend-test.js
```

## 📊 Métricas y Monitoreo

### KPIs Principales
- **Usuarios activos** diarios/mensuales
- **Salas creadas** por día
- **Tiempo promedio** de votación
- **Tasa de matches** exitosos
- **Latencia de APIs** GraphQL
- **Errores de Lambda** por función

### Herramientas de Monitoreo
- **CloudWatch** para logs y métricas
- **X-Ray** para tracing distribuido (opcional)
- **AppSync metrics** para GraphQL performance
- **Cognito analytics** para usuarios
- **DynamoDB metrics** para performance de base de datos

### Dashboards Recomendados
- Lambda execution duration y errors
- DynamoDB read/write capacity utilization
- AppSync request count y latency
- Cognito sign-up y sign-in metrics

## 🔒 Seguridad

### Medidas Implementadas
- **Autenticación JWT** via Cognito con rotación automática
- **Autorización granular** a nivel de resolver GraphQL
- **Validación de entrada** en todas las lambdas
- **Encriptación en tránsito** (HTTPS/WSS) y reposo
- **Rate limiting** en APIs públicas
- **Sanitización** de inputs de usuario

### Best Practices de Seguridad
- **Rotación regular** de secrets y API keys
- **Principio de menor privilegio** en IAM roles
- **Logs de auditoría** para acciones críticas
- **Monitoreo de anomalías** en patrones de uso
- **Backup automático** de datos críticos
- **Disaster recovery** plan documentado

### Configuración de Seguridad
```bash
# Verificar configuración de seguridad
node scripts/utils/verify-aws-config/verify-aws-config.js

# Revisar permisos IAM
aws iam get-role --role-name trinity-lambda-execution-role

# Verificar encriptación DynamoDB
aws dynamodb describe-table --table-name trinity-users-dev
```

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver `LICENSE` para más detalles.

## 📞 Soporte

Para soporte técnico o preguntas:
- **Issues**: Crear issue en GitHub con template apropiado
- **Documentación**: Revisar este README completo
- **Logs**: Consultar CloudWatch para debugging
- **Configuración**: Usar scripts de verificación en `scripts/utils/`

### Recursos Adicionales
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [AppSync GraphQL](https://docs.aws.amazon.com/appsync/)
- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [Expo Documentation](https://docs.expo.dev/)

---

**¡Trinity está listo para crear experiencias de votación de películas increíbles!** 🎬✨

*Repositorio completamente organizado, documentado y listo para producción.*