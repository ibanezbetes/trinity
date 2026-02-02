#!/usr/bin/env node

/**
 * Backup Completeness Verification Script
 * Verifies all critical files have been backed up before migration
 * Run: node backup/pre-migration-backup/verify-backup-completeness.js
 */

const fs = require('fs');
const path = require('path');

const BACKUP_DIR = 'backup/pre-migration-backup';

// Critical files and directories that must be backed up
const CRITICAL_BACKUPS = {
  files: [
    '.env.backup',
    'MONOLITH-TRINITY-CACHE-FINAL.js',
    'MONOLITH-TRINITY-ROOM-FINAL.js',
    'package.json',
    'package-lock.json',
    'README.md',
    'AWS-RESOURCE-INVENTORY.md',
    'verify-aws-resources.js'
  ],
  directories: [
    'lambdas',
    'infrastructure', 
    'database'
  ],
  lambdaFunctions: [
    'trinity-auth-dev',
    'trinity-cache-dev',
    'trinity-matchmaker-dev', 
    'trinity-movie-dev',
    'trinity-realtime-dev',
    'trinity-room-dev',
    'trinity-vote-dev'
  ],
  infrastructureComponents: [
    'src/handlers',
    'src/services',
    'clean/src/handlers',
    'clean/src/shared',
    'clean/lib'
  ]
};

function checkFileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

