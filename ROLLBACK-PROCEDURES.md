# Trinity - Procedimientos de Rollback

## 📋 Información General

Este documento describe los procedimientos de rollback para Trinity después de la estabilización arquitectural completada el 2 de febrero de 2026.

### Estado Actual del Sistema
- **Arquitectura**: Completamente estabilizada con single source of truth
- **Código**: Consolidado en `infrastructure/clean/src/handlers/`
- **Deployment**: 100% CDK TypeScript
- **Funciones Lambda**: 8 activas (incluyendo pre-signup de Cognito)
- **Tablas DynamoDB**: 12 sincronizadas
- **APIs GraphQL**: 2 operacionales
- **Cognito**: User Pool restaurado (eu-west-1_TSlG71OQi)

## 🚨 Escenarios de Rollback

### 1. Rollback de Deployment CDK

#### Síntomas que Requieren Rollback
- Funciones Lambda no responden después del deployment
- Errores de importación de módulos en las funciones
- Pérdida de conectividad con DynamoDB
- Errores de autorización en GraphQL

#### Procedimiento de Rollback CDK
```bash
# 1. Verificar el estado actual de los stacks
cd infrastructure/clean
npm run list

# 2. Ver el historial de deployments
aws cloudformation describe-stacks --region eu-west-1 --query "Stacks[?contains(StackName, 'Trinity')]"

# 3. Rollback a la versión anterior
cdk deploy --rollback

# 4. Si el rollback automático falla, rollback manual por stack
cdk deploy TrinityLambdaStack --rollback
cdk deploy TrinityDatabaseStack --rollback
cdk deploy TrinityApiStack --rollback
```

#### Verificación Post-Rollback
```bash
# Verificar funciones Lambda
aws lambda list-functions --region eu-west-1 --query "Functions[?starts_with(FunctionName, 'trinity-')]"

# Verificar tablas DynamoDB
aws dynamodb list-tables --region eu-west-1

# Test básico de funcionalidad
node scripts/e2e-backend-test/e2e-backend-test.js
```

### 2. Rollback de Código de Funciones Lambda

#### Síntomas que Requieren Rollback
- Errores de runtime en funciones específicas
- Timeouts aumentados significativamente
- Errores de lógica de negocio
- Fallos en property-based tests

#### Procedimiento de Rollback de Código
```bash
# 1. Identificar la función problemática
aws logs tail /aws/lambda/trinity-[function-name] --region eu-west-1

# 2. Revertir cambios en Git
git log --oneline infrastructure/clean/src/handlers/[handler-name].ts
git revert [commit-hash]

# 3. Deployment rápido de la función específica
cd infrastructure/clean
npm run hotswap

# 4. Verificar la función específica
aws lambda invoke --function-name trinity-[function-name] --region eu-west-1 --payload '{}' response.json
```

### 3. Rollback de Configuración de Base de Datos

#### Síntomas que Requieren Rollback
- Errores de acceso a tablas DynamoDB
- Pérdida de datos después de cambios de esquema
- Problemas de performance en queries
- Errores de TTL o GSI

#### Procedimiento de Rollback de Base de Datos
```bash
# 1. Verificar el estado de las tablas
node scripts/utils/analyze-dynamodb-usage/analyze-dynamodb-usage.js

# 2. Restaurar desde backup (si existe)
# Nota: DynamoDB no tiene rollback automático, usar backups manuales

# 3. Recrear tabla desde esquema anterior
aws dynamodb delete-table --table-name [table-name] --region eu-west-1
aws dynamodb create-table --cli-input-json file://database/schemas/[table-schema].json --region eu-west-1

# 4. Restaurar datos desde backup
node database/scripts/restore-from-backup.js [table-name]
```

### 4. Rollback de Autenticación (Cognito)

#### Síntomas que Requieren Rollback
- Usuarios no pueden autenticarse
- Errores de JWT token validation
- Problemas con pre-signup triggers
- Pérdida de configuración de User Pool

#### Procedimiento de Rollback de Cognito
```bash
# 1. Verificar el estado actual del User Pool
aws cognito-idp describe-user-pool --user-pool-id eu-west-1_TSlG71OQi --region eu-west-1

# 2. Si el User Pool está corrupto, usar backup de configuración
# Restaurar desde: api/schemas/cognito-trinity-users-dev-v2.json

# 3. Recrear User Pool si es necesario
aws cognito-idp create-user-pool --cli-input-json file://api/schemas/cognito-trinity-users-dev-v2.json --region eu-west-1

# 4. Actualizar variables de entorno con nuevo User Pool ID
# Editar .env con nuevos valores
# Redesplegar funciones Lambda con nueva configuración
cd infrastructure/clean
npm run deploy:lambda
```

## 🔄 Procedimientos de Recuperación Completa

### Recuperación desde Backup Completo

Si el sistema completo necesita ser restaurado:

