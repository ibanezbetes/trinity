# 🧪 Guía de Pruebas - Sistema de Votación en Tiempo Real

**Fecha:** 15 de Enero de 2026

---

## 🎯 OBJETIVO

Verificar que el sistema de votación en tiempo real funciona correctamente cuando múltiples usuarios votan en una sala.

---

## 📱 OPCIÓN 1: Prueba con 2 Dispositivos Físicos (Recomendado)

### Requisitos:
- 2 teléfonos Android/iOS
- 2 cuentas de usuario diferentes
- Ambos conectados a internet

### Pasos:

#### 1. Preparación
```
Dispositivo A: Inicia sesión con usuario1@example.com
Dispositivo B: Inicia sesión con usuario2@example.com
```

#### 2. Crear Sala (Dispositivo A)
1. Abre la app
2. Toca "Crear Sala"
3. Dale un nombre: "Prueba Tiempo Real"
4. Toca "Crear"
5. **Anota el código de invitación** (ej: "ABC123")

#### 3. Unirse a la Sala (Dispositivo B)
1. Abre la app
2. Toca "Unirse a Sala"
3. Ingresa el código: "ABC123"
4. Toca "Unirse"

#### 4. Verificar Conexión
**En ambos dispositivos deberías ver:**
- ✅ Nombre de la sala
- ✅ Lista de participantes (2 usuarios)
- ✅ Estado: "Esperando votos"

#### 5. ¡PRUEBA DE TIEMPO REAL!

**Dispositivo A:**
1. Aparece una película
2. Vota "LIKE" (👍)

**Dispositivo B (OBSERVA):**
- ✅ Deberías ver INMEDIATAMENTE:
  - Contador de votos actualizado: "1/2 votos"
  - Indicador de que Usuario A votó
  - Progreso de votación: 50%

**Tiempo esperado:** < 500ms (casi instantáneo)

#### 6. Prueba Completa

**Dispositivo B:**
1. Vota "LIKE" (👍) en la misma película

**Ambos dispositivos (OBSERVA):**
- ✅ Deberías ver INMEDIATAMENTE:
  - 🎉 Notificación de "¡Match encontrado!"
  - Información de la película ganadora
  - Botón para ver detalles

---

## 💻 OPCIÓN 2: Prueba con Emuladores Android Studio

### Requisitos:
- Android Studio instalado
- 2 emuladores Android

### Pasos:

#### 1. Iniciar 2 Emuladores
```bash
# Terminal 1
emulator -avd Pixel_5_API_30

# Terminal 2
emulator -avd Pixel_6_API_30
```

#### 2. Instalar la App en Ambos
```bash
cd mobile

# Instalar en emulador 1
npx expo run:android --device emulator-5554

# Instalar en emulador 2
npx expo run:android --device emulator-5556
```

#### 3. Seguir los Pasos de la Opción 1
- Crear sala en emulador 1
- Unirse en emulador 2
- Votar y observar actualizaciones

---

## 🌐 OPCIÓN 3: Prueba con Expo Go (Más Rápido)

### Requisitos:
- 2 teléfonos con Expo Go instalado
- Ambos en la misma red WiFi

### Pasos:

#### 1. Iniciar el Servidor
```bash
cd mobile
npm start -- --offline
```

#### 2. Escanear QR en Ambos Teléfonos
- Abre Expo Go en ambos teléfonos
- Escanea el QR que aparece en la terminal

#### 3. Seguir los Pasos de la Opción 1

**⚠️ NOTA:** Google Sign-In NO funciona en Expo Go, solo en builds nativos.

---

## 🖥️ OPCIÓN 4: Prueba con 1 Dispositivo + Navegador Web (Si tienes web)

### Si tu app tiene versión web:

#### 1. Dispositivo Móvil
- Abre la app móvil
- Crea una sala

#### 2. Navegador Web
- Abre la app en el navegador
- Únete a la sala

#### 3. Vota desde el móvil
- Observa la actualización en el navegador

---

## 🔍 OPCIÓN 5: Prueba con Logs (Sin segundo dispositivo)

Si solo tienes 1 dispositivo, puedes verificar que los eventos se están enviando:

### 1. Monitorear Logs de AppSync
```bash
aws logs tail /aws/appsync/apis/imx6fos5lnd3xkdchl4rqtv4pi --follow
```

### 2. Crear Sala y Votar
- Abre la app
- Crea una sala
- Vota por una película

### 3. Observar en los Logs
Deberías ver:
```
[INFO] Mutation: vote
[INFO] Publishing event to subscription: onVoteUpdateEnhanced
[INFO] Event published successfully
[INFO] Active subscriptions: 1
```

### 4. Monitorear Logs de Lambda
```bash
aws logs tail /aws/lambda/trinity-vote-dev --follow
```

Deberías ver:
```
[INFO] Processing vote for room: xxx
[INFO] Vote registered in DynamoDB
[INFO] Publishing event to AppSync
[INFO] Event published successfully
```

---

## 🎬 ESCENARIOS DE PRUEBA

### Escenario 1: Votación Básica ✅
**Objetivo:** Verificar que los votos se ven en tiempo real

1. Usuario A crea sala
2. Usuario B se une
3. Usuario A vota LIKE
4. **Verificar:** Usuario B ve el voto inmediatamente

**Resultado esperado:**
- ✅ Contador actualizado: "1/2 votos"
- ✅ Indicador de progreso: 50%
- ✅ Latencia < 500ms

---

### Escenario 2: Match Encontrado 🎉
**Objetivo:** Verificar notificación de match

1. Usuario A y B en la misma sala
2. Ambos votan LIKE en la misma película
3. **Verificar:** Ambos reciben notificación de match

**Resultado esperado:**
- ✅ Notificación "¡Match encontrado!"
- ✅ Información de película ganadora
- ✅ Ambos usuarios ven la misma información

---

### Escenario 3: Votos Diferentes ❌
**Objetivo:** Verificar que no hay match con votos diferentes

1. Usuario A y B en la misma sala
2. Usuario A vota LIKE
3. Usuario B vota DISLIKE
4. **Verificar:** No hay match, siguiente película

**Resultado esperado:**
- ✅ Contador: "2/2 votos"
- ✅ No hay match
- ✅ Siguiente película aparece

---

### Escenario 4: Múltiples Usuarios (3+) 👥
**Objetivo:** Verificar escalabilidad

1. Usuario A crea sala
2. Usuarios B, C, D se unen
3. Usuario A vota
4. **Verificar:** B, C, D ven el voto

**Resultado esperado:**
- ✅ Todos ven el voto de A
- ✅ Contador: "1/4 votos"
- ✅ Progreso: 25%

---

### Escenario 5: Reconexión 🔄
**Objetivo:** Verificar reconexión automática

1. Usuario A y B en sala votando
2. Usuario A activa modo avión (pierde conexión)
3. Usuario B vota
4. Usuario A desactiva modo avión
5. **Verificar:** Usuario A se reconecta y ve el voto de B

**Resultado esperado:**
- ✅ Reconexión automática
- ✅ Estado sincronizado
- ✅ Votos recuperados

---

### Escenario 6: Usuario Sale de la Sala 🚪
**Objetivo:** Verificar actualización de miembros

1. Usuario A, B, C en sala
2. Usuario C sale de la sala
3. **Verificar:** A y B ven que C salió

**Resultado esperado:**
- ✅ Lista de participantes actualizada
- ✅ Contador de miembros: 2/3
- ✅ Notificación "Usuario C salió"

---

## 🐛 QUÉ BUSCAR (Debugging)

### ✅ Señales de que FUNCIONA:

1. **En la UI:**
   - Contador de votos se actualiza solo
   - Indicadores de "votando..." aparecen
   - Progreso de votación cambia
   - Notificaciones aparecen automáticamente

2. **En los Logs de la App:**
   ```
   [AppSync] WebSocket connected
   [AppSync] Subscription active: onVoteUpdateEnhanced
   [AppSync] Event received: { type: 'VOTE_UPDATE', ... }
   [UI] Updating vote count: 1 -> 2
   ```

3. **En los Logs de AWS:**
   ```
   [Lambda] Vote processed successfully
   [AppSync] Event published to subscription
   [AppSync] 2 clients notified
   ```

### ❌ Señales de que NO FUNCIONA:

1. **En la UI:**
   - Necesitas refrescar para ver votos
   - Contador no cambia automáticamente
   - No aparecen notificaciones

2. **En los Logs de la App:**
   ```
   [AppSync] WebSocket connection failed
   [AppSync] Subscription error: ...
   [AppSync] No events received
   ```

3. **En los Logs de AWS:**
   ```
   [Lambda] Error publishing event
   [AppSync] No active subscriptions
   [AppSync] Event not delivered
   ```

---

## 📊 MÉTRICAS A MEDIR

### Latencia
**Cómo medir:**
1. Usuario A vota (anota la hora: T1)
2. Usuario B ve la actualización (anota la hora: T2)
3. Latencia = T2 - T1

**Objetivo:** < 500ms
**Típico:** 100-300ms

### Tasa de Éxito
**Cómo medir:**
1. Realizar 10 votos
2. Contar cuántos se ven en tiempo real
3. Tasa = (votos vistos / 10) × 100%

**Objetivo:** > 99%

### Reconexión
**Cómo medir:**
1. Perder conexión 5 veces
2. Contar cuántas veces se reconecta automáticamente
3. Tasa = (reconexiones exitosas / 5) × 100%

**Objetivo:** 100%

---

## 🎥 GRABACIÓN DE PRUEBAS

### Para Documentar:

1. **Graba la Pantalla de Ambos Dispositivos**
   - Android: Usa el grabador nativo
   - iOS: Usa el grabador nativo

2. **Sincroniza los Videos**
   - Pon ambos videos lado a lado
   - Verifica que las actualizaciones sean simultáneas

3. **Comparte el Video**
   - Sube a YouTube/Drive
   - Comparte con el equipo

---

## 🔧 TROUBLESHOOTING

### Problema: No veo actualizaciones en tiempo real

**Solución 1: Verifica la conexión WebSocket**
```javascript
// En mobile/src/services/appSyncService.ts
// Busca logs como:
console.log('WebSocket connected');
console.log('Subscription active');
```

**Solución 2: Verifica los tokens**
```bash
# Los tokens de Cognito expiran cada hora
# Cierra sesión y vuelve a iniciar
```

**Solución 3: Verifica los logs de AWS**
```bash
aws logs tail /aws/appsync/apis/imx6fos5lnd3xkdchl4rqtv4pi --follow
```

### Problema: Latencia muy alta (> 1 segundo)

**Solución 1: Verifica la conexión a internet**
```bash
# Prueba la latencia a AWS
ping appsync.eu-west-1.amazonaws.com
```

**Solución 2: Verifica la región**
- Tu AppSync está en `eu-west-1` (Irlanda)
- Si estás lejos, la latencia será mayor

**Solución 3: Verifica CloudWatch**
```bash
# Métricas de AppSync
aws cloudwatch get-metric-statistics \
  --namespace AWS/AppSync \
  --metric-name Latency \
  --dimensions Name=GraphQLAPIId,Value=epjtt2y3fzh53ii6omzj6n6h5a \
  --start-time 2026-01-15T00:00:00Z \
  --end-time 2026-01-15T23:59:59Z \
  --period 300 \
  --statistics Average
```

### Problema: Algunos usuarios no reciben actualizaciones

**Solución 1: Verifica que estén en la misma sala**
```javascript
// Verifica que roomId sea el mismo
console.log('Room ID:', roomId);
```

**Solución 2: Verifica las subscriptions**
```javascript
// Verifica que la subscription esté activa
console.log('Active subscriptions:', subscriptions);
```

**Solución 3: Verifica los permisos**
```bash
# Verifica que el usuario tenga permisos en Cognito
aws cognito-idp admin-get-user \
  --user-pool-id eu-west-1_6UxioIj4z \
  --username usuario@example.com
```

---

## ✅ CHECKLIST DE PRUEBAS

Usa este checklist para verificar que todo funciona:

### Funcionalidad Básica
- [ ] Usuario puede crear sala
- [ ] Usuario puede unirse a sala
- [ ] Usuario puede votar
- [ ] Votos se registran en DynamoDB

### Tiempo Real
- [ ] Votos se ven en tiempo real (< 500ms)
- [ ] Contador de votos se actualiza automáticamente
- [ ] Progreso de votación se actualiza
- [ ] Notificaciones de match aparecen

### Múltiples Usuarios
- [ ] 2 usuarios ven votos mutuamente
- [ ] 3+ usuarios ven todos los votos
- [ ] Match funciona con múltiples usuarios

### Reconexión
- [ ] Usuario se reconecta automáticamente
- [ ] Estado se sincroniza al reconectar
- [ ] Votos no se pierden

### Edge Cases
- [ ] Usuario sale de la sala → otros lo ven
- [ ] Usuario pierde conexión → se reconecta
- [ ] Votos simultáneos → todos se registran
- [ ] Match con votos diferentes → no hay match

---

## 📝 REPORTE DE PRUEBAS

Después de probar, documenta los resultados:

```markdown
# Reporte de Pruebas - Sistema de Tiempo Real

**Fecha:** [fecha]
**Probado por:** [tu nombre]

## Configuración
- Dispositivos: [ej: 2 Android físicos]
- Usuarios: [ej: usuario1@test.com, usuario2@test.com]
- Red: [ej: WiFi 100Mbps]

## Resultados

### Escenario 1: Votación Básica
- ✅ Funciona correctamente
- Latencia medida: 250ms
- Notas: Actualización instantánea

### Escenario 2: Match Encontrado
- ✅ Funciona correctamente
- Notificación apareció en ambos dispositivos
- Notas: Información correcta de película

### Escenario 3: Reconexión
- ⚠️ Funciona con delay
- Reconexión tomó 3 segundos
- Notas: Estado se sincronizó correctamente

## Problemas Encontrados
1. [Descripción del problema]
   - Solución aplicada: [...]
   - Estado: [Resuelto/Pendiente]

## Conclusión
[Resumen general de las pruebas]
```

---

## 🎯 PRÓXIMOS PASOS

Después de probar:

1. **Si todo funciona:** 🎉
   - Documenta los resultados
   - Comparte con el equipo
   - Considera pruebas de carga

2. **Si hay problemas:** 🔧
   - Revisa los logs de AWS
   - Verifica la configuración
   - Consulta la sección de Troubleshooting

3. **Optimización:** 📈
   - Mide la latencia promedio
   - Identifica cuellos de botella
   - Ajusta configuración si es necesario

---

**¿Necesitas ayuda?**

- Ejecuta: `node verify-appsync-cli.js`
- Revisa: `FINAL_STATUS_REPORT.md`
- Logs: `aws logs tail /aws/appsync/apis/imx6fos5lnd3xkdchl4rqtv4pi --follow`

---

**Generado por:** Kiro AI Assistant  
**Fecha:** 15 de Enero de 2026
