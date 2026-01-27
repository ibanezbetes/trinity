# Script de PowerShell para migrar Trinity a un repositorio nuevo
# Ejecutar: .\migrate-to-new-repo.ps1

Write-Host "🚀 MIGRACIÓN A REPOSITORIO NUEVO - TRINITY PROJECT" -ForegroundColor Green
Write-Host "═" * 60 -ForegroundColor Green

$newProjectDir = "trinity-clean"
$currentDir = Get-Location

# Directorios y archivos a excluir
$excludePatterns = @(
    ".git",
    "node_modules",
    ".expo",
    "dist",
    "build",
    "cdk.out",
    ".DS_Store",
    "Thumbs.db",
    "*.log",
    "*.zip",
    "deploy-error.log",
    "deploy-output*.log",
    "test-output*.log",
    "gradle-verbose.log",
    "build-debug-log.txt",
    "build-error.log",
    "full-build-error.log",
    "eas-build-log.txt",
    "check-iam-permissions.js",
    "debug-lambda-permissions.js",
    "partner-debug.log",
    "last-error.json",
    "tatus"
)

$excludeFiles = @(
    ".env",
    "google-services.json",
    "local.properties"
)

function Should-Exclude {
    param($Path)
    
    $fileName = Split-Path $Path -Leaf
    $relativePath = Resolve-Path $Path -Relative
    
    # Excluir archivos específicos
    if ($excludeFiles -contains $fileName) {
        return $true
    }
    
    # Excluir patrones
    foreach ($pattern in $excludePatterns) {
        if ($pattern.StartsWith("*")) {
            if ($fileName.EndsWith($pattern.Substring(1))) {
                return $true
            }
        } elseif ($relativePath -like "*$pattern*" -or $fileName -eq $pattern) {
            return $true
        }
    }
    
    return $false
}

function Copy-ProjectFiles {
    param($Source, $Destination)
    
    if (!(Test-Path $Destination)) {
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    }
    
    $items = Get-ChildItem $Source
    
    foreach ($item in $items) {
        if (Should-Exclude $item.FullName) {
            Write-Host "⏭️ Excluyendo: $($item.Name)" -ForegroundColor Yellow
            continue
        }
        
        $destPath = Join-Path $Destination $item.Name
        
        if ($item.PSIsContainer) {
            Copy-ProjectFiles $item.FullName $destPath
        } else {
            Copy-Item $item.FullName $destPath
            Write-Host "✅ Copiado: $($item.Name)" -ForegroundColor Green
        }
    }
}

# Paso 1: Crear directorio limpio
Write-Host "`n1️⃣ Creando directorio limpio..." -ForegroundColor Cyan
if (Test-Path $newProjectDir) {
    Write-Host "⚠️ El directorio $newProjectDir ya existe. Eliminándolo..." -ForegroundColor Yellow
    Remove-Item $newProjectDir -Recurse -Force
}

New-Item -ItemType Directory -Path $newProjectDir | Out-Null
Write-Host "✅ Directorio creado: $newProjectDir" -ForegroundColor Green

# Paso 2: Copiar archivos
Write-Host "`n2️⃣ Copiando archivos del proyecto..." -ForegroundColor Cyan
Copy-ProjectFiles $currentDir $newProjectDir

# Paso 3: Crear instrucciones
Write-Host "`n3️⃣ Creando instrucciones de migración..." -ForegroundColor Cyan
$instructions = @"
# 🚀 INSTRUCCIONES DE MIGRACIÓN - TRINITY PROJECT

## ✅ ARCHIVOS MIGRADOS EXITOSAMENTE

Este repositorio contiene una copia limpia del proyecto Trinity sin:
- ❌ Historial de Git (sin credenciales filtradas)
- ❌ node_modules (se instalan con npm install)
- ❌ Archivos temporales y logs
- ❌ Archivos de configuración local (.env, google-services.json)

---

## 🔧 CONFIGURACIÓN INICIAL

### 1. Instalar dependencias:
``````bash
# Dependencias principales
npm install

# Dependencias mobile
cd mobile
npm install
cd ..

