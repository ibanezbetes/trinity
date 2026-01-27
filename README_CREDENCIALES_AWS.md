# 🚀 CONFIGURACIÓN RÁPIDA DE CREDENCIALES AWS

## ⚡ CONFIGURACIÓN INMEDIATA (5 minutos)

### 1. Configurar Variables de Entorno (RECOMENDADO)

#### Windows PowerShell:
```powershell
# Ejecutar estos comandos en PowerShell (reemplazar con credenciales reales)
$env:AWS_ACCESS_KEY_ID = "YOUR_ACCESS_KEY_ID"
$env:AWS_SECRET_ACCESS_KEY = "YOUR_SECRET_ACCESS_KEY"
$env:AWS_DEFAULT_REGION = "eu-west-1"

# Verificar configuración
node verify-aws-config.js
```

**⚠️ IMPORTANTE**: Reemplazar `YOUR_ACCESS_KEY_ID` y `YOUR_SECRET_ACCESS_KEY` con las credenciales reales del proyecto. Ver `CREDENCIALES_REALES_UBICACION.md` para obtener las credenciales reales.

#### Linux/Mac:
```bash
# Ejecutar estos comandos en terminal (reemplazar con credenciales reales)
export AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="YOUR_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="eu-west-1"

# Verificar configuración
node verify-aws-config.js
```

**⚠️ IMPORTANTE**: Reemplazar `YOUR_ACCESS_KEY_ID` y `YOUR_SECRET_ACCESS_KEY` con las credenciales reales del proyecto.

### 2. Verificar que Funciona
```bash
# Debe mostrar "✅ Configuración de AWS completamente funcional!"
node verify-aws-config.js
```

### 3. Probar Despliegue
```bash
# Debe funcionar sin errores de credenciales
node deploy-lambda-only.js
```

---

## 🔧 ALTERNATIVA: Archivo .env

### 1. Crear archivo `.env` en la raíz del proyecto:
```env
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_ACCESS_KEY
AWS_DEFAULT_REGION=eu-west-1
TMDB_API_KEY=tu_tmdb_api_key
```

**⚠️ IMPORTANTE**: Reemplazar con las credenciales reales del proyecto.

### 2. Instalar dotenv (si no está instalado):
```bash
npm install dotenv
```

### 3. Cargar variables en scripts que las necesiten:
```javascript
// Al inicio del archivo
require('dotenv').config();

// Luego usar normalmente
AWS.config.update({ 
  region: process.env.AWS_DEFAULT_REGION || 'eu-west-1'
});
```

---

## 🚨 SOLUCIÓN DE PROBLEMAS COMUNES

### Error: "Unable to locate credentials"
```bash
# Verificar variables de entorno
echo $AWS_ACCESS_KEY_ID    # Linux/Mac
echo $env:AWS_ACCESS_KEY_ID # Windows PowerShell

# Si están vacías, configurar de nuevo:
export AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY_ID"  # Linux/Mac
$env:AWS_ACCESS_KEY_ID = "YOUR_ACCESS_KEY_ID"   # Windows
```

### Error: "Access Denied"
```bash
# Las credenciales están configuradas pero no tienen permisos
# Contactar al administrador de AWS para verificar permisos IAM
```

### Error: "Region not specified"
```bash
# Configurar región
export AWS_DEFAULT_REGION="eu-west-1"    # Linux/Mac
$env:AWS_DEFAULT_REGION = "eu-west-1"     # Windows
```

---

## 📋 CHECKLIST RÁPIDO

- [ ] Variables de entorno configuradas
- [ ] `node verify-aws-config.js` muestra ✅
- [ ] `node deploy-lambda-only.js` funciona
- [ ] `node test-simple-filtering.js` funciona

---

## 📞 AYUDA ADICIONAL

- **Documentación completa**: `CONFIGURACION_AWS_CREDENCIALES.md`
- **Credenciales reales**: `CREDENCIALES_REALES_UBICACION.md`
- **Verificación**: `node verify-aws-config.js`
- **Scripts de prueba**: `node test-simple-filtering.js`

---

**⏱️ Tiempo estimado de configuración**: 5 minutos  
**🎯 Resultado esperado**: Todos los scripts funcionando sin errores de credenciales