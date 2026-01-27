# 🎬 INSTRUCCIONES: Cargar TODO el Contenido de TMDB

**Fecha:** 15 de Enero de 2026  
**Objetivo:** Cargar TODAS las películas y series disponibles de TMDB

---

## 🚨 PROBLEMA ACTUAL

El código del frontend está listo para cargar **TODO el contenido** (500+ películas), pero el **schema de AppSync NO está actualizado** con el parámetro `page`.

**Error actual:**
```
Validation error of type UnknownArgument: Unknown field argument page @ 'getMovies'
```

---

## ✅ SOLUCIÓN: Actualizar Schema de AppSync

### Opción 1: AWS Console (MÁS FÁCIL) ⭐

1. **Abrir AWS AppSync Console:**
   - https://console.aws.amazon.com/appsync

2. **Seleccionar tu API:**
   - API ID: `epjtt2y3fzh53ii6omzj6n6h5a`
   - Nombre: Trinity API

3. **Editar Schema:**
   - Click en "Schema" en el menú lateral
   - Click en "Edit Schema"

4. **Buscar la línea:**
   ```graphql
   getMovies(genre: String): [Movie]
   ```

5. **Cambiar a:**
   ```graphql
   getMovies(genre: String, page: Int): [Movie]
   ```

6. **Guardar:**
   - Click en "Save Schema"
   - Esperar a que se complete (status: SUCCESS)

### Opción 2: AWS CLI

```bash
cd C:\trinity_tfg\trinity_tfg
node update-appsync-schema.js
```

---

## 🎯 QUÉ HACE EL CÓDIGO ACTUAL

Una vez que actualices el schema, el frontend hará lo siguiente:

### 1. Carga Masiva en Paralelo
```javascript
// Carga 25 páginas en paralelo (500+ películas)
const TOTAL_PAGES = 25;
for (let page = 1; page <= TOTAL_PAGES; page++) {
  // Llamada a AppSync para cada página
}
```

### 2. Combina Todo el Contenido
- Página 1: 20 películas
- Página 2: 20 películas
- ...
- Página 25: 20 películas
- **TOTAL: ~500 películas**

### 3. Muestra Todo de Una Vez
- Sin scroll infinito
- Sin paginación manual
- TODO el contenido disponible desde el inicio

---

## 📊 CAPACIDAD TOTAL

### Películas Populares
- **25 páginas × 20 películas = 500 películas**

### Series Populares (futuro)
- **25 páginas × 20 series = 500 series**

### Total Disponible
- **~1,000 items de contenido**

---

## 🔧 DESPUÉS DE ACTUALIZAR EL SCHEMA

### 1. Reiniciar la App
```bash
# El frontend se recargará automáticamente
# O presiona 'r' en la terminal de Expo
```

### 2. Ir a la Pestaña "Explorar"
- Segunda pestaña en la barra inferior
- Icono de búsqueda/explorar

### 3. Esperar la Carga Inicial
- Verás un indicador de carga
- Se están cargando 25 páginas en paralelo
- Puede tomar 5-10 segundos

### 4. ¡Listo!
- Verás **TODAS las películas disponibles**
- Puedes hacer scroll para ver todo
- Puedes buscar entre todas las películas
- Puedes filtrar por tipo (Todo/Películas/Series)

---

## 🎬 LOGS ESPERADOS

Una vez que funcione, verás estos logs en el frontend:

```
🎬 Loading ALL movies from TMDB via AppSync...
📦 Loading 25 pages in parallel...
✅ Page 1: 20 movies
✅ Page 2: 20 movies
✅ Page 3: 20 movies
...
✅ Page 25: 20 movies
✅ Total movies loaded: 500
✅ Displaying 500 media items
```

---

## ⚡ OPTIMIZACIONES IMPLEMENTADAS

### 1. Carga en Paralelo
- Las 25 páginas se cargan simultáneamente
- No espera a que termine una para empezar la siguiente
- Mucho más rápido que carga secuencial

### 2. Cache en Lambda
- Cada página se cachea en DynamoDB
- TTL: 30 días
- Reduce llamadas a TMDB API
- Mejora velocidad de carga

### 3. Manejo de Errores
- Si una página falla, las demás continúan
- No bloquea la carga completa
- Muestra lo que pudo cargar

---

## 🚀 PRÓXIMOS PASOS (OPCIONAL)

### Agregar Series
Modificar el código para también cargar series:

```javascript
// Cargar películas Y series
const moviePromises = loadMovies(25); // 25 páginas de películas
const tvPromises = loadTVShows(25);   // 25 páginas de series

const [movies, tvShows] = await Promise.all([
  Promise.all(moviePromises),
  Promise.all(tvPromises)
]);

// Total: ~1,000 items
```

### Agregar Más Categorías
- Películas en cartelera
- Películas mejor valoradas
- Series en emisión
- Series mejor valoradas
- Documentales
- Anime
- etc.

---

## 📝 RESUMEN

**Estado Actual:**
- ✅ Frontend: Listo para cargar TODO
- ✅ Backend (Lambda): Soporta paginación
- ❌ AppSync Schema: **NECESITA ACTUALIZACIÓN**

**Acción Requerida:**
1. Actualizar schema en AppSync (agregar `page: Int`)
2. Reiniciar app
3. Ir a pestaña Explorar
4. ¡Disfrutar de 500+ películas!

---

**Generado por:** Kiro AI Assistant  
**Fecha:** 15 de Enero de 2026
