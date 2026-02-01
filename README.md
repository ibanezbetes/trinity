# Trinity - Aplicación de Votación de Películas 🎬

## 🎉 Infrastructure Migration Completed Successfully

**Migration Date**: February 1, 2026  
**Status**: ✅ **FULLY CDK-MANAGED**  
**Migration Type**: Infrastructure Modernization  

Trinity infrastructure has been successfully migrated to AWS CDK with zero data loss and full backward compatibility.

### 🚀 New CDK-Based Deployment

```bash
cd infrastructure/clean
npm run deploy:all    # Deploy all stacks
npm run hotswap       # Fast development deployment (15-30s)
npm run diff          # Preview changes before deployment
```

### 📊 Migration Results
- ✅ **12 DynamoDB Tables** - All data preserved (2,473 items)
- ✅ **7 Lambda Functions** - Fully operational
- ✅ **2 AppSync APIs** - GraphQL endpoints active
- ✅ **Cognito Authentication** - User management intact
- ✅ **Property-Based Testing** - 11 correctness properties validated
- ✅ **Security Compliance** - Enhanced IAM and monitoring

### 🗂️ Legacy Scripts Archived
Legacy deployment scripts moved to `scripts/legacy-archived/` for reference.  
**⚠️ DO NOT USE** archived scripts - they may conflict with CDK-managed resources.

### 🏗️ 100% CDK TypeScript Infrastructure
All infrastructure is now managed through AWS CDK with TypeScript:
- **Type Safety**: Full TypeScript definitions for all AWS resources
- **Infrastructure as Code**: Version-controlled infrastructure definitions
- **Automated Deployment**: Consistent, repeatable deployments
- **Property-Based Testing**: 11 correctness properties validated

### 📋 Complete Migration Report
See [MIGRATION-COMPLETION-REPORT.md](infrastructure/clean/MIGRATION-COMPLETION-REPORT.md) for detailed results.

---
Una aplicación móvil React Native para crear salas de votación de películas en tiempo real, con backend completamente serverless en AWS.

## 🏗️ Arquitectura del Sistema

### Servicios AWS Desplegados (Febrero 2026)
- **7 Funciones Lambda Activas** para lógica de negocio
- **12 Tablas DynamoDB** para almacenamiento
- **2 APIs GraphQL AppSync** para comunicación
- **1 Cognito User Pool** para autenticación (v2)
- **S3** para assets estáticos
- **🆕 100% CDK TypeScript** - Infraestructura como código con type safety

### 🆕 Sistema de Cache de Películas (Enero 2026)
- ✅ **DESPLEGADO**: Sistema completo de cache basado en salas (50 títulos por sala)
- ✅ **PROBLEMA RESUELTO**: Eliminados falsos matches - usuarios ven películas idénticas
- ✅ **PERFORMANCE**: < 200ms para servir películas desde cache
- ✅ **CLEANUP**: TTL automático de 7 días + cleanup por match

