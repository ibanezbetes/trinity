# 📱 GUÍA: PROBAR LA APP MÓVIL TRINITY

## 🎉 ¡BUENAS NOTICIAS!

**La app móvil funciona INMEDIATAMENTE** sin necesidad de configurar credenciales AWS adicionales.

---

## ✅ ¿POR QUÉ FUNCIONA SIN CREDENCIALES?

La app móvil tiene toda la configuración AWS **hardcodeada** en el código y se conecta directamente a los servicios desplegados:

### 🔧 Configuración incluida en la app:
- **AppSync GraphQL Endpoint**: Ya configurado
- **Cognito User Pool**: Ya configurado  
- **WebSocket para tiempo real**: Ya configurado
- **Google Sign-In**: Ya configurado

### 📍 Archivos con configuración:
- `mobile/src/config/aws-config.ts` - Configuración principal
- `mobile/app.json` - Configuración de Expo
- `mobile/src/aws-exports.ts` - Configuración de Cognito

---

## 🚀 CÓMO PROBAR LA APP (PASO A PASO)

### 1. Clonar el repositorio:
```bash
git clone https://github.com/danilazar06/trinity_tfg.git
cd trinity_tfg
```

### 2. Ir a la carpeta mobile:
```bash
cd mobile
```

### 3. Instalar dependencias:
```bash
npm install
```

### 4. Ejecutar la app:

#### 📱 Para Android:
```bash
npm run android
```

#### 🍎 Para iOS:
```bash
npm run ios
```

#### 🌐 Para Web:
```bash
npm run web
```

#### 📲 Con Expo Go (más fácil):
```bash
npx expo start
```
Luego escanear el QR con la app Expo Go.

---

## 🎯 ¿QUÉ PUEDEN HACER SIN CONFIGURACIÓN ADICIONAL?

### ✅ Funcionalidades que funcionan inmediatamente:
- **Crear cuenta** (registro con email)
- **Iniciar sesión** (con email o Google)
- **Crear salas** de votación
- **Unirse a salas** con código de invitación
- **Buscar películas** (conecta a TMDB API)
- **Votar películas** en tiempo real
- **Ver recomendaciones** con IA
- **Recibir notificaciones** en tiempo real
- **Ver historial** de salas

### 🔄 Todo funciona porque se conecta a:
- **AWS AppSync** (GraphQL + WebSockets)
- **AWS Cognito** (Autenticación)
- **AWS Lambda** (Lógica de negocio)
- **AWS DynamoDB** (Base de datos)

---

## 📋 REQUISITOS MÍNIMOS

### 💻 Para desarrollo:
- **Node.js** 18+
- **npm** o **yarn**
- **Expo CLI** (se instala automáticamente)

### 📱 Para probar en dispositivo:
- **Expo Go** app (iOS/Android)
- O **Android Studio** (para Android)
- O **Xcode** (para iOS)

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### Error: "Metro bundler failed"
```bash
cd mobile
npm install
npx expo start --clear
```

### Error: "Network request failed"
- Verificar conexión a internet
- La app necesita internet para conectarse a AWS

### Error: "Google Sign-In not working"
- Funciona en dispositivos reales
- En simulador puede fallar (es normal)

### Error: "Can't connect to development server"
```bash
npx expo start --tunnel
```

---

## 🔍 VERIFICAR QUE TODO FUNCIONA

### 1. Abrir la app
### 2. Crear una cuenta nueva
### 3. Crear una sala de votación
### 4. Buscar películas
### 5. Votar por una película
### 6. Ver que funciona en tiempo real

---

## 🚨 ¿CUÁNDO SÍ NECESITAN CREDENCIALES AWS?

### ❌ NO necesitan credenciales para:
- **Probar la app móvil**
- **Desarrollar UI/UX**
- **Probar funcionalidades**
- **Hacer cambios en React Native**

### ✅ SÍ necesitan credenciales para:
- **Modificar funciones Lambda**
- **Cambiar esquema de base de datos**
- **Desplegar cambios en AWS**
- **Modificar configuración de AppSync**

---

## 📁 ESTRUCTURA DE ARCHIVOS IMPORTANTES

```
mobile/
├── src/
│   ├── config/
│   │   └── aws-config.ts          # ← Configuración AWS principal
│   ├── services/
│   │   ├── appSyncService.ts      # ← Cliente GraphQL
│   │   └── authService.ts         # ← Autenticación
│   └── aws-exports.ts             # ← Configuración Cognito
├── app.json                       # ← Configuración Expo
└── package.json                   # ← Dependencias
```

---

## 🎯 PARA COMPARTIR CON OTROS DESARROLLADORES

### Envía este mensaje:
```
🎉 ¡La app Trinity está lista para probar!

1. Clona: git clone https://github.com/danilazar06/trinity_tfg.git
2. Ve a mobile: cd trinity_tfg/mobile
3. Instala: npm install
4. Ejecuta: npx expo start

¡No necesitas configurar nada más! La app se conecta automáticamente a AWS.

📱 Prueba crear una sala, buscar películas y votar en tiempo real.
```

---

## 🔄 FLUJO DE DESARROLLO PARA OTROS

### Para cambios en la app móvil:
1. **Clonar** repositorio
2. **Instalar** dependencias
3. **Desarrollar** cambios en React Native
4. **Probar** con `npx expo start`
5. **Hacer commit** de cambios

### Para cambios en backend:
1. **Solicitar credenciales AWS** (ver `CONTACTO_ADMINISTRADOR.md`)
2. **Configurar** variables de entorno
3. **Modificar** funciones Lambda
4. **Desplegar** con `node deploy-lambda-only.js`

---

**🎉 RESUMEN: LA APP MÓVIL FUNCIONA INMEDIATAMENTE SIN CONFIGURACIÓN ADICIONAL**

**📱 Solo necesitan:** Node.js + npm install + npx expo start  
**🚀 Resultado:** App completamente funcional conectada a AWS  
**⏱️ Tiempo de setup:** 5 minutos máximo