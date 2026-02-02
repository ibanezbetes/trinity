#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Preparando build de producción...');

// 1. Verificar que no hay referencias a localhost en archivos críticos
const filesToCheck = [
  'src/aws-exports.ts',
  'src/config/aws-config.ts',
  'app.json',
];

console.log('🔍 Verificando configuraciones...');

filesToCheck.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('localhost') || content.includes('127.0.0.1')) {
      console.warn(`⚠️  Advertencia: ${file} contiene referencias a localhost`);
    } else {
      console.log(`✅ ${file} - OK`);
    }
  }
});

// 2. Crear archivo de configuración de producción
const productionConfig = {
  NODE_ENV: 'production',
  __DEV__: false,
  AWS_REGION: 'eu-west-1',
  GRAPHQL_ENDPOINT: 'https://b7vef3wm6jhfddfazbpru5ngki.appsync-api.eu-west-1.amazonaws.com/graphql',
  REALTIME_ENDPOINT: 'wss://b7vef3wm6jhfddfazbpru5ngki.appsync-realtime-api.eu-west-1.amazonaws.com/graphql',
  COGNITO_USER_POOL_ID: 'eu-west-1_TSlG71OQi',
  COGNITO_CLIENT_ID: '3k120srs09npek1qbfhgip63n',
};

// 3. Escribir configuración de producción
const configPath = path.join('android', 'app', 'src', 'main', 'assets', 'production-config.json');
fs.writeFileSync(configPath, JSON.stringify(productionConfig, null, 2));
console.log('✅ Configuración de producción creada');

// 4. Verificar que el directorio de assets existe
const assetsDir = path.join('android', 'app', 'src', 'main', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
  console.log('📁 Directorio de assets creado');
}

// 5. Crear archivo de configuración de React Native para producción
const rnConfigPath = path.join('android', 'app', 'src', 'main', 'assets', 'rn-config.json');
const rnConfig = {
  bundleSource: 'assets',
  devServerEnabled: false,
  metroEnabled: false,
  debugEnabled: false,
};

fs.writeFileSync(rnConfigPath, JSON.stringify(rnConfig, null, 2));
console.log('✅ Configuración de React Native para producción creada');

// 6. Verificar gradle.properties
const gradlePropsPath = path.join('android', 'gradle.properties');
if (fs.existsSync(gradlePropsPath)) {
  let gradleProps = fs.readFileSync(gradlePropsPath, 'utf8');
  
  // Asegurar que Hermes esté habilitado
  if (!gradleProps.includes('hermesEnabled=true')) {
    gradleProps += '\nhermesEnabled=true\n';
  }
  
  // Asegurar que el nuevo arquitectura esté deshabilitada para estabilidad
  if (!gradleProps.includes('newArchEnabled=false')) {
    gradleProps += '\nnewArchEnabled=false\n';
  }
  
  fs.writeFileSync(gradlePropsPath, gradleProps);
  console.log('✅ gradle.properties actualizado');
}

console.log('🎯 Preparación de build de producción completada');
console.log('📱 Ahora puedes ejecutar: node build-production-apk.js');