function checkDirectoryExists(dirPath) {
  try {
    const stats = fs.statSync(dirPath);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

function getDirectorySize(dirPath) {
  try {
    let totalSize = 0;
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        totalSize += getDirectorySize(fullPath);
      } else {
        const stats = fs.statSync(fullPath);
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  } catch (error) {
    return 0;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function verifyFiles() {
  console.log('\n🔍 Verifying Critical Files...');
  
  const results = {
    found: [],
    missing: []
  };
  
  for (const file of CRITICAL_BACKUPS.files) {
    const filePath = path.join(BACKUP_DIR, file);
    if (checkFileExists(filePath)) {
      const stats = fs.statSync(filePath);
      results.found.push({
        name: file,
        size: formatBytes(stats.size),
        modified: stats.mtime.toISOString()
      });
      console.log(`  ✅ ${file} (${formatBytes(stats.size)})`);
    } else {
      results.missing.push(file);
      console.log(`  ❌ ${file} - MISSING`);
    }
  }
  
  return results;
}

function verifyDirectories() {
  console.log('\n🔍 Verifying Critical Directories...');
  
  const results = {
    found: [],
    missing: []
  };
  
  for (const dir of CRITICAL_BACKUPS.directories) {
    const dirPath = path.join(BACKUP_DIR, dir);
    if (checkDirectoryExists(dirPath)) {
      const size = getDirectorySize(dirPath);
      results.found.push({
        name: dir,
        size: formatBytes(size)
      });
      console.log(`  ✅ ${dir}/ (${formatBytes(size)})`);
    } else {
      results.missing.push(dir);
      console.log(`  ❌ ${dir}/ - MISSING`);
    }
  }
  
  return results;
}

function verifyLambdaFunctions() {
  console.log('\n🔍 Verifying Lambda Function Backups...');
  
  const results = {
    found: [],
    missing: []
  };
  
  const lambdasDir = path.join(BACKUP_DIR, 'lambdas');
  
  if (!checkDirectoryExists(lambdasDir)) {
    console.log('  ❌ Lambdas directory not found');
    return { found: [], missing: CRITICAL_BACKUPS.lambdaFunctions };
  }
  
  for (const funcName of CRITICAL_BACKUPS.lambdaFunctions) {
    const funcDir = path.join(lambdasDir, funcName);
    if (checkDirectoryExists(funcDir)) {
      const size = getDirectorySize(funcDir);
      
      // Check for critical files in lambda directory
      const hasPackageJson = checkFileExists(path.join(funcDir, 'package.json'));
      const hasHandler = fs.readdirSync(funcDir).some(file => 
        file.endsWith('.js') && !file.includes('test')
      );
      
      results.found.push({
        name: funcName,
        size: formatBytes(size),
        hasPackageJson,
        hasHandler
      });
      
      const status = hasPackageJson && hasHandler ? '✅' : '⚠️';
      console.log(`  ${status} ${funcName} (${formatBytes(size)}) - Package: ${hasPackageJson ? '✅' : '❌'}, Handler: ${hasHandler ? '✅' : '❌'}`);
    } else {
      results.missing.push(funcName);
      console.log(`  ❌ ${funcName} - MISSING`);
    }
  }
  
  return results;
}

function verifyInfrastructureComponents() {
  console.log('\n🔍 Verifying Infrastructure Components...');
  
  const results = {
    found: [],
    missing: []
  };
  
  const infraDir = path.join(BACKUP_DIR, 'infrastructure');
  
  if (!checkDirectoryExists(infraDir)) {
    console.log('  ❌ Infrastructure directory not found');
    return { found: [], missing: CRITICAL_BACKUPS.infrastructureComponents };
  }
  
  for (const component of CRITICAL_BACKUPS.infrastructureComponents) {
    const componentPath = path.join(infraDir, component);
    if (checkDirectoryExists(componentPath)) {
      const size = getDirectorySize(componentPath);
      results.found.push({
        name: component,
        size: formatBytes(size)
      });
      console.log(`  ✅ ${component} (${formatBytes(size)})`);
    } else {
      results.missing.push(component);
      console.log(`  ❌ ${component} - MISSING`);
    }
  }
  
  return results;
}

function verifyMonolithFiles() {
  console.log('\n🔍 Verifying MONOLITH Files (Critical Working Code)...');
  
  const monolithFiles = [
    'MONOLITH-TRINITY-CACHE-FINAL.js',
    'MONOLITH-TRINITY-ROOM-FINAL.js'
  ];
  
  const results = {
    found: [],
    missing: []
  };
  
  for (const file of monolithFiles) {
    const filePath = path.join(BACKUP_DIR, file);
    if (checkFileExists(filePath)) {
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check for critical components in MONOLITH files
      const hasEnhancedTMDBClient = content.includes('class EnhancedTMDBClient');
      const hasContentFilterService = content.includes('ContentFilterService');
      const hasGenreMapping = content.includes('GENRE_MAPPING');
      const hasJapaneseKorean = content.includes("'ja'") && content.includes("'ko'");
      
      results.found.push({
        name: file,
        size: formatBytes(stats.size),
        hasEnhancedTMDBClient,
        hasContentFilterService,
        hasGenreMapping,
        hasJapaneseKorean
      });
      
      console.log(`  ✅ ${file} (${formatBytes(stats.size)})`);
      console.log(`    - EnhancedTMDBClient: ${hasEnhancedTMDBClient ? '✅' : '❌'}`);
      console.log(`    - ContentFilterService: ${hasContentFilterService ? '✅' : '❌'}`);
      console.log(`    - Genre Mapping: ${hasGenreMapping ? '✅' : '❌'}`);
      console.log(`    - Japanese/Korean Support: ${hasJapaneseKorean ? '✅' : '❌'}`);
    } else {
      results.missing.push(file);
      console.log(`  ❌ ${file} - MISSING`);
    }
  }
  
  return results;
}

function verifyEnvironmentConfiguration() {
  console.log('\n🔍 Verifying Environment Configuration...');
  
  const envPath = path.join(BACKUP_DIR, '.env.backup');
  
  if (!checkFileExists(envPath)) {
    console.log('  ❌ .env.backup file not found');
    return { valid: false, missing: ['.env.backup'] };
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  // Critical environment variables that must be present
  const criticalVars = [
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'GRAPHQL_API_URL',
    'COGNITO_USER_POOL_ID',
    'COGNITO_CLIENT_ID',
    'TMDB_API_KEY',
    'AUTH_HANDLER_NAME',
    'ROOM_HANDLER_NAME',
    'VOTE_HANDLER_NAME',
    'MOVIE_HANDLER_NAME',
    'CACHE_HANDLER_NAME',
    'MATCHMAKER_HANDLER_NAME',
    'REALTIME_HANDLER_NAME'
  ];
  
  const results = {
    found: [],
    missing: []
  };
  
  for (const varName of criticalVars) {
    if (envContent.includes(`${varName}=`)) {
      results.found.push(varName);
      console.log(`  ✅ ${varName}`);
    } else {
      results.missing.push(varName);
      console.log(`  ❌ ${varName} - MISSING`);
    }
  }
  
  const stats = fs.statSync(envPath);
  console.log(`  📄 Configuration file: ${formatBytes(stats.size)}`);
  
  return {
    valid: results.missing.length === 0,
    found: results.found,
    missing: results.missing,
    size: formatBytes(stats.size)
  };
}

function generateBackupReport(fileResults, dirResults, lambdaResults, infraResults, monolithResults, envResults) {
  const report = {
    timestamp: new Date().toISOString(),
    backupDirectory: BACKUP_DIR,
    verification: {
      files: fileResults,
      directories: dirResults,
      lambdaFunctions: lambdaResults,
      infrastructureComponents: infraResults,
      monolithFiles: monolithResults,
      environmentConfiguration: envResults
    },
    summary: {
      totalFilesFound: fileResults.found.length,
      totalFilesMissing: fileResults.missing.length,
      totalDirectoriesFound: dirResults.found.length,
      totalDirectoriesMissing: dirResults.missing.length,
      lambdaFunctionsFound: lambdaResults.found.length,
      lambdaFunctionsMissing: lambdaResults.missing.length,
      infrastructureComponentsFound: infraResults.found.length,
      infrastructureComponentsMissing: infraResults.missing.length,
      monolithFilesFound: monolithResults.found.length,
      monolithFilesMissing: monolithResults.missing.length,
      environmentConfigurationValid: envResults.valid
    }
  };
  
  // Calculate total backup size
  let totalSize = 0;
  for (const dir of dirResults.found) {
    const dirPath = path.join(BACKUP_DIR, dir.name);
    totalSize += getDirectorySize(dirPath);
  }
  
  report.summary.totalBackupSize = formatBytes(totalSize);
  
  // Write report
  const reportPath = path.join(BACKUP_DIR, 'backup-completeness-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n📄 Backup completeness report saved to: ${reportPath}`);
  
  return report;
}

function main() {
  console.log('🔍 Trinity Backup Completeness Verification');
  console.log('===========================================');
  console.log(`Backup Directory: ${BACKUP_DIR}`);
  console.log(`Verification Date: ${new Date().toISOString()}`);
  
  // Verify backup directory exists
  if (!checkDirectoryExists(BACKUP_DIR)) {
    console.error(`❌ Backup directory not found: ${BACKUP_DIR}`);
    process.exit(1);
  }
  
  try {
    const fileResults = verifyFiles();
    const dirResults = verifyDirectories();
    const lambdaResults = verifyLambdaFunctions();
    const infraResults = verifyInfrastructureComponents();
    const monolithResults = verifyMonolithFiles();
    const envResults = verifyEnvironmentConfiguration();
    
    const report = generateBackupReport(
      fileResults, dirResults, lambdaResults, 
      infraResults, monolithResults, envResults
    );
    
    console.log('\n📊 Backup Verification Summary:');
    console.log(`  Files: ${fileResults.found.length}/${CRITICAL_BACKUPS.files.length} found`);
    console.log(`  Directories: ${dirResults.found.length}/${CRITICAL_BACKUPS.directories.length} found`);
    console.log(`  Lambda Functions: ${lambdaResults.found.length}/${CRITICAL_BACKUPS.lambdaFunctions.length} found`);
    console.log(`  Infrastructure Components: ${infraResults.found.length}/${CRITICAL_BACKUPS.infrastructureComponents.length} found`);
    console.log(`  MONOLITH Files: ${monolithResults.found.length}/2 found`);
    console.log(`  Environment Configuration: ${envResults.valid ? 'Valid' : 'Invalid'}`);
    console.log(`  Total Backup Size: ${report.summary.totalBackupSize}`);
    
    const allCriticalBackupsComplete = 
      fileResults.missing.length === 0 &&
      dirResults.missing.length === 0 &&
      lambdaResults.missing.length === 0 &&
      infraResults.missing.length === 0 &&
      monolithResults.missing.length === 0 &&
      envResults.valid;
    
    if (allCriticalBackupsComplete) {
      console.log('\n✅ All critical backups complete - Safe to proceed with migration!');
      console.log('🚀 Ready for Task 2: Destructive AWS Resource Cleanup');
    } else {
      console.log('\n⚠️ Some critical backups missing - Review and complete before migration');
      
      // List missing items
      if (fileResults.missing.length > 0) {
        console.log(`   Missing files: ${fileResults.missing.join(', ')}`);
      }
      if (dirResults.missing.length > 0) {
        console.log(`   Missing directories: ${dirResults.missing.join(', ')}`);
      }
      if (lambdaResults.missing.length > 0) {
        console.log(`   Missing Lambda functions: ${lambdaResults.missing.join(', ')}`);
      }
      if (infraResults.missing.length > 0) {
        console.log(`   Missing infrastructure: ${infraResults.missing.join(', ')}`);
      }
      if (monolithResults.missing.length > 0) {
        console.log(`   Missing MONOLITH files: ${monolithResults.missing.join(', ')}`);
      }
      if (!envResults.valid) {
        console.log(`   Missing environment variables: ${envResults.missing.join(', ')}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Backup verification failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };