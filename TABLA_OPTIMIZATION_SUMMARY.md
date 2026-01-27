# 📊 Resumen de Optimización de Tablas DynamoDB

## 🎯 Situación Actual

Tienes **11 tablas** en DynamoDB, pero solo necesitas **8**. Hay 3 tablas que pueden ser optimizadas:

### ✅ Tablas Necesarias (8)
1. `trinity-users-dev` - 0 items (usuarios)
2. `trinity-rooms-dev-v2` - 6 items (salas principales) 
3. `trinity-room-members-dev` - 14 items (miembros)
4. `trinity-votes-dev` - 60 items (votos)
5. `trinity-movies-cache-dev` - 0 items (caché películas)
6. `trinity-room-invites-dev-v2` - 62 items (invitaciones)
7. `trinity-room-matches-dev` - 60 items (matches)
8. `trinity-connections-dev` - 0 items (websockets)

### ❌ Tablas a Optimizar (3)
1. `trinity-rooms-dev` - 4 items **→ MIGRAR a v2**
2. `trinity-events-dev` - 0 items **→ ELIMINAR (vacía)**
3. `trinity-analytics-dev` - 0 items **→ ELIMINAR (vacía)**

## 🚀 Plan de Ejecución

### Paso 1: Eliminar Tablas Vacías (SEGURO)
```bash
node cleanup-empty-tables.js
```
Esto eliminará `trinity-events-dev` y `trinity-analytics-dev` que están vacías.

### Paso 2: Migrar Datos de Rooms (CUIDADOSO)
```bash
node migrate-rooms-safely.js
```
Esto migrará las 4 rooms de `trinity-rooms-dev` a `trinity-rooms-dev-v2`.

### Paso 3: Eliminar Tabla Antigua (DESPUÉS DE VERIFICAR)
```bash
node migrate-rooms-safely.js --delete-old
```
Solo después de verificar que todo funciona correctamente.

## 💰 Beneficios

1. **Ahorro de costos**: 3 tablas menos = menos facturación
2. **Simplicidad**: Estructura más limpia
3. **Consistencia**: Solo versiones v2
4. **Mantenimiento**: Menos confusión sobre qué tabla usar

## ⚠️ Consideraciones Importantes

### Código Legacy
Hay referencias a `trinity-rooms-dev` en código legacy que debes actualizar:
- `archive/backend/src/infrastructure/database/multi-table.service.ts`
- Scripts de prueba en `archive/`

### Verificación Post-Migración
Después de la migración, verifica que:
1. La aplicación móvil puede crear/unirse a salas
2. La web puede unirse a salas
3. Los votos funcionan correctamente
4. Las invitaciones funcionan

## 🎯 Resultado Final

**Antes**: 11 tablas con duplicados y tablas vacías
**Después**: 8 tablas optimizadas y consolidadas

### Estructura Final Recomendada
```
trinity-users-dev              (usuarios)
trinity-rooms-dev-v2          (salas - consolidada)
trinity-room-members-dev      (miembros)
trinity-room-invites-dev-v2   (invitaciones)
trinity-room-matches-dev      (matches)
trinity-votes-dev             (votos)
trinity-movies-cache-dev      (caché)
trinity-connections-dev       (websockets)
```

## 🔧 Comandos Rápidos

```bash
# 1. Ver estado actual
node list-actual-tables.js

# 2. Análisis completo
node optimize-dynamodb-tables.js

# 3. Limpiar tablas vacías
node cleanup-empty-tables.js

# 4. Migrar rooms
node migrate-rooms-safely.js

# 5. Eliminar tabla antigua (después de verificar)
node migrate-rooms-safely.js --delete-old
```

## 📈 Monitoreo Post-Optimización

Después de la optimización, monitorea:
1. Logs de CloudWatch para errores
2. Métricas de DynamoDB
3. Funcionamiento de la aplicación
4. Costos de AWS (deberían reducirse)

¿Quieres que ejecute alguno de estos pasos ahora?