# Verify Aws Config

## 📋 Descripción
Verifica que la configuración de AWS esté correcta para Trinity

## 🚀 Uso
```bash
# Desde la raíz del proyecto
node scripts/utils/verify-aws-config/verify-aws-config.js
```

## ⚙️ Funcionalidad
- Verifica credenciales AWS\n- Confirma región eu-west-1\n- Testa permisos IAM\n- Valida recursos existentes

## 📊 Output Esperado
- Estado de configuración AWS\n- Lista de recursos encontrados\n- Permisos verificados\n- Recomendaciones de seguridad

## 🔧 Configuración Requerida
- AWS CLI instalado\n- Credenciales configuradas\n- Permisos básicos de lectura

## ⚠️ Notas Importantes
- Requiere AWS CLI configurado
- Región: eu-west-1
- Permisos IAM apropiados

---
*Utilidad del proyecto Trinity - Script de análisis y verificación*