# Plan de Optimización de Tablas DynamoDB

## 📊 Estado Actual

### ✅ Tablas Activas y en Uso
- `trinity-users-dev`: 0 items (vacía pero necesaria)
- `trinity-rooms-dev-v2`: 6 items ✅ **TABLA PRINCIPAL**
- `trinity-room-members-dev`: 14 items ✅
- `trinity-votes-dev`: 60 items ✅
- `trinity-movies-cache-dev`: 0 items (vacía pero necesaria para caché)
- `trinity-room-invites-dev-v2`: 62 items ✅
- `trinity-room-matches-dev`: 60 items ✅
- `trinity-connections-dev`: 0 items (vacía pero necesaria para WebSocket)

### ⚠️ Tablas Problemáticas
- `trinity-rooms-dev`: 4 items **VERSIÓN ANTIGUA**
- `trinity-events-dev`: 0 items **VACÍA - ELIMINAR**
- `trinity-analytics-dev`: 0 items **VACÍA - ELIMINAR**

## 🎯 Plan de Acción

### Fase 1: Eliminar Tablas Vacías (INMEDIATO)
```bash
# Estas tablas están vacías y no se usan en el código actual
aws dynamodb delete-table --table-name trinity-events-dev --region eu-west-1
aws dynamodb delete-table --table-name trinity-analytics-dev --region eu-west-1
```

### Fase 2: Migrar Datos de trinity-rooms-dev (CUIDADOSO)
La tabla `trinity-rooms-dev` tiene 4 rooms que necesitan ser migradas a `trinity-rooms-dev-v2`:

**Rooms encontradas:**
1. `9315a716-2a50-4848-86f2-b05c1cdd30a1` (25/01/2026)
2. `20c495f3-df47-448a-b171-db82b57cef38` (25/01/2026)
3. `adcf182e-d8d5-43dc-8c16-817f690b2208` (25/01/2026)
4. `9c511c09-8d94-42ed-9195-af514a2f2a82` (25/01/2026)

### Fase 3: Actualizar Código Legacy
Cambiar todas las referencias de `trinity-rooms-dev` a `trinity-rooms-dev-v2` en:
- `archive/backend/src/infrastructure/database/multi-table.service.ts`
- Scripts de prueba en `archive/`
- Cualquier configuración que use la tabla antigua

## 🚀 Comandos de Ejecución

### 1. Eliminar Tablas Vacías
```bash
node -e "
const { DynamoDBClient, DeleteTableCommand } = require('@aws-sdk/client-dynamodb');
const client = new DynamoDBClient({ region: 'eu-west-1' });

async function deleteTables() {
  const tablesToDelete = ['trinity-events-dev', 'trinity-analytics-dev'];
  
  for (const table of tablesToDelete) {
    try {
      await client.send(new DeleteTableCommand({ TableName: table }));
      console.log(\`✅ Eliminada: \${table}\`);
    } catch (error) {
      console.log(\`❌ Error eliminando \${table}: \${error.message}\`);
    }
  }
}

deleteTables();
"
```

### 2. Migrar Datos (Ejecutar después de verificar)
```bash
node optimize-dynamodb-tables.js --migrate
```

## 📋 Resultado Final

Después de la optimización tendrás **8 tablas** en lugar de 11:

### Tablas Finales
1. `trinity-users-dev` - Usuarios
2. `trinity-rooms-dev-v2` - Salas (consolidada)
3. `trinity-room-members-dev` - Miembros de salas
4. `trinity-votes-dev` - Votos
5. `trinity-movies-cache-dev` - Caché de películas
6. `trinity-room-invites-dev-v2` - Invitaciones
7. `trinity-room-matches-dev` - Matches de películas
8. `trinity-connections-dev` - Conexiones WebSocket

### Tablas Eliminadas
- ❌ `trinity-events-dev` (vacía, no usada)
- ❌ `trinity-analytics-dev` (vacía, solo en código legacy)
- ❌ `trinity-rooms-dev` (migrada a v2)

## 💰 Beneficios

1. **Reducción de costos**: 3 tablas menos = menos costos de DynamoDB
2. **Simplicidad**: Estructura más limpia y fácil de mantener
3. **Consistencia**: Solo versiones v2 de las tablas
4. **Rendimiento**: Menos confusión sobre qué tabla usar

## ⚠️ Precauciones

1. **Backup**: Hacer backup de `trinity-rooms-dev` antes de eliminar
2. **Verificación**: Probar que la migración funciona correctamente
3. **Código**: Actualizar todas las referencias en el código
4. **Monitoreo**: Verificar que no hay errores después de los cambios