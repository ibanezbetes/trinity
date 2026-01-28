# Deploy With Cdk

## 📋 Descripción
Despliega toda la infraestructura usando CDK en orden correcto

## 🚀 Uso
```bash
# Desde la raíz del proyecto
node scripts/deploy-with-cdk/deploy-with-cdk.js
```

## ⚙️ Funcionalidad
- Compila código TypeScript\n- Despliega stacks en orden\n- Verifica dependencias

## 🔧 Funciones Principales
- `deployWithCDK`

## 📁 Archivos Relacionados
- `infrastructure/clean/`\n- `infrastructure/clean/lib/*.ts`

## 🔍 Logs y Debug
```bash
# Ver logs de deployment
aws logs tail /aws/lambda/trinity-movie-dev --follow --region eu-west-1

# Verificar funciones
aws lambda list-functions --region eu-west-1
```

## ⚠️ Notas Importantes
- Requiere CDK bootstrap\n- Despliega en orden específico\n- Puede tardar 5-10 minutos

---
*Script organizado automáticamente - Parte del proyecto Trinity*