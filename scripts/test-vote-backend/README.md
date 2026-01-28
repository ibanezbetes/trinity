# Test Vote Backend

## 📋 Descripción
Testa el sistema de votación del backend

## 🚀 Uso
```bash
# Desde la raíz del proyecto
node scripts/test-vote-backend/test-vote-backend.js
```

## ⚙️ Funcionalidad
- Testa sistema de votación\n- Verifica cálculo de matches\n- Valida tiempo real

## 🔧 Funciones Principales
- `testBackendComponents`
- `testVoteFlow`
- `checkCommonIssues`
- `timeout`
- `runAllTests`

## 📁 Archivos Relacionados
- `lambdas/trinity-vote-dev/`\n- `database/schemas/trinity-votes-dev.json`

## 🔍 Logs y Debug
```bash
# Ejecutar con debug
DEBUG=* node scripts/test-vote-backend/test-vote-backend.js

# Ver logs detallados
node scripts/test-vote-backend/test-vote-backend.js --verbose
```

## ⚠️ Notas Importantes
- Ejecutar desde la raíz del proyecto\n- Verificar configuración AWS

---
*Script organizado automáticamente - Parte del proyecto Trinity*