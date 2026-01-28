# E2e Backend Test

## 📋 Descripción
Ejecuta tests end-to-end del backend completo

## 🚀 Uso
```bash
# Desde la raíz del proyecto
node scripts/e2e-backend-test/e2e-backend-test.js
```

## ⚙️ Funcionalidad
- Testa flujo completo de usuario\n- Verifica integraciones\n- Reporta resultados

## 🔧 Funciones Principales
- `graphqlRequest`
- `runTest`

## 📁 Archivos Relacionados
- Todas las lambdas\n- Todas las tablas DynamoDB\n- APIs GraphQL

## 🔍 Logs y Debug
```bash
# Ejecutar con debug
DEBUG=* node scripts/e2e-backend-test/e2e-backend-test.js

# Ver logs detallados
node scripts/e2e-backend-test/e2e-backend-test.js --verbose
```

## ⚠️ Notas Importantes
- Requiere datos de prueba\n- Puede modificar estado de BD\n- Ejecutar en entorno de desarrollo

---
*Script organizado automáticamente - Parte del proyecto Trinity*