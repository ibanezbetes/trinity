---
inclusion: always
---

# Trinity Project - Guía Consolidada del Sistema

## 🎬 Contexto del Proyecto
Trinity es una aplicación móvil React Native para votación de películas en tiempo real con backend serverless en AWS. El sistema permite crear salas de votación donde los usuarios votan sobre contenido pre-cacheado y previamente filtrado hasta encontrar un match.

### Arquitectura Principal
- **Frontend**: React Native + Expo
- **Backend**: AWS Lambda (Node.js 18.x)
- **Base de Datos**: DynamoDB (12 tablas activas)
- **APIs**: GraphQL (AppSync)
- **Autenticación**: AWS Cognito
- **Región**: eu-west-1 (SIEMPRE)

### Estado Actual del Proyecto (Enero 31, 2026)
- ✅ **Proyecto completamente limpio y organizado**
- ✅ **AWS vs Local 100% sincronizado** - 7 Lambdas, 12 tablas DynamoDB, 2 APIs GraphQL
- ✅ **Sistema de cache de películas** - Implementado y operacional
- ✅ **Sistema de votación individual** - Completamente funcional
- ✅ **Documentación completa** - README, steering y comparación AWS actualizados
- ✅ **50+ archivos temporales eliminados** - Repositorio limpio y minimalista
- ✅ **APK de producción** - Builds funcionales disponibles

## 📁 Estructura del Repositorio

```
trinity/
├── 📱 mobile/                    # App React Native + Expo (LIMPIO)
│   ├── app/                      # Pantallas y navegación
│   ├── src/                      # Componentes, servicios, tests
│   └── assets/                   # Recursos e imágenes
│
├── ⚡ lambdas/                   # 7 Funciones Lambda (TODAS ACTIVAS)
│   ├── trinity-auth-dev/         # Autenticación (Node.js)
│   ├── trinity-cache-dev/        # Sistema de cache de películas (Node.js)
│   ├── trinity-matchmaker-dev/   # Matchmaking (Node.js) - desplegada como trinity-vote-consensus-dev
│   ├── trinity-movie-dev/        # Gestión películas TMDB (Node.js)
│   ├── trinity-realtime-dev/     # Tiempo real WebSocket (Node.js)
│   ├── trinity-room-dev/         # Gestión salas (Node.js)
│   └── trinity-vote-dev/         # Sistema votación (Node.js)
│
├── 🗄️ database/                  # Base de datos DynamoDB (12 TABLAS SINCRONIZADAS)
│   ├── schemas/                  # 12 esquemas sincronizados con AWS
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
├── 🛠️ scripts/                   # Scripts utilidad y deployment (ESENCIALES SOLO)
│   ├── deploy-*/                 # Scripts deployment automatizado
│   ├── test-*/                   # Scripts testing E2E
│   └── utils/                    # Utilidades AWS y verificación
│
├── 📋 AWS-LOCAL-COMPARISON.md    # Comparación detallada recursos AWS vs local
├── 📋 TRINITY-PROJECT-STEERING.md # Guía completa del proyecto
└── 📋 README.md                  # Documentación principal actualizada
```

## 🎯 LÓGICA DE NEGOCIO PRINCIPAL

### Sistema de Pre-Caching de Películas (50 Títulos por Sala)

#### Flujo de Creación de Sala
1. **Usuario crea sala** → Selecciona tipo de contenido y géneros
2. **Aplicación de filtros** → Se ejecuta lógica de filtrado específica
3. **Petición única a TMDB** → Se obtienen exactamente 50 títulos
4. **Cache en DynamoDB** → Los 50 títulos se almacenan con orden determinístico
5. **Usuarios leen de cache** → No más llamadas a TMDB API durante la sesión

#### Lógica de Filtrado Específica por orden de prioridad y segmentación

##### 1. Filtros Base Obligatorios (NO OMITIBLES)
- **Solo idiomas occidentales** (inglés, español, francés, alemán, italiano, portugués, etc.)
- **Solo títulos con descripción** (no vacías o null)

##### 2. Selección de Tipo de Media
- Usuario elige **"películas" O "series"** (nunca ambos)
- Esta selección es inmutable una vez creada la sala