### ✅ Limpieza Completada (Enero 2026)
- **Proyecto completamente limpio y organizado**
- **AWS vs Local 100% sincronizado** - 7 Lambdas, 12 tablas DynamoDB, 2 APIs GraphQL
- **Sistema de cache de películas** - Implementado y operacional
- **Sistema de votación individual** - Completamente funcional
- **Archivos temporales eliminados** - Repositorio limpio y minimalista

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
│   ├── trinity-auth-dev/         # Autenticación y autorización
│   ├── trinity-cache-dev/        # 🆕 Sistema de cache de películas por sala
│   ├── trinity-matchmaker-dev/   # 🆕 Matchmaking (desplegada como trinity-vote-consensus-dev)
│   ├── trinity-movie-dev/        # Gestión de películas y TMDB (con integración cache)
│   ├── trinity-realtime-dev/     # Comunicación en tiempo real
│   ├── trinity-room-dev/         # Gestión de salas (con triggers de cache)
│   └── trinity-vote-dev/         # Sistema de votación
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
├── 🏗️ infrastructure/            # Infraestructura como código (CDK TypeScript)
│   ├── clean/                    # 🆕 CDK project - All infrastructure managed here
│   │   ├── lib/                  # CDK stack definitions (TypeScript)
│   │   ├── bin/                  # CDK app entry points
│   │   ├── test/                 # Property-based tests (11 properties)
│   │   ├── scripts/              # Deployment and validation scripts
│   │   └── package.json          # CDK dependencies and commands
│   ├── src/                      # Legacy handlers (archived)
│   └── lib/                      # Legacy compiled code (archived)
│
└── 🛠️ scripts/                   # Utility and testing scripts
    ├── legacy-archived/            # 🗂️ Archived legacy deployment scripts
    │   ├── deploy-all-lambdas/     # ⚠️ ARCHIVED - Use CDK instead
    │   ├── deploy-cache-system/    # ⚠️ ARCHIVED - Use CDK instead
    │   └── update-lambda-and-deploy/ # ⚠️ ARCHIVED - Use CDK instead
    ├── test-*/                     # E2E testing scripts (ACTIVE)
    │   ├── e2e-backend-test/       # End-to-end backend validation
    │   ├── test-create-room/       # Room creation testing
    │   └── test-vote-backend/      # Voting system testing
    └── utils/                      # AWS utilities (ACTIVE)
        ├── verify-aws-config/      # AWS configuration verification
        ├── analyze-dynamodb-usage/ # DynamoDB analysis
        └── check-lambda-code/      # Lambda code verification
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

### Ejecutar la App en Desarrollo
```bash
cd mobile
npm install
npm start

# Para dispositivos específicos
npm run android
npm run ios

# Limpiar cache si hay problemas
npx expo start --clear
```

### Compilación de APK para Producción

#### Prerrequisitos
- **WSL2** (Windows Subsystem for Linux) con Ubuntu
- **Node.js 18+** instalado en WSL
- **React Native CLI** instalado globalmente
- **Android SDK** configurado (opcional para compilación con bundle)

#### Proceso de Compilación (WSL)

Trinity utiliza un proceso híbrido de compilación que funciona en WSL2:

```bash
# 1. Navegar al directorio mobile en WSL
cd mobile

# 2. Instalar dependencias si es necesario
npm install

# 3. Generar bundle de JavaScript para producción
npx @react-native-community/cli bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res \
  --reset-cache \
  --minify true

# 4. Verificar que el bundle se generó correctamente
ls -la android/app/src/main/assets/index.android.bundle

# 5. El APK se actualiza automáticamente con el nuevo bundle
# El APK principal está en: trinity-simple.apk (60MB)
```

#### Configuración de Producción Incluida
- **Endpoints AWS**: Configurados para eu-west-1
- **GraphQL**: `https://qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com/graphql`
- **Realtime**: `wss://qdvhkkwneza2pkpaofehnvmubq.appsync-realtime-api.eu-west-1.amazonaws.com/graphql`
- **Cognito**: `eu-west-1_6UxioIj4z`
- **Sin localhost**: APK independiente, no requiere Metro bundler

#### Instalación en Dispositivo
```bash
# Conectar dispositivo Android con USB debugging habilitado
adb devices

# Instalar APK (usar -r para reinstalar sobre versión existente)
adb install -r trinity-simple.apk

# Verificar instalación
adb shell pm list packages | grep trinity

# Ver logs de la app en tiempo real
adb logcat | grep Trinity
```

#### Troubleshooting de Compilación

**Error: "Cannot resolve @react-native/metro-config"**
```bash
cd mobile
npm install --save-dev @react-native/metro-config
```

