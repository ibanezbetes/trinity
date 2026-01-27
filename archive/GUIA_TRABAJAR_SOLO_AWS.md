# 🚀 Guía: Trabajar Solo con AWS (Sin Backend Local)

## ✅ Ventajas de Trabajar Directamente con AWS

1. **Entorno Real**: Pruebas en el mismo entorno que producción
2. **Sin Simulación**: No necesitas mantener backend local corriendo
3. **Escalabilidad Real**: Pruebas con auto-scaling y alta disponibilidad
4. **Tiempo Real**: WebSockets y subscriptions funcionan nativamente
5. **Menos Recursos**: No consume CPU/RAM de tu PC

## 📋 Requisitos Previos

### 1. Credenciales AWS Configuradas ✅

Configura tus credenciales en `backend/.env`:
```
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
```

### 2. Infraestructura Desplegada ✅

Ya está desplegada según `infrastructure/cdk-outputs.json`:
```
✅ AppSync API: https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql
✅ Cognito: eu-west-1_6UxioIj4z
✅ Lambda Functions: 6 funciones activas
✅ DynamoDB: 5 tablas activas
```

## 🎯 Configuración de la App Móvil

### Paso 1: Verificar Configuración AWS

El archivo `mobile/src/config/aws-config.ts` ya está configurado:

```typescript
export const AWS_CONFIG: AWSConfig = {
  region: 'eu-west-1',
  graphqlEndpoint: 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
  realtimeEndpoint: 'wss://imx6fos5lnd3xkdchl4rqtv4pi.appsync-realtime-api.eu-west-1.amazonaws.com/graphql',
  userPoolId: 'eu-west-1_6UxioIj4z',
  userPoolWebClientId: '59dpqsm580j14ulkcha19shl64',
  // ... más configuración
};
```

### Paso 2: Usar AppSync en Lugar de Backend Local

**ANTES (Backend Local):**
```typescript
const response = await fetch('http://localhost:3000/rooms/join', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ inviteCode })
});
```

**AHORA (AWS AppSync):**
```typescript
const room = await appSync.joinRoom({
  inviteCode: inviteCode.toUpperCase().trim()
});
```

### Paso 3: Configurar Variables de Entorno

Crea o actualiza `mobile/.env`:

```bash
# AWS Configuration
AWS_REGION=eu-west-1
APPSYNC_ENDPOINT=https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql
COGNITO_USER_POOL_ID=eu-west-1_6UxioIj4z
COGNITO_CLIENT_ID=59dpqsm580j14ulkcha19shl64

# External APIs
TMDB_API_KEY=dc4dbcd2404c1ca852f8eb964add267d
GOOGLE_WEB_CLIENT_ID=230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com

# Development Mode
USE_AWS_ONLY=true
```

## 🔧 Comandos para Desarrollo

### Iniciar App Móvil (Solo AWS)
```bash
cd mobile
npm start
```

**No necesitas iniciar el backend local** ❌

### Verificar Conexión con AWS
```bash
# Desde la raíz del proyecto
node trinity_tfg/test-aws-credentials.js
```

### Ver Logs de Lambda en Tiempo Real
```bash
# Instalar AWS CLI si no lo tienes
# Windows: choco install awscli
# Mac: brew install awscli

# Ver logs de una Lambda específica
aws logs tail /aws/lambda/trinity-room-dev --follow --region eu-west-1
aws logs tail /aws/lambda/trinity-vote-dev --follow --region eu-west-1
```

## 📊 Monitoreo y Debugging

### 1. CloudWatch Logs

Accede a los logs en AWS Console:
```
https://console.aws.amazon.com/cloudwatch/home?region=eu-west-1#logsV2:log-groups
```

Busca los log groups:
- `/aws/lambda/trinity-auth-dev`
- `/aws/lambda/trinity-room-dev`
- `/aws/lambda/trinity-vote-dev`
- `/aws/lambda/trinity-movie-dev`
- `/aws/lambda/trinity-ai-dev`

### 2. AppSync Console

Prueba queries directamente en AppSync:
```
https://console.aws.amazon.com/appsync/home?region=eu-west-1#/epjtt2y3fzh53ii6omzj6n6h5a/v1/queries
```

Ejemplo de query:
```graphql
query GetMyHistory {
  getMyHistory {
    id
    name
    description
    status
    memberCount
  }
}
```

### 3. DynamoDB Console

Ver datos en las tablas:
```
https://console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#tables
```

Tablas disponibles:
- `trinity-users-dev`
- `trinity-rooms-dev`
- `trinity-votes-dev`
- `trinity-room-members-dev`
- `trinity-movies-cache-dev`

## 🚀 Flujo de Desarrollo Completo

### 1. Hacer Cambios en el Código

```bash
# Editar handlers Lambda
cd infrastructure/src/handlers
# Editar auth.ts, room.ts, vote.ts, etc.
```

### 2. Desplegar Cambios a AWS

```bash
cd infrastructure
npm run build
cdk deploy --all
```

### 3. Probar en la App Móvil

```bash
cd mobile
npm start
# Presiona 'w' para web o escanea QR para móvil
```

### 4. Ver Logs en Tiempo Real

```bash
# En otra terminal
aws logs tail /aws/lambda/trinity-room-dev --follow --region eu-west-1
```

## 🎯 Casos de Uso Comunes