##### 3. Lógica de Géneros (Prioridad Específica)
- Usuario puede seleccionar **1 o 2 géneros** de los disponibles
- **PRIORIDAD 1**: Títulos que tengan **AMBOS** géneros seleccionados
- **FALLBACK**: Si no hay suficientes, títulos con **CUALQUIERA** de los 2 géneros en el supuesto de haber elegido 2 géneros
- Títulos **aleatorios** teniendo en cuenta ese filtrado y esas preferencias de estos filtros
- Esta selección es inmutable una vez creada la sala

##### Ejemplo de Implementación:
```
Usuario crea sala:
- Selecciona "películas"
- Selecciona géneros "fantasía" y "comedia"

Resultado:
1. Aplicar filtros de idioma occidental y descripción
2. Buscar películas con géneros "fantasía" Y "comedia"
3. Si no hay 50, rellenar con películas (o series, según aplique) con "fantasía" O "comedia"
4. Aleatorizar y tomar exactamente 50 títulos (NINGUN TÍTULO DUPLICADO)
5. Cachear en DynamoDB con orden determinístico
```

#### Características del Sistema
- **50 títulos exactos** por sala (no 30, no variables)
- **Sin duplicados** dentro de una sala
- **Filtros inmutables** una vez creada la sala
- **Orden determinístico** para todos los usuarios
- **Cache persistente** durante toda la sesión

### Sistema de Votación Individual

#### Flujo de Votación
1. **Usuario entra a sala** → Lee los 50 títulos desde DynamoDB
2. **Votación independiente** → Cada usuario puede votar cada uno de los 50 títulos a su ritmo
3. **Verificación de match** → Antes de cada acción en la aplicación (no solo en la sala) se comprueba si hay match
4. **Registro de voto** → Si no hay match, se registra el voto y continúa

#### Lógica de Match por Capacidad de Sala
- **Sala de 2 personas** = necesita 2 votos "SÍ" al mismo título
- **Sala de 3 personas** = necesita 3 votos "SÍ" al mismo título
- **Sala de 4 personas** = necesita 4 votos "SÍ" al mismo título
- **Y así sucesivamente** según la capacidad máxima de la sala

#### Verificación de Match en Cada Acción
```javascript
// Antes de cualquier acción del usuario:
1. Comprobar si hay match en la sala
2. Si hay match → Mostrar popup con título del match (serie o película en cuestión) y nombre de la sala
3. Si no hay match → Continuar con la acción normal
```

#### Escenarios de Final de Juego

##### Usuario Normal Termina 50 Títulos
- **Mensaje**: "A ver si hay suerte y hacéis un match"
- **Comportamiento**: El usuario puede cerrar la app o esperar

##### Último Usuario Termina Sin Match
- **Condición**: Es el último usuario (si el número máximo de integrantes de la sala es "N"; tienen que haber votado los 50 títulos "N menos 1" usuarios de la sala) que quedaba por votar los 50 títulos
- **Mensaje**: "No os habéis puesto de acuerdo... Hacer otra sala."
- **Comportamiento**: Se notifica a todos los usuarios de la sala

##### Match Encontrado
- **Notificación**: Popup emergente con el título del match (serie o película en cuestión) y nombre de la sala 
- **Alcance**: Todos los usuarios de la sala (incluso si están navegando fuera de la sala)
- **Interacción**: Usuario puede cerrar el popup y continuar

### Control de Capacidad de Sala
- **Inscripción limitada**: No pueden inscribirse más usuarios que la capacidad máxima
- **Ejemplo**: Sala de 2 personas → máximo 2 usuarios inscritos
- **Match requerido**: Necesita votos "SÍ" de TODOS los usuarios de la capacidad máxima, no solo de los que se han inscrito en la sala. Se tiene que cumplir la condición de que: NÚMERO DE USUARIOS QUE HAN VOTADO QUE SÍ A UN MISMO TÍTULO = NÚMERO DE USUARIOS MÁXIMO DE LA SALA

### Gestión de Salas en DynamoDB
- **Una vez hecho el match**: Una vez que cierren el popup del match todos los usuarios a los que se les ha notificado del match, se borra la sala con la que se ha hecho match, para ir liberando espacio en DynamoDB

## 🗄️ ARQUITECTURA DE DATOS

### Tablas DynamoDB Activas (12 tablas)
1. `trinity-users-dev` - Usuarios del sistema
2. `trinity-rooms-dev-v2` - Salas de votación
3. `trinity-room-members-dev` - Miembros de salas
4. `trinity-votes-dev` - Votos de usuarios
5. `trinity-movies-cache-dev` - Cache general de películas
6. `trinity-room-matches-dev` - Matches encontrados
7. `trinity-room-invites-dev-v2` - Invitaciones a salas
8. `trinity-connections-dev` - Conexiones WebSocket
9. `trinity-room-movie-cache-dev` - **Cache específico por sala** (TTL: 7 días)
10. `trinity-room-cache-metadata-dev` - Metadata del cache por sala
11. `trinity-matchmaking-dev` - Datos de matchmaking
12. `trinity-filter-cache` - Cache de filtros de películas

### Flujo de Cache por Sala
```
Creación de Sala:
1. Usuario define filtros → Aplicar lógica de filtrado
2. Petición a TMDB API → Obtener títulos que cumplan criterios
3. Seleccionar 50 títulos → Aplicar prioridades y aleatorización
4. Guardar en trinity-room-movie-cache-dev → Con roomId y orden secuencial
5. Usuarios leen de DynamoDB → Sin más llamadas a TMDB
```

## ⚡ FUNCIONES LAMBDA ACTIVAS (7 funciones)

### Funciones Principales
1. **trinity-auth-dev** - Autenticación de usuarios
2. **trinity-cache-dev** - **Sistema de cache de películas por sala**
3. **trinity-matchmaker-dev** - Detección de matches (desplegada como trinity-vote-consensus-dev)
4. **trinity-movie-dev** - Gestión de películas TMDB
5. **trinity-realtime-dev** - Notificaciones tiempo real
6. **trinity-room-dev** - **Gestión de salas y creación de cache**
7. **trinity-vote-dev** - **Sistema de votación individual**

### Funciones Clave para el Sistema

#### trinity-room-dev
- **Responsabilidad**: Crear salas y generar cache de 50 películas
- **Flujo**: Aplicar filtros → Llamar TMDB → Cachear en DynamoDB
- **Integración**: Con trinity-cache-dev para el almacenamiento

#### trinity-vote-dev
- **Responsabilidad**: Procesar votos individuales
- **Verificación**: Comprobar matches antes de registrar votos
- **Notificación**: Activar eventos de match cuando se detecten

#### trinity-cache-dev
- **Responsabilidad**: Gestionar cache de películas por sala
- **Almacenamiento**: trinity-room-movie-cache-dev con TTL de 7 días
- **Optimización**: Evitar llamadas repetidas a TMDB API

## 🔗 APIs GRAPHQL (2 APIs activas)

### trinity-api-dev (Principal)
- **Autenticación**: AWS Cognito User Pools
- **Funcionalidad**: CRUD operations, room management, voting

### trinity-realtime-api (Subscripciones)
- **Autenticación**: API Key
- **Funcionalidad**: Real-time notifications, match alerts

## 🚨 REGLAS CRÍTICAS DE DESARROLLO

### 📖 ANTES DE CUALQUIER CAMBIO
1. **SIEMPRE leer la documentación completa** en README.md y este steering
2. **REVISAR AWS-LOCAL-COMPARISON.md** para entender recursos desplegados
3. **ANALIZAR dependencias** y conexiones con otros servicios
4. **VERIFICAR configuración existente** antes de hacer cambios

### 🔒 PRESERVACIÓN DE FUNCIONALIDAD
- **SIEMPRE mantener** compatibilidad con código móvil existente
- **PRESERVAR** todas las variables de entorno y configuraciones

### 🛠️ METODOLOGÍA DE CAMBIOS

#### CDK para Todos los Cambios
Hay que configurar CDK para SIEMPRE hacer los cambios en el proyecto en código (de manera organizada, ordenada y de manera esquematizada como lo tenemos) y después desplegar los cambios.

#### Para Modificar Lambdas:
1. **Leer código existente** completamente
2. **Verificar AWS-LOCAL-COMPARISON.md** para confirmar función activa
3. **Identificar todas las funciones** y sus propósitos
4. **Verificar integraciones** con DynamoDB y AppSync
5. **Mantener handlers existentes** y estructura de respuesta
6. **Añadir funcionalidad** sin eliminar la existente
7. **Preservar manejo de errores** y logging
8. **Ejecutar tests** antes y después de cambios

