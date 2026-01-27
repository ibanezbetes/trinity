const { spawn } = require('child_process');
const path = require('path');

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    console.log(`\n📦 Ejecutando: ${command} ${args.join(' ')}`);
    console.log(`📁 En directorio: ${cwd}\n`);
    
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      stdio: 'inherit'
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Comando falló con código ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function installDependencies() {
  console.log('🚀 Instalando todas las dependencias del proyecto Trinity...\n');
  console.log('=' .repeat(60));

  const rootDir = __dirname;
  
  try {
    // 1. Root
    console.log('\n1️⃣ INSTALANDO DEPENDENCIAS DEL ROOT');
    console.log('=' .repeat(60));
    await runCommand('npm', ['install'], rootDir);
    console.log('✅ Root completado\n');

    // 2. Backend
    console.log('\n2️⃣ INSTALANDO DEPENDENCIAS DEL BACKEND');
    console.log('=' .repeat(60));
    const backendDir = path.join(rootDir, 'backend');
    await runCommand('npm', ['install', '--legacy-peer-deps'], backendDir);
    console.log('✅ Backend completado\n');

    // 3. Mobile
    console.log('\n3️⃣ INSTALANDO DEPENDENCIAS DEL MOBILE');
    console.log('=' .repeat(60));
    const mobileDir = path.join(rootDir, 'mobile');
    await runCommand('npm', ['install'], mobileDir);
    console.log('✅ Mobile completado\n');

    // 4. Infrastructure
    console.log('\n4️⃣ INSTALANDO DEPENDENCIAS DE INFRASTRUCTURE');
    console.log('=' .repeat(60));
    const infraDir = path.join(rootDir, 'infrastructure');
    await runCommand('npm', ['install'], infraDir);
    console.log('✅ Infrastructure completado\n');

    console.log('\n' + '=' .repeat(60));
    console.log('🎉 ¡TODAS LAS DEPENDENCIAS INSTALADAS CORRECTAMENTE!');
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('\n❌ Error durante la instalación:', error.message);
    process.exit(1);
  }
}

installDependencies();
