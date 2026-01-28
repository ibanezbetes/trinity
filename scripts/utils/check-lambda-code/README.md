# Check Lambda Code

## 📋 Descripción
Verifica el código y configuración de todas las funciones Lambda

## 🚀 Uso
```bash
# Desde la raíz del proyecto
node scripts/utils/check-lambda-code/check-lambda-code.js
```

## ⚙️ Funcionalidad
- Verifica sintaxis de código\n- Analiza dependencias\n- Revisa configuración\n- Reporta problemas potenciales

## 📊 Output Esperado
- Lista de funciones verificadas\n- Errores de sintaxis encontrados\n- Warnings de configuración\n- Resumen de estado

## 🔧 Configuración Requerida
- AWS CLI configurado\n- Permisos Lambda:ListFunctions\n- Acceso a código fuente

## ⚠️ Notas Importantes
- Requiere AWS CLI configurado
- Región: eu-west-1
- Permisos IAM apropiados

---
*Utilidad del proyecto Trinity - Script de análisis y verificación*