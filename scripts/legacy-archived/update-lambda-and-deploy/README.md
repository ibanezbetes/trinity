# Update Lambda And Deploy

## 📋 Descripción
Actualiza lambdas y sincroniza con CDK usando hotswap

## 🚀 Uso
```bash
# Desde la raíz del proyecto
node scripts/update-lambda-and-deploy/update-lambda-and-deploy.js
```

## ⚙️ Funcionalidad
- Despliega lambdas individualmente\n- Ejecuta CDK hotswap\n- Sincroniza cambios

## 🔧 Funciones Principales
- `updateLambdaAndDeploy`

## 📁 Archivos Relacionados
- `lambdas/*/`\n- `infrastructure/clean/`

## 🔍 Logs y Debug
```bash
# Ver logs de deployment
aws logs tail /aws/lambda/trinity-movie-dev --follow --region eu-west-1

# Verificar funciones
aws lambda list-functions --region eu-west-1
```

## ⚠️ Notas Importantes
- Más rápido que deploy completo\n- Usa hotswap para cambios menores\n- Ideal para desarrollo

---
*Script organizado automáticamente - Parte del proyecto Trinity*