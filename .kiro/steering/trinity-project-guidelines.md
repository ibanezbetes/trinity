---
inclusion: always
---

# Trinity Project Guidelines

## 🎬 Contexto del Proyecto
Trinity es una aplicación móvil React Native para votación de películas en tiempo real con backend serverless en AWS, que incluye un chatbot inteligente (Trini) para recomendaciones personalizadas usando IA.

### Arquitectura Principal
- **Frontend**: React Native + Expo
- **Backend**: AWS Lambda (Node.js 18.x + Python 3.10)
- **Base de Datos**: DynamoDB (9 tablas)
- **APIs**: GraphQL (AppSync)
- **Autenticación**: AWS Cognito
- **IA**: Chatbot Trini con OpenAI SDK + HF Serverless (Qwen2.5-1.5B) + Fallback inteligente
- **Región**: eu-west-1 (SIEMPRE)

### Estado Actual del Proyecto
- ✅ **Proyecto limpio y organizado** (Enero 30, 2026)
- ✅ **AI Logic mejorada** - Migrado de HF Inference API a OpenAI SDK con HF Serverless
- ✅ **Chatbot Trini funcional** - Sistema de fallback inteligente implementado
- ✅ **Sistema de chat sessions** - Persistencia de conversaciones
- ✅ **Property-based testing** - Tests robustos implementados
- ✅ **Documentación completa** - README y steering actualizados
- ✅ **Cleanup completo** - Archivos temporales eliminados, .gitignore mejorado
- ✅ **Legacy code identificado** - trinity-trini-dev marcado como LEGACY
- ✅ **Deployment scripts limpiados** - Scripts temporales eliminados

## 📁 Estructura del Repositorio

```
trinity/
├── 📱 mobile/                    # App React Native + Expo
│   ├── app/                      # Pantallas y navegación
│   ├── src/                      # Componentes, servicios, tests
│   └── assets/                   # Recursos e imágenes
│
├── ⚡ lambdas/                   # 7 Funciones Lambda (6 ACTIVAS + 1 LEGACY)
│   ├── trinity-ai-dev/           # IA para recomendaciones (Node.js) - ACTIVO
│   ├── trinity-auth-dev/         # Autenticación (Node.js)
│   ├── trinity-movie-dev/        # Gestión películas TMDB (Node.js)
│   ├── trinity-realtime-dev/     # Tiempo real WebSocket (Node.js)
│   ├── trinity-room-dev/         # Gestión salas (Node.js)
│   ├── trinity-vote-dev/         # Sistema votación (Node.js)
│   └── trinity-trini-dev/        # Chatbot IA Salamandra-2b (Python) - LEGACY
│
├── 🗄️ database/                  # Base de datos DynamoDB
│   ├── schemas/                  # 9 esquemas exportados de AWS
│   └── scripts/                  # Scripts creación y migración
│
├── 🔗 api/                       # APIs GraphQL y configuración
│   ├── schemas/                  # Esquemas GraphQL y Cognito
│   └── resolvers/                # Resolvers AppSync y tests
│
├── 🏗️ infrastructure/            # Infraestructura como código
│   ├── clean/                    # CDK organizado para deployment
│   ├── src/                      # Handlers y servicios TypeScript
│   ├── lib/                      # Servicios compilados
│   └── web/                      # Assets web estáticos
│
└── 🛠️ scripts/                   # Scripts utilidad y deployment
    ├── deploy-*/                 # Scripts deployment automatizado
    ├── test-*/                   # Scripts testing E2E
    └── utils/                    # Utilidades AWS y verificación
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
7. **Ejecutar tests** antes y después de cambios

#### Para Modificar DynamoDB:
1. **Revisar esquemas actuales** en `database/schemas/`
2. **Verificar todas las consultas** en lambdas que usan la tabla
3. **Mantener claves primarias** y GSIs existentes
4. **Añadir campos** sin eliminar existentes
5. **Actualizar scripts** de creación si es necesario
6. **Considerar TTL** para nuevas tablas si aplica

#### Para Modificar AppSync:
1. **Revisar esquema GraphQL** completo
2. **Verificar resolvers existentes** y sus conexiones
3. **Mantener queries y mutations** actuales
4. **Preservar subscripciones** en tiempo real
5. **Añadir nuevos campos** sin romper existentes
6. **Ejecutar tests de resolvers** después de cambios

#### Para Modificar App Móvil:
1. **Revisar componentes existentes** y navegación
2. **Mantener funcionalidad actual** de pantallas
3. **Preservar integraciones** con APIs GraphQL
4. **Verificar compatibilidad** con Expo y React Native
5. **Testear en dispositivos** reales cuando sea posible

#### Para Modificar Chatbot Trini:
1. **Revisar modelo Salamandra-2b** y configuración
2. **Verificar rate limiting** y TTL settings
3. **Mantener compatibilidad** con chat sessions
4. **Preservar integración** con todas las tablas DynamoDB
5. **Testear respuestas IA** con queries reales

## 🛠️ Comandos Principales

### Deployment
```bash
# Deployment completo con CDK (RECOMENDADO)
node scripts/deploy-with-cdk/deploy-with-cdk.js