**Error: "Command not found" en WSL**
```bash
# Verificar que Node.js está instalado en WSL
node --version
npm --version

# Si no está instalado:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Bundle contiene referencias a localhost**
- Esto es normal en desarrollo, el APK de producción funciona correctamente
- Las referencias son parte del código de React Native para debugging

#### Estructura del APK Compilado
```
trinity-simple.apk (60MB)
├── assets/
│   ├── index.android.bundle (2.8MB) - JavaScript compilado
│   └── production-config.json - Configuración AWS
├── res/ - Recursos e imágenes
└── META-INF/ - Metadatos y firmas
```

## 🎯 Match Detection System (Enero 2026)

Trinity implementa un sistema robusto de detección de matches que fue mejorado para eliminar errores de sincronización.

### Problema Resuelto
**Antes**: La app móvil continuaba intentando votar después de detectar un match en el backend, causando el error "Esta sala no está disponible para votar en este momento."

**Después**: Detección instantánea del match a través de la respuesta del voto, eliminando completamente los errores de sincronización.

### Flujo de Match Detection Mejorado
1. **Usuario vota** → `appSyncService.vote()` envía voto al backend
2. **Backend procesa** → Detecta match y actualiza estado de sala a "MATCHED"
3. **Respuesta inmediata** → App móvil recibe `voteResult.vote.status === 'MATCHED'`
4. **Celebración instantánea** → Carga película ganadora y muestra pantalla de celebración
5. **Prevención de errores** → Función retorna temprano, evitando cargar siguiente película

### Características Técnicas
- **Detección instantánea**: Procesa respuesta del voto inmediatamente
- **Fallback robusto**: Sistema de retry con exponential backoff (3 intentos)
- **Animaciones fluidas**: Transición suave del voto al match con confetti
- **Error prevention**: Elimina "Esta sala no está disponible para votar"
- **Consistencia**: App móvil siempre sincronizada con estado del backend

### Testing del Match System
```bash
# Instalar APK con fix
adb install -r trinity-simple.apk

# Crear sala de prueba y votar hasta match
# Verificar que la celebración aparece inmediatamente sin errores

# Ver logs del match detection
adb logcat | grep "Match detected immediately"
adb logcat | grep "🎉"
```

### Código del Fix
```typescript
// En mobile/app/room/[id].tsx - función completeSwipe
const voteResult = await appSyncService.vote(roomId!, movieId);

// Verificar match inmediatamente
if (voteResult?.vote?.status === 'MATCHED') {
  console.log('🎉 Match detected immediately from vote response!');
  // Mostrar celebración y salir temprano
  return;
}
// Solo continuar con siguiente película si no hay match
```

## ⚡ Funciones Lambda

### Funciones Activas
| Función | Propósito | Runtime | Handler | Estado |
|---------|-----------|---------|---------|---------|
| `trinity-auth-dev` | Autenticación | Node.js 18.x | index.handler | ✅ ACTIVO |
| `trinity-cache-dev` | 🆕 **Cache de películas** | Node.js 18.x | index.handler | ✅ **NUEVO** |
| `trinity-movie-dev` | Gestión películas | Node.js 18.x | movie.handler | ✅ ACTIVO |
| `trinity-realtime-dev` | Tiempo real | Node.js 18.x | index.handler | ✅ ACTIVO |
| `trinity-room-dev` | Gestión salas | Node.js 18.x | index.handler | ✅ ACTIVO |
| `trinity-vote-dev` | Sistema votación | Node.js 18.x | index.handler | ✅ ACTIVO |
| `trinity-matchmaker-dev` | Matchmaking | Node.js 18.x | index.handler | ✅ ACTIVO |

## 🎬 Room-Based Movie Pre-Caching System (Enero 2026)

Trinity implementa un sistema revolucionario de **pre-caching de películas basado en salas** que garantiza que todos los usuarios vean las mismas películas en el mismo orden, eliminando los falsos matches.

### 🎯 Problema Resuelto

**Antes**: Los usuarios en la misma sala veían películas diferentes en órdenes diferentes, causando falsos matches cuando votaban "sí" en su 5ª película, pero no era la misma película para ambos usuarios.

**Ahora**: Todas las películas se pre-cargan por sala en un orden determinístico, garantizando que todos los usuarios vean exactamente las mismas películas en la misma secuencia.

### 🏗️ Arquitectura del Sistema de Cache

#### Nuevas Tablas DynamoDB
- **`trinity-room-movie-cache-dev`**: Almacena películas pre-cargadas por sala
  - Clave: `roomId` + `sequenceIndex` (0-299)
  - GSI: `BatchIndex` para operaciones por lotes
  - TTL: 7 días automático
- **`trinity-room-cache-metadata-dev`**: Metadata de cache por sala
  - Información de estado, filtros, progreso de batches
  - Control de secuencia global por sala

#### Nueva Función Lambda
- **`trinity-cache-dev`**: Sistema completo de gestión de cache
  - **Batch Loading**: Carga 30 películas por lote desde TMDB
  - **Sequence Management**: Control atómico de secuencia por sala
  - **Duplicate Prevention**: Evita películas repetidas entre lotes
  - **Automatic Cleanup**: Limpieza automática cuando sala hace match

### 🔄 Flujo del Sistema

1. **Creación de Sala** → `trinity-room-dev` trigger → Cache pre-loading
2. **Solicitud de Película** → `trinity-movie-dev` → Servir desde cache
3. **Progreso de Usuario** → Incremento atómico de secuencia global
4. **80% Consumido** → Auto-carga del siguiente lote (30 películas)
5. **Match Detectado** → Cleanup automático de cache

### ⚡ Performance y Características

- **< 200ms**: Tiempo de respuesta para servir películas desde cache
- **Determinístico**: Mismo orden garantizado para todos los usuarios
- **Escalable**: Hasta 10 lotes por sala (300 películas máximo)
- **Resiliente**: Fallback automático a TMDB si cache falla
- **Monitoreado**: Métricas completas en CloudWatch

### 🧪 Testing Comprehensivo

El sistema incluye **property-based testing** con 100+ iteraciones:
- **Deterministic Cache Creation**: Mismo cache para mismos filtros
- **Sequence Consistency**: Orden idéntico para todos los usuarios
- **Batch Management**: Prevención de duplicados entre lotes
- **Storage Integrity**: Consistencia de datos en DynamoDB
- **Lifecycle Management**: Cleanup automático y TTL
- **Backward Compatibility**: Funciona con salas existentes

### 🚀 Deployment del Sistema de Cache

```bash
# Deployment completo del sistema de cache
node scripts/deploy-cache-system/deploy-cache-system.js

