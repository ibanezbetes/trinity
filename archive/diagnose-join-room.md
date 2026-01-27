# 🔍 Diagnóstico: Join Room desde Web

## Problema
No se puede unir a una sala desde la web cuando la sala fue creada desde la app móvil.

## Pasos para Diagnosticar

### 1. Verificar que la Sala Existe en DynamoDB

Abre AWS Console:
```
https://console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#item-explorer?table=trinity-rooms-dev
```

Busca la sala por `inviteCode` y verifica:
- ✅ La sala existe
- ✅ El campo `inviteCode` está presente
- ✅ El campo `isActive` es `true`
- ✅ El campo `status` es `active` o `waiting`

### 2. Verificar Logs en la Consola del Navegador

Abre la consola del navegador (F12) y busca:

**Logs esperados:**
```
🔄 Joining room via AWS AppSync...
📝 Invite code: ABC123
🚪 AppSyncService.joinRoomByInvite - InviteCode: ABC123
✅ Raw result from AppSync: { joinRoomByInvite: { ... } }
✅ Joined room via AppSync: { id: '...', name: '...', ... }
```

**Si ves errores:**
- `❌ AppSyncService.joinRoomByInvite - Full error:` → Copia el error completo
- `Authentication` o `Unauthorized` → Problema de autenticación
- `not found` o `Invalid` → Código incorrecto o sala no existe
- `Network request failed` → Problema de conectividad

### 3. Verificar Token de Autenticación

En la consola del navegador, ejecuta:
```javascript
// Verificar token en localStorage
localStorage.getItem('trinity_id_token')

// Verificar token en AsyncStorage (si estás en React Native)
AsyncStorage.getItem('cognitoTokens').then(tokens => console.log(JSON.parse(tokens)))
```

Si el token es `null` o está expirado:
1. Cierra sesión
2. Vuelve a iniciar sesión
3. Intenta unirte de nuevo

### 4. Verificar Logs de Lambda en AWS

Abre una terminal y ejecuta:
```bash
aws logs tail /aws/lambda/trinity-room-dev --follow --region eu-west-1
```

Luego intenta unirte a la sala desde la web y observa los logs en tiempo real.

**Logs esperados:**
```
START RequestId: xxx
🚪 JoinRoomByInvite - InviteCode: ABC123
✅ Room found: { id: '...', name: '...' }
✅ User added to room members
END RequestId: xxx
```

**Si ves errores:**
- `Room not found` → La sala no existe o el código es incorrecto
- `User already member` → Ya eres miembro de la sala
- `DynamoDB error` → Problema con la base de datos

### 5. Verificar Schema de AppSync

Verifica que el schema de AppSync tenga la mutation `joinRoomByInvite`:

```bash
# Ver schema actual
cat infrastructure/schema.graphql | grep -A 10 "joinRoomByInvite"
```

Debería mostrar:
```graphql
type Mutation {
  joinRoomByInvite(inviteCode: String!): Room
}
```

Si no existe, necesitas actualizar el schema:
```bash
cd infrastructure
node update-schema-now.js
```

### 6. Probar con curl (Prueba Manual)

Obtén tu token de autenticación y prueba manualmente:

```bash
# Reemplaza TOKEN con tu token real
# Reemplaza ABC123 con tu código de invitación

curl -X POST \
  https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "query": "mutation JoinRoom($inviteCode: String!) { joinRoomByInvite(inviteCode: $inviteCode) { id name description status hostId inviteCode memberCount } }",
    "variables": {
      "inviteCode": "ABC123"
    }
  }'
```

## Errores Comunes y Soluciones

### Error: "Authentication failed" o "Unauthorized"

**Causa:** Token expirado o inválido

**Solución:**
1. Cierra sesión en la web
2. Vuelve a iniciar sesión
3. Asegúrate de que el token se guarde correctamente

**Verificar:**
```javascript
// En la consola del navegador
console.log('Token:', localStorage.getItem('trinity_id_token'));
```

### Error: "Código de invitación inválido"

**Causa:** La sala no existe o el código es incorrecto

**Solución:**
1. Verifica que el código sea exactamente el mismo (mayúsculas/minúsculas)
2. Verifica en DynamoDB que la sala existe
3. Verifica que `isActive` sea `true`

**Verificar en DynamoDB:**
```bash
aws dynamodb scan \
  --table-name trinity-rooms-dev \
  --filter-expression "inviteCode = :code" \
  --expression-attribute-values '{":code":{"S":"ABC123"}}' \
  --region eu-west-1
```

### Error: "Network request failed"

**Causa:** No hay conexión a AWS o problema de CORS

**Solución:**
1. Verifica tu conexión a internet
2. Verifica que AppSync esté accesible
3. Verifica configuración de CORS en AppSync

**Verificar conectividad:**
```bash
curl -I https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql
```

### Error: "Ya eres miembro de esta sala"

**Causa:** El usuario ya está en la sala

**Solución:**
1. Esto es normal si ya te uniste antes
2. Puedes ir directamente a la sala
3. O salir de la sala y volver a unirte

### Error: "La sala está llena"

**Causa:** La sala alcanzó el límite de miembros

**Solución:**
1. Espera a que alguien salga
2. O pide al host que aumente el límite

## Checklist de Verificación

- [ ] La app móvil está corriendo (Expo)
- [ ] La web está abierta en el navegador
- [ ] Ambos usuarios están autenticados
- [ ] La sala existe en DynamoDB
- [ ] El código de invitación es correcto
- [ ] El token de autenticación es válido
- [ ] AppSync está accesible
- [ ] Lambda trinity-room-dev está activa
- [ ] Los logs no muestran errores

## Información de Configuración

**AppSync Endpoint:**
```
https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql
```

**Lambda Function:**
```
trinity-room-dev
```

**DynamoDB Tables:**
```
trinity-rooms-dev
trinity-room-members-dev
```

**Región:**
```
eu-west-1
```

## Próximos Pasos

1. Ejecuta cada paso de diagnóstico
2. Copia los errores exactos que veas
3. Comparte los logs para análisis más detallado
4. Verifica que todos los servicios AWS estén activos

---

**¿Necesitas ayuda?** Comparte:
- El error exacto de la consola del navegador
- Los logs de Lambda (si los tienes)
- El código de invitación que estás usando
- Si la sala aparece en DynamoDB
