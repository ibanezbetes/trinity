const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 COMPLETANDO MIGRACIÓN A REPOSITORIO TRINITY...\n');

const sourceDir = process.cwd(); // Current directory (trinity_tfg)
const targetDir = 'C:\\Users\\daniz\\Documents\\GitHub\\trinity';

// Files and directories to exclude from migration
const excludePatterns = [
    '.git',
    'node_modules',
    '.expo',
    'cdk.out',
    'dist',
    'build',
    '.DS_Store',
    'Thumbs.db',
    '*.log',
    '*.tmp',
    'android_backup_temp', // This causes Windows filename length issues
    'partner-debug.log',
    'last-error.json',
    'tatus',
    'deploy-error.log',
    'deploy-output-3.log',
    'test-output.log',
    'test-output-2.log',
    'eas-build-log.txt'
];

function shouldExclude(filePath) {
    const relativePath = path.relative(sourceDir, filePath);
    return excludePatterns.some(pattern => {
        if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(relativePath);
        }
        return relativePath.includes(pattern);
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
            console.log(`⏭️  Excluyendo: ${path.relative(sourceDir, srcPath)}`);
            continue;
        }
        
        const stat = fs.statSync(srcPath);
        
        if (stat.isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            try {
                fs.copyFileSync(srcPath, destPath);
                console.log(`✅ Copiado: ${path.relative(sourceDir, srcPath)}`);
            } catch (error) {
                console.log(`❌ Error copiando ${srcPath}: ${error.message}`);
            }
        }
    }
}

try {
    console.log('📁 Verificando directorio destino...');
    if (!fs.existsSync(targetDir)) {
        console.log('❌ El directorio destino no existe. Asegúrate de haber clonado el repositorio.');
        process.exit(1);
    }

    console.log('📋 Copiando archivos...');
    copyDirectory(sourceDir, targetDir);

    console.log('\n🔧 Configurando git en el nuevo repositorio...');
    process.chdir(targetDir);
    
    // Check git status
    console.log('📊 Estado actual del repositorio:');
    try {
        const status = execSync('git status --porcelain', { encoding: 'utf8' });
        if (status.trim()) {
            console.log('📝 Archivos pendientes de commit:');
            console.log(status);
        } else {
            console.log('✅ Repositorio limpio');
        }
    } catch (error) {
        console.log('⚠️  Error verificando estado git:', error.message);
    }

    console.log('\n🎯 MIGRACIÓN COMPLETADA');
    console.log('📍 Ubicación: ' + targetDir);
    console.log('\n📋 PRÓXIMOS PASOS:');
    console.log('1. cd "C:\\Users\\daniz\\Documents\\GitHub\\trinity"');
    console.log('2. git add .');
    console.log('3. git commit -m "Initial commit - Trinity project migration"');
    console.log('4. git push origin main');
    
    console.log('\n📱 PARA PROBAR LA APP MÓVIL:');
    console.log('1. cd mobile');
    console.log('2. npm install');
    console.log('3. npx expo start');
    
} catch (error) {
    console.error('❌ Error durante la migración:', error.message);
    process.exit(1);
}