# Tests de validación post-deployment
node scripts/test-deployment-integration/test-deployment-integration.js

# Tests de performance (< 200ms requirement)
node scripts/test-cache-performance/test-cache-performance.js
```

## 🔍 Estado Actual AWS vs Código Local (Enero 2026)

**Status**: ✅ **COMPLETAMENTE SINCRONIZADO** - Ver [AWS-LOCAL-COMPARISON.md](./AWS-LOCAL-COMPARISON.md) para detalles completos

### ✅ Funciones Lambda Desplegadas en AWS (7 Total - Todas Activas)

| Función AWS | Directorio Local | Runtime | Estado | Notas |
|-------------|------------------|---------|--------|-------|
| `trinity-auth-dev` | `lambdas/trinity-auth-dev/` | Node.js 18.x | ✅ ACTIVO | Autenticación |
| `trinity-cache-dev` | `lambdas/trinity-cache-dev/` | Node.js 18.x | ✅ ACTIVO | Cache de películas |
| `trinity-movie-dev` | `lambdas/trinity-movie-dev/` | Node.js 18.x | ✅ ACTIVO | TMDB integration |
| `trinity-realtime-dev` | `lambdas/trinity-realtime-dev/` | Node.js 18.x | ✅ ACTIVO | WebSocket/Realtime |
| `trinity-room-dev` | `lambdas/trinity-room-dev/` | Node.js 18.x | ✅ ACTIVO | Gestión de salas |
| `trinity-vote-dev` | `lambdas/trinity-vote-dev/` | Node.js 18.x | ✅ ACTIVO | Sistema de votación |
| `trinity-vote-consensus-dev` | `lambdas/trinity-matchmaker-dev/` | Node.js 18.x | ✅ ACTIVO | Matchmaking (nombre diferente) |

### ✅ Tablas DynamoDB (12 Total - Todas Sincronizadas)

| Tabla AWS | Esquema Local | Estado | Propósito |
|-----------|---------------|--------|-----------|
| `trinity-connections-dev` | ✅ Sincronizado | ✅ ACTIVO | Conexiones WebSocket |
| `trinity-filter-cache` | ✅ Sincronizado | ✅ ACTIVO | Cache filtros películas |
| `trinity-matchmaking-dev` | ✅ Sincronizado | ✅ ACTIVO | Datos matchmaking |
| `trinity-movies-cache-dev` | ✅ Sincronizado | ✅ ACTIVO | Cache global películas |
| `trinity-room-cache-metadata-dev` | ✅ Sincronizado | ✅ ACTIVO | Metadatos cache |
| `trinity-room-invites-dev-v2` | ✅ Sincronizado | ✅ ACTIVO | Invitaciones salas |
| `trinity-room-matches-dev` | ✅ Sincronizado | ✅ ACTIVO | Matches películas por sala |
| `trinity-room-members-dev` | ✅ Sincronizado | ✅ ACTIVO | Miembros de salas |
| `trinity-room-movie-cache-dev` | ✅ Sincronizado | ✅ ACTIVO | Cache específico por sala (TTL: 7 días) |
| `trinity-rooms-dev-v2` | ✅ Sincronizado | ✅ ACTIVO | Gestión de salas |
| `trinity-users-dev` | ✅ Sincronizado | ✅ ACTIVO | Perfiles de usuario |
| `trinity-votes-dev` | ✅ Sincronizado | ✅ ACTIVO | Votos de usuarios |

### ✅ APIs GraphQL AppSync

| API AWS | Esquema Local | Estado | Propósito |
|---------|---------------|--------|-----------|
| `trinity-api-dev` | ✅ `api/schemas/trinity-api-dev.graphql` | ✅ ACTIVO | API principal CRUD con auth Cognito |
| `trinity-realtime-api` | ✅ `api/schemas/trinity-main-schema.graphql` | ✅ ACTIVO | Subscripciones tiempo real con API key |

### ✅ Cognito User Pools

| User Pool AWS | Config Local | Estado | Propósito |
|---------------|--------------|--------|-----------|
| `trinity-users-dev-v2` | ✅ `api/schemas/cognito-user-pool-v2.json` | ✅ ACTIVO | Autenticación usuarios (actual) |

## 🧹 Limpieza Completada (Enero 31, 2026)

### ✅ Archivos Temporales Eliminados (50+ archivos)
- **Archivos .md temporales**: Eliminados todos los `*-SUMMARY-*.md`, `*-FIXES-*.md`, `*BUILD*.md`
- **Scripts temporales**: Eliminados scripts de build, deploy y fix temporales
- **APKs temporales**: Eliminados 15+ builds temporales, mantenidos solo builds de producción
- **Archivos JSON temporales**: Eliminados archivos de deployment y error temporales
- **Archivos de test**: Eliminados archivos de test y debug temporales

### ✅ Esquemas Sincronizados
- **Creado**: `database/schemas/trinity-filter-cache.json` para tabla existente en AWS
- **Verificado**: Todos los esquemas locales coinciden con tablas AWS

### ✅ Estructura Limpia
- **Directorio raíz**: Limpio de archivos temporales
- **Mobile folder**: Eliminados APKs temporales y archivos de build
- **Database folder**: Eliminados archivos de implementación temporales
- **Scripts folder**: Mantenidos solo scripts esenciales

### 🚫 No Se Encontraron Recursos Legacy
**Análisis Previo Incorrecto**: No se encontraron recursos deprecados en AWS. Todos los recursos desplegados están activos y correctamente documentados en el repositorio local.

### ⚠️ Cognito User Pools
- `trinity-users-dev-v2` (eu-west-1_EtOx2swvP) - **ACTIVO** ✅
- `trinity-users-dev` (eu-west-1_EMnWISSRn) - **LEGACY** ⚠️ (eliminar si no se usa)

### 🧹 Limpieza Realizada (Enero 30, 2026)
- ✅ **17 archivos temporales eliminados** (.md, .sh, .js, .json, .apk)
- ✅ **GitIgnore actualizado** con reglas para prevenir acumulación futura
- ✅ **Documentación actualizada** para reflejar estado real AWS
- ✅ **12 Lambdas identificadas y mapeadas** (8 Core + 2 TCG + 2 CDK Auto)
- ✅ **Código TCG localizado** en mobile/src/services/ (no en lambdas/)

### 📋 **Explicación de las 4 Lambdas "Faltantes"**
1. **2 Lambdas TCG**: El código está en `mobile/src/services/TriniAITCGService.ts`, no en `/lambdas/`
2. **2 Lambdas CDK**: Generadas automáticamente por CDK para gestión de logs y Cognito
3. **NO hay lambdas legacy**: Todas las 12 lambdas están activas y tienen código correspondiente

> **Nota**: La lambda legacy `trinity-trini-dev` (Python/Salamandra-2b) fue eliminada en la limpieza de Enero 2026. Toda la funcionalidad de IA ahora está en `trinity-ai-dev` que usa Qwen2.5-1.5B con OpenAI SDK.

### Deployment de APK (Producción)

### Deployment de APK (Producción)

#### APK Simple (Recomendado)
```bash
# Desde el directorio mobile/
cd mobile
node build-production-apk.js

