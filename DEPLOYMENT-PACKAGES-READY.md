# Trinity Lambda Deployment Packages - OPTIMIZED FOR AWS CONSOLE

## 🚨 PAQUETES OPTIMIZADOS LISTOS (< 1MB cada uno)

He creado **paquetes optimizados** que cumplen con el límite de 50MB de la consola AWS.

## 📦 Paquetes de Despliegue Optimizados

### 1. `trinity-cache-dev-OPTIMIZED.zip` (0.87 MB)
- **LÓGICA DE NEGOCIO INMUTABLE** implementada
- **ZERO TOLERANCE Quality Gate** según especificaciones
- **Solo dependencias esenciales**: axios únicamente
- **Algoritmo exacto de 3 pasos**: AND → OR → Popular
- **Enforcement absoluto de endpoints**: TV → /discover/tv, MOVIE → /discover/movie

### 2. `trinity-vote-dev-OPTIMIZED.zip` (0.02 MB)
- Lambda de votación actual (sin cambios necesarios)
- **Sin dependencias externas** (usa AWS SDK nativo)
- Listo para subida manual

## 🎯 LÓGICA DE NEGOCIO INMUTABLE IMPLEMENTADA

### Flujo: Input → Validación Previa → Fetch & Filter Loop → Persistencia

```
1. Input: Usuario elige MediaType ('TV'/'MOVIE') y Géneros ([80,18])
2. Validación Previa: Configure TMDB client for EXCLUSIVE endpoint
   - TV → /discover/tv SOLAMENTE
   - MOVIE → /discover/movie SOLAMENTE
   - PROHIBIDO MEZCLAR
3. Fetch & Filter Loop: Hasta exactamente 50 ítems válidos
   - Intento 1 (AND): with_genres=80,18
   - Intento 2 (OR): with_genres=80|18  
   - Relleno Final: Popular mismo mediaType
4. Persistencia: Guardar exactamente 50 ítems en DynamoDB
```

### QUALITY GATE (ZERO TOLERANCE - NO OMITIBLES)

#### A. Filtros Base
- ✅ **Idioma**: original_language debe ser occidental ('en','es','fr','it','de','pt')
- ✅ **Contenido**: overview no puede ser null/vacío/"Descripción no disponible"
- ✅ **Imagen**: poster_path no puede ser null

#### B. Coherencia de Tipo (CRÍTICO)
- ✅ **Salas TV**: DESCARTAR cualquier ítem de película
- ✅ **Salas MOVIE**: DESCARTAR cualquier ítem de TV

#### C. Lógica de Géneros
- ✅ **Paso 1**: AMBOS géneros (lógica AND)
- ✅ **Paso 2**: CUALQUIER género (lógica OR)
- ✅ **Paso 3**: Popular mismo mediaType únicamente

## 🔧 Optimizaciones Realizadas

### Paquete trinity-cache-dev-OPTIMIZED.zip
- **Eliminadas dependencias pesadas**: @aws-sdk/*, aws-sdk v2
- **Solo axios incluido**: Para llamadas TMDB
- **AWS SDK nativo**: Lambda runtime incluye DynamoDB client
- **Archivos esenciales únicamente**: index.js, services/, package.json

### Paquete trinity-vote-dev-OPTIMIZED.zip  
- **Sin node_modules**: Usa AWS SDK nativo del runtime
- **Solo archivos core**: vote.js, package.json
- **Tamaño mínimo**: 0.02 MB

## 🚨 INSTRUCCIONES DE DESPLIEGUE MANUAL

### Subida a Consola AWS

1. **Ir a AWS Lambda Console** → región eu-west-1
2. **Función trinity-cache-dev**:
   - Clic en "Upload from" → ".zip file"
   - Seleccionar `trinity-cache-dev-OPTIMIZED.zip`
   - Clic en "Save"
3. **Función trinity-vote-dev**:
   - Clic en "Upload from" → ".zip file"  
   - Seleccionar `trinity-vote-dev-OPTIMIZED.zip`
   - Clic en "Save"

### Verificación Post-Despliegue

Probar con payload de prueba:
```javascript
{
  "action": "createCache",
  "roomId": "test-room-123",
  "filterCriteria": {
    "mediaType": "TV",
    "genreIds": [80, 18],
    "roomId": "test-room-123"
  }
}
```

**Logs esperados**:
- `🚨 TMDB_URL_GENERATED: https://api.themoviedb.org/3/discover/tv?...`
- `✅ QUALITY GATE PASS: TV item "Nombre Serie" (ID: 12345)`
- `🎯 IMMUTABLE BUSINESS LOGIC SUCCESS: Generated exactly 50 valid TV items`

## 🎯 CORRECCIONES CRÍTICAS IMPLEMENTADAS

1. **ENFORCEMENT ABSOLUTO DE ENDPOINTS**: No más contenido mixto
2. **QUALITY GATE ZERO TOLERANCE**: Cada ítem validado
3. **EXACTAMENTE 50 ÍTEMS**: Lógica de negocio garantiza exactamente 50
4. **SOLO IDIOMAS OCCIDENTALES**: Filtrado estricto de idiomas
5. **NO DESCRIPCIONES PLACEHOLDER**: "Descripción no disponible" rechazado
6. **POSTER REQUERIDO**: No se permite poster_path null
7. **COHERENCIA DE TIPO DE MEDIA**: Salas TV rechazan películas, salas MOVIE rechazan TV

## 📊 Resultados Esperados

Después del despliegue, salas como:
- **Sala 5924f8b9** (TV/Crimen+Drama) debería retornar **SOLO series de TV** con géneros Crimen Y/O Drama
- **No más "Couples" (película de Comedia/Romance)** en salas TV
- **No más "Evil Dead" (película de Terror)** en salas Crimen+Drama
- **No más ítems "Descripción no disponible"**
- **Todos los ítems tendrán posters válidos e idiomas occidentales**

---

**ESTADO**: ✅ **PAQUETES OPTIMIZADOS LISTOS PARA SUBIDA MANUAL**

Los archivos ZIP contienen la implementación **EXACTA DE LA LÓGICA DE NEGOCIO INMUTABLE** según tus especificaciones y están optimizados para cumplir con el límite de 50MB de la consola AWS.