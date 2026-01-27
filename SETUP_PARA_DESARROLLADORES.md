# 🚀 CONFIGURACIÓN PARA NUEVOS DESARROLLADORES

## 🎯 ¿QUÉ QUIERES HACER?

### 📱 **SOLO PROBAR LA APP MÓVIL** → `GUIA_PROBAR_APP_MOVIL.md`
**¡No necesitas credenciales AWS!** La app funciona inmediatamente.

### 🔧 **DESARROLLAR BACKEND/LAMBDA** → Sigue esta guía
**Necesitas credenciales AWS** para modificar servicios.

---

## 📋 REQUISITOS PREVIOS (PARA DESARROLLO BACKEND)

Para trabajar en el backend del proyecto necesitas:
1. **Node.js** (versión 18 o superior)
2. **Git** configurado
3. **Credenciales AWS** del proyecto (solicitar al administrador)

---

## 🔑 OBTENER CREDENCIALES AWS

### Opción 1: Contactar al Administrador del Proyecto
- Solicitar las credenciales AWS al administrador del equipo
- Te proporcionarán:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - Región: `eu-west-1`

### Opción 2: Crear Usuario IAM (si tienes acceso a la cuenta AWS)
1. Ir a AWS Console → IAM → Users
2. Crear nuevo usuario con permisos:
   - `AWSLambdaFullAccess`
   - `AmazonDynamoDBFullAccess`
   - `AmazonS3FullAccess`
   - `CloudWatchLogsFullAccess`
3. Generar Access Keys

---

## ⚙️ CONFIGURACIÓN INICIAL

### 1. Clonar el Repositorio
```bash
git clone https://github.com/danilazar06/trinity_tfg.git
cd trinity_tfg
```

### 2. Instalar Dependencias
```bash
# Instalar dependencias principales
npm install

# Instalar dependencias de mobile
cd mobile
npm install
cd ..

# Instalar dependencias de infrastructure
cd infrastructure
npm install
cd ..
```

### 3. Configurar Variables de Entorno

#### Opción A: Archivo .env (RECOMENDADO)
Crear archivo `.env` en la raíz del proyecto:
```env
# AWS Configuration
AWS_ACCESS_KEY_ID=tu_access_key_aqui
AWS_SECRET_ACCESS_KEY=tu_secret_key_aqui
AWS_DEFAULT_REGION=eu-west-1

# TMDB API Key (opcional para desarrollo)
TMDB_API_KEY=tu_tmdb_api_key
```

#### Opción B: Variables de Entorno del Sistema

**Windows PowerShell:**
```powershell
$env:AWS_ACCESS_KEY_ID = "tu_access_key_aqui"
$env:AWS_SECRET_ACCESS_KEY = "tu_secret_key_aqui"
$env:AWS_DEFAULT_REGION = "eu-west-1"
```

**Linux/Mac:**
```bash
export AWS_ACCESS_KEY_ID="tu_access_key_aqui"
export AWS_SECRET_ACCESS_KEY="tu_secret_key_aqui"
export AWS_DEFAULT_REGION="eu-west-1"
```

#### Opción C: AWS CLI (RECOMENDADO para desarrollo)
```bash
# Instalar AWS CLI
npm install -g aws-cli

# Configurar credenciales
aws configure
# Introducir: Access Key, Secret Key, Region (eu-west-1), Output (json)
```

---

## 🧪 VERIFICAR CONFIGURACIÓN

### 1. Probar Conexión AWS
```bash
node verify-aws-config.js
```

**Salida esperada:**
```
✅ Autenticación exitosa!
✅ Lambda accesible. Funciones encontradas: 7
✅ DynamoDB accesible. Tablas encontradas: 8
🎉 ¡Configuración de AWS completamente funcional!
```

### 2. Probar Despliegue
```bash
node deploy-lambda-only.js
```

### 3. Probar Sistema de Filtrado
```bash
node test-simple-filtering.js
```

---

## 🛠️ COMANDOS DE DESARROLLO

### Backend/Lambda:
```bash
# Desplegar cambios en Lambda
node deploy-lambda-only.js

# Probar filtrado de contenido
node test-simple-filtering.js

# Limpiar salas de prueba
node clean-test-rooms.js
```

### Mobile (React Native):
```bash
cd mobile

# Desarrollo iOS
npm run ios

# Desarrollo Android
npm run android

# Web
npm run web
```

### Infrastructure (CDK):
```bash
cd infrastructure

# Desplegar infraestructura completa
npm run deploy

# Solo sintetizar (verificar cambios)
npm run synth
```

---

## 🚨 PROBLEMAS COMUNES

### Error: "Unable to locate credentials"
**Solución:**
1. Verificar que las variables de entorno están configuradas
2. Ejecutar `aws configure` si usas AWS CLI
3. Verificar que el archivo `.env` existe y tiene las credenciales correctas

### Error: "Access Denied"
**Solución:**
1. Verificar que las credenciales son correctas
2. Contactar al administrador para verificar permisos IAM
3. Asegurarse de usar la región correcta (`eu-west-1`)

### Error: "Function not found"
**Solución:**
1. Verificar que estás en la región correcta (`eu-west-1`)
2. Contactar al administrador para verificar que la infraestructura está desplegada

---

## 📁 ESTRUCTURA DEL PROYECTO

```
trinity_tfg/
├── mobile/                 # App React Native
├── infrastructure/         # AWS CDK + Lambda handlers
├── lambda-package-final/   # Código Lambda optimizado
├── scripts/               # Scripts de utilidad
├── .env.example          # Plantilla de variables de entorno
└── README.md             # Documentación principal
```

---

## 🔐 SEGURIDAD

### ✅ Hacer:
- Usar variables de entorno para credenciales
- Nunca commitear credenciales al repositorio
- Usar permisos IAM mínimos necesarios
- Rotar credenciales regularmente

### ❌ No hacer:
- Hardcodear credenciales en el código
- Compartir credenciales por email/chat
- Usar credenciales de producción para desarrollo
- Subir archivos `.env` al repositorio

---

## 📞 SOPORTE

### Si tienes problemas:
1. **Verificar configuración**: `node verify-aws-config.js`
2. **Revisar documentación**: `README.md` y `CONFIGURACION_AWS_CREDENCIALES.md`
3. **Contactar al equipo**: Solicitar ayuda al administrador del proyecto

### Recursos útiles:
- [AWS CLI Documentation](https://docs.aws.amazon.com/cli/)
- [React Native Setup](https://reactnative.dev/docs/environment-setup)
- [AWS CDK Guide](https://docs.aws.amazon.com/cdk/)

---

**📅 Última actualización**: 27 de enero de 2026  
**🔒 Estado de seguridad**: Credenciales externalizadas  
**🚀 Estado del proyecto**: Completamente funcional