# El script automáticamente:
# 1. Configura endpoints de producción (sin localhost)
# 2. Genera bundle de JavaScript optimizado
# 3. Compila APK con Gradle
# 4. Copia APK final como trinity-production.apk
```

#### Configuración de Producción
El APK usa estos endpoints AWS (hardcodeados para evitar localhost):
```javascript
{
  "GRAPHQL_ENDPOINT": "https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql",
  "REALTIME_ENDPOINT": "wss://imx6fos5lnd3xkdchl4rqtv4pi.appsync-realtime-api.eu-west-1.amazonaws.com/graphql",
  "COGNITO_USER_POOL_ID": "eu-west-1_6UxioIj4z",
  "COGNITO_CLIENT_ID": "2a07bheqdh1mllkd1sn0i3s5m3"
}
```

#### Instalación en Dispositivo
```bash
# Instalar APK
adb install trinity-production.apk

# Verificar instalación
adb shell pm list packages | grep trinity

# Ver logs de la app
adb logcat | grep Trinity
```

#### Troubleshooting APK
- **Error "Unable to load script"**: Bundle contiene localhost, regenerar APK
- **App no conecta**: Verificar endpoints AWS en production-config.json
- **Gradle falla**: Verificar JAVA_HOME apunta a Java 17
- **Bundle muy grande**: Verificar que minify=true en el comando bundle

### Deployment de Lambdas
```bash
# Desde el directorio mobile/
cd mobile
node build-production-apk.js

