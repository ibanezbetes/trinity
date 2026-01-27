# 🔑 Google Sign-In Setup Guide - Trinity APK

## 📋 Información del Certificado

### SHA-1 Fingerprint (IMPORTANTE)
```
5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
```

### SHA-256 Fingerprint
```
FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

## 🚀 Pasos para Configurar Google Sign-In

### 1. Acceder a Google Cloud Console
1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Selecciona el proyecto: **trinity-mobile-app-bcb60**

### 2. Configurar OAuth 2.0 Client ID
1. Ve a **APIs & Services** > **Credentials**
2. Busca el **Android OAuth 2.0 client ID** existente
3. Haz clic en **Edit** (icono de lápiz)

### 3. Agregar SHA-1 Fingerprint
1. En la sección **SHA-1 certificate fingerprints**
2. Haz clic en **+ ADD FINGERPRINT**
3. Pega exactamente: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
4. Haz clic en **SAVE**

### 4. Verificar Configuración
Asegúrate de que tienes:
- **Package name**: `com.trinity.app`
- **SHA-1 fingerprint**: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

### 5. Esperar Propagación
- Los cambios pueden tardar **5-10 minutos** en propagarse
- Google necesita tiempo para actualizar sus servidores

## 📱 Información del APK Actual

### Configuración Actual
- **Package Name**: com.trinity.app
- **Google Web Client ID**: 230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com
- **Google Android Client ID**: 230498169556-ipt2iafpd75h17kjcsgmb89oc9u1ciii.apps.googleusercontent.com
- **Project ID**: trinity-mobile-app-bcb60
- **Project Number**: 230498169556

### APK Details
- **Ubicación**: `mobile/android/app/build/outputs/apk/release/app-release.apk`
- **Tamaño**: ~77MB
- **Fecha**: 24/01/2026 21:04
- **Certificado**: Debug keystore (válido hasta 2052)

## 🧪 Pruebas Después de la Configuración

### Antes de la Configuración (Estado Actual)
- ❌ Google Sign-In: "Error de configuración de Google..."
- ✅ Email/Password: Funciona correctamente
- ✅ Crear salas: Funciona
- ✅ Sistema de votación: Funciona con logging mejorado

### Después de la Configuración (Esperado)
- ✅ Google Sign-In: Debe funcionar completamente
- ✅ Email/Password: Sigue funcionando
- ✅ Todas las funcionalidades: Sin cambios

## 🔧 Troubleshooting

### Si Google Sign-In sigue fallando:
1. **Verifica el SHA-1**: Debe ser exactamente el de arriba
2. **Espera más tiempo**: Puede tardar hasta 15 minutos
3. **Reinstala la app**: Desinstala y vuelve a instalar el APK
4. **Limpia caché**: Ve a Configuración > Apps > Trinity > Almacenamiento > Limpiar caché

### Si aparecen otros errores:
1. **"App not verified"**: Normal en desarrollo, puedes continuar
2. **"This app isn't verified"**: Haz clic en "Advanced" > "Go to Trinity (unsafe)"
3. **"Sign in temporarily disabled"**: Espera unos minutos y reintenta

## 📞 Soporte

Si después de seguir estos pasos Google Sign-In no funciona:
1. Verifica que el SHA-1 esté correctamente configurado
2. Asegúrate de que el package name sea exactamente `com.trinity.app`
3. Espera al menos 10 minutos después de guardar los cambios
4. Reinstala la app completamente

---

**Nota**: El APK actual ya incluye todos los fixes necesarios. Solo necesitas configurar el SHA-1 fingerprint en Google Console para que Google Sign-In funcione completamente.