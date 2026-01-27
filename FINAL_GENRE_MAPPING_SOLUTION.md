# Solución Final: Mapeo de Géneros TV vs Movies

## 🎯 Problema Identificado

El usuario selecciona "Terror" y "Thriller" en la interfaz, pero:
- **Movies**: Terror=27, Thriller=53 ✅ Funciona
- **TV**: Terror=27, Thriller=53 ❌ No funciona (0 resultados)
- **TV**: Mystery=9648, Crime=80 ✅ Funciona (contenido relevante)

## 🔧 Solución Propuesta

### 1. **Mapeo de Géneros por MediaType**

Crear un mapeo que convierta géneros de Movies a sus equivalentes de TV:

```javascript
const GENRE_MAPPING = {
  // Terror/Horror mapping
  27: { // Horror (Movies)
    MOVIE: 27,  // Keep original
    TV: 9648    // Map to Mystery for TV
  },
  // Thriller mapping  
  53: { // Thriller (Movies)
    MOVIE: 53,  // Keep original
    TV: 80      // Map to Crime for TV
  },
  // Other genres remain the same
  35: { // Comedy
    MOVIE: 35,
    TV: 35
  },
  18: { // Drama
    MOVIE: 18,
    TV: 18
  }
};
```

### 2. **Implementación en ContentFilterService**

Modificar el servicio para aplicar el mapeo antes de hacer las llamadas a TMDB:

```javascript
function mapGenresForMediaType(genreIds, mediaType) {
  return genreIds.map(genreId => {
    const mapping = GENRE_MAPPING[genreId];
    if (mapping && mapping[mediaType]) {
      return mapping[mediaType];
    }
    return genreId; // Keep original if no mapping
  });
}
```

### 3. **Resultado Esperado**

Cuando el usuario crea una sala de "Terror + Thriller" para TV:
- **Input**: genreIds=[27, 53], mediaType="TV"
- **Mapped**: genreIds=[9648, 80] (Mystery + Crime)
- **Output**: Series de misterio y crimen (más apropiado para TV)

## 📊 Beneficios

1. ✅ **Contenido Relevante**: Mystery/Crime es más común en TV que Horror puro
2. ✅ **Experiencia Consistente**: El usuario sigue viendo "Terror/Thriller" en la UI
3. ✅ **Flexibilidad**: Fácil agregar más mapeos según necesidades
4. ✅ **Backward Compatibility**: Movies siguen funcionando igual

## 🚀 Implementación

1. Agregar el mapeo al ContentFilterService
2. Aplicar la conversión antes de las llamadas TMDB
3. Mantener la UI sin cambios (transparente al usuario)
4. Probar con salas de Terror/Thriller para TV

## 🎯 Resultado Final Esperado

**Sala "Terror + Thriller" para TV mostrará**:
- Mentes criminales ✅
- CSI ✅  
- Sherlock ✅
- True Detective ✅
- Mystery Files ✅

**En lugar de**:
- Los Simpson ❌
- Padre de familia ❌
- Friends ❌