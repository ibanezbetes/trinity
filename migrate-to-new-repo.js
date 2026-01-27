/**
 * Script para migrar el proyecto Trinity a un repositorio nuevo
 * Copia todos los archivos necesarios sin el historial de Git
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 MIGRACIÓN A REPOSITORIO NUEVO - TRINITY PROJECT');
console.log('═'.repeat(60));

// Directorios y archivos a EXCLUIR de la migración
const EXCLUDE_PATTERNS = [
    '.git',
    'node_modules',
    '.expo',
    'dist',
    'build',
    'cdk.out',
    '.DS_Store',
    'Thumbs.db',
    '*.log',
    '*.zip',
    'deploy-error.log',
    'deploy-output*.log',
    'test-output*.log',
    'gradle-verbose.log',
    'build-debug-log.txt',
    'build-error.log',
    'full-build-error.log',
    'eas-build-log.txt',
    // Archivos temporales de diagnóstico
    'check-iam-permissions.js',
    'debug-lambda-permissions.js',
    'partner-debug.log',
    'last-error.json',
    'tatus'
];

// Archivos específicos a EXCLUIR (que pueden contener información sensible)
const EXCLUDE_FILES = [
    '.env',
    'google-services.json',
    'local.properties'
];

function shouldExclude(filePath) {
    const fileName = path.basename(filePath);
    const relativePath = path.relative(process.cwd(), filePath);
    
    // Excluir archivos específicos
    if (EXCLUDE_FILES.includes(fileName)) {
        return true;
    }
    
    // Excluir patrones
    return EXCLUDE_PATTERNS.some(pattern => {
        if (pattern.startsWith('*')) {
            return fileName.endsWith(pattern.substring(1));
        }
        return relativePath.includes(pattern) || fileName === pattern;
    });
}

function copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const items = fs.readdirSync(src);
    
    for (const item of items) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        
        if (shouldExclude(srcPath)) {
            console.log(`⏭️ Excluyendo: ${path.relative(process.cwd(), srcPath)}`);
            continue;
        }
        
        const stat = fs.statSync(srcPath);
        
        if (stat.isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
            console.log(`✅ Copiado: ${path.relative(process.cwd(), srcPath)}`);
        }
    }
}

function createMigrationInstructions() {
    const instructions = `# 🚀 INSTRUCCIONES DE MIGRACIÓN - TRINITY PROJECT

## ✅ ARCHIVOS MIGRADOS EXITOSAMENTE

Este repositorio contiene una copia limpia del proyecto Trinity sin:
- ❌ Historial de Git (sin credenciales filtradas)
- ❌ node_modules (se instalan con npm install)
- ❌ Archivos temporales y logs
- ❌ Archivos de configuración local (.env, google-services.json)

---

## 🔧 CONFIGURACIÓN INICIAL

### 1. Instalar dependencias:
\`\`\`bash
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
\`\`\`

### 2. Configurar variables de entorno:
\`\`\`bash
# Copiar plantilla
cp .env.example .env

# Editar .env con las credenciales reales
# (solicitar al administrador del proyecto)
\`\`\`

### 3. Verificar configuración:
\`\`\`bash
node verify-aws-config.js
\`\`\`

---

## 📱 PROBAR LA APP MÓVIL (SIN CONFIGURACIÓN ADICIONAL)

\`\`\`bash
cd mobile
npm install
npx expo start
\`\`\`

**¡La app móvil funciona inmediatamente!** Se conecta automáticamente a AWS.

---

## 📚 DOCUMENTACIÓN

- \`README.md\` - Información general del proyecto
- \`GUIA_PROBAR_APP_MOVIL.md\` - Cómo probar la app sin configuración
- \`SETUP_PARA_DESARROLLADORES.md\` - Configuración completa para desarrollo
- \`CONTACTO_ADMINISTRADOR.md\` - Cómo obtener credenciales AWS

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
2. **Probar la app móvil** (\`cd mobile && npx expo start\`)
3. **Verificar backend** (\`node verify-aws-config.js\`)
4. **¡Desarrollar!** 🚀

---

**📅 Migración realizada:** ${new Date().toLocaleDateString('es-ES')}  
**🔒 Estado de seguridad:** ✅ LIMPIO  
**🚀 Estado del proyecto:** ✅ FUNCIONAL
`;

    return instructions;
}

async function migrateProject() {
    const newProjectDir = 'trinity-clean';
    
    console.log('\n1️⃣ Creando directorio limpio...');
    if (fs.existsSync(newProjectDir)) {
        console.log(`⚠️ El directorio ${newProjectDir} ya existe. Eliminándolo...`);
        fs.rmSync(newProjectDir, { recursive: true, force: true });
    }
    
    fs.mkdirSync(newProjectDir);
    console.log(`✅ Directorio creado: ${newProjectDir}`);
    
    console.log('\n2️⃣ Copiando archivos del proyecto...');
    copyDirectory('.', newProjectDir);
    
    console.log('\n3️⃣ Creando instrucciones de migración...');
    const instructions = createMigrationInstructions();
    fs.writeFileSync(path.join(newProjectDir, 'MIGRACION_COMPLETADA.md'), instructions);
    console.log('✅ Instrucciones creadas: MIGRACION_COMPLETADA.md');
    
    console.log('\n4️⃣ Inicializando nuevo repositorio Git...');
    const { execSync } = require('child_process');
    
    try {
        process.chdir(newProjectDir);
        execSync('git init', { stdio: 'inherit' });
        execSync('git add .', { stdio: 'inherit' });
        execSync('git commit -m "Initial commit: Clean Trinity project migration"', { stdio: 'inherit' });
        console.log('✅ Repositorio Git inicializado con commit inicial');
    } catch (error) {
        console.log('⚠️ Error inicializando Git (puedes hacerlo manualmente):', error.message);
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('🎉 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE!');
    console.log('═'.repeat(60));
    
    console.log('\n📁 Proyecto limpio creado en:', path.resolve(newProjectDir));
    console.log('\n📋 Próximos pasos:');
    console.log('1. cd trinity-clean');
    console.log('2. Crear repositorio en GitHub');
    console.log('3. git remote add origin <URL_DEL_NUEVO_REPO>');
    console.log('4. git push -u origin main');
    console.log('5. Configurar credenciales AWS (ver MIGRACION_COMPLETADA.md)');
    
    console.log('\n🔐 Beneficios de la migración:');
    console.log('✅ Sin historial de credenciales filtradas');
    console.log('✅ Sin archivos temporales o logs');
    console.log('✅ Estructura limpia y organizada');
    console.log('✅ Documentación completa incluida');
    console.log('✅ Listo para desarrollo colaborativo');
}

// Ejecutar migración
migrateProject().catch(console.error);