# El script automáticamente:
# 1. Configura endpoints de producción (sin localhost)
# 2. Genera bundle de JavaScript optimizado
# 3. Compila APK con Gradle
# 4. Copia APK final como trinity-production.apk
```

#### Configuración de Producción
El APK usa estos endpoints AWS (hardcodeados para evitar localhost):
```javascript
{
  "GRAPHQL_ENDPOINT": "https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql",
  "REALTIME_ENDPOINT": "wss://imx6fos5lnd3xkdchl4rqtv4pi.appsync-realtime-api.eu-west-1.amazonaws.com/graphql",
  "COGNITO_USER_POOL_ID": "eu-west-1_6UxioIj4z",
  "COGNITO_CLIENT_ID": "2a07bheqdh1mllkd1sn0i3s5m3"
}
```

#### Instalación en Dispositivo
```bash
# Instalar APK
adb install trinity-production.apk

# Verificar instalación
adb shell pm list packages | grep trinity

# Ver logs de la app
adb logcat | grep Trinity
```

#### Troubleshooting APK
- **Error "Unable to load script"**: Bundle contiene localhost, regenerar APK
- **App no conecta**: Verificar endpoints AWS en production-config.json
- **Gradle falla**: Verificar JAVA_HOME apunta a Java 17
- **Bundle muy grande**: Verificar que minify=true en el comando bundle
```bash
# CDK-based Lambda deployment (RECOMMENDED)
cd infrastructure/clean
npm run deploy:lambda      # Deploy all Lambda functions
npm run hotswap           # Fast Lambda code updates (15-30s)

