# Test Join Room Aws

## 📋 Descripción
Testa el proceso de unirse a salas usando AWS

## 🚀 Uso
```bash
# Desde la raíz del proyecto
node scripts/test-join-room-aws/test-join-room-aws.js
```

## ⚙️ Funcionalidad
- Testa unirse usando APIs AWS\n- Verifica membresías\n- Valida permisos

## 🔧 Funciones Principales
- `log`
- `testJoinRoom`

## 📁 Archivos Relacionados
- `lambdas/trinity-room-dev/`\n- `database/schemas/trinity-room-members-dev.json`

## 🔍 Logs y Debug
```bash
# Ejecutar con debug
DEBUG=* node scripts/test-join-room-aws/test-join-room-aws.js

# Ver logs detallados
node scripts/test-join-room-aws/test-join-room-aws.js --verbose
```

## ⚠️ Notas Importantes
- Ejecutar desde la raíz del proyecto\n- Verificar configuración AWS

---
*Script organizado automáticamente - Parte del proyecto Trinity*