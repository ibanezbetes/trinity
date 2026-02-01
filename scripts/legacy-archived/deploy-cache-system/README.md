# Deploy Cache System

Script completo para desplegar el sistema de cache de películas basado en salas de Trinity.

## Propósito

Ejecuta el deployment completo del sistema de cache con validación integral:

1. **Validación pre-deployment** - Verificar archivos y configuración
2. **Tests comprehensivos** - Ejecutar toda la suite de tests
3. **Deployment CDK** - Desplegar infraestructura completa
4. **Verificación post-deployment** - Tests de integración
5. **Validación de performance** - Verificar requisitos de tiempo
6. **Resumen y documentación** - Generar información de deployment

## Uso

```bash
# Deployment completo del sistema de cache
node scripts/deploy-cache-system/deploy-cache-system.js
```

## Proceso de Deployment

### 1. Validación Pre-Deployment
- ✅ Verificar archivos CDK requeridos
- ✅ Verificar archivos Lambda requeridos  
- ✅ Verificar esquemas de base de datos
- ✅ Verificar configuración AWS

### 2. Tests Comprehensivos
- ✅ Property-based tests (100+ iteraciones)
- ✅ Unit tests
- ✅ Integration tests
- ✅ Backward compatibility tests
- ⚠️  Si fallan, deployment se aborta

### 3. Deployment CDK
- ✅ Instalar dependencias
- ✅ Compilar TypeScript
- ✅ Bootstrap CDK si es necesario
- ✅ Mostrar diferencias
- ✅ Desplegar stacks en orden:
  1. `TrinityDatabaseStack` (nuevas tablas DynamoDB)
  2. `TrinityLambdaStack` (nueva función cache)
  3. `TrinityApiStack` (resolvers actualizados)
  4. `TrinityMainStack` (recursos compartidos)

### 4. Verificación Post-Deployment
- ✅ Esperar que recursos estén listos (30s)
- ✅ Tests de integración de deployment
- ✅ Verificar tablas DynamoDB
- ✅ Verificar funciones Lambda
- ✅ Verificar permisos IAM

### 5. Validación de Performance
- ✅ Tests de tiempo de respuesta (< 200ms)
- ✅ Tests de batch loading (< 10s)
- ✅ Tests de operaciones concurrentes
- ✅ Tests de cleanup

### 6. Resumen y Documentación
- ✅ Generar `deployment-cache-system.json`
- ✅ Mostrar resumen de deployment
- ✅ Listar nuevas características
- ✅ Proporcionar próximos pasos

## Nuevas Características Desplegadas

### 🗄️ Nuevas Tablas DynamoDB
- **trinity-room-movie-cache-dev** - Cache de películas por sala
- **trinity-room-cache-metadata-dev** - Metadata de cache por sala

### ⚡ Nueva Función Lambda
- **trinity-cache-dev** - Sistema de pre-caching de películas

### 🔧 Funciones Lambda Actualizadas
- **trinity-movie-dev** - Integración con sistema de cache
- **trinity-room-dev** - Triggers de creación de cache

### 🎯 Nuevas Funcionalidades
1. **Room-based movie pre-caching** - Películas pre-cargadas por sala
2. **Deterministic movie sequences** - Orden idéntico para todos los usuarios
3. **Automatic batch management** - Carga automática de lotes adicionales
4. **TTL-based cleanup** - Limpieza automática de cache
5. **Performance monitoring** - Métricas de CloudWatch

## Outputs del Deployment

### Console Output
- Progreso en tiempo real de cada paso
- Resultados de tests y validaciones
- Información de stacks desplegados
- Resumen final con estadísticas

### Archivo JSON
`deployment-cache-system.json`:
```json
{
  "timestamp": "2024-01-30T...",
  "duration": 180,
  "region": "eu-west-1",
  "stacks": ["TrinityDatabaseStack", "TrinityLambdaStack", ...],
  "newTables": ["trinity-room-movie-cache-dev", ...],
  "newLambda": "trinity-cache-dev",
  "features": ["Room-based movie pre-caching", ...],
  "status": "SUCCESS"
}
```

## Requisitos

### AWS
- AWS CLI configurado con región eu-west-1
- Credenciales con permisos para:
  - DynamoDB (crear tablas, índices)
  - Lambda (crear/actualizar funciones)
  - IAM (crear roles y políticas)
  - CloudFormation (crear/actualizar stacks)
  - AppSync (actualizar APIs)

### Local
- Node.js 18.x
- AWS CDK instalado globalmente
- Dependencias npm instaladas

### Variables de Entorno
```bash
export AWS_REGION=eu-west-1
export TMDB_API_KEY=your_tmdb_key
export HF_API_TOKEN=your_huggingface_token
```

## Troubleshooting

### Deployment Falla
1. **Verificar credenciales**: `aws sts get-caller-identity`
2. **Verificar región**: Debe ser `eu-west-1`
3. **Verificar permisos**: IAM debe permitir crear recursos
4. **Revisar logs**: CloudFormation en AWS Console
5. **CDK bootstrap**: `cdk bootstrap aws://ACCOUNT/eu-west-1`

### Tests Fallan
1. **Property tests**: Revisar generadores y propiedades
2. **Integration tests**: Verificar recursos desplegados
3. **Performance tests**: Optimizar configuración Lambda

### Recursos Ya Existen
- El deployment es idempotente
- CDK actualiza recursos existentes
- Tablas DynamoDB se mantienen (RETAIN policy)

## Rollback

Si necesitas hacer rollback:

```bash
# Rollback completo (CUIDADO: elimina recursos)
cd infrastructure/clean
cdk destroy --all

# Rollback selectivo por stack
cdk destroy TrinityLambdaStack
cdk destroy TrinityDatabaseStack
```

## Monitoreo Post-Deployment

### CloudWatch Metrics
- Lambda execution duration
- DynamoDB read/write capacity
- Error rates y timeouts
- Cache hit rates

### Logs
- `/aws/lambda/trinity-cache-dev`
- `/aws/lambda/trinity-movie-dev`
- `/aws/lambda/trinity-room-dev`

### Dashboards
- Crear dashboard personalizado en CloudWatch
- Monitorear métricas de performance
- Configurar alertas para errores

## Próximos Pasos

Después del deployment exitoso:

1. **Verificar funcionalidad móvil** - Usuarios ven mismo orden
2. **Monitorear performance** - Tiempos de respuesta < 200ms
3. **Verificar costos** - DynamoDB PAY_PER_REQUEST
4. **Configurar alertas** - Errores y performance
5. **Documentar cambios** - Actualizar README del proyecto