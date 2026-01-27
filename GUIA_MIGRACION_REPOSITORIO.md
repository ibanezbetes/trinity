# 🚀 GUÍA: MIGRAR A REPOSITORIO NUEVO

## 🎯 OBJETIVO

Crear un repositorio completamente limpio sin historial de credenciales filtradas.

---

## ⚡ MIGRACIÓN AUTOMÁTICA (RECOMENDADO)

### Opción 1: Script de Node.js
```bash
node migrate-to-new-repo.js
```

### Opción 2: Script de PowerShell (Windows)
```powershell
.\migrate-to-new-repo.ps1
```

**¡Listo!** El script crea una carpeta `trinity-clean` con todo el proyecto limpio.

---

## 📋 QUÉ HACE EL SCRIPT AUTOMÁTICAMENTE

### ✅ Incluye:
- ✅ Todo el código fuente
- ✅ Documentación completa
- ✅ Configuración de proyecto
- ✅ Archivos .example
- ✅ Scripts de utilidad
- ✅ Estructura completa del proyecto

### ❌ Excluye:
- ❌ Historial de Git (.git)
- ❌ node_modules
- ❌ Archivos temporales (.expo, dist, build)
- ❌ Logs y archivos de debug
- ❌ Archivos de configuración local (.env, google-services.json)
- ❌ Archivos sensibles

---

## 🔧 PASOS DESPUÉS DE LA MIGRACIÓN

### 1. Ir al directorio limpio:
```bash
cd trinity-clean
```

### 2. Crear repositorio en GitHub:
- Ve a GitHub.com
- Crea un nuevo repositorio (ej: `trinity-app-clean`)
- **NO** inicialices con README (ya tienes uno)

### 3. Conectar con el nuevo repositorio:
```bash
git remote add origin https://github.com/tu-usuario/trinity-app-clean.git
git branch -M main
git push -u origin main
```

### 4. Verificar que todo funciona:
```bash
# Instalar dependencias
npm install

# Probar app móvil
cd mobile
npm install
npx expo start
```

---

## 🔐 BENEFICIOS DE LA MIGRACIÓN

### ✅ Seguridad:
- **Sin credenciales** en el historial de Git
- **Sin archivos sensibles** incluidos
- **Configuración segura** con variables de entorno

### ✅ Limpieza:
- **Sin archivos temporales** o logs
- **Sin node_modules** pesados
- **Estructura organizada** y clara

### ✅ Colaboración:
- **Documentación completa** para nuevos desarrolladores
- **Instrucciones claras** de configuración
- **Proceso de onboarding** definido

---

## 🚨 IMPORTANTE DESPUÉS DE LA MIGRACIÓN

### 1. Actualizar enlaces:
- Actualizar URL del repositorio en documentación
- Informar al equipo sobre el nuevo repositorio
- Actualizar enlaces en otros proyectos

### 2. Configurar protecciones:
- Activar branch protection en `main`
- Configurar GitHub Secrets para CI/CD
- Activar secret scanning (ya no debería detectar nada)

### 3. Archivar repositorio anterior:
- **NO eliminar** el repositorio anterior inmediatamente
- Marcarlo como "archived" en GitHub
- Agregar nota de redirección al nuevo repo

---

## 📁 ESTRUCTURA DEL PROYECTO MIGRADO

```
trinity-clean/
├── mobile/                 # App React Native
├── infrastructure/         # AWS CDK + Lambda
├── lambda-package-final/   # Código Lambda optimizado
├── scripts/               # Scripts de utilidad
├── .env.example          # Plantilla de configuración
├── README.md             # Documentación principal
├── GUIA_PROBAR_APP_MOVIL.md
├── SETUP_PARA_DESARROLLADORES.md
├── CONTACTO_ADMINISTRADOR.md
└── MIGRACION_COMPLETADA.md # Instrucciones post-migración
```

---

## 🎯 VERIFICACIÓN POST-MIGRACIÓN

### ✅ Checklist:
- [ ] Repositorio nuevo creado en GitHub
- [ ] Código subido sin errores
- [ ] App móvil funciona (`cd mobile && npx expo start`)
- [ ] Documentación accesible
- [ ] No hay credenciales en el código
- [ ] GitHub secret scanning no detecta problemas
- [ ] Equipo informado sobre el nuevo repositorio

---

## 📞 SI ALGO SALE MAL

### Problemas comunes:
1. **Error de Git**: Verificar que Git esté instalado
2. **Permisos**: Ejecutar como administrador si es necesario
3. **Archivos faltantes**: Verificar que no estén en .gitignore

### Migración manual:
Si los scripts fallan, puedes copiar manualmente:
1. Crear carpeta nueva
2. Copiar todos los archivos EXCEPTO `.git` y `node_modules`
3. Inicializar Git: `git init`
4. Hacer commit inicial: `git add . && git commit -m "Initial commit"`

---

**🎉 ¡Con esta migración tendrás un repositorio completamente limpio y seguro!**

**📅 Tiempo estimado:** 5-10 minutos  
**🔒 Resultado:** Repositorio sin credenciales filtradas  
**🚀 Estado:** Listo para desarrollo colaborativo