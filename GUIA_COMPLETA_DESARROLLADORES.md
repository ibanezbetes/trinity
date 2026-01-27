# 🚀 GUÍA COMPLETA PARA DESARROLLADORES - TRINITY

## 📱 ¿QUIERES PROBAR LA APP MÓVIL? (5 MINUTOS)

### ✅ ¡FUNCIONA INMEDIATAMENTE SIN CONFIGURACIÓN!

```bash
# 1. Clonar repositorio
git clone https://github.com/ibanezbetes/trinity.git
cd trinity

# 2. Ir a mobile y ejecutar
cd mobile
npm install
npx expo start

# 3. ¡Listo! Escanea el QR con Expo Go
```

**🎉 La app funciona completamente porque se conecta a AWS ya desplegado**

---

## 🔧 ¿QUIERES DESARROLLAR BACKEND? (NECESITAS CREDENCIALES)

### 📋 Requisitos:
- **Node.js** 18+
- **AWS CLI** configurado
- **Credenciales AWS** (solicitar al administrador)

### 🔑 Configurar Credenciales AWS:

#### Opción 1: Variables de entorno
```bash
set AWS_ACCESS_KEY_ID=tu_access_key_aqui
set AWS_SECRET_ACCESS_KEY=tu_secret_key_aqui
set AWS_DEFAULT_REGION=eu-west-1
```

#### Opción 2: AWS CLI
```bash
aws configure
# Introducir:
# - Access Key ID: [solicitar al admin]
# - Secret Access Key: [solicitar al admin]  
# - Region: eu-west-1
# - Output format: json
```

#### Opción 3: Archivo .env
```bash
# Crear archivo .env en la raíz del proyecto
AWS_ACCESS_KEY_ID=tu_access_key_aqui
AWS_SECRET_ACCESS_KEY=tu_secret_key_aqui
AWS_DEFAULT_REGION=eu-west-1
```

### 🚀 Comandos de desarrollo backend:

```bash
# Instalar dependencias
npm install

# Desplegar cambios en Lambda
node deploy-lambda-only.js

# Probar filtrado de contenido
node test-simple-filtering.js

# Limpiar salas de prueba
node clean-test-rooms.js

# Verificar configuración AWS
node verify-aws-config.js
```

---

## 📁 ESTRUCTURA DEL PROYECTO

```
trinity/
├── mobile/                    # 📱 App React Native
│   ├── src/
│   │   ├── config/           # Configuración AWS (ya incluida)
│   │   ├── services/         # Servicios de la app
│   │   └── components/       # Componentes UI
│   └── package.json
├── infrastructure/           # 🏗️ Infraestructura AWS
│   ├── lib/handlers/        # Funciones Lambda
│   └── src/services/        # Servicios backend
├── lambda-package-final/    # 📦 Código Lambda optimizado
│   ├── services/           # Servicios de filtrado
│   └── types/              # Tipos TypeScript
└── scripts/                # 🔧 Scripts de utilidad
```

---

## 🎯 FLUJOS DE TRABAJO

### 📱 Desarrollo Mobile (SIN credenciales AWS):
1. **Clonar** repositorio
2. **cd mobile && npm install**
3. **npx expo start**
4. **Desarrollar** cambios en React Native
5. **Probar** en tiempo real con Expo Go
6. **Commit** cambios

### 🔧 Desarrollo Backend (CON credenciales AWS):
1. **Configurar** credenciales AWS
2. **Modificar** código en `lambda-package-final/`
3. **Desplegar** con `node deploy-lambda-only.js`
4. **Probar** con scripts de testing
5. **Commit** cambios

### 🧪 Testing:
```bash
# Probar sistema de filtrado
node test-simple-filtering.js

# Probar creación de salas
node scripts/test-create-room.js

# Probar votación
node scripts/test-vote-backend.js
```

---

## 🔍 CARACTERÍSTICAS PRINCIPALES

### 🎬 Sistema de Filtrado Avanzado:
- **3 capas de filtrado**: Idioma → Descripción → Géneros
- **Algoritmo de prioridad**: AND logic → OR logic → Popular fallback
- **30 títulos por sala** con rotación automática
- **Sin repeticiones** dentro de la misma sala

### 🔐 Autenticación:
- **AWS Cognito** para gestión de usuarios
- **Google Sign-In** integrado
- **Registro con email** y verificación

### ⚡ Tiempo Real:
- **AWS AppSync** con WebSockets
- **Votación en tiempo real**
- **Sincronización automática** entre dispositivos

### 🎨 UI/UX:
- **React Native** con Expo
- **Diseño responsive**
- **Animaciones fluidas**
- **Tema oscuro/claro**

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### ❌ "Network request failed" en mobile:
- Verificar conexión a internet
- La app necesita internet para AWS

### ❌ "AWS credentials not found" en backend:
- Configurar credenciales AWS (ver sección anterior)
- Verificar con `node verify-aws-config.js`

### ❌ "Metro bundler failed" en mobile:
```bash
cd mobile
rm -rf node_modules
npm install
npx expo start --clear
```

### ❌ "Lambda deployment failed":
- Verificar credenciales AWS
- Verificar permisos IAM
- Revisar logs con `node check-lambda-logs.js`

---

## 📞 CONTACTO Y SOPORTE

### 🔑 Para obtener credenciales AWS:
- **Contactar al administrador del proyecto**
- **Proporcionar**: Nombre, email, propósito
- **Recibirás**: Access Key, Secret Key, región

### 📧 Para soporte técnico:
- **Crear issue** en GitHub
- **Incluir**: Logs de error, pasos para reproducir
- **Especificar**: Mobile o Backend

### 📚 Documentación adicional:
- `DOCUMENTACION_TECNICA_FILTRADO_AVANZADO.md` - Detalles técnicos
- `GUIA_RAPIDA_SISTEMA_FILTRADO.md` - Referencia rápida
- `CONFIGURACION_AWS_CREDENCIALES.md` - Setup AWS detallado

---

## 🎉 RESUMEN RÁPIDO

### 👨‍💻 Para desarrolladores Mobile:
```bash
git clone https://github.com/ibanezbetes/trinity.git
cd trinity/mobile
npm install
npx expo start
# ¡Listo! No necesitas nada más
```

### 👨‍💻 Para desarrolladores Backend:
```bash
git clone https://github.com/ibanezbetes/trinity.git
cd trinity
# 1. Solicitar credenciales AWS al admin
# 2. Configurar credenciales (ver guía arriba)
# 3. npm install
# 4. node verify-aws-config.js
# 5. ¡Listo para desarrollar!
```

**🚀 La app móvil funciona inmediatamente, el backend requiere credenciales AWS**