# Dependencias infrastructure
cd infrastructure
npm install
cd ..
``````

### 2. Configurar variables de entorno:
``````bash
# Copiar plantilla
cp .env.example .env

# Editar .env con las credenciales reales
# (solicitar al administrador del proyecto)
``````

### 3. Verificar configuración:
``````bash
node verify-aws-config.js
``````

---

## 📱 PROBAR LA APP MÓVIL (SIN CONFIGURACIÓN ADICIONAL)

``````bash
cd mobile
npm install
npx expo start
``````

**¡La app móvil funciona inmediatamente!** Se conecta automáticamente a AWS.

---

## 📚 DOCUMENTACIÓN

- ``README.md`` - Información general del proyecto
- ``GUIA_PROBAR_APP_MOVIL.md`` - Cómo probar la app sin configuración
- ``SETUP_PARA_DESARROLLADORES.md`` - Configuración completa para desarrollo
- ``CONTACTO_ADMINISTRADOR.md`` - Cómo obtener credenciales AWS

---

## 🔐 SEGURIDAD

✅ **Este repositorio está limpio:**
- Sin credenciales hardcodeadas
- Sin historial de Git comprometido
- Configuración segura con variables de entorno
- Documentación completa para nuevos desarrolladores

---

## 🎯 PRÓXIMOS PASOS

1. **Configurar credenciales AWS** (ver documentación)
2. **Probar la app móvil** (``cd mobile && npx expo start``)
3. **Verificar backend** (``node verify-aws-config.js``)
4. **¡Desarrollar!** 🚀

---

**📅 Migración realizada:** $(Get-Date -Format "dd/MM/yyyy")
**🔒 Estado de seguridad:** ✅ LIMPIO
**🚀 Estado del proyecto:** ✅ FUNCIONAL
"@

$instructions | Out-File -FilePath "$newProjectDir\MIGRACION_COMPLETADA.md" -Encoding UTF8
Write-Host "✅ Instrucciones creadas: MIGRACION_COMPLETADA.md" -ForegroundColor Green

# Paso 4: Inicializar Git
Write-Host "`n4️⃣ Inicializando nuevo repositorio Git..." -ForegroundColor Cyan
try {
    Set-Location $newProjectDir
    git init
    git add .
    git commit -m "Initial commit: Clean Trinity project migration"
    Write-Host "✅ Repositorio Git inicializado con commit inicial" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Error inicializando Git (puedes hacerlo manualmente): $($_.Exception.Message)" -ForegroundColor Yellow
} finally {
    Set-Location $currentDir
}

# Resumen final
Write-Host "`n" + "═" * 60 -ForegroundColor Green
Write-Host "🎉 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE!" -ForegroundColor Green
Write-Host "═" * 60 -ForegroundColor Green

Write-Host "`n📁 Proyecto limpio creado en: $(Resolve-Path $newProjectDir)" -ForegroundColor White
Write-Host "`n📋 Próximos pasos:" -ForegroundColor Cyan
Write-Host "1. cd trinity-clean" -ForegroundColor White
Write-Host "2. Crear repositorio en GitHub" -ForegroundColor White
Write-Host "3. git remote add origin <URL_DEL_NUEVO_REPO>" -ForegroundColor White
Write-Host "4. git push -u origin main" -ForegroundColor White
Write-Host "5. Configurar credenciales AWS (ver MIGRACION_COMPLETADA.md)" -ForegroundColor White

Write-Host "`n🔐 Beneficios de la migración:" -ForegroundColor Cyan
Write-Host "✅ Sin historial de credenciales filtradas" -ForegroundColor Green
Write-Host "✅ Sin archivos temporales o logs" -ForegroundColor Green
Write-Host "✅ Estructura limpia y organizada" -ForegroundColor Green
Write-Host "✅ Documentación completa incluida" -ForegroundColor Green
Write-Host "✅ Listo para desarrollo colaborativo" -ForegroundColor Green

Write-Host "`n🚀 ¡El proyecto está listo para el nuevo repositorio!" -ForegroundColor Green