#!/usr/bin/env node

/**
 * Trinity System Analysis Script (Simplified)
 * 
 * Executes comprehensive analysis of the current Trinity project
 * without requiring full TypeScript compilation.
 */

const fs = require('fs').promises;
const path = require('path');

class TrinitySystemAnalyzer {
  constructor() {
    this.logger = console;
    this.rootPath = process.cwd();
  }

  async run() {
    this.logger.log('🔍 Iniciando análisis completo del sistema Trinity...');

    try {
      // Define project paths to analyze
      const projectPaths = this.getProjectPaths();
      
      this.logger.log(`📁 Analizando ${projectPaths.length} directorios del proyecto...`);

      // Execute comprehensive analysis
      const analysis = await this.executeComprehensiveAnalysis(projectPaths);
      
      // Generate migration recommendations
      const migrationPlan = await this.generateMigrationRecommendations(analysis);
      
      // Create analysis report
      const report = await this.createAnalysisReport(analysis, migrationPlan);
      
      // Save report to file
      await this.saveAnalysisReport(report);
      
      // Display summary
      this.displayAnalysisSummary(report);
      
    } catch (error) {
      this.logger.error('❌ Error durante el análisis del sistema:', error);
      process.exit(1);
    }
  }

  getProjectPaths() {
    return [
      path.join(this.rootPath, 'backend'),
      path.join(this.rootPath, 'backend-refactored'),
      path.join(this.rootPath, 'mobile'),
      path.join(this.rootPath, 'infrastructure'),
      path.join(this.rootPath, '.kiro/specs'),
    ];
  }

  async executeComprehensiveAnalysis(projectPaths) {
    this.logger.log('🔬 Ejecutando análisis completo...');
    
    const analysisResults = [];
    
    for (const projectPath of projectPaths) {
      try {
        this.logger.log(`  📂 Analizando: ${path.basename(projectPath)}`);
        
        const pathExists = await this.pathExists(projectPath);
        if (!pathExists) {
          this.logger.warn(`  ⚠️  Directorio no encontrado: ${projectPath}`);
          continue;
        }

        const analysis = await this.analyzeProject(projectPath);
        analysisResults.push({
          path: projectPath,
          name: path.basename(projectPath),
          analysis,
        });
        
        this.logger.log(`  ✅ Completado: ${path.basename(projectPath)}`);
        
      } catch (error) {
        this.logger.error(`  ❌ Error analizando ${projectPath}:`, error.message);
      }
    }

    return {
      timestamp: new Date().toISOString(),
      projects: analysisResults,
      summary: this.generateAnalysisSummary(analysisResults),
    };
  }

  async analyzeProject(projectPath) {
    const analysis = {
      repository: await this.analyzeRepository(projectPath),
      infrastructure: await this.analyzeInfrastructure(projectPath),
      features: await this.identifyFeatures(projectPath),
      obsoleteComponents: await this.findObsoleteComponents(projectPath),
      dependencies: await this.analyzeDependencies(projectPath),
    };

    return analysis;
  }

  async analyzeRepository(projectPath) {
    const modules = await this.scanModules(projectPath);
    const configurations = await this.scanConfigurations(projectPath);
    
    return {
      path: projectPath,
      modules,
      configurations,
      totalFiles: modules.length,
      totalSize: modules.reduce((sum, m) => sum + (m.size || 0), 0),
    };
  }

  async scanModules(projectPath) {
    const modules = [];
    const excludePatterns = [/node_modules/, /\.git/, /dist/, /build/, /\.expo/];
    
    const scanDirectory = async (dirPath) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (excludePatterns.some(exclude => exclude.test(fullPath))) {
            continue;
          }
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (this.isCodeFile(entry.name)) {
            const stats = await fs.stat(fullPath);
            const content = await this.readFileContent(fullPath);
            
            modules.push({
              path: path.relative(projectPath, fullPath),
              name: entry.name,
              size: stats.size,
              lastModified: stats.mtime,
              type: this.getFileType(entry.name),
              dependencies: this.extractDependencies(content),
              exports: this.extractExports(content),
              complexity: this.calculateComplexity(content),
            });
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };
    
    await scanDirectory(projectPath);
    return modules;
  }

