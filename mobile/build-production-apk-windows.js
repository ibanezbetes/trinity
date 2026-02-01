#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Compilando Trinity APK para producción (Windows)...');

// Verificar que estamos en el directorio correcto
let workingDir = process.cwd();
if (!fs.existsSync('package.json')) {
  console.error('❌ Error: No se encontró package.json. Ejecuta desde el directorio mobile/');
  process.exit(1);
}

try {
  // 0. Preparar build de producción
  console.log('🔧 Preparando configuración de producción...');
  
  // Crear directorio de assets si no existe
  const assetsDir = path.join('android', 'app', 'src', 'main', 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
    console.log('📁 Directorio de assets creado');
  }

  // Crear configuración de producción
  const productionConfig = {
    NODE_ENV: 'production',
    __DEV__: false,
    AWS_REGION: 'eu-west-1',
    GRAPHQL_ENDPOINT: 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
    REALTIME_ENDPOINT: 'wss://imx6fos5lnd3xkdchl4rqtv4pi.appsync-realtime-api.eu-west-1.amazonaws.com/graphql',
    COGNITO_USER_POOL_ID: 'eu-west-1_6UxioIj4z',
    COGNITO_CLIENT_ID: '2a07bheqdh1mllkd1sn0i3s5m3',
  };

  const configPath = path.join(assetsDir, 'production-config.json');
  fs.writeFileSync(configPath, JSON.stringify(productionConfig, null, 2));
  console.log('✅ Configuración de producción creada');

  // 1. Limpiar builds anteriores (Windows compatible)
  console.log('🧹 Limpiando builds anteriores...');
  const buildDir = path.join('android', 'app', 'build');
  if (fs.existsSync(buildDir)) {
    try {
      fs.rmSync(buildDir, { recursive: true, force: true });
      console.log('✅ Build anterior eliminado');
    } catch (error) {
      console.warn('⚠️ No se pudo eliminar build anterior:', error.message);
    }
  }

  const distDir = 'dist';
  if (fs.existsSync(distDir)) {
    try {
      fs.rmSync(distDir, { recursive: true, force: true });
      console.log('✅ Directorio dist eliminado');
    } catch (error) {
      console.warn('⚠️ No se pudo eliminar directorio dist:', error.message);
    }
  }

  // 2. Verificar dependencias
  console.log('📦 Verificando dependencias...');
  if (!fs.existsSync('node_modules')) {
    console.log('📦 Instalando dependencias...');
    execSync('npm install', { stdio: 'inherit' });
  }

  // 3. Generar bundle de producción
  console.log('🔧 Generando bundle de JavaScript para producción...');
  
  // Configurar variables de entorno para producción
  process.env.NODE_ENV = 'production';
  process.env.BABEL_ENV = 'production';
  
  // Usar el CLI local de React Native
  const bundleCommand = [
    'npx react-native bundle',
    '--platform android',
    '--dev false',
    '--entry-file index.js',
    `--bundle-output "${path.join(assetsDir, 'index.android.bundle')}"`,
    '--assets-dest android/app/src/main/res',
    '--reset-cache',
    '--minify true'
  ].join(' ');

  console.log('📝 Ejecutando:', bundleCommand);
  
  try {
    execSync(bundleCommand, { stdio: 'inherit' });
  } catch (error) {
    console.log('⚠️ React Native CLI falló, intentando con @react-native-community/cli...');
    
    // Fallback: usar npx con el CLI de la comunidad
    const fallbackCommand = [
      'npx @react-native-community/cli bundle',
      '--platform android',
      '--dev false',
      '--entry-file index.js',
      `--bundle-output "${path.join(assetsDir, 'index.android.bundle')}"`,
      '--assets-dest android/app/src/main/res',
      '--reset-cache',
      '--minify true'
    ].join(' ');
    
    console.log('📝 Ejecutando fallback:', fallbackCommand);
    execSync(fallbackCommand, { stdio: 'inherit' });
  }

  // 4. Verificar que el bundle se generó
  const bundlePath = path.join(assetsDir, 'index.android.bundle');
  if (!fs.existsSync(bundlePath)) {
    throw new Error('No se pudo generar el bundle de JavaScript');
  }

  const bundleSize = fs.statSync(bundlePath).size;
  console.log(`✅ Bundle generado: ${(bundleSize / 1024 / 1024).toFixed(2)} MB`);

  // 5. Verificar que el bundle no contiene referencias a localhost
  const bundleContent = fs.readFileSync(bundlePath, 'utf8');
  if (bundleContent.includes('localhost') || bundleContent.includes('127.0.0.1')) {
    console.warn('⚠️ Advertencia: El bundle contiene referencias a localhost');
    console.warn('   Esto puede causar el error "Unable to load script"');
  } else {
    console.log('✅ Bundle verificado - sin referencias a localhost');
  }

  // 6. Configurar entorno Android (Windows paths)
  console.log('🔧 Configurando entorno Android...');
  
  // Configurar JAVA_HOME y ANDROID_HOME para Windows
  if (!process.env.JAVA_HOME) {
    // Intentar encontrar Java automáticamente
    const possibleJavaPaths = [
      'C:\\Program Files\\Java\\jdk-17',
      'C:\\Program Files\\Java\\jdk-11',
      'C:\\Program Files\\OpenJDK\\jdk-17',
      'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.2.8-hotspot'
    ];
    
    for (const javaPath of possibleJavaPaths) {
      if (fs.existsSync(javaPath)) {
        process.env.JAVA_HOME = javaPath;
        console.log(`📍 JAVA_HOME configurado: ${javaPath}`);
        break;
      }
    }
    
    if (!process.env.JAVA_HOME) {
      console.warn('⚠️ JAVA_HOME no configurado. Asegúrate de tener Java 17 instalado.');
    }
  }

  if (!process.env.ANDROID_HOME) {
    // Intentar encontrar Android SDK automáticamente
    const possibleAndroidPaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
      path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk'),
      'C:\\Android\\Sdk'
    ];
    
    for (const androidPath of possibleAndroidPaths) {
      if (fs.existsSync(androidPath)) {
        process.env.ANDROID_HOME = androidPath;
        console.log(`📍 ANDROID_HOME configurado: ${androidPath}`);
        break;
      }
    }
    
    if (!process.env.ANDROID_HOME) {
      console.warn('⚠️ ANDROID_HOME no configurado. Asegúrate de tener Android SDK instalado.');
    }
  }

  // 7. Crear local.properties si no existe
  const localPropsPath = path.join('android', 'local.properties');
  if (!fs.existsSync(localPropsPath) && process.env.ANDROID_HOME) {
    const androidHomePath = process.env.ANDROID_HOME.replace(/\\/g, '/');
    fs.writeFileSync(localPropsPath, `sdk.dir=${androidHomePath}\n`);
    console.log('📝 local.properties creado');
  }

  // 8. Compilar APK con Gradle (Windows)
  console.log('🔨 Compilando APK con Gradle...');
  
  const originalDir = process.cwd();
  process.chdir('android');
  
  try {
    // Limpiar build anterior
    console.log('🧹 Limpiando con Gradle...');
    execSync('gradlew.bat clean', { stdio: 'inherit' });
    
    // Compilar APK de release
    console.log('🔨 Compilando APK de release...');
    execSync('gradlew.bat assembleRelease', { stdio: 'inherit' });
    
  } finally {
    process.chdir(originalDir);
  }
  
  // 9. Verificar que el APK se generó
  const apkPath = path.join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (fs.existsSync(apkPath)) {
    console.log('✅ APK compilado exitosamente!');
    console.log(`📍 Ubicación: ${path.resolve(apkPath)}`);
    
    const apkSize = fs.statSync(apkPath).size;
    console.log(`📦 Tamaño del APK: ${(apkSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Copiar APK al directorio raíz con timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const targetApk = `trinity-individual-voting-${timestamp}.apk`;
    fs.copyFileSync(apkPath, targetApk);
    console.log(`🎉 APK copiado a: ${path.resolve(targetApk)}`);
    
    console.log('\n🎯 APK de producción listo para instalar en dispositivo');
    console.log(`📱 Para instalar: adb install ${targetApk}`);
    console.log('🔍 Para verificar instalación: adb shell pm list packages | grep trinity');
    
    console.log('\n🆕 NUEVO SISTEMA DE VOTACIÓN INDIVIDUAL:');
    console.log('   ✅ Cada usuario vota independientemente por 50 películas');
    console.log('   ✅ Match cuando maxMembers usuarios votan "SÍ" a la misma película');
    console.log('   ✅ Progreso individual (X/50 películas)');
    console.log('   ✅ Estados: match encontrado, usuario terminó, sin consenso');
    
  } else {
    console.error('❌ Error: No se pudo encontrar el APK generado');
    console.error(`   Buscando en: ${path.resolve(apkPath)}`);
    process.exit(1);
  }

} catch (error) {
  console.error('❌ Error durante la compilación:', error.message);
  console.error('💡 Sugerencias:');
  console.error('   - Verifica que Android SDK esté instalado');
  console.error('   - Verifica que JAVA_HOME apunte a Java 17');
  console.error('   - Ejecuta: npm install && npm start para verificar que la app funciona');
  console.error('   - Verifica que no hay referencias a localhost en el código');
  console.error('   - En Windows, usa Android Studio para configurar el SDK automáticamente');
  process.exit(1);
}