#### Para Modificar DynamoDB:
1. **Revisar esquemas actuales** en `database/schemas/` (12 tablas)
2. **Verificar uso** en todas las lambdas que usan la tabla
3. **Mantener claves primarias** y GSIs existentes
4. **Añadir campos** sin eliminar existentes
5. **Actualizar scripts** de creación si es necesario
6. **Considerar TTL** para nuevas tablas si aplica

## 🛠️ Comandos Principales

### Deployment
```bash
# Deployment completo con CDK (RECOMENDADO)
node scripts/deploy-with-cdk/deploy-with-cdk.js

# Solo lambdas (rápido para desarrollo diario)
node scripts/update-lambda-and-deploy/update-lambda-and-deploy.js

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

# Crear tabla específica
aws dynamodb create-table --cli-input-json file://database/scripts/create-trinity-[TABLE-NAME].json --region eu-west-1
```

### Desarrollo Móvil
```bash
cd mobile
npm install && npm start    # Expo dev server
npm run android             # Android
npm run ios                 # iOS

# Build APK de producción (método tradicional React Native + Gradle)
node build-production-apk.js
```

### Testing y Desarrollo
```bash
# Test end-to-end del backend
node scripts/e2e-backend-test/e2e-backend-test.js

# Test de creación de salas
node scripts/test-create-room/test-create-room.js

# Test de votación
node scripts/test-vote-backend/test-vote-backend.js

# Tests de lambdas individuales
cd lambdas/trinity-movie-dev && npm test
cd mobile && npm test
```

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
Las variables de entorno están definidas en `.env` en la raíz del proyecto. Incluyen:

- **AWS Configuration**: Account, region, credentials
- **AppSync GraphQL**: API URLs y IDs
- **Cognito Authentication**: User pool y client IDs
- **Google OAuth**: Client IDs para autenticación
- **External APIs**: TMDB API key
- **DynamoDB**: Nombres de tablas
- **Lambda Functions**: Nombres de funciones
- **Security**: JWT secrets
- **Feature Flags**: Configuraciones de funcionalidades

### 🔑 GESTIÓN DE CREDENCIALES
- **TODAS las credenciales** deben estar en `.env` en la raíz del proyecto
- **NUNCA** duplicar credenciales en otros archivos
- **SIEMPRE** mantener `.env` organizado, ordenado y actualizado
- **PROHIBIDO** hardcodear credenciales en código
- **OBLIGATORIO** usar variables de entorno desde `.env` únicamente

## 🔄 Workflow de Desarrollo

### Para Cambios en Lambdas
1. **LEER código completo** de la lambda
2. **VERIFICAR en AWS-LOCAL-COMPARISON.md** que la función esté activa
3. **IDENTIFICAR todas las funciones** y dependencias
4. **VERIFICAR integraciones** con DynamoDB y AppSync
5. Editar código en `lambdas/[function-name]/`
6. **MANTENER estructura** de respuesta existente
7. **EJECUTAR tests locales** si existen
8. Ejecutar: `node scripts/update-lambda-and-deploy/update-lambda-and-deploy.js`
9. **VERIFICAR logs** y funcionalidad

### Para Cambios en Base de Datos
1. **ANALIZAR esquemas actuales** en `database/schemas/` (12 esquemas)
2. **VERIFICAR uso** en todas las lambdas
3. Actualizar esquemas en `database/schemas/`
4. Regenerar scripts: `node database/scripts/create-tables-from-schemas.js`
5. **BACKUP antes** de aplicar cambios
6. Aplicar cambios: `node database/scripts/create-all-tables.js`

## 🔍 Debugging y Logs

### Ver Logs de Lambda
```bash
# Logs específicos por función (7 funciones activas)
aws logs tail /aws/lambda/trinity-movie-dev --follow --region eu-west-1
aws logs tail /aws/lambda/trinity-cache-dev --follow --region eu-west-1
aws logs tail /aws/lambda/trinity-vote-dev --follow --region eu-west-1

# Logs con filtros
aws logs filter-log-events --log-group-name /aws/lambda/trinity-movie-dev --filter-pattern "ERROR" --region eu-west-1
```