  async scanConfigurations(projectPath) {
    const configurations = [];
    const configFiles = [
      'package.json',
      'tsconfig.json',
      'nest-cli.json',
      'app.json',
      'eas.json',
      '.env',
      '.env.example',
      'docker-compose.yml',
      'Dockerfile',
    ];
    
    for (const configFile of configFiles) {
      const configPath = path.join(projectPath, configFile);
      if (await this.pathExists(configPath)) {
        const stats = await fs.stat(configPath);
        const content = await this.readFileContent(configPath);
        
        configurations.push({
          path: configFile,
          type: this.getConfigType(configFile),
          size: stats.size,
          lastModified: stats.mtime,
          isObsolete: this.isConfigObsolete(configFile, content),
        });
      }
    }
    
    return configurations;
  }

  async analyzeInfrastructure(projectPath) {
    const awsResources = [];
    const cdkFiles = await this.findFiles(projectPath, /\.ts$/, [/node_modules/]);
    
    for (const cdkFile of cdkFiles) {
      if (cdkFile.includes('stack') || cdkFile.includes('infrastructure')) {
        const content = await this.readFileContent(cdkFile);
        const resources = this.extractAwsResources(content);
        awsResources.push(...resources);
      }
    }
    
    return {
      awsResources,
      totalResources: awsResources.length,
      estimatedCost: awsResources.reduce((sum, r) => sum + (r.estimatedCost || 0), 0),
    };
  }

  async identifyFeatures(projectPath) {
    const features = [];
    const modules = await this.scanModules(projectPath);
    
    // Group modules by feature
    const featureGroups = this.groupModulesByFeature(modules);
    
    for (const [featureName, featureModules] of Object.entries(featureGroups)) {
      features.push({
        name: featureName,
        description: this.generateFeatureDescription(featureName, featureModules),
        modules: featureModules.map(m => m.path),
        complexity: this.assessFeatureComplexity(featureModules),
        userImpact: this.assessUserImpact(featureName),
        isCore: this.isCoreFeature(featureName),
        isDeprecated: this.isFeatureDeprecated(featureName, featureModules),
      });
    }
    
    return features;
  }

  async findObsoleteComponents(projectPath) {
    const components = [];
    
    // Find unused dependencies
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (await this.pathExists(packageJsonPath)) {
      const packageJson = JSON.parse(await this.readFileContent(packageJsonPath));
      const unusedDeps = await this.findUnusedDependencies(projectPath, packageJson);
      components.push(...unusedDeps);
    }
    
    // Find dead code files
    const modules = await this.scanModules(projectPath);
    const deadCode = this.findDeadCodeFiles(modules);
    components.push(...deadCode);
    
    return components;
  }

  async analyzeDependencies(projectPath) {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!(await this.pathExists(packageJsonPath))) {
      return { dependencies: [], devDependencies: [], unusedDependencies: [] };
    }
    
    const packageJson = JSON.parse(await this.readFileContent(packageJsonPath));
    