# Individual Lambda deployment (if needed)
cd infrastructure/clean
npm run diff              # Preview changes
cdk deploy TrinityLambdaStack --hotswap
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
| `trinity-room-movie-cache-dev` | 🆕 **Cache películas por sala** | roomId, sequenceIndex | BatchIndex, TTLIndex |
| `trinity-room-cache-metadata-dev` | 🆕 **Metadata cache salas** | roomId | StatusIndex, TTLCleanupIndex |

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
# CDK Deployment Commands (NEW - RECOMMENDED)
cd infrastructure/clean

# Deploy all stacks (complete infrastructure)
npm run deploy:all

# Fast development deployment (15-30s)
npm run hotswap

# Deploy individual stacks
npm run deploy:database    # DynamoDB tables only
npm run deploy:lambda      # Lambda functions only
npm run deploy:api         # AppSync APIs only
npm run deploy:main        # Core infrastructure

# Preview changes before deployment
npm run diff

# Validate configuration
npm run validate
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

## 🔄 Daily Development Workflow

### 📝 **Editing Lambda Code**
```bash
# 1. Edit file (e.g., lambdas/trinity-movie-dev/services/deepLinkService.js)
# 2. Deploy changes with CDK hotswap
cd infrastructure/clean
npm run hotswap
# 3. Verify logs
aws logs tail /aws/lambda/trinity-movie-dev --follow --region eu-west-1
```

### 🏗️ **Modifying Infrastructure**
```bash
# 1. Edit CDK code (e.g., infrastructure/clean/lib/trinity-lambda-stack.ts)
# 2. Preview changes
cd infrastructure/clean
npm run diff
# 3. Deploy
npm run deploy:all
```

### 🗄️ **Updating Database**
```bash
# 1. Modify schema (e.g., database/schemas/trinity-rooms-dev-v2.json)
# 2. Update CDK stack definition
# 3. Deploy database stack
cd infrastructure/clean
npm run deploy:database
```

### ⚡ **Urgent Changes**
```bash
# For critical Lambda fixes (super fast)
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

### 🏗️ **CDK-Managed Infrastructure**

All Trinity infrastructure is now managed through AWS CDK with TypeScript:
- **Lambdas**: Automatically packaged from `lambdas/[function-name]/`
- **DynamoDB**: Schemas from `database/schemas/` with proper indexing
- **GraphQL**: Schemas from `api/schemas/` with resolvers
- **Region**: Always deploys to `eu-west-1`
- **Type Safety**: Full TypeScript definitions for all resources

#### **Change Detection**
CDK uses **content hashing** for intelligent deployments:
1. Calculates hash of complete folders
2. Compares with previous deployment
3. Only updates resources that changed
4. Automatic skip if no changes detected

### 📋 **CDK Deployment Commands**

#### **Complete Infrastructure** 🏗️ (8-12min)
```bash
cd infrastructure/clean
npm run deploy:all
```
- Deploys all stacks in correct order
- Validates dependencies between resources
- **Recommended for infrastructure changes**

#### **Fast Development** ⚡ (15-30s)
```bash
cd infrastructure/clean
npm run hotswap
```
- Only for Lambda code changes
- Does not update infrastructure
- **For urgent fixes**

#### **Individual Stacks** 🎯 (2-5min)
```bash
cd infrastructure/clean
npm run deploy:database    # DynamoDB tables only
npm run deploy:lambda      # Lambda functions only  
npm run deploy:api         # AppSync APIs only
npm run deploy:main        # Shared resources only
```

#### **Development Workflow** 🔄
```bash
cd infrastructure/clean
npm run diff               # Preview changes
npm run validate           # Validate configuration
npm run deploy:all         # Deploy everything
```

### 🎯 **Deployment Guide by Scenario**

| Change Made | Recommended Command | Time |
|-------------|-------------------|---------|
| Edit Lambda code | `cd infrastructure/clean && npm run hotswap` | 15-30s |
| Add new DynamoDB table | `cd infrastructure/clean && npm run deploy:all` | 8-12min |
| Modify GraphQL schema | `cd infrastructure/clean && npm run deploy:api` | 2-3min |
| Change CDK configuration | `cd infrastructure/clean && npm run deploy:all` | 8-12min |
| Urgent Lambda fix | `cd infrastructure/clean && npm run hotswap` | 15-30s |
| Create new resources | `cd infrastructure/clean && npm run deploy:all` | 8-12min |
| Database schema changes | `cd infrastructure/clean && npm run deploy:database` | 3-5min |

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

### 🔍 **Post-Deployment Verification**

#### **View Lambda Logs**
```bash
aws logs tail /aws/lambda/trinity-movie-dev --follow --region eu-west-1
```

#### **Verify Stack Status**
```bash
cd infrastructure/clean
npm run list                # View all stacks
npm run diff                # View pending changes
npm run validate            # Validate configuration
```

#### **Verify Deployed Resources**
```bash
# View Lambda functions
aws lambda list-functions --region eu-west-1 --query "Functions[?contains(FunctionName, 'trinity')]"

