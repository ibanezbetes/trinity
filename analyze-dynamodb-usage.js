const fs = require('fs');
const path = require('path');

// Tablas que tienes en DynamoDB
const existingTables = [
  'trinity-votes-dev',
  'trinity-users-dev', 
  'trinity-rooms-dev-v2',
  'trinity-rooms-dev',
  'trinity-room-members-dev',
  'trinity-room-matches-dev',
  'trinity-room-invites-dev-v2',
  'trinity-movies-cache-dev',
  'trinity-events-dev',
  'trinity-connections-dev',
  'trinity-analytics-dev'
];

// Tablas definidas en el stack
const stackDefinedTables = [
  'trinity-users-dev',
  'trinity-rooms-dev-v2', 
  'trinity-room-members-dev',
  'trinity-votes-dev',
  'trinity-movies-cache-dev',
  'trinity-room-invites-dev-v2',
  'trinity-room-matches-dev',
  'trinity-connections-dev'
];

console.log('=== ANÁLISIS DE TABLAS DYNAMODB ===\n');

console.log('📋 Tablas existentes en DynamoDB:');
existingTables.forEach(table => console.log(`  - ${table}`));

console.log('\n🏗️  Tablas definidas en el stack CDK:');
stackDefinedTables.forEach(table => console.log(`  - ${table}`));

console.log('\n❓ Tablas que existen pero NO están en el stack:');
const orphanTables = existingTables.filter(table => !stackDefinedTables.includes(table));
orphanTables.forEach(table => console.log(`  - ${table} ⚠️`));

console.log('\n🔍 Analizando uso en el código...\n');

// Función para buscar referencias a tablas en archivos
function searchInFile(filePath, searchTerms) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const found = [];
    
    searchTerms.forEach(term => {
      if (content.includes(term)) {
        found.push(term);
      }
    });
    
    return found;
  } catch (error) {
    return [];
  }
}

// Función para buscar recursivamente en directorios
function searchInDirectory(dir, searchTerms, results = {}) {
  try {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !file.includes('node_modules') && !file.includes('.git')) {
        searchInDirectory(filePath, searchTerms, results);
      } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx'))) {
        const found = searchInFile(filePath, searchTerms);
        if (found.length > 0) {
          if (!results[filePath]) results[filePath] = [];
          results[filePath] = [...results[filePath], ...found];
        }
      }
    });
  } catch (error) {
    // Ignorar errores de acceso a directorios
  }
  
  return results;
}

// Buscar referencias a todas las tablas
const allTableReferences = searchInDirectory('.', existingTables);

console.log('📊 RESULTADOS DEL ANÁLISIS:\n');

existingTables.forEach(table => {
  const isInStack = stackDefinedTables.includes(table);
  const referencesFound = Object.keys(allTableReferences).filter(file => 
    allTableReferences[file].includes(table)
  );
  
  console.log(`🗃️  ${table}`);
  console.log(`   Stack CDK: ${isInStack ? '✅' : '❌'}`);
  console.log(`   Referencias en código: ${referencesFound.length}`);
  
  if (referencesFound.length > 0) {
    referencesFound.slice(0, 3).forEach(file => {
      console.log(`     - ${file}`);
    });
    if (referencesFound.length > 3) {
      console.log(`     ... y ${referencesFound.length - 3} más`);
    }
  }
  console.log('');
});

console.log('\n🎯 RECOMENDACIONES:\n');

// Tablas huérfanas (existen pero no están en stack)
if (orphanTables.length > 0) {
  console.log('❌ TABLAS HUÉRFANAS (eliminar):');
  orphanTables.forEach(table => {
    const hasReferences = Object.keys(allTableReferences).some(file => 
      allTableReferences[file].includes(table)
    );
    console.log(`   - ${table} ${hasReferences ? '⚠️ (tiene referencias en código!)' : '✅ (seguro eliminar)'}`);
  });
  console.log('');
}

// Verificar duplicados
console.log('🔄 POSIBLES DUPLICADOS:');
if (existingTables.includes('trinity-rooms-dev') && existingTables.includes('trinity-rooms-dev-v2')) {
  console.log('   - trinity-rooms-dev vs trinity-rooms-dev-v2');
  console.log('     Recomendación: Migrar datos de v1 a v2 y eliminar v1');
}

if (existingTables.includes('trinity-room-invites-dev-v2')) {
  console.log('   - Verificar si existe trinity-room-invites-dev (v1)');
}

console.log('\n💡 OPTIMIZACIONES SUGERIDAS:');
console.log('   1. Eliminar tablas huérfanas que no tienen referencias');
console.log('   2. Consolidar versiones v1 y v2 de las mismas tablas');
console.log('   3. Verificar si trinity-events-dev y trinity-analytics-dev son necesarias');
console.log('   4. Considerar combinar tablas relacionadas si es apropiado');
