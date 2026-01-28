# Test Create Room

## 📋 Descripción
Testa la funcionalidad de creación de salas

## 🚀 Uso
```bash
# Desde la raíz del proyecto
node scripts/test-create-room/test-create-room.js
```

## ⚙️ Funcionalidad
- Crea sala de prueba\n- Verifica en DynamoDB\n- Limpia después del test

## 🔧 Funciones Principales
- `authenticate`
- `createRoom`
- `getUserRooms`
- `main`

## 📁 Archivos Relacionados
- `lambdas/trinity-room-dev/`\n- `database/schemas/trinity-rooms-dev-v2.json`

## 🔍 Logs y Debug
```bash
# Ejecutar con debug
DEBUG=* node scripts/test-create-room/test-create-room.js

# Ver logs detallados
node scripts/test-create-room/test-create-room.js --verbose
```

## ⚠️ Notas Importantes
- Ejecutar desde la raíz del proyecto\n- Verificar configuración AWS

---
*Script organizado automáticamente - Parte del proyecto Trinity*