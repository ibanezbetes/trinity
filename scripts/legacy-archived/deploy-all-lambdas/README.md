# Deploy All Lambdas

## 📋 Descripción
Despliega todas las funciones Lambda individualmente usando AWS CLI

## 🚀 Uso
```bash
# Desde la raíz del proyecto
node scripts/deploy-all-lambdas/deploy-all-lambdas.js
```

## ⚙️ Funcionalidad
- Empaqueta cada lambda individualmente\n- Despliega usando AWS CLI\n- Verifica deployment exitoso

## 🔧 Funciones Principales
- `deployAllLambdas`

## 📁 Archivos Relacionados
- `lambdas/*/` (todas las carpetas)\n- `lambdas/*/lambda-config.json`

## 🔍 Logs y Debug
```bash
# Ver logs de deployment
aws logs tail /aws/lambda/trinity-movie-dev --follow --region eu-west-1

# Verificar funciones
aws lambda list-functions --region eu-west-1
```

## ⚠️ Notas Importantes
- Requiere AWS CLI configurado\n- Región fija: eu-west-1\n- Puede tardar 2-5 minutos

---
*Script organizado automáticamente - Parte del proyecto Trinity*