### Verificar Configuración
```bash
# Verificar configuración AWS completa
node scripts/utils/verify-aws-config/verify-aws-config.js

# Verificar estado de recursos (7 lambdas, 12 tablas, 2 APIs)
aws lambda list-functions --region eu-west-1
aws dynamodb list-tables --region eu-west-1
aws appsync list-graphql-apis --region eu-west-1
```

### Analizar DynamoDB (12 Tablas)
```bash
# Análisis completo de uso
node scripts/utils/analyze-dynamodb-usage/analyze-dynamodb-usage.js

# Verificar tabla específica
aws dynamodb describe-table --table-name trinity-room-movie-cache-dev --region eu-west-1
aws dynamodb scan --table-name trinity-users-dev --region eu-west-1 --max-items 5
```

## 🚨 Reglas Importantes

### NUNCA hacer:
- Cambiar región de eu-west-1
- Eliminar tablas en producción sin backup
- Hardcodear credenciales en código
- **Eliminar funcionalidades existentes sin confirmación**
- **Romper integraciones entre servicios**
- **Modificar handlers principales sin revisar**
- **Cambiar estructura de respuestas GraphQL**
- **Poner credenciales en archivos que no sean `.env` raíz**
- **Duplicar variables de entorno en múltiples archivos**

### SIEMPRE hacer:
- **Leer documentación completa antes de cambios**
- **Revisar AWS-LOCAL-COMPARISON.md para verificar recursos**
- **Revisar código existente completamente**
- **Mantener funcionalidad actual**
- **Verificar integraciones después de cambios**
- Usar scripts de deployment automatizados
- Verificar cambios con `cdk diff` antes de deploy
- Mantener documentación actualizada
- **Limpiar archivos temporales después de cambios**
- **Mantener todas las credenciales en `.env` raíz únicamente**
- **Ejecutar property-based tests para lógica crítica**
- **Verificar logs después de deployment**

## 🎯 Objetivos del Proyecto

### Funcionalidad Principal
1. **Crear salas** de votación de películas con filtros específicos
2. **Sistema de pre-caching** - 50 películas por sala con lógica de géneros
3. **Invitar usuarios** a salas con límites de capacidad
4. **Votar películas** independientemente a través de cache
5. **Calcular matches** basados en capacidad de sala
6. **Notificaciones** en tiempo real con AppSync subscriptions

### Características Técnicas
- **Serverless** completamente
- **Tiempo real** con subscripciones
- **Escalable** automáticamente
- **Seguro** con Cognito JWT
- **Optimizado** para móvil
- **Cache inteligente** - Sistema de pre-caching de películas por sala
- **Property-based testing** - Tests robustos

### Estado de Desarrollo Actual (Enero 31, 2026)
- ✅ **Core functionality** - Salas, votación, matches funcionando
- ✅ **Movie pre-caching system** - Sistema de cache implementado y operacional
- ✅ **Individual voting system** - Votación independiente por usuario
- ✅ **Clean architecture** - Proyecto completamente limpio y organizado
- ✅ **AWS synchronization** - 100% sincronizado con deployment
- ✅ **Comprehensive documentation** - Documentación completa y actualizada
- ✅ **Production ready** - APKs de producción disponibles

---

**RECUERDA**: 
1. **SIEMPRE leer documentación completa ANTES de cambios**
2. **VERIFICAR AWS-LOCAL-COMPARISON.md para confirmar recursos activos**
3. **MANTENER funcionalidad actual - NUNCA romper lo que funciona**
4. **VERIFICAR integraciones después de cada cambio**
5. **LIMPIAR archivos temporales al finalizar**
6. **CREDENCIALES SOLO en `.env` raíz - organizadas y actualizadas**
7. **TESTEAR sistema de cache de películas con filtros reales**
8. **MONITOREAR métricas de DynamoDB y Lambda post-deployment**
9. **EJECUTAR property-based tests para lógica crítica**
10. Trinity es un proyecto serverless en eu-west-1 con estructura completamente limpia
11. **Estado actual: Proyecto limpio, sincronizado, cache implementado (Enero 31, 2026)**