# Solo lambdas (rápido para desarrollo diario)
node scripts/update-lambda-and-deploy/update-lambda-and-deploy.js

# Deployment legacy individual de lambdas
node scripts/deploy-all-lambdas/deploy-all-lambdas.js

# CDK por stacks individuales
cd infrastructure/clean
npm run deploy:database    # Solo DynamoDB
npm run deploy:lambda      # Solo Lambdas
npm run deploy:api         # Solo APIs GraphQL
npm run hotswap            # Cambios urgentes (15-30s)
```

### Base de Datos
```bash
# Crear todas las tablas desde esquemas
node database/scripts/create-all-tables.js

# Crear backup de datos existentes
node database/scripts/migrate-data.js

# Crear tabla específica
aws dynamodb create-table --cli-input-json file://database/scripts/create-trinity-chat-sessions-dev.json --region eu-west-1
```

### Desarrollo Móvil
```bash
cd mobile
npm install && npm start    # Expo dev server
npm run android             # Android
npm run ios                 # iOS
npx expo start --clear      # Limpiar cache
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

# Tests de lambdas individuales
cd lambdas/trinity-movie-dev && npm test
cd mobile && npm test
```

### Utilidades AWS
```bash
# Verificar configuración AWS completa
node scripts/utils/verify-aws-config/verify-aws-config.js

# Analizar uso de DynamoDB
node scripts/utils/analyze-dynamodb-usage/analyze-dynamodb-usage.js

