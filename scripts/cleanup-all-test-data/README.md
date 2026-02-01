# Cleanup All Test Data - Trinity

## 🎯 Propósito
Script para limpiar TODOS los datos de prueba de Trinity antes del lanzamiento a producción.

## ⚠️ ADVERTENCIA IMPORTANTE
Este script borra **TODOS** los datos de las tablas de salas, votos, cache, etc. 
**Solo usar en desarrollo/testing, NUNCA en producción con usuarios reales.**

## 📋 Qué se borra
- ✅ Todas las salas de prueba (`trinity-rooms-dev-v2`)
- ✅ Todos los miembros de salas (`trinity-room-members-dev`)
- ✅ Todas las invitaciones (`trinity-room-invites-dev-v2`)
- ✅ Todos los votos (`trinity-votes-dev`)
- ✅ Todos los matches (`trinity-room-matches-dev`)
- ✅ Todas las conexiones WebSocket (`trinity-connections-dev`)
- ✅ Todo el cache de películas por sala (`trinity-room-movie-cache-dev`)
- ✅ Todos los metadatos de cache (`trinity-room-cache-metadata-dev`)
- ✅ Todos los datos de matchmaking (`trinity-matchmaking-dev`)

## 🛡️ Qué se mantiene intacto
- ✅ Usuarios registrados (`trinity-users-dev`) - **PROTEGIDO**
- ✅ Cache global de películas (`trinity-movies-cache-dev`) - **PROTEGIDO**

## 🚀 Uso

### Ejecutar limpieza completa
```bash
node scripts/cleanup-all-test-data/cleanup-all-test-data.js
```

### Verificar antes de ejecutar
```bash
# Ver cuántas salas hay actualmente
aws dynamodb scan --table-name trinity-rooms-dev-v2 --select COUNT --region eu-west-1

# Ver cuántos miembros hay
aws dynamodb scan --table-name trinity-room-members-dev --select COUNT --region eu-west-1

# Ver cuántos votos hay
aws dynamodb scan --table-name trinity-votes-dev --select COUNT --region eu-west-1
```

### Verificar después de ejecutar
```bash
# Verificar que las tablas estén vacías
aws dynamodb scan --table-name trinity-rooms-dev-v2 --select COUNT --region eu-west-1
aws dynamodb scan --table-name trinity-room-members-dev --select COUNT --region eu-west-1
aws dynamodb scan --table-name trinity-votes-dev --select COUNT --region eu-west-1

# Verificar que los usuarios se mantuvieron
aws dynamodb scan --table-name trinity-users-dev --select COUNT --region eu-west-1
```

## 📊 Ejemplo de salida
```
🚨 LIMPIEZA COMPLETA DE DATOS DE PRUEBA DE TRINITY
⚠️  Este script borrará TODOS los datos de las siguientes tablas:
   trinity-rooms-dev-v2, trinity-room-members-dev, trinity-room-invites-dev-v2, ...

📋 Tablas protegidas (NO se borrarán):
   trinity-users-dev, trinity-movies-cache-dev

⏳ Iniciando limpieza en 3 segundos...

🧹 Limpiando tabla: trinity-rooms-dev-v2
   ✅ Borrados 25 elementos (total: 25)
   ✅ Borrados 15 elementos (total: 40)
✅ Tabla trinity-rooms-dev-v2 limpiada: 40 elementos borrados

🧹 Limpiando tabla: trinity-room-members-dev
   ✅ Borrados 25 elementos (total: 25)
✅ Tabla trinity-room-members-dev limpiada: 25 elementos borrados

...

🎉 LIMPIEZA COMPLETADA EXITOSAMENTE
📊 Resumen:
   • Tablas limpiadas: 10
   • Elementos borrados: 150
   • Tiempo total: 12.34s

✅ Trinity está listo para empezar con datos limpios
👥 Los usuarios registrados se mantuvieron intactos
🎬 El cache global de películas se mantuvo intacto
```

## 🔧 Características técnicas
- **Batch processing**: Procesa elementos en lotes de 25 para eficiencia
- **Rate limiting**: Pausa entre lotes para no sobrecargar DynamoDB
- **Error handling**: Manejo robusto de errores con información detallada
- **Progress tracking**: Muestra progreso en tiempo real
- **Safety checks**: Protege tablas críticas de usuarios y cache global
- **Key mapping**: Maneja diferentes esquemas de claves primarias por tabla

## 🛡️ Medidas de seguridad
1. **Confirmación visual**: Muestra qué se va a borrar antes de ejecutar
2. **Delay de seguridad**: 3 segundos de espera antes de iniciar
3. **Tablas protegidas**: Lista explícita de tablas que NO se tocan
4. **Logging detallado**: Registro completo de todas las operaciones
5. **Rollback imposible**: Una vez ejecutado, los datos no se pueden recuperar

## ⚡ Cuándo usar
- Antes del lanzamiento a producción
- Después de testing extensivo
- Para limpiar datos de desarrollo
- Cuando hay demasiadas salas de prueba acumuladas

## 🚫 Cuándo NO usar
- En producción con usuarios reales
- Si hay datos importantes que conservar
- Sin hacer backup previo si es necesario
- Si no estás 100% seguro de lo que haces