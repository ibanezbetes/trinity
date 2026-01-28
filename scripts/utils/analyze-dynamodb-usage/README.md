# Analyze Dynamodb Usage

## 📋 Descripción
Analiza el uso y rendimiento de todas las tablas DynamoDB del proyecto

## 🚀 Uso
```bash
# Desde la raíz del proyecto
node scripts/utils/analyze-dynamodb-usage/analyze-dynamodb-usage.js
```

## ⚙️ Funcionalidad
- Consulta métricas de CloudWatch\n- Analiza capacidad de lectura/escritura\n- Reporta uso de índices\n- Identifica tablas subutilizadas

## 📊 Output Esperado
- Tabla de métricas por tabla\n- Gráficos de uso\n- Recomendaciones de optimización\n- Alertas de capacidad

## 🔧 Configuración Requerida
- AWS CLI con permisos CloudWatch\n- Acceso a DynamoDB\n- Región: eu-west-1

## ⚠️ Notas Importantes
- Requiere AWS CLI configurado
- Región: eu-west-1
- Permisos IAM apropiados

---
*Utilidad del proyecto Trinity - Script de análisis y verificación*