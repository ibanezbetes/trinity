# Test Deployment Integration

Este script ejecuta tests de integración para validar que el deployment del sistema de cache funcione correctamente.

## Propósito

Valida que después del deployment:
- Las tablas DynamoDB estén creadas y accesibles
- Las funciones Lambda tengan las variables de entorno correctas
- Las funciones Lambda tengan los permisos IAM necesarios
- El sistema de cache funcione end-to-end
- Los tiempos de respuesta cumplan los requisitos (< 200ms)
- El manejo de errores y fallbacks funcionen correctamente

## Uso

```bash
# Ejecutar tests de integración después del deployment
node scripts/test-deployment-integration/test-deployment-integration.js
```

## Tests Incluidos

### 1. DynamoDB Tables Deployment
- Verificar que `trinity-room-movie-cache-dev` existe y es accesible
- Verificar que `trinity-room-cache-metadata-dev` existe y es accesible
- Probar operaciones de lectura/escritura
- Probar queries en GSIs

### 2. Lambda Functions Deployment
- Verificar que `trinity-cache-dev` tiene variables de entorno correctas
- Verificar que `trinity-movie-dev` tiene integración de cache
- Verificar que `trinity-room-dev` tiene capacidad de trigger de cache

### 3. End-to-End Cache Functionality
- Crear cache de sala
- Recuperar películas desde cache
- Verificar consistencia de secuencia
- Limpiar cache

### 4. Performance and Reliability Validation
- Verificar tiempos de respuesta < 200ms
- Verificar manejo de errores y fallbacks

## Requisitos

- AWS CLI configurado con región eu-west-1
- Credenciales AWS con permisos para DynamoDB y Lambda
- Tablas DynamoDB desplegadas
- Funciones Lambda desplegadas
- Node.js 18.x
- Dependencias npm instaladas

## Troubleshooting

Si los tests fallan, verificar:

1. **Tablas DynamoDB**: `aws dynamodb list-tables --region eu-west-1`
2. **Funciones Lambda**: `aws lambda list-functions --region eu-west-1`
3. **Variables de entorno**: Verificar en la consola AWS Lambda
4. **Permisos IAM**: Verificar roles y políticas de Lambda
5. **Conectividad**: Verificar acceso a AWS desde el entorno de testing

## Outputs

El script genera:
- Logs detallados de cada test
- Reporte de cobertura (si está disponible)
- Información de debugging en caso de fallos
- Métricas de performance para validación

## Integración con CI/CD

Este script puede integrarse en pipelines de CI/CD para validación automática después del deployment:

```yaml
# Ejemplo para GitHub Actions
- name: Test Deployment Integration
  run: node scripts/test-deployment-integration/test-deployment-integration.js
  env:
    AWS_REGION: eu-west-1
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```