# Verificar código de lambdas
node scripts/utils/check-lambda-code/check-lambda-code.js
```

## ⚡ Funciones Lambda

| Función | Propósito | Runtime | Handler | Timeout | NUNCA Modificar |
|---------|-----------|---------|---------|---------|-----------------|
| `trinity-ai-dev` | Recomendaciones IA | Node.js 18.x | index.handler | 30s | Handler principal |
| `trinity-auth-dev` | Autenticación | Node.js 18.x | index.handler | 15s | Flujo de auth |
| `trinity-movie-dev` | Gestión películas | Node.js 18.x | movie.handler | 30s | Integración TMDB |
| `trinity-realtime-dev` | Tiempo real | Node.js 18.x | index.handler | 15s | WebSocket logic |
| `trinity-room-dev` | Gestión salas | Node.js 18.x | index.handler | 20s | Lógica de salas |
| `trinity-vote-dev` | Sistema votación | Node.js 18.x | index.handler | 20s | Algoritmo de votos |
| `trinity-trini-dev` | Chatbot IA | Python 3.10 | trini.handler | 30s | Salamandra-2b model (LEGACY) |

### 🤖 Chatbot Trini (trinity-ai-dev - ACTIVO)
- **Modelo IA**: Qwen/Qwen2.5-1.5B-Instruct via OpenAI SDK + HF Serverless
- **Fallback**: Sistema inteligente de análisis de consultas en español
- **Funcionalidad**: Recomendaciones inteligentes de películas
- **Características**: Análisis de géneros, filtrado por contenido, respuestas contextuales
- **Rate Limiting**: Controlado por HF Serverless Inference

## 🗄️ Tablas DynamoDB

| Tabla | Propósito | Clave Primaria | GSI Principal | NUNCA Modificar |
|-------|-----------|----------------|---------------|-----------------|
| `trinity-users-dev` | Usuarios | userId | email-index | Estructura de usuario |
| `trinity-rooms-dev-v2` | Salas de votación | roomId | hostId-index | Lógica de salas |
| `trinity-room-members-dev` | Miembros de salas | roomId, userId | userId-index | Relaciones miembros |
| `trinity-votes-dev` | Votos de usuarios | voteId | roomId-movieId-index | Sistema de votos |
| `trinity-movies-cache-dev` | Cache de películas | movieId | - | Cache TMDB |
| `trinity-room-matches-dev` | Matches de películas | roomId, movieId | - | Algoritmo matches |
| `trinity-room-invites-dev-v2` | Invitaciones | inviteId | roomId-index | Sistema invitaciones |
| `trinity-connections-dev` | Conexiones WebSocket | connectionId | roomId-index | WebSocket connections |
| `trinity-chat-sessions-dev` | **NUEVO** Sesiones chat | sessionId | userId-index | Chat Trini con TTL |

### 🆕 Nueva Tabla: Chat Sessions
- **Propósito**: Persistir conversaciones del chatbot Trini
- **TTL**: 30 días automático
- **Límite**: 10 mensajes por sesión
- **Integración**: Conectada con trinity-trini-dev lambda

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
# AWS Core
AWS_REGION=eu-west-1
COGNITO_USER_POOL_ID=eu-west-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

# APIs Externas
TMDB_API_KEY=tu_api_key_de_tmdb
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxxxxxxxxxxxxxxx

# AppSync
APPSYNC_API_URL=https://xxxxxxxxxx.appsync-api.eu-west-1.amazonaws.com/graphql
APPSYNC_REALTIME_URL=wss://xxxxxxxxxx.appsync-realtime-api.eu-west-1.amazonaws.com/graphql

# Chatbot Trini (ACTIVO en trinity-ai-dev)
HF_API_TOKEN=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
QWEN_MODEL=Qwen/Qwen2.5-1.5B-Instruct

# Chatbot Trini Legacy (trinity-trini-dev - DEPRECATED)
SALAMANDRA_MODEL=BSC-LT/salamandra-2b-instruct
MAX_QUERIES_PER_MINUTE=5
SESSION_TTL_DAYS=30
MAX_SESSION_MESSAGES=10
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
6. **EJECUTAR tests locales** si existen
7. Ejecutar: `node scripts/update-lambda-and-deploy/update-lambda-and-deploy.js`
8. **VERIFICAR logs** y funcionalidad

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

### Para Testing y Property-Based Testing
1. **EJECUTAR tests existentes** antes de cambios
2. **ESCRIBIR tests** para nueva funcionalidad
3. **USAR property-based testing** para lógica compleja
4. **VERIFICAR coverage** de tests críticos
5. **EJECUTAR tests E2E** después de deployment
6. **DOCUMENTAR** casos de test importantes

### Para Debugging y Troubleshooting
1. **VERIFICAR logs** en CloudWatch primero
2. **USAR scripts de verificación** en `scripts/utils/`
3. **REVISAR métricas** de DynamoDB y Lambda
4. **TESTEAR endpoints** individualmente
5. **VERIFICAR configuración** de variables de entorno
6. **CONSULTAR README** para troubleshooting específico

## 🧹 LIMPIEZA POST-CAMBIOS

### SIEMPRE Eliminar Después de Cambios:
- **Archivos .md temporales** (COMPLETE, SUMMARY, STATUS, etc.)
- **Scripts de testing** temporales (test-*.js)
- **Archivos de debug** (debug-*.js)
- **ZIPs temporales** (*.zip en raíz)
- **Logs temporales** (*.log en raíz)
- **Archivos de backup** temporales
- **Cache folders** (.hypothesis/, .pytest_cache/, __pycache__/)
- **Build summaries** (*BUILD*.md, *FIXES*.md, *FINAL*.md)
- **Icon creation scripts** redundantes (mobile/scripts/create-*-icon*.js)

### ✅ Cleanup Completado (Enero 30, 2026):
- **Mobile directory**: Eliminados 4 archivos BUILD*.md y 3 archivos test-*.js
- **Mobile scripts**: Eliminados 8 scripts redundantes de creación de iconos
- **GitIgnore mejorado**: Añadidas reglas para prevenir acumulación futura
- **Python cache**: Añadidas reglas para __pycache__, .pytest_cache, .hypothesis
- **Documentación actualizada**: Guidelines reflejan arquitectura actual
- **🆕 Infrastructure cleanup**: Eliminados 3 scripts de deployment legacy
- **🆕 Database cleanup**: Eliminado script de test temporal
- **🆕 Legacy lambda identificada**: trinity-trini-dev marcada como LEGACY
- **🆕 README actualizado**: Tabla de lambdas con estados ACTIVO/LEGACY
- **🆕 GitIgnore expandido**: Reglas para deployment scripts y test files

### Comando de Limpieza:
```bash
# Eliminar archivos temporales
rm -f *-COMPLETE.md *-SUMMARY.md *-STATUS.md
rm -f test-*.js debug-*.js
rm -f *.zip *.log
rm -f mobile/*BUILD*.md mobile/*SUMMARY*.md mobile/*FIXES*.md
```

## 📋 SPECS Y PROPERTY-BASED TESTING

### Gestión de Specs
- **Ubicación**: `.kiro/specs/[feature-name]/`
- **Archivos requeridos**: `requirements.md`, `design.md`, `tasks.md`
- **Formato**: Usar kebab-case para nombres de features
- **Workflow**: Requirements → Design → Tasks → Implementation

### Property-Based Testing Guidelines
```bash
# Ejecutar property-based tests
cd infrastructure/src/tests
npm test -- --grep "property"

# Tests específicos con Hypothesis (Python)
cd lambdas/trinity-trini-dev
python -m pytest tests/ -v

# Verificar coverage de property tests
npm run test:coverage
```

### Reglas para Property-Based Testing
1. **SIEMPRE escribir** property tests para lógica crítica
2. **USAR generators inteligentes** que limiten el espacio de entrada
3. **DOCUMENTAR properties** con comentarios claros
4. **VALIDAR contra requirements** específicos
5. **EJECUTAR tests** antes y después de cambios
6. **REPORTAR failures** con ejemplos específicos

### Specs Activas
- `trini-chatbot-integration/` - Integración chatbot Trini (ACTIVO)
- Otras specs se crean según necesidades del proyecto

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
- **Modificar modelo Qwen sin testing**
- **Cambiar rate limiting sin considerar costos**
- **Eliminar TTL de chat sessions**

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
- **Ejecutar property-based tests para lógica crítica**
- **Verificar logs después de deployment**
- **Testear chatbot Trini (trinity-ai-dev) con queries reales**
- **Monitorear métricas de DynamoDB**

## 🔍 Debugging y Logs

### Ver Logs de Lambda
```bash
# Logs específicos por función
aws logs tail /aws/lambda/trinity-movie-dev --follow --region eu-west-1
aws logs tail /aws/lambda/trinity-trini-dev --follow --region eu-west-1
aws logs tail /aws/lambda/trinity-ai-dev --follow --region eu-west-1

# Logs con filtros
aws logs filter-log-events --log-group-name /aws/lambda/trinity-movie-dev --filter-pattern "ERROR" --region eu-west-1
```

### Verificar Configuración
```bash
# Verificar configuración AWS completa
node scripts/utils/verify-aws-config/verify-aws-config.js

# Verificar estado de recursos
aws lambda list-functions --region eu-west-1
aws dynamodb list-tables --region eu-west-1
aws appsync list-graphql-apis --region eu-west-1
```

### Analizar DynamoDB
```bash
# Análisis completo de uso
node scripts/utils/analyze-dynamodb-usage/analyze-dynamodb-usage.js

# Verificar tabla específica
aws dynamodb describe-table --table-name trinity-chat-sessions-dev --region eu-west-1
aws dynamodb scan --table-name trinity-users-dev --region eu-west-1 --max-items 5
```

### Troubleshooting Específico Trinity

#### Problemas de AI/Chatbot
```bash
# Verificar modelo Qwen en trinity-ai-dev
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev --filter-pattern "Qwen" --region eu-west-1

# Verificar fallback engine
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev --filter-pattern "fallback" --region eu-west-1
```

#### Problemas de TMDB API
```bash
# Verificar quotas y límites
aws logs filter-log-events --log-group-name /aws/lambda/trinity-movie-dev --filter-pattern "TMDB" --region eu-west-1

# Verificar cache de películas
aws dynamodb scan --table-name trinity-movies-cache-dev --region eu-west-1 --max-items 3
```

#### Problemas de Tiempo Real
```bash
# Verificar conexiones WebSocket
aws dynamodb scan --table-name trinity-connections-dev --region eu-west-1

# Logs de subscripciones
aws logs tail /aws/lambda/trinity-realtime-dev --follow --region eu-west-1
```

## 📊 Monitoreo

### Métricas Clave
- Lambda execution duration y errors (todas las 7 funciones)
- DynamoDB read/write capacity (9 tablas)
- AppSync request count y latency
- Cognito sign-up/sign-in metrics
- **Chatbot Trini**: Rate limiting, model response time
- **Chat Sessions**: TTL cleanup, session count
- **TMDB API**: Quotas, cache hit rate

### Dashboards
- CloudWatch para métricas
- X-Ray para tracing distribuido (habilitado)
- AppSync console para GraphQL performance
- **DynamoDB Insights** para análisis de queries
- **Lambda Insights** para performance detallado

### Alertas Recomendadas
```bash
# Configurar alertas críticas
- Lambda errors > 5% en 5 minutos
- DynamoDB throttling > 0
- TMDB API rate limit alcanzado
- Chatbot Trini errors > 10%
- Chat sessions TTL failures
```

## 🎯 Objetivos del Proyecto

### Funcionalidad Principal
1. **Crear salas** de votación de películas
2. **Invitar usuarios** a salas
3. **Votar películas** en tiempo real
4. **Calcular matches** basados en votos
5. **Notificaciones** en tiempo real
6. **🆕 Chatbot Trini** - Recomendaciones inteligentes con IA
7. **🆕 Chat persistente** - Sesiones con TTL automático

### Características Técnicas
- **Serverless** completamente
- **Tiempo real** con subscripciones
- **Escalable** automáticamente
- **Seguro** con Cognito JWT
- **Optimizado** para móvil
- **🆕 IA integrada** - Qwen2.5-1.5B con OpenAI SDK + Fallback inteligente
- **🆕 Rate limiting** - Control de uso de IA
- **🆕 Property-based testing** - Tests robustos

### Estado de Desarrollo Actual (Enero 2026)
- ✅ **Core functionality** - Salas, votación, matches funcionando
- ✅ **AI Logic fixes** - Reasoning único, scores variables implementados
- ✅ **Chatbot integration** - Trini completamente funcional
- ✅ **Clean architecture** - Proyecto organizado y documentado
- ✅ **Comprehensive testing** - Property-based tests implementados
- 🔄 **Continuous improvement** - Optimizaciones ongoing

---

**RECUERDA**: 
1. **SIEMPRE leer documentación y código existente ANTES de cambios**
2. **MANTENER funcionalidad actual - NUNCA romper lo que funciona**
3. **VERIFICAR integraciones después de cada cambio**
4. **LIMPIAR archivos temporales al finalizar**
5. **CREDENCIALES SOLO en `.env` raíz - organizadas y actualizadas**
6. **TESTEAR chatbot Trini (trinity-ai-dev) con queries reales después de cambios**
7. **MONITOREAR métricas de DynamoDB y Lambda post-deployment**
8. **EJECUTAR property-based tests para lógica crítica**
9. Trinity es un proyecto serverless en eu-west-1 con estructura organizada
10. **Estado actual: Proyecto limpio, IA mejorada, chatbot funcional (Enero 2026)**