    return {
      dependencies: Object.keys(packageJson.dependencies || {}),
      devDependencies: Object.keys(packageJson.devDependencies || {}),
      unusedDependencies: await this.findUnusedDependencies(projectPath, packageJson),
    };
  }

  // Utility methods

  isCodeFile(filename) {
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.graphql', '.md'];
    return codeExtensions.some(ext => filename.endsWith(ext));
  }

  getFileType(filename) {
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript';
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript';
    if (filename.endsWith('.json')) return 'json';
    if (filename.endsWith('.graphql')) return 'graphql';
    if (filename.endsWith('.md')) return 'markdown';
    return 'other';
  }

  getConfigType(filename) {
    if (filename === 'package.json') return 'package';
    if (filename.includes('tsconfig')) return 'typescript';
    if (filename.includes('nest-cli')) return 'nestjs';
    if (filename === 'app.json') return 'expo';
    if (filename === 'eas.json') return 'eas';
    if (filename.includes('.env')) return 'env';
    if (filename.includes('docker')) return 'docker';
    return 'other';
  }

  isConfigObsolete(filename, content) {
    // Simple heuristics for obsolete configs
    if (filename.includes('old') || filename.includes('backup')) return true;
    if (content.includes('deprecated') || content.includes('legacy')) return true;
    return false;
  }

  async readFileContent(filePath) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  extractDependencies(content) {
    const importRegex = /import.*from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    const dependencies = [];
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }
    
    while ((match = requireRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }
    
    return [...new Set(dependencies)];
  }

  extractExports(content) {
    const exportRegex = /export\s+(?:class|function|const|let|var|interface|type)\s+(\w+)/g;
    const exports = [];
    let match;
    
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    
    return exports;
  }

  calculateComplexity(content) {
    const lines = content.split('\n').length;
    const functions = (content.match(/function\s+\w+/g) || []).length;
    const classes = (content.match(/class\s+\w+/g) || []).length;
    
    const complexityScore = lines + (functions * 2) + (classes * 3);
    
    if (complexityScore > 500) return 'high';
    if (complexityScore > 200) return 'medium';
    return 'low';
  }

  extractAwsResources(content) {
    const resources = [];
    
    // Simple pattern matching for AWS resources
    const resourcePatterns = [
      { pattern: /new\s+lambda\.Function/g, type: 'lambda' },
      { pattern: /new\s+dynamodb\.Table/g, type: 'dynamodb' },
      { pattern: /new\s+appsync\.GraphqlApi/g, type: 'appsync' },
      { pattern: /new\s+cognito\.UserPool/g, type: 'cognito' },
    ];
    
    for (const { pattern, type } of resourcePatterns) {
      const matches = content.match(pattern) || [];
      for (let i = 0; i < matches.length; i++) {
        resources.push({
          type,
          name: `${type}-resource-${i + 1}`,
          estimatedCost: this.estimateResourceCost(type),
        });
      }
    }
    
    return resources;
  }

  estimateResourceCost(type) {
    const costMap = {
      lambda: 5,
      dynamodb: 10,
      appsync: 15,
      cognito: 8,
    };
    return costMap[type] || 5;
  }

  groupModulesByFeature(modules) {
    const groups = {};
    
    for (const module of modules) {
      const featureName = this.extractFeatureName(module.path);
      if (!groups[featureName]) {
        groups[featureName] = [];
      }
      groups[featureName].push(module);
    }
    
    return groups;
  }

  extractFeatureName(modulePath) {
    const pathParts = modulePath.split(path.sep);
    
    const featureIndicators = [
      'auth', 'room', 'vote', 'media', 'user', 'notification',
      'analytics', 'api', 'ui', 'database', 'config', 'test',
      'realtime', 'chat', 'security', 'infrastructure'
    ];
    
    for (const part of pathParts) {
      const lowerPart = part.toLowerCase();
      for (const indicator of featureIndicators) {
        if (lowerPart.includes(indicator)) {
          return indicator;
        }
      }
    }
    
    return 'unknown';
  }

  generateFeatureDescription(featureName, modules) {
    const descriptions = {
      'auth': 'Sistema de autenticación y autorización de usuarios',
      'room': 'Gestión de salas y funcionalidad de ciclo de vida',
      'vote': 'Sistema de votación en tiempo real y toma de decisiones',
      'media': 'Manejo de medios y capacidades de streaming',
      'user': 'Gestión de perfiles y cuentas de usuario',
      'notification': 'Sistema de notificaciones push y mensajería',
      'analytics': 'Recolección de datos y seguimiento de analíticas',
      'api': 'Endpoints API e integraciones externas',
      'ui': 'Componentes de interfaz de usuario y pantallas',
      'database': 'Persistencia de datos y operaciones de base de datos',
      'config': 'Configuración y gestión de entorno',
      'test': 'Utilidades de testing y suites de pruebas',
      'realtime': 'Funcionalidad en tiempo real y WebSockets',
      'chat': 'Sistema de chat y mensajería',
      'security': 'Seguridad y control de acceso',
      'infrastructure': 'Infraestructura y deployment',
    };
    
    const baseDescription = descriptions[featureName] || `Funcionalidad de ${featureName}`;
    return `${baseDescription} (${modules.length} módulos)`;
  }

  assessFeatureComplexity(modules) {
    const totalSize = modules.reduce((sum, m) => sum + (m.size || 0), 0);
    const avgDependencies = modules.length > 0 
      ? modules.reduce((sum, m) => sum + (m.dependencies?.length || 0), 0) / modules.length 
      : 0;
    
    if (totalSize > 50000 || avgDependencies > 10) return 'high';
    if (totalSize > 20000 || avgDependencies > 5) return 'medium';
    return 'low';
  }

  assessUserImpact(featureName) {
    const highImpactFeatures = ['auth', 'room', 'vote'];
    const mediumImpactFeatures = ['media', 'user', 'realtime'];
    
    if (highImpactFeatures.includes(featureName)) return 'high';
    if (mediumImpactFeatures.includes(featureName)) return 'medium';
    return 'low';
  }

  isCoreFeature(featureName) {
    const coreFeatures = ['auth', 'room', 'vote', 'realtime'];
    return coreFeatures.includes(featureName);
  }

  isFeatureDeprecated(featureName, modules) {
    const deprecationIndicators = ['deprecated', 'legacy', 'old', 'obsolete'];
    
    return modules.some(module => 
      deprecationIndicators.some(indicator => 
        module.path.toLowerCase().includes(indicator)
      )
    );
  }

  async findUnusedDependencies(projectPath, packageJson) {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    
    const modules = await this.scanModules(projectPath);
    const usedDeps = new Set();
    
    for (const module of modules) {
      for (const dep of module.dependencies || []) {
        if (allDeps[dep]) {
          usedDeps.add(dep);
        }
      }
    }
    
    const unusedDeps = [];
    for (const dep of Object.keys(allDeps)) {
      if (!usedDeps.has(dep)) {
        unusedDeps.push({
          path: dep,
          type: 'dependency',
          reason: 'Dependencia no utilizada detectada en package.json',
          safeToRemove: true,
        });
      }
    }
    
    return unusedDeps;
  }

  findDeadCodeFiles(modules) {
    const components = [];
    const moduleMap = new Map();
    const referencedModules = new Set();
    
    // Build module map
    for (const module of modules) {
      moduleMap.set(module.path, module);
    }
    
    // Find all referenced modules
    for (const module of modules) {
      for (const dep of module.dependencies || []) {
        if (dep.startsWith('./') || dep.startsWith('../')) {
          referencedModules.add(dep);
        }
      }
    }
    
    // Find unreferenced modules
    for (const module of modules) {
      const isReferenced = referencedModules.has(module.path) || 
                          this.isEntryPoint(module.path);
      
      if (!isReferenced && this.isRemovableFile(module.path)) {
        components.push({
          path: module.path,
          type: 'file',
          reason: 'Módulo no referenciado - posible código muerto',
          safeToRemove: true,
          lastUsed: module.lastModified,
        });
      }
    }
    
    return components;
  }

  isEntryPoint(filePath) {
    const entryPointPatterns = [
      /main\.(ts|js)$/,
      /index\.(ts|js)$/,
      /app\.(ts|js|tsx)$/,
      /_layout\.(ts|js|tsx)$/,
    ];
    
    return entryPointPatterns.some(pattern => pattern.test(filePath));
  }

  isRemovableFile(filePath) {
    const criticalPatterns = [
      /package\.json$/,
      /tsconfig.*\.json$/,
      /\.env/,
      /Dockerfile/,
      /README/i,
    ];
    
    return !criticalPatterns.some(pattern => pattern.test(filePath));
  }

  async findFiles(rootPath, pattern, excludePatterns = []) {
    const files = [];
    
    const scanDirectory = async (dirPath) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (excludePatterns.some(exclude => exclude.test(fullPath))) {
            continue;
          }
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile() && pattern.test(entry.name)) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };
    
    await scanDirectory(rootPath);
    return files;
  }

  generateAnalysisSummary(analysisResults) {
    const totalFiles = analysisResults.reduce((sum, project) => 
      sum + (project.analysis?.repository?.totalFiles || 0), 0
    );
    
    const totalFeatures = analysisResults.reduce((sum, project) => 
      sum + (project.analysis?.features?.length || 0), 0
    );
    
    const obsoleteComponents = analysisResults.reduce((sum, project) => 
      sum + (project.analysis?.obsoleteComponents?.length || 0), 0
    );

    return {
      totalProjects: analysisResults.length,
      totalFiles,
      totalFeatures,
      obsoleteComponents,
      projectBreakdown: analysisResults.map(project => ({
        name: project.name,
        files: project.analysis?.repository?.totalFiles || 0,
        features: project.analysis?.features?.length || 0,
        obsolete: project.analysis?.obsoleteComponents?.length || 0,
      })),
    };
  }

  async generateMigrationRecommendations(analysis) {
    const summary = analysis.summary;
    
    // Calculate migration phases based on complexity
    const phases = [];
    
    // Phase 1: Setup and preparation
    phases.push({
      id: 'phase-1',
      name: 'Preparación y Setup',
      description: 'Configuración inicial y preparación del entorno',
      estimatedDuration: '1-2 semanas',
      tasks: [
        'Configurar nuevo proyecto NestJS',
        'Migrar configuraciones básicas',
        'Setup de testing y CI/CD',
      ],
    });
    
    // Phase 2: Core services migration
    phases.push({
      id: 'phase-2',
      name: 'Migración de Servicios Core',
      description: 'Migración de funcionalidades principales',
      estimatedDuration: '3-4 semanas',
      tasks: [
        'Migrar sistema de autenticación',
        'Migrar gestión de salas',
        'Migrar sistema de votación',
      ],
    });
    
    // Phase 3: Infrastructure optimization
    phases.push({
      id: 'phase-3',
      name: 'Optimización de Infraestructura',
      description: 'Simplificación y optimización de AWS',
      estimatedDuration: '2-3 semanas',
      tasks: [
        'Implementar nueva infraestructura AWS',
        'Migrar datos existentes',
        'Configurar monitoreo',
      ],
    });
    
    // Phase 4: Testing and validation
    phases.push({
      id: 'phase-4',
      name: 'Testing y Validación',
      description: 'Pruebas completas y validación del sistema',
      estimatedDuration: '1-2 semanas',
      tasks: [
        'Ejecutar suite completa de tests',
        'Validar compatibilidad móvil',
        'Performance testing',
      ],
    });
    
    // Phase 5: Legacy cleanup
    phases.push({
      id: 'phase-5',
      name: 'Limpieza de Legacy',
      description: 'Eliminación de código y recursos obsoletos',
      estimatedDuration: '1 semana',
      tasks: [
        'Eliminar código obsoleto',
        'Limpiar recursos AWS no utilizados',
        'Documentación final',
      ],
    });
    
    return {
      phases,
      totalEstimatedDuration: '8-12 semanas',
      riskLevel: this.calculateRiskLevel(summary),
      prerequisites: [
        'Backup completo de datos existentes',
        'Configuración de entorno de desarrollo',
        'Acceso a credenciales AWS',
        'Validación de tests existentes',
      ],
    };
  }

  calculateRiskLevel(summary) {
    let riskScore = 0;
    
    if (summary.totalFiles > 500) riskScore += 2;
    else if (summary.totalFiles > 200) riskScore += 1;
    
    if (summary.totalFeatures > 20) riskScore += 2;
    else if (summary.totalFeatures > 10) riskScore += 1;
    
    if (summary.obsoleteComponents > 50) riskScore += 2;
    else if (summary.obsoleteComponents > 20) riskScore += 1;

    if (riskScore >= 5) return 'high';
    if (riskScore >= 3) return 'medium';
    return 'low';
  }

  async createAnalysisReport(analysis, migrationPlan) {
    const summary = analysis.summary;
    
    const recommendations = this.generateRecommendations(analysis, migrationPlan);
    
    return {
      timestamp: new Date().toISOString(),
      projectPath: this.rootPath,
      analysis,
      migrationPlan,
      recommendations,
      summary: {
        totalFiles: summary.totalFiles,
        totalFeatures: summary.totalFeatures,
        obsoleteComponents: summary.obsoleteComponents,
        estimatedMigrationTime: migrationPlan.totalEstimatedDuration,
        riskLevel: migrationPlan.riskLevel,
      },
    };
  }

  generateRecommendations(analysis, migrationPlan) {
    const recommendations = [];
    const summary = analysis.summary;
    
    if (summary.totalFiles > 300) {
      recommendations.push('Considerar dividir la migración en múltiples fases para reducir riesgo');
    }
    
    if (summary.obsoleteComponents > 20) {
      recommendations.push('Priorizar limpieza de componentes obsoletos antes de la migración');
    }
    
    if (summary.totalFeatures > 15) {
      recommendations.push('Implementar migración incremental por features para mantener funcionalidad');
    }
    
    if (migrationPlan.phases?.length > 4) {
      recommendations.push('Plan de migración complejo - considerar simplificar arquitectura objetivo');
    }
    
    recommendations.push('Ejecutar suite completa de property tests antes de iniciar migración');
    recommendations.push('Configurar monitoreo continuo durante proceso de migración');
    recommendations.push('Mantener backup completo de datos durante toda la migración');
    
    return recommendations;
  }

  async saveAnalysisReport(report) {
    const reportPath = path.join(this.rootPath, 'trinity-system-analysis-report.json');
    
    try {
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
      this.logger.log(`📄 Reporte guardado en: ${reportPath}`);
    } catch (error) {
      this.logger.error('❌ Error guardando reporte:', error.message);
    }
  }

  displayAnalysisSummary(report) {
    const { summary, recommendations } = report;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DEL ANÁLISIS DEL SISTEMA TRINITY');
    console.log('='.repeat(60));
    
    console.log(`\n📁 Archivos analizados: ${summary.totalFiles}`);
    console.log(`🎯 Features identificados: ${summary.totalFeatures}`);
    console.log(`🗑️  Componentes obsoletos: ${summary.obsoleteComponents}`);
    console.log(`⏱️  Tiempo estimado de migración: ${summary.estimatedMigrationTime}`);
    console.log(`⚠️  Nivel de riesgo: ${summary.riskLevel.toUpperCase()}`);
    
    // Display project breakdown
    console.log('\n📊 DESGLOSE POR PROYECTO:');
    for (const project of report.analysis.projects) {
      const analysis = project.analysis;
      console.log(`   ${project.name}:`);
      console.log(`     - Archivos: ${analysis.repository?.totalFiles || 0}`);
      console.log(`     - Features: ${analysis.features?.length || 0}`);
      console.log(`     - Obsoletos: ${analysis.obsoleteComponents?.length || 0}`);
    }
    
    // Display migration phases
    if (report.migrationPlan.phases) {
      console.log('\n🚀 FASES DE MIGRACIÓN:');
      for (const phase of report.migrationPlan.phases) {
        console.log(`   ${phase.name} (${phase.estimatedDuration})`);
        console.log(`     ${phase.description}`);
      }
    }
    
    if (recommendations.length > 0) {
      console.log('\n💡 RECOMENDACIONES:');
      recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    }
    
    console.log('\n✅ Análisis completo finalizado exitosamente');
    console.log('📄 Reporte detallado guardado en: trinity-system-analysis-report.json');
    console.log('='.repeat(60) + '\n');
  }

  async pathExists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}

// Execute analysis if run directly
if (require.main === module) {
  const analyzer = new TrinitySystemAnalyzer();
  analyzer.run().catch(console.error);
}

module.exports = { TrinitySystemAnalyzer };