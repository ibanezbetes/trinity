# Test Match Scenario

Este script prueba el escenario completo de match en Trinity para verificar que la funcionalidad funciona correctamente.

## ¿Qué hace?

1. **Crea una sala de prueba** con 2 usuarios máximo
2. **Simula votos** de ambos usuarios por la misma película
3. **Verifica que se detecta el match** correctamente
4. **Confirma que la sala se actualiza** a estado `MATCHED`
5. **Prueba que no se pueden hacer más votos** después del match
6. **Limpia los datos** de prueba automáticamente

## Uso

```bash
# Ejecutar el test
node scripts/test-match-scenario/test-match-scenario.js
```

## Requisitos

- Variables de entorno AWS configuradas
- Acceso a las tablas DynamoDB de Trinity
- Región: eu-west-1

## Salida Esperada

```
🧪 Iniciando test de escenario de match...

📝 Paso 1: Creando sala de prueba...
✅ Sala creada: abc123...

👥 Paso 2: Agregando segundo usuario...
✅ Usuario agregado: def456...

🔍 Paso 3: Verificando estado inicial...
Estado inicial: ACTIVE
ResultMovieId inicial: null

🗳️ Paso 4: Usuario 1 vota por la película...
Votos actuales para movie-12345: 1
✅ Votos después del usuario 1: 1

🗳️ Paso 5: Usuario 2 vota por la misma película...
Votos actuales para movie-12345: 2
🎉 ¡Match detectado! Actualizando sala...
✅ Votos después del usuario 2: 2

🎉 Paso 6: Verificando match...
Estado final: MATCHED
ResultMovieId final: movie-12345

🎉 ¡SUCCESS! Match detectado correctamente
✅ Estado: MATCHED
✅ Película ganadora: movie-12345

🚫 Paso 7: Intentando votar después del match...
✅ Correcto: Voto rechazado después del match

🧹 Limpiando datos de prueba...
✅ Cleanup completado

🎯 Test completado
```

## Casos de Prueba

### ✅ Casos que DEBEN pasar:
- Sala se crea correctamente en estado `ACTIVE`
- Usuarios pueden unirse a la sala
- Votos se registran correctamente
- Match se detecta cuando ambos usuarios votan por la misma película
- Sala se actualiza a estado `MATCHED` con `resultMovieId`
- Votos posteriores son rechazados

### ❌ Casos que DEBEN fallar:
- Intentar votar después del match
- Votar en sala inexistente
- Votar sin ser miembro de la sala

## Troubleshooting

### Error: "Cannot read property 'votes' of undefined"
- Verificar que las tablas DynamoDB existen
- Confirmar permisos de acceso a DynamoDB

### Error: "Access Denied"
- Verificar credenciales AWS
- Confirmar que el usuario tiene permisos para DynamoDB

### Test falla en verificación de match
- Aumentar el delay en el Paso 6 (línea con `setTimeout`)
- Verificar que la lógica de match en el backend está funcionando

## Integración con CI/CD

Este script puede usarse en pipelines de CI/CD para verificar que la funcionalidad de match funciona correctamente después de deployments.

```yaml
# Ejemplo para GitHub Actions
- name: Test Match Scenario
  run: node scripts/test-match-scenario/test-match-scenario.js
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```