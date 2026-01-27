# 🚀 SERVICIOS ACTIVOS - Trinity TFG

**Fecha:** 15 de Enero de 2026  
**Estado:** ✅ Backend y Frontend corriendo

---

## 📡 SERVICIOS CORRIENDO

### Backend (NestJS)
- **Estado:** ✅ Corriendo
- **URL:** http://localhost:3002
- **Process ID:** 8
- **Logs:** Disponibles en el proceso

### Frontend (Expo)
- **Estado:** ✅ Corriendo
- **URL:** exp://172.17.21.66:8081
- **Process ID:** 9
- **Modo:** Offline (sin EAS)

---

## 📱 CÓMO ACCEDER A LA APP

### Opción 1: Expo Go (Más Rápido)
1. Instala Expo Go en tu teléfono
2. Escanea el QR que aparece en la terminal
3. La app se abrirá automáticamente

### Opción 2: Emulador Android
```bash
# En otra terminal
npx expo run:android
```

### Opción 3: Emulador iOS (Solo Mac)
```bash
# En otra terminal
npx expo run:ios
```

---

## 👥 USUARIOS DISPONIBLES PARA LOGIN

### ✅ USUARIOS CONFIRMADOS (Listos para usar)

#### Usuario 1: Test Principal
- **Email:** `test@trinity.app`
- **Password:** `Trinity2024!` (o la que hayas configurado)
- **Estado:** ✅ CONFIRMED

#### Usuario 2: Test Secundario
- **Email:** `test@trinity.com`
- **Password:** `Trinity2024!`
- **Estado:** ✅ CONFIRMED

#### Usuario 3: Prueba
- **Email:** `prueba@prueba.com`
- **Password:** `Trinity2024!`
- **Estado:** ✅ CONFIRMED

#### Usuario 4: Paco
- **Email:** `paco@paco.com`
- **Password:** `Trinity2024!`
- **Estado:** ✅ CONFIRMED

#### Usuario 5: Dani
- **Email:** `dani@dani.com`
- **Password:** `Trinity2024!`
- **Estado:** ✅ CONFIRMED

#### Usuario 6: Dani Lazar
- **Email:** `danilazar@gmail.com`
- **Password:** `Trinity2024!`
- **Estado:** ✅ CONFIRMED

#### Usuario 7: Test Example
- **Email:** `test@example.com`
- **Password:** `Trinity2024!`
- **Estado:** ✅ CONFIRMED

---

## 🧪 RECOMENDACIÓN PARA PRUEBAS DE TIEMPO REAL

### Para probar con 2 usuarios:

**Dispositivo A:**
- Email: `test@trinity.app`
- Password: `Trinity2024!`

**Dispositivo B:**
- Email: `test@trinity.com`
- Password: `Trinity2024!`

### Pasos:
1. **Dispositivo A:** Crea una sala
2. **Dispositivo B:** Únete con el código
3. **Dispositivo A:** Vota por una película
4. **Dispositivo B:** Observa la actualización en tiempo real ✨

---

## ⚠️ USUARIOS CON PROBLEMAS

### Usuario con cambio de password requerido:
- **Email:** `d@dani.com`
- **Estado:** ⚠️ FORCE_CHANGE_PASSWORD
- **Acción:** Necesita cambiar password en primer login

### Usuarios no confirmados:
- `protexwear.dev@gmail.com` - ⚠️ UNCONFIRMED
- `danizgz95@gmail.com` - ⚠️ UNCONFIRMED
- `test-1767054571785@trinity.app` - ⚠️ UNCONFIRMED
- `test-1767296469317@trinity.app` - ⚠️ UNCONFIRMED
- `test-1767054503498@trinity.app` - ⚠️ UNCONFIRMED

**Nota:** Estos usuarios necesitan confirmar su email antes de poder usarlos.

---

## 🔧 COMANDOS ÚTILES

### Ver logs del Backend:
```bash
# En PowerShell
Get-Process | Where-Object {$_.Id -eq 8}
```

### Ver logs del Frontend:
```bash
# En PowerShell
Get-Process | Where-Object {$_.Id -eq 9}
```

### Detener servicios:
```bash
# Backend
Stop-Process -Id 8

# Frontend
Stop-Process -Id 9
```

### Reiniciar servicios:
```bash
# Backend
cd backend
npm run start:dev

# Frontend
cd mobile
npx expo start --offline
```

---

## 📊 MONITOREO EN TIEMPO REAL

Mientras pruebas, puedes monitorear los eventos:

```bash
node monitor-realtime-test.js
```

Esto te mostrará:
- 🗳️ Votos registrados
- 📡 Subscriptions activas
- 🎉 Matches encontrados
- ✅ Eventos publicados

---

## 🎯 PRUEBA RÁPIDA (5 minutos)

### 1. Abre la app en 2 dispositivos
- Escanea el QR en ambos

### 2. Inicia sesión
- Dispositivo A: `test@trinity.app`
- Dispositivo B: `test@trinity.com`

### 3. Crea sala (Dispositivo A)
- Toca "Crear Sala"
- Nombre: "Test Tiempo Real"
- Copia el código

### 4. Únete (Dispositivo B)
- Toca "Unirse"
- Pega el código

### 5. ¡VOTA! (Dispositivo A)
- Vota LIKE en una película

### 6. OBSERVA (Dispositivo B)
- ¿Ves el voto INMEDIATAMENTE?
- ✅ Si lo ves → ¡FUNCIONA!
- ❌ Si no lo ves → Revisa logs

---

## 🔍 VERIFICACIÓN DE INFRAESTRUCTURA

Para verificar que todo está bien:

```bash
node verify-appsync-cli.js
```

Deberías ver:
```
✅ AppSync API: Operativa
✅ Subscription Resolvers: 7
✅ No se detectaron problemas
```

---

## 📝 NOTAS IMPORTANTES

### Passwords:
- Si no sabes la password de un usuario, puedes resetearla desde AWS Console
- O crear un nuevo usuario desde la app (registro)

### Google Sign-In:
- ⚠️ NO funciona en Expo Go
- Solo funciona en builds nativos (development build)

### Offline Mode:
- El frontend está en modo offline (sin EAS)
- Esto es normal y esperado

---

## 🆘 TROUBLESHOOTING

### Problema: No puedo escanear el QR
**Solución:** Usa el comando `a` para abrir en Android o `w` para web

### Problema: Error de autenticación
**Solución:** Verifica que el usuario esté CONFIRMED en la lista

### Problema: No veo actualizaciones en tiempo real
**Solución:** 
1. Ejecuta `node monitor-realtime-test.js`
2. Revisa los logs
3. Verifica que ambos usuarios estén en la misma sala

---

## ✅ CHECKLIST

Antes de probar:
- [ ] Backend corriendo (puerto 3002)
- [ ] Frontend corriendo (Expo)
- [ ] 2 usuarios CONFIRMED disponibles
- [ ] 2 dispositivos listos
- [ ] Monitor de logs activo (opcional)

---

**¿Listo para probar?**

1. Abre la app en 2 dispositivos
2. Inicia sesión con los usuarios recomendados
3. Sigue la guía de pruebas
4. ¡Disfruta del tiempo real! ✨

---

**Generado por:** Kiro AI Assistant  
**Fecha:** 15 de Enero de 2026
