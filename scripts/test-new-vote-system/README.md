# Test del Nuevo Sistema de Votación

## 🎯 Propósito

Este script verifica que el sistema de votación corregido funcione exactamente como se especifica:

1. **Match Rápido**: Cuando todos votan LIKE → Match inmediato
2. **Sin Match**: Cuando hay votos mixtos → Avanza a siguiente película
3. **Fin Sin Consenso**: Cuando se agotan las 50 películas → Notificación apropiada

## 🚀 Uso

```bash
# Ejecutar test completo
node scripts/test-new-vote-system/test-new-vote-system.js
```

## 🧪 Escenarios de Test

### Escenario 1: Match Rápido
- Usuario 1 vota LIKE por película 1
- Usuario 2 vota LIKE por película 1
- **Resultado esperado**: Match inmediato, status = 'MATCHED'

### Escenario 2: Sin Match, Avance Normal  
- Usuario 1 vota LIKE por película 1
- Usuario 2 vota DISLIKE por película 1
- **Resultado esperado**: No match, avanza a película 2

### Escenario 3: Fin Sin Consenso (TODO)
- Usuarios votan todas las películas sin match
- **Resultado esperado**: Mensaje "No han conseguido ponerse de acuerdo"

## ✅ Verificaciones

El test verifica:
- ✅ Película inicial correcta (índice 0)
- ✅ Votos individuales no generan match prematuro
- ✅ Match solo cuando TODOS votan LIKE
- ✅ Avance solo cuando todos han votado (sin match)
- ✅ Estado de sala actualizado correctamente
- ✅ Índice de película avanza apropiadamente

## 🔧 Configuración

Requiere:
- AWS credentials configuradas
- Acceso a tablas DynamoDB de desarrollo
- Acceso a lambdas trinity-vote-dev y trinity-movie-dev
- Región: eu-west-1

## 📊 Output Esperado

```
🧪 Iniciando Test del Nuevo Sistema de Votación
🏠 Creando sala de test...
✅ Sala de test creada

🎯 TEST ESCENARIO 1: Match Rápido
🗳️ test-user-1 votando LIKE por película 12345...
✅ Voto procesado: { status: 'WAITING', matchFound: false }
🗳️ test-user-2 votando LIKE por película 12345...
✅ Voto procesado: { status: 'MATCHED', matchFound: true }
✅ ESCENARIO 1 PASADO: Match detectado correctamente

🔄 Reseteando sala para siguiente test...
✅ Sala reseteada

🎯 TEST ESCENARIO 2: Sin Match, Avance Normal
🗳️ test-user-1 votando LIKE por película 12345...
✅ Voto procesado: { status: 'WAITING', matchFound: false }
🗳️ test-user-2 votando DISLIKE por película 12345...
✅ Voto procesado: { status: 'WAITING', matchFound: false }
🎬 Obteniendo película actual...
🎭 Película actual: Movie Title (índice 1)
✅ ESCENARIO 2 PASADO: Avance correcto sin match

🎉 TODOS LOS TESTS PASARON
✅ El nuevo sistema de votación funciona correctamente
```