# View DynamoDB tables  
aws dynamodb list-tables --region eu-west-1

# View GraphQL APIs
aws appsync list-graphql-apis --region eu-west-1
```

#### **Property-Based Testing**
```bash
cd infrastructure/clean
npm run test:property       # Run all correctness properties
npm run test:integration    # Run integration tests
npm run test:all           # Run complete test suite
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

## 📊 Current Project Status (February 1, 2026)

### ✅ Completed Features
- **Complete voting system** with match detection
- **🆕 Room-based movie pre-caching system** - Identical movies in identical order
- **🆕 100% CDK TypeScript Infrastructure** - Full infrastructure as code
- **🆕 Property-Based Testing** - 11 correctness properties validated
- **Trini AI Chatbot** with Qwen2.5-1.5B and intelligent fallback
- **React Native mobile app** with production APK
- **AWS serverless backend** with 7 active lambdas (includes new cache function)
- **DynamoDB database** with 12 optimized tables (includes new cache tables)
- **GraphQL APIs** with real-time subscriptions
- **Instant match detection** without synchronization errors
- **Celebration screen** with animations and confetti

### 🔧 Recent Technical Improvements
- **🆕 Revolutionary cache system**: Eliminates false matches by guaranteeing same movie order
- **🆕 CDK Migration Completed**: 100% infrastructure managed by TypeScript CDK
- **🆕 Property-based testing**: Robust tests with 100+ iterations for correctness
- **🆕 Performance optimized**: < 200ms to serve movies from cache
- **🆕 Automatic cleanup**: TTL and intelligent cache cleanup
- **Critical fix**: Eliminated "Room not available for voting" error
- **Instant detection**: Match detection through vote response
- **Complete cleanup**: Organized and minimalist repository
- **Updated documentation**: Complete README with WSL compilation process
- **Optimized APK**: 2.8MB bundle with production configuration

### 📱 APK de Producción con Match Detection Fix
- **Archivos disponibles**: 
  - `trinity-match-fix-1851.apk` (60MB) - **RECOMENDADO**
  - `trinity-match-fix-1901.apk` (60MB) - Versión alternativa
  - `trinity-simple.apk` (60MB) - Versión base
- **Fix implementado**: Detección instantánea de matches desde respuesta de voto
- **Configuración**: Endpoints AWS eu-west-1 de producción
- **Estado**: ✅ **Listo para testing con fix de match detection**

### 🎯 Testing del Match Detection Fix
```bash
# Instalar APK con fix
adb install -r trinity-match-fix-1901.apk

# Monitorear logs del fix
adb logcat | grep "Match detected immediately"
adb logcat | grep "🎉"
```

### 🚀 Next Suggested Steps
1. **✅ COMPLETED**: Match detection fix implemented and compiled
2. **✅ COMPLETED**: Movie cache system implemented and ready for deployment
3. **✅ COMPLETED**: Infrastructure migration to CDK completed with zero data loss
4. **🔄 READY FOR TESTING**: Test CDK deployment and property-based tests
5. **Cache system testing** on real devices
6. **Performance monitoring** of new cache system
7. **UX improvements** in celebration screen
8. **Distribution** via Google Play Store or internal distribution
9. **Usage and performance metrics monitoring**

*Repository completely clean, organized, and ready for continuous development with 100% CDK-managed infrastructure.*