```bash
# 1. Clonar el repositorio en estado estable
git clone [repository-url]
cd trinity
git checkout [stable-commit-hash]

# 2. Restaurar variables de entorno
cp backup/.env.backup .env

# 3. Deployment completo desde cero
cd infrastructure/clean
npm install
npm run deploy:all

# 4. Restaurar datos de DynamoDB
node database/scripts/restore-all-tables.js

# 5. Verificar funcionalidad completa
node scripts/run-comprehensive-tests/run-comprehensive-tests.js
```

### Recuperación de Emergencia

Para situaciones críticas donde el sistema completo está inoperativo:

```bash
# 1. Eliminar todos los recursos AWS
cd infrastructure/clean
cdk destroy --all --force

# 2. Limpiar estado de CDK
rm -rf cdk.out/
rm -rf node_modules/
npm install

# 3. Deployment completo desde cero
npm run deploy:all

# 4. Restaurar configuración crítica
# - Cognito User Pool
# - Variables de entorno
# - Datos de DynamoDB desde backup

# 5. Verificación completa
npm run test:all
node scripts/e2e-backend-test/e2e-backend-test.js
```

## 📊 Verificación Post-Rollback

### Checklist de Verificación Completa

#### 1. Funciones Lambda
```bash
# Verificar que todas las 8 funciones están activas
aws lambda list-functions --region eu-west-1 --query "Functions[?starts_with(FunctionName, 'trinity-')].{Name:FunctionName,State:State}"

# Test básico de cada función
for func in trinity-auth-dev trinity-room-dev trinity-vote-dev trinity-movie-dev trinity-cache-dev trinity-realtime-dev trinity-vote-consensus-dev trinity-pre-signup-dev; do
  echo "Testing $func..."
  aws lambda invoke --function-name $func --region eu-west-1 --payload '{"test": true}' response.json
  cat response.json
  rm response.json
done
```

#### 2. Base de Datos DynamoDB
```bash
# Verificar que todas las 12 tablas están activas
aws dynamodb list-tables --region eu-west-1 --query "TableNames[?starts_with(@, 'trinity-')]"

# Verificar acceso a tablas críticas
aws dynamodb scan --table-name trinity-users-dev --region eu-west-1 --max-items 1
aws dynamodb scan --table-name trinity-rooms-dev-v2 --region eu-west-1 --max-items 1
```

#### 3. APIs GraphQL
```bash
# Verificar APIs AppSync
aws appsync list-graphql-apis --region eu-west-1 --query "graphqlApis[?contains(name, 'trinity')]"

# Test básico de GraphQL endpoint
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "query { __schema { types { name } } }"}' \
  [GRAPHQL_ENDPOINT]
```

#### 4. Autenticación Cognito
```bash
# Verificar User Pool
aws cognito-idp describe-user-pool --user-pool-id eu-west-1_TSlG71OQi --region eu-west-1

# Test de autenticación con usuario de prueba
aws cognito-idp admin-initiate-auth \
  --user-pool-id eu-west-1_TSlG71OQi \
  --client-id 3k120srs09npek1qbfhgip63n \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=test@trinity.com,PASSWORD=Trinity123! \
  --region eu-west-1
```

#### 5. Property-Based Tests
```bash
# Ejecutar todos los property tests para verificar correctness
cd infrastructure/clean
npm run test:property

# Verificar que todos los tests pasan
echo "All property tests should pass for successful rollback verification"
```

## 🚨 Contactos de Emergencia

### Información de Soporte
- **Logs de Sistema**: CloudWatch en región eu-west-1
- **Monitoreo**: AWS Console → CloudWatch → Dashboards
- **Backups**: Ubicados en `backup/` y `trinity-stabilization-backup/`
- **Documentación**: Este archivo y README.md

### Comandos de Diagnóstico Rápido
```bash
# Estado general del sistema
node scripts/utils/verify-aws-config/verify-aws-config.js

# Análisis de performance
node scripts/utils/analyze-dynamodb-usage/analyze-dynamodb-usage.js

# Test end-to-end
node scripts/e2e-backend-test/e2e-backend-test.js
```

## 📝 Notas Importantes

### Consideraciones de Rollback
1. **Datos de Usuario**: Los rollbacks de DynamoDB pueden causar pérdida de datos recientes
2. **Cognito**: Los cambios en User Pool no son reversibles automáticamente
3. **CDK State**: Mantener consistencia entre el estado de CDK y AWS
4. **Variables de Entorno**: Verificar que `.env` esté actualizado después del rollback
5. **Cache**: Limpiar cache de aplicaciones móviles después de rollbacks de API

### Prevención de Problemas
1. **Backups Regulares**: Crear backups antes de cambios mayores
2. **Testing**: Ejecutar property-based tests antes de deployment
3. **Staging**: Usar ambiente de staging para cambios críticos
4. **Monitoreo**: Configurar alertas en CloudWatch
5. **Documentación**: Mantener este documento actualizado

---

**Última Actualización**: 2 de febrero de 2026  
**Versión del Sistema**: Post-Estabilización Arquitectural  
**Estado**: Procedimientos validados y listos para uso