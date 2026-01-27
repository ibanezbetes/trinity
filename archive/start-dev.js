const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Iniciando Trinity - Backend + Frontend\n');
console.log('=' .repeat(60));

const processes = [];

// Función para iniciar un proceso
function startProcess(name, command, args, cwd, color) {
  console.log(`\n${color}📦 Iniciando ${name}...`);
  console.log(`   Comando: ${command} ${args.join(' ')}`);
  console.log(`   Directorio: ${cwd}\x1b[0m\n`);

  const proc = spawn(command, args, {
    cwd,
    shell: true,
    stdio: 'pipe'
  });

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        console.log(`${color}[${name}]\x1b[0m ${line}`);
      }
    });
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        console.log(`${color}[${name}]\x1b[0m ${line}`);
      }
    });
  });

  proc.on('close', (code) => {
    console.log(`\n${color}[${name}] Proceso terminado con código ${code}\x1b[0m`);
  });

  proc.on('error', (error) => {
    console.error(`\n${color}[${name}] Error: ${error.message}\x1b[0m`);
  });

  processes.push({ name, proc });
  return proc;
}

// Iniciar Backend
const backendDir = path.join(__dirname, 'backend');
const backendProc = startProcess(
  'BACKEND',
  'npm',
  ['run', 'start:dev'],
  backendDir,
  '\x1b[36m' // Cyan
);

// Esperar 5 segundos antes de iniciar el frontend
setTimeout(() => {
  // Iniciar Mobile/Frontend
  const mobileDir = path.join(__dirname, 'mobile');
  const mobileProc = startProcess(
    'MOBILE',
    'npm',
    ['start'],
    mobileDir,
    '\x1b[35m' // Magenta
  );

  console.log('\n' + '=' .repeat(60));
  console.log('✅ Ambos servicios iniciados');
  console.log('=' .repeat(60));
  console.log('\n📍 URLs:');
  console.log('   🔹 Backend: http://localhost:3002');
  console.log('   🔹 Mobile: Sigue las instrucciones en la terminal');
  console.log('\n💡 Presiona Ctrl+C para detener ambos servicios\n');

}, 5000);

// Manejar Ctrl+C para cerrar ambos procesos
process.on('SIGINT', () => {
  console.log('\n\n🛑 Deteniendo servicios...\n');
  processes.forEach(({ name, proc }) => {
    console.log(`   Cerrando ${name}...`);
    proc.kill();
  });
  setTimeout(() => {
    console.log('\n✅ Todos los servicios detenidos\n');
    process.exit(0);
  }, 1000);
});
