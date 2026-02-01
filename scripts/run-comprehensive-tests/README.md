# Run Comprehensive Tests

Script para ejecutar la suite completa de tests de validación final del sistema de cache de Trinity.

## Propósito

Ejecuta todos los tests necesarios para validar que el sistema está listo para deployment:

1. **Property-Based Tests** (100+ iteraciones)
2. **Unit Tests** 
3. **Integration Tests**
4. **Performance Tests** (< 200ms requirement)
5. **Backward Compatibility Tests**

## Uso

```bash
# Ejecutar suite completa de tests
node scripts/run-comprehensive-tests/run-comprehensive-tests.js
```

## Tests Ejecutados

### 1. Property-Based Tests (100+ iteraciones)
- **cache-creation-determinism.property.test.ts**
- **sequence-consistency.property.test.ts** 
- **batch-management-duplicates.property.test.ts**
- **storage-integrity-retrieval.property.test.ts**
- **lifecycle-management-cleanup.property.test.ts**
- **backward-compatibility.property.test.ts**
- **resilience-fallback-behavior.property.test.ts**

### 2. Unit Tests
- **cache-edge-cases.test.ts**
- **room-integration.test.ts**
- **priority-algorithm-edge-cases.test.ts**
- **legacy-room-compatibility.test.ts**

### 3. Integration Tests
- **deployment-integration.test.ts**
- **movie-cache-realtime-e2e.test.ts**
- **room-cache-integration.test.ts**

### 4. Performance Tests
- Validación de tiempos de respuesta < 200ms
- Tests de carga para batch loading
- Validación de cleanup operations

### 5. Backward Compatibility Tests
- Verificación de funcionalidad existente
- Tests de rooms pre-cache
- Validación de APIs GraphQL existentes

## Output

El script genera:

### Console Output
- Progreso en tiempo real de cada suite de tests
- Resultados individuales (PASSED/FAILED)
- Resumen final con estadísticas
- Recomendaciones basadas en resultados

### Reporte JSON
Archivo `test-results-final.json` con:

```json
{
  "timestamp": "2024-01-30T...",
  "overallStatus": "PASSED|FAILED",
  "testResults": {
    "propertyTests": { "passed": true, "details": "..." },
    "unitTests": { "passed": true, "details": "..." },
    "integrationTests": { "passed": true, "details": "..." },
    "performanceTests": { "passed": true, "details": "..." },
    "backwardCompatibility": { "passed": true, "details": "..." }
  },
  "summary": {
    "totalTests": 5,
    "passedTests": 5,
    "failedTests": 0
  },
  "recommendations": []
}
```

## Criterios de Éxito

Para que el sistema sea considerado listo para deployment:

✅ **Todos los property tests deben pasar** (100+ iteraciones)
✅ **Todos los unit tests deben pasar**
✅ **Todos los integration tests deben pasar**
✅ **Performance requirements cumplidos** (< 200ms)
✅ **Backward compatibility verificada**

## Troubleshooting

### Property Tests Fallan
- Revisar generadores de datos de entrada
- Verificar propiedades de correctness
- Aumentar iteraciones para encontrar edge cases

### Performance Tests Fallan
- Optimizar queries DynamoDB
- Revisar tamaño de batches
- Verificar configuración de Lambda (memoria, timeout)

### Integration Tests Fallan
- Verificar deployment de infraestructura
- Verificar permisos IAM
- Verificar variables de entorno

### Backward Compatibility Fallan
- Revisar cambios en APIs existentes
- Verificar funcionalidad de rooms legacy
- Verificar resolvers GraphQL

## Integración con Deployment

Este script debe ejecutarse **antes** del deployment final:

```bash
# 1. Ejecutar tests comprehensivos
node scripts/run-comprehensive-tests/run-comprehensive-tests.js

# 2. Si todos pasan, proceder con deployment
if [ $? -eq 0 ]; then
  node scripts/deploy-with-cdk/deploy-with-cdk.js
else
  echo "Tests fallaron - no deployar"
  exit 1
fi
```

## Configuración de Environment

Variables de entorno opcionales:

```bash
# Número de iteraciones para property tests (default: 100)
export PROPERTY_TEST_ITERATIONS=200

# Timeout para tests de performance (default: 5000ms)
export PERFORMANCE_TEST_TIMEOUT=3000

# Nivel de logging para debugging
export TEST_LOG_LEVEL=debug
```