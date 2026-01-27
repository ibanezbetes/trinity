# Guía: Unirse a una Sala desde la Web

## Estado Actual ✅

La funcionalidad de unirse a una sala desde la web **ya está implementada** y usa el backend REST API como solución de respaldo mientras los credenciales de AWS están expirados.

### Cambios Realizados

1. **JoinRoomModal.tsx** - Modificado para usar el backend REST API directamente
2. **secureTokenStorage.ts** - Configurado para usar localStorage en web
3. **Backend REST API** - Endpoint `/rooms/join` funcionando correctamente

## Cómo Probar la Funcionalidad

### Paso 1: Asegúrate de que el Backend está Corriendo

```bash
cd backend
npm run start:dev
```

Deberías ver:
```
[Nest] INFO [NestApplication] Nest application successfully started
```

### Paso 2: Crear una Sala desde el Móvil

1. Abre la app en el móvil/emulador Android
2. Inicia sesión con: `test@trinity.com` / `Trinity2024!`
3. Crea una nueva sala
4. **Copia el código de invitación** (6 caracteres, ej: ABC123)

### Paso 3: Unirse desde la Web

1. Abre la app en el navegador web
2. Inicia sesión con una cuenta diferente (ej: `test2@trinity.com` / `Trinity2024!`)
3. Haz clic en "Unirse a una sala"
4. Introduce el código de invitación que copiaste
5. Haz clic en "Unirse"

### Paso 4: Verificar que Funcionó

Si todo funciona correctamente, deberías ver:
- ✅ Mensaje de confirmación: "¡Te has unido! Ahora eres parte de [nombre de la sala]"
- ✅ La sala aparece en tu lista de salas
- ✅ Puedes ver los detalles de la sala

## Solución de Problemas

### Error: "Código de invitación inválido o expirado"

**Causas posibles:**
- El código está mal escrito (debe ser exactamente 6 caracteres)
- La sala fue eliminada o desactivada
- El código no existe

**Solución:**
1. Verifica que el código esté correcto
2. Crea una nueva sala desde el móvil y usa ese código
3. Asegúrate de que la sala esté activa

### Error: "Tu sesión ha expirado"

**Causa:** No estás autenticado o el token expiró

**Solución:**
1. Cierra sesión y vuelve a iniciar sesión
2. Verifica que puedes ver tu perfil/salas
3. Intenta unirte de nuevo

### Error: "Ya eres miembro de esta sala"

**Causa:** Ya te uniste a esta sala anteriormente

**Solución:**
- Esto es normal, simplemente ve a tu lista de salas para acceder a ella

### Error: "La sala está llena"

**Causa:** La sala alcanzó su límite de miembros

**Solución:**
- Pide al creador que aumente el límite de miembros
- O únete a otra sala

### Error de Red / Timeout

**Causas posibles:**
- El backend no está corriendo
- Problemas de conexión
- CORS no configurado correctamente

**Solución:**
1. Verifica que el backend esté corriendo en `http://localhost:3000`
2. Prueba acceder a `http://localhost:3000/health` en el navegador
3. Revisa la consola del navegador para errores de CORS

## Prueba Automatizada

Puedes usar el script de prueba para verificar que todo funciona:

```bash
# 1. Actualiza el código de invitación en el archivo
# Edita test-join-room-web.js y cambia TEST_INVITE_CODE

# 2. Ejecuta el test
node test-join-room-web.js
```

El script probará:
- ✅ Login con credenciales de prueba
- ✅ Obtención del token de autenticación
- ✅ Llamada al endpoint de unirse a sala
- ✅ Verificación de la respuesta

## Detalles Técnicos

### Flujo de Autenticación

1. Usuario inicia sesión → Cognito devuelve tokens
2. Tokens se guardan en `localStorage` (web) o `SecureStore` (móvil)
3. Al unirse a sala, se lee el token de `localStorage`
4. Token se envía en header `Authorization: Bearer <token>`
5. Backend valida el token con Cognito
6. Si es válido, añade al usuario a la sala

### Endpoint REST API

```
POST http://localhost:3000/rooms/join
Headers:
  Content-Type: application/json
  Authorization: Bearer <id_token>
Body:
  {
    "inviteCode": "ABC123"
  }
```

### Respuesta Exitosa

```json
{
  "id": "uuid-de-la-sala",
  "name": "Nombre de la Sala",
  "inviteCode": "ABC123",
  "isActive": true,
  "creatorId": "uuid-del-creador",
  "filters": { ... },
  "masterList": [ ... ],
  "createdAt": "2026-01-20T...",
  "updatedAt": "2026-01-20T..."
}
```

## Próximos Pasos (Cuando AWS Credentials Estén Disponibles)

Una vez que ejecutes `aws sso login` y renueves tus credenciales:

1. **Verificar AppSync Schema:**
   ```bash
   node check-appsync-resolvers.js
   ```

2. **Actualizar Schema si es necesario:**
   ```bash
   node update-appsync-schema.js
   ```

3. **Cambiar a AppSync GraphQL:**
   - El código ya está preparado para usar AppSync
   - Solo necesitas que el resolver `joinRoomByInvite` esté configurado
   - La app intentará usar AppSync primero, y si falla, usará REST API

## Notas Importantes

- ✅ **La funcionalidad ya está implementada y funcionando**
- ✅ **Usa REST API como respaldo confiable**
- ⏳ **AppSync GraphQL está preparado pero requiere credenciales AWS válidas**
- 🔒 **Los tokens se manejan de forma segura en localStorage (web) y SecureStore (móvil)**
- 🌐 **Funciona tanto en web como en móvil con el mismo código**

## Contacto y Soporte

Si encuentras problemas:
1. Revisa la consola del navegador (F12 → Console)
2. Revisa los logs del backend
3. Usa el script de prueba para diagnosticar
4. Verifica que todos los servicios estén corriendo