### Crear una Sala
```typescript
// En tu componente React Native
import { useAppSync } from '../services/apiClient';

const appSync = useAppSync();

const createRoom = async () => {
  const room = await appSync.createRoom({
    name: 'Mi Sala',
    description: 'Sala de prueba',
    isPrivate: false,
    maxMembers: 10
  });
  console.log('Sala creada:', room);
};
```

### Unirse a una Sala
```typescript
const joinRoom = async (inviteCode: string) => {
  const room = await appSync.joinRoom({
    inviteCode: inviteCode.toUpperCase()
  });
  console.log('Unido a sala:', room);
};
```

### Votar por una Película
```typescript
const vote = async (roomId: string, movieId: string) => {
  const result = await appSync.vote({
    roomId,
    movieId,
    voteType: 'YES'
  });
  console.log('Voto registrado:', result);
};
```

### Suscribirse a Actualizaciones en Tiempo Real
```typescript
const subscription = appSync.subscribeToRoomUpdates(roomId, (update) => {
  console.log('Actualización de sala:', update);
  // Actualizar UI
});

// Cancelar suscripción cuando el componente se desmonte
return () => subscription.unsubscribe();
```

## 🐛 Solución de Problemas

### Error: "Unauthorized" o "401"
**Causa**: Token de autenticación expirado o inválido

**Solución**:
```typescript
// Cerrar sesión y volver a iniciar
await authContext.logout();
await authContext.login(email, password);
```

### Error: "Network request failed"
**Causa**: No hay conexión a internet o AWS está caído

**Solución**:
1. Verificar conexión a internet
2. Verificar estado de AWS: https://status.aws.amazon.com/
3. Verificar credenciales AWS

### Error: "The provided key element does not match the schema"
**Causa**: Estructura de datos incorrecta en DynamoDB

**Solución**:
```bash
# Redesplegar Lambda con corrección
cd infrastructure
npm run build
cdk deploy TrinityMvpStack
```

### Lambda Timeout
**Causa**: Lambda tarda más de 30 segundos

**Solución**:
```typescript
// En infrastructure/lib/trinity-mvp-stack.ts
const lambda = new lambda.Function(this, 'Handler', {
  timeout: Duration.seconds(60), // Aumentar timeout
  // ...
});
```

## 💰 Costos de AWS

### Free Tier (Primer Año)
- **Lambda**: 1M requests/mes GRATIS
- **DynamoDB**: 25GB + 25 RCU/WCU GRATIS
- **AppSync**: 250K queries/mes GRATIS
- **Cognito**: 50K MAU GRATIS

### Estimación de Costos (Después del Free Tier)
Para 1000 usuarios activos/mes:
- Lambda: ~$0.20
- DynamoDB: ~$1.25
- AppSync: ~$4.00
- Cognito: ~$0.00 (dentro de free tier)
- **Total: ~$5.45/mes**

### Configurar Alertas de Presupuesto
```bash
# Crear alerta de presupuesto
aws budgets create-budget \
  --account-id 847850007406 \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
```

## 📚 Recursos Adicionales

### Documentación AWS
- [AppSync Developer Guide](https://docs.aws.amazon.com/appsync/)
- [Lambda Developer Guide](https://docs.aws.amazon.com/lambda/)
- [DynamoDB Developer Guide](https://docs.aws.amazon.com/dynamodb/)
- [Cognito Developer Guide](https://docs.aws.amazon.com/cognito/)

### Herramientas Útiles
- **AWS Console**: https://console.aws.amazon.com/
- **AWS CLI**: https://aws.amazon.com/cli/
- **AWS CDK**: https://docs.aws.amazon.com/cdk/
- **NoSQL Workbench**: Para diseñar tablas DynamoDB

### Scripts de Utilidad
```bash
# Ver todas las Lambdas
aws lambda list-functions --region eu-west-1

# Ver todas las tablas DynamoDB
aws dynamodb list-tables --region eu-west-1

# Ver logs recientes de una Lambda
aws logs tail /aws/lambda/trinity-room-dev --since 1h --region eu-west-1

# Invocar Lambda manualmente
aws lambda invoke \
  --function-name trinity-room-dev \
  --payload '{"body": "{\"name\": \"Test Room\"}"}' \
  --region eu-west-1 \
  response.json
```

## ✅ Checklist de Configuración

- [x] Credenciales AWS configuradas
- [x] Infraestructura desplegada en AWS
- [x] App móvil configurada con endpoints AWS
- [x] JoinRoomModal actualizado para usar AppSync
- [ ] Probar crear sala desde la app
- [ ] Probar unirse a sala desde la app
- [ ] Probar votación en tiempo real
- [ ] Configurar alertas de presupuesto
- [ ] Documentar flujos de trabajo del equipo

## 🎉 ¡Listo!

Ahora puedes desarrollar **sin necesidad del backend local**. Todo funciona directamente con AWS:

```bash
# Solo necesitas esto:
cd mobile
npm start

# ¡Y listo! 🚀
```

**Ventajas:**
- ✅ Entorno real de producción
- ✅ Tiempo real con WebSockets
- ✅ Escalabilidad automática
- ✅ Menos recursos en tu PC
- ✅ Logs centralizados en CloudWatch

**Desventajas:**
- ❌ Necesitas internet
- ❌ Costos después del free tier
- ❌ Debugging más complejo (pero con CloudWatch es manejable)

---

**¿Preguntas?** Revisa la sección de Solución de Problemas o consulta los logs en CloudWatch.