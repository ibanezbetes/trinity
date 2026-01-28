# Create Room Only

## 📋 Descripción
Crea una sala de votación básica para testing

## 🚀 Uso
```bash
# Desde la raíz del proyecto
node scripts/create-room-only/create-room-only.js
```

## ⚙️ Funcionalidad
- Crea entrada en trinity-rooms-dev-v2\n- Genera código de invitación\n- Configura sala básica

## 🔧 Funciones Principales
- `authenticateUser`
- `executeGraphql`
- `run`

## 📁 Archivos Relacionados
- `database/schemas/trinity-rooms-dev-v2.json`\n- `lambdas/trinity-room-dev/`

## 🔍 Logs y Debug
Ver logs en CloudWatch para más detalles

## ⚠️ Notas Importantes
- Ejecutar desde la raíz del proyecto\n- Verificar configuración AWS

---
*Script organizado automáticamente - Parte del proyecto Trinity*