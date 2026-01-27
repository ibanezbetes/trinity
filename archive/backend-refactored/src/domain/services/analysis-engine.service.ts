/**
 * Analysis Engine Service Implementation
 * Core service for analyzing existing Trinity codebase and infrastructure
 */

import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  IAnalysisEngine,
  RepositoryAnalysis,
  InfrastructureAnalysis,
  FeatureMap,
  ObsoleteComponents,
  SystemAnalysis,
  Codebase,
  ModuleInfo,
  DependencyGraph,
  ConfigurationFiles,
  CoverageReport,
  InfrastructureResource,
  Feature,
  ObsoleteComponent,
} from './analysis-engine.interface';

@Injectable()
export class AnalysisEngineService implements IAnalysisEngine {
  
  async scanRepository(rootPath: string): Promise<RepositoryAnalysis> {
    const modules = await this.scanModules(rootPath);
    const dependencies = await this.analyzeDependencies(rootPath);
    const configurations = await this.scanConfigurations(rootPath);
    const testCoverage = await this.analyzeTestCoverage(rootPath);
    
    const stats = await this.calculateRepositoryStats(rootPath);
    
    return {
      modules,
      dependencies,
      configurations,
      testCoverage,
      codeMetrics: {
        totalLines: stats.totalLinesOfCode,
        totalFiles: stats.totalFiles,
        averageComplexity: modules.length > 0 ? modules.reduce((sum, m) => sum + (m.dependencies?.length || 0), 0) / modules.length : 0,
        duplicatedCode: [],
        technicalDebt: [],
        maintainabilityIndex: 0,
      },
      securityIssues: [],
      performanceIssues: [],
      qualityIssues: [],
    };
  }

  async analyzeInfrastructure(cdkPath: string): Promise<InfrastructureAnalysis> {
    const resources = await this.scanInfrastructureResources(cdkPath);
    
    return {
      cdkStacks: [],
      awsResources: resources,
      costEstimate: {},
      securityAnalysis: [],
      performanceAnalysis: '',
      complianceAnalysis: {},
    };
  }

  async analyzeConfigurations(rootPath: string): Promise<ConfigurationFiles[]> {
    return this.scanConfigurations(rootPath);
  }

  async analyzeExistingSpecs(rootPath: string): Promise<any[]> {
    const specsPath = path.join(rootPath, '.kiro', 'specs');
    const specs: any[] = [];
    
    if (await this.pathExists(specsPath)) {
      const specDirs = await fs.readdir(specsPath, { withFileTypes: true });
      
      for (const dir of specDirs) {
        if (dir.isDirectory()) {
          const specPath = path.join(specsPath, dir.name);
          const spec = await this.analyzeSpecDirectory(specPath, dir.name);
          if (spec) {
            specs.push(spec);
          }
        }
      }
    }
    
    return specs;
  }

  async catalogCDKResources(cdkPath: string): Promise<InfrastructureResource[]> {
    return this.scanInfrastructureResources(cdkPath);
  }

  async extractFeatures(codebase: Codebase): Promise<FeatureMap> {
    const features = await this.identifyFeatures(codebase);
    const coreFeatures = features.filter(f => f.isCore);
    const deprecatedFeatures = features.filter(f => f.isDeprecated);
    const missingFeatures = await this.identifyMissingFeatures(codebase);
    
    return {
      features,
      coreFeatures,
      deprecatedFeatures,
      missingFeatures,
    };
  }

  async identifyObsoleteComponents(analysis: SystemAnalysis): Promise<ObsoleteComponents> {
    const components = await this.findObsoleteComponents(analysis);
    const totalSize = await this.calculateObsoleteSize(components);
    
    const potentialSavings = {
      storage: totalSize,
      cost: this.estimateCostSavings(components),
      complexity: this.estimateComplexityReduction(components),
    };
    
    return {
      components,
      totalSize,
      potentialSavings,
    };
  }

  async analyzeSystem(rootPath: string): Promise<SystemAnalysis> {
    const repository = await this.scanRepository(rootPath);
    const infrastructure = await this.analyzeInfrastructure(path.join(rootPath, 'infrastructure'));
    
    const codebase: Codebase = {
      rootPath,
      analysis: repository,
      infrastructure,
    };
    
    const features = await this.extractFeatures(codebase);
    
    return {
      repository,
      infrastructure,
      features,
      dependencies: 0,
      obsoleteComponents: [],
      recommendations: [],
      migrationPlan: [],
    };
  }

  // Private helper methods

  private async scanModules(rootPath: string): Promise<ModuleInfo[]> {
    const modules: ModuleInfo[] = [];
    
    // Scan backend NestJS modules
    const backendPath = path.join(rootPath, 'backend');
    if (await this.pathExists(backendPath)) {
      const nestjsModules = await this.scanNestJSModules(backendPath);
      modules.push(...nestjsModules);
    }
    
    // Scan mobile React Native components
    const mobilePath = path.join(rootPath, 'mobile');
    if (await this.pathExists(mobilePath)) {
      const reactNativeModules = await this.scanReactNativeModules(mobilePath);
      modules.push(...reactNativeModules);
    }
    
    // Scan infrastructure modules
    const infraPath = path.join(rootPath, 'infrastructure');
    if (await this.pathExists(infraPath)) {
      const infraModules = await this.scanInfrastructureModules(infraPath);
      modules.push(...infraModules);
    }
    
    return modules;
  }

  private async scanNestJSModules(backendPath: string): Promise<ModuleInfo[]> {
    const modules: ModuleInfo[] = [];
    const srcPath = path.join(backendPath, 'src');
    
    if (await this.pathExists(srcPath)) {
      const moduleFiles = await this.findFiles(srcPath, /\.(module|service|controller|guard|middleware)\.ts$/);
      
      for (const filePath of moduleFiles) {
        const content = await fs.readFile(filePath, 'utf-8');
        const stats = await fs.stat(filePath);
        
        modules.push({
          name: path.basename(filePath, '.ts'),
          path: filePath,
          type: 'nestjs',
          dependencies: this.extractImports(content),
          exports: this.extractExports(content),
          size: stats.size,
          lastModified: stats.mtime,
        });
      }
    }
    
    return modules;
  }

  private async scanReactNativeModules(mobilePath: string): Promise<ModuleInfo[]> {
    const modules: ModuleInfo[] = [];
    const srcPath = path.join(mobilePath, 'src');
    const appPath = path.join(mobilePath, 'app');
    
    // Scan src directory
    if (await this.pathExists(srcPath)) {
      const componentFiles = await this.findFiles(srcPath, /\.(tsx?|jsx?)$/);
      modules.push(...await this.processReactNativeFiles(componentFiles));
    }
    
    // Scan app directory (Expo Router)
    if (await this.pathExists(appPath)) {
      const appFiles = await this.findFiles(appPath, /\.(tsx?|jsx?)$/);
      modules.push(...await this.processReactNativeFiles(appFiles));
    }
    
    return modules;
  }

  private async processReactNativeFiles(files: string[]): Promise<ModuleInfo[]> {
    const modules: ModuleInfo[] = [];
    
    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);
      
      modules.push({
        name: path.basename(filePath, path.extname(filePath)),
        path: filePath,
        type: 'react-native',
        dependencies: this.extractImports(content),
        exports: this.extractExports(content),
        size: stats.size,
        lastModified: stats.mtime,
      });
    }
    
    return modules;
  }

  private async scanInfrastructureModules(infraPath: string): Promise<ModuleInfo[]> {
    const modules: ModuleInfo[] = [];
    const files = await this.findFiles(infraPath, /\.(ts|js)$/);
    
    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);
      
      modules.push({
        name: path.basename(filePath, path.extname(filePath)),
        path: filePath,
        type: 'infrastructure',
        dependencies: this.extractImports(content),
        exports: this.extractExports(content),
        size: stats.size,
        lastModified: stats.mtime,
      });
    }
    
    return modules;
  }

  private async analyzeDependencies(rootPath: string): Promise<DependencyGraph> {
    const packageJsonPaths = await this.findFiles(rootPath, /package\.json$/);
    const allDependencies = new Set<string>();
    const edges: Array<{ from: string; to: string; type: string }> = [];
    const declaredDependencies = new Set<string>();
    const usedDependencies = new Set<string>();
    
    // Collect declared dependencies from package.json files
    for (const pkgPath of packageJsonPaths) {
      try {
        const content = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        const deps = { ...content.dependencies, ...content.devDependencies };
        
        Object.keys(deps).forEach(dep => {
          allDependencies.add(dep);
          declaredDependencies.add(dep);
          edges.push({
            from: path.dirname(pkgPath),
            to: dep,
            type: 'dependency',
          });
        });
      } catch (error) {
        // Skip invalid package.json files
      }
    }
    
    // Scan source files to find actually used dependencies
    const sourceFiles = await this.findFiles(rootPath, /\.(ts|js|tsx|jsx)$/, [/node_modules/, /dist/, /build/]);
    
    for (const filePath of sourceFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const imports = this.extractImports(content);
        
        for (const importPath of imports) {
          // Check if it's an external dependency (not relative path)
          if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
            // Extract package name (handle scoped packages)
            const packageName = importPath.startsWith('@') 
              ? importPath.split('/').slice(0, 2).join('/')
              : importPath.split('/')[0];
            
            if (declaredDependencies.has(packageName)) {
              usedDependencies.add(packageName);
            }
          }
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    // Find unused dependencies
    const unusedDependencies = Array.from(declaredDependencies).filter(dep => !usedDependencies.has(dep));
    
    // Detect circular dependencies (simplified)
    const cycles = this.detectCircularDependencies(edges);
    
    return {
      nodes: Array.from(allDependencies),
      edges,
      cycles,
      unusedDependencies,
    };
  }

  private detectCircularDependencies(edges: Array<{ from: string; to: string; type: string }>): string[][] {
    const cycles: string[][] = [];
    const graph = new Map<string, string[]>();
    
    // Build adjacency list
    for (const edge of edges) {
      if (!graph.has(edge.from)) {
        graph.set(edge.from, []);
      }
      graph.get(edge.from)!.push(edge.to);
    }
    
    // Simple cycle detection using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const dfs = (node: string, path: string[]): void => {
      if (recursionStack.has(node)) {
        // Found a cycle
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart));
        }
        return;
      }
      
      if (visited.has(node)) {
        return;
      }
      
      visited.add(node);
      recursionStack.add(node);
      
      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        dfs(neighbor, [...path, node]);
      }
      
      recursionStack.delete(node);
    };
    
    // Run DFS from all nodes
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }
    
    return cycles;
  }

  private async scanConfigurations(rootPath: string): Promise<ConfigurationFiles[]> {
    const configs: ConfigurationFiles[] = [];
    const configPatterns = [
      { pattern: /package\.json$/, type: 'package.json' as const },
      { pattern: /tsconfig.*\.json$/, type: 'tsconfig' as const },
      { pattern: /\.env/, type: 'env' as const },
      { pattern: /Dockerfile/, type: 'docker' as const },
      { pattern: /cdk\.json$/, type: 'cdk' as const },
      { pattern: /jest\.config\.(js|ts)$/, type: 'jest' as const },
      { pattern: /eslint\.config\.(js|mjs|ts)$/, type: 'eslint' as const },
      { pattern: /\.prettierrc/, type: 'prettier' as const },
      { pattern: /babel\.config\.(js|ts)$/, type: 'babel' as const },
      { pattern: /metro\.config\.js$/, type: 'metro' as const },
      { pattern: /eas\.json$/, type: 'eas' as const },
      { pattern: /app\.json$/, type: 'expo' as const },
    ];
    
    for (const { pattern, type } of configPatterns) {
      const files = await this.findFiles(rootPath, pattern);
      
      for (const filePath of files) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          let parsedContent: any = content;
          
          if (filePath.endsWith('.json')) {
            parsedContent = JSON.parse(content);
          }
          
          const isObsolete = await this.isConfigurationObsolete(filePath, parsedContent, type);
          
          configs.push({
            path: filePath,
            type,
            content: parsedContent,
            isObsolete,
          });
        } catch (error) {
          // Skip files that can't be read or parsed
        }
      }
    }
    
    return configs;
  }

  private async analyzeSpecDirectory(specPath: string, specName: string): Promise<any | null> {
    try {
      const spec: any = {
        name: specName,
        path: specPath,
        files: {},
        status: 'unknown',
        lastModified: new Date(0),
      };

      // Check for standard spec files
      const specFiles = ['requirements.md', 'design.md', 'tasks.md'];
      
      for (const fileName of specFiles) {
        const filePath = path.join(specPath, fileName);
        if (await this.pathExists(filePath)) {
          const content = await fs.readFile(filePath, 'utf-8');
          const stats = await fs.stat(filePath);
          
          spec.files[fileName] = {
            content,
            size: stats.size,
            lastModified: stats.mtime,
          };
          
          // Update spec last modified time
          if (stats.mtime > spec.lastModified) {
            spec.lastModified = stats.mtime;
          }
        }
      }

      // Determine spec status based on files present
      if (spec.files['requirements.md'] && spec.files['design.md'] && spec.files['tasks.md']) {
        spec.status = 'complete';
      } else if (spec.files['requirements.md']) {
        spec.status = 'in-progress';
      } else {
        spec.status = 'incomplete';
      }

      // Analyze tasks if tasks.md exists
      if (spec.files['tasks.md']) {
        spec.taskAnalysis = await this.analyzeTasksFile(spec.files['tasks.md'].content);
      }

      return spec;
    } catch (error) {
      return null;
    }
  }

  private async analyzeTasksFile(content: string): Promise<any> {
    const lines = content.split('\n');
    const tasks = {
      total: 0,
      completed: 0,
      inProgress: 0,
      notStarted: 0,
      queued: 0,
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^- \[.\]/)) {
        tasks.total++;
        
        if (trimmed.includes('- [x]')) {
          tasks.completed++;
        } else if (trimmed.includes('- [-]')) {
          tasks.inProgress++;
        } else if (trimmed.includes('- [~]')) {
          tasks.queued++;
        } else if (trimmed.includes('- [ ]')) {
          tasks.notStarted++;
        }
      }
    }

    return tasks;
  }

  private async isConfigurationObsolete(filePath: string, content: any, type: ConfigurationFiles['type']): Promise<boolean> {
    switch (type) {
      case 'package.json':
        return this.isPackageJsonObsolete(content);
        
      case 'tsconfig':
        return this.isTsConfigObsolete(content);
        
      case 'eslint':
        return this.isEslintConfigObsolete(content, filePath);
        
      case 'jest':
        return this.isJestConfigObsolete(content);
        
      case 'babel':
        return this.isBabelConfigObsolete(content);
        
      case 'docker':
        return this.isDockerfileObsolete(content);
        
      default:
        return false;
    }
  }

  private isPackageJsonObsolete(content: any): boolean {
    if (!content || typeof content !== 'object') return false;
    
    // Check for very old Node.js version requirements
    if (content.engines?.node) {
      const nodeVersion = content.engines.node.replace(/[^\d.]/g, '');
      const majorVersion = parseInt(nodeVersion.split('.')[0]);
      if (majorVersion < 14) return true; // Node 14 is EOL
    }
    
    // Check for deprecated packages
    const obsoletePackages = [
      'bower', 'grunt', 'gulp', 'browserify',
      'tslint', // Replaced by ESLint
      'node-sass', // Replaced by sass/dart-sass
      'request', // Deprecated HTTP client
    ];
    
    const allDeps = {
      ...content.dependencies,
      ...content.devDependencies,
      ...content.peerDependencies,
    };
    
    return obsoletePackages.some(pkg => allDeps[pkg]);
  }

  private isTsConfigObsolete(content: any): boolean {
    if (!content?.compilerOptions) return false;
    
    const options = content.compilerOptions;
    
    // Check for very old TypeScript target versions
    if (options.target) {
      const oldTargets = ['es3', 'es5', 'es2015'];
      if (oldTargets.includes(options.target.toLowerCase())) return true;
    }
    
    // Check for deprecated compiler options
    const deprecatedOptions = [
      'experimentalDecorators', // Should use decorators metadata
      'keyofStringsOnly', // Removed in TS 4.1
    ];
    
    return deprecatedOptions.some(opt => options[opt] !== undefined);
  }

  private isEslintConfigObsolete(content: any, filePath: string): boolean {
    // Check if using old ESLint config format
    if (filePath.endsWith('.eslintrc.js') || filePath.endsWith('.eslintrc.json')) {
      return true; // Flat config is preferred
    }
    
    if (typeof content === 'string') return false;
    
    // Check for deprecated rules or plugins
    const deprecatedRules = [
      'babel/new-cap', // Babel ESLint plugin deprecated
      'react/jsx-space-before-closing', // Deprecated React rule
    ];
    
    const rules = content.rules || {};
    return deprecatedRules.some(rule => rules[rule] !== undefined);
  }

  private isJestConfigObsolete(content: any): boolean {
    if (typeof content === 'string') return false;
    
    // Check for deprecated Jest configuration options
    const deprecatedOptions = [
      'browser', // Removed in Jest 27
      'timers', // Changed to fakeTimers
      'setupTestFrameworkScriptFile', // Renamed to setupFilesAfterEnv
    ];
    
    return deprecatedOptions.some(opt => content[opt] !== undefined);
  }

  private isBabelConfigObsolete(content: any): boolean {
    if (typeof content === 'string') return false;
    
    // Check for deprecated Babel presets/plugins
    const deprecatedPresets = [
      'babel-preset-es2015', // Use @babel/preset-env
      'babel-preset-react', // Use @babel/preset-react
      'babel-preset-stage-0', // Stage presets are deprecated
    ];
    
    const presets = content.presets || [];
    return deprecatedPresets.some(preset => 
      presets.includes(preset) || 
      presets.some((p: any) => Array.isArray(p) && p[0] === preset)
    );
  }

  private isDockerfileObsolete(content: string): boolean {
    if (typeof content !== 'string') return false;
    
    // Check for deprecated Docker practices
    const deprecatedPatterns = [
      /FROM.*:latest/i, // Using latest tag
      /RUN apt-get update && apt-get install/i, // Should use specific versions
      /MAINTAINER/i, // Deprecated in favor of LABEL
    ];
    
    return deprecatedPatterns.some(pattern => pattern.test(content));
  }

  private async analyzeTestCoverage(rootPath: string): Promise<CoverageReport> {
    // Simplified test coverage analysis
    const testFiles = await this.findFiles(rootPath, /\.(test|spec)\.(ts|js)$/);
    const sourceFiles = await this.findFiles(rootPath, /\.(ts|js)$/, [/node_modules/, /dist/, /build/]);
    
    return {
      totalLines: sourceFiles.length * 50, // Rough estimate
      coveredLines: testFiles.length * 30, // Rough estimate
      percentage: testFiles.length > 0 ? (testFiles.length / sourceFiles.length) * 100 : 0,
      uncoveredFiles: [], // TODO: Implement actual coverage analysis
    };
  }

  private async calculateRepositoryStats(rootPath: string) {
    const allFiles = await this.findFiles(rootPath, /\.(ts|js|tsx|jsx|json|md)$/, [/node_modules/, /dist/, /build/]);
    const languages: Record<string, number> = {};
    let totalLinesOfCode = 0;
    
    for (const filePath of allFiles) {
      const ext = path.extname(filePath);
      languages[ext] = (languages[ext] || 0) + 1;
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        totalLinesOfCode += content.split('\n').length;
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    return {
      totalFiles: allFiles.length,
      totalLinesOfCode,
      languages,
    };
  }

  private async scanInfrastructureResources(cdkPath: string): Promise<InfrastructureResource[]> {
    const resources: InfrastructureResource[] = [];
    
    if (await this.pathExists(cdkPath)) {
      // Scan CDK TypeScript files
      const cdkFiles = await this.findFiles(cdkPath, /\.(ts|js)$/);
      
      for (const filePath of cdkFiles) {
        const content = await fs.readFile(filePath, 'utf-8');
        const fileResources = await this.extractCDKResources(content, filePath);
        resources.push(...fileResources);
      }

      // Scan CDK output files for deployed resources
      const cdkOutPath = path.join(cdkPath, 'cdk.out');
      if (await this.pathExists(cdkOutPath)) {
        const deployedResources = await this.scanDeployedResources(cdkOutPath);
        resources.push(...deployedResources);
      }

      // Check for CloudFormation templates
      const cfTemplates = await this.findFiles(cdkPath, /template.*\.json$/);
      for (const templatePath of cfTemplates) {
        const templateResources = await this.extractCloudFormationResources(templatePath);
        resources.push(...templateResources);
      }
    }
    
    return this.deduplicateResources(resources);
  }

  private async extractCDKResources(content: string, filePath: string): Promise<InfrastructureResource[]> {
    const resources: InfrastructureResource[] = [];
    
    // Enhanced resource patterns for AWS CDK
    const resourcePatterns = [
      { pattern: /new\s+(\w*\.)?Function\s*\(/g, type: 'lambda' as const, service: 'AWS Lambda' },
      { pattern: /new\s+(\w*\.)?Table\s*\(/g, type: 'dynamodb' as const, service: 'DynamoDB' },
      { pattern: /new\s+(\w*\.)?GraphqlApi\s*\(/g, type: 'appsync' as const, service: 'AppSync' },
      { pattern: /new\s+(\w*\.)?UserPool\s*\(/g, type: 'cognito' as const, service: 'Cognito' },
      { pattern: /new\s+(\w*\.)?Bucket\s*\(/g, type: 's3' as const, service: 'S3' },
      { pattern: /new\s+(\w*\.)?Distribution\s*\(/g, type: 'cloudfront' as const, service: 'CloudFront' },
      { pattern: /new\s+(\w*\.)?RestApi\s*\(/g, type: 'apigateway' as const, service: 'API Gateway' },
      { pattern: /new\s+(\w*\.)?Cluster\s*\(/g, type: 'ecs' as const, service: 'ECS' },
      { pattern: /new\s+(\w*\.)?LoadBalancer\s*\(/g, type: 'elb' as const, service: 'Load Balancer' },
      { pattern: /new\s+(\w*\.)?Queue\s*\(/g, type: 'sqs' as const, service: 'SQS' },
      { pattern: /new\s+(\w*\.)?Topic\s*\(/g, type: 'sns' as const, service: 'SNS' },
    ];
    
    for (const { pattern, type, service } of resourcePatterns) {
      const matches = Array.from(content.matchAll(pattern));
      
      matches.forEach((match, index) => {
        const resourceName = this.extractResourceName(content, match.index || 0);
        
        resources.push({
          id: `${type}-${path.basename(filePath)}-${index}`,
          type,
          name: resourceName || match[0],
          region: this.extractRegion(content) || 'us-east-1',
          isActive: true, // Assume active if defined in CDK
          estimatedCost: this.estimateResourceCost(type),
          dependencies: this.extractResourceDependencies(content, match.index || 0),
          service,
          source: 'cdk',
          filePath,
        });
      });
    }
    
    return resources;
  }

  private async scanDeployedResources(cdkOutPath: string): Promise<InfrastructureResource[]> {
    const resources: InfrastructureResource[] = [];
    
    try {
      const manifestPath = path.join(cdkOutPath, 'manifest.json');
      if (await this.pathExists(manifestPath)) {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
        
        // Extract resources from CDK manifest
        for (const [stackName, stackInfo] of Object.entries(manifest.artifacts || {})) {
          if ((stackInfo as any).type === 'aws:cloudformation:stack') {
            const templatePath = path.join(cdkOutPath, (stackInfo as any).properties?.templateFile || '');
            if (await this.pathExists(templatePath)) {
              const stackResources = await this.extractCloudFormationResources(templatePath);
              resources.push(...stackResources.map(r => ({ ...r, stackName })));
            }
          }
        }
      }
    } catch (error) {
      // Skip if manifest can't be read
    }
    
    return resources;
  }

  private async extractCloudFormationResources(templatePath: string): Promise<InfrastructureResource[]> {
    const resources: InfrastructureResource[] = [];
    
    try {
      const template = JSON.parse(await fs.readFile(templatePath, 'utf-8'));
      
      if (template.Resources) {
        for (const [resourceId, resourceDef] of Object.entries(template.Resources)) {
          const resource = resourceDef as any;
          
          resources.push({
            id: resourceId,
            type: this.mapCloudFormationTypeToSimpleType(resource.Type),
            name: resourceId,
            region: 'us-east-1', // Default, could be extracted from template
            isActive: true,
            estimatedCost: this.estimateResourceCost(this.mapCloudFormationTypeToSimpleType(resource.Type)),
            dependencies: this.extractCloudFormationDependencies(resource),
            service: resource.Type,
            source: 'cloudformation',
            filePath: templatePath,
          });
        }
      }
    } catch (error) {
      // Skip if template can't be parsed
    }
    
    return resources;
  }

  private extractResourceName(content: string, matchIndex: number): string | null {
    // Try to extract variable name or constructor parameter
    const beforeMatch = content.substring(Math.max(0, matchIndex - 100), matchIndex);
    const nameMatch = beforeMatch.match(/(?:const|let|var)\s+(\w+)\s*=\s*$/);
    return nameMatch ? nameMatch[1] : null;
  }

  private extractRegion(content: string): string | null {
    const regionMatch = content.match(/region\s*:\s*['"]([^'"]+)['"]/);
    return regionMatch ? regionMatch[1] : null;
  }

  private extractResourceDependencies(content: string, matchIndex: number): string[] {
    // Simple dependency extraction - look for references to other resources
    const dependencies: string[] = [];
    const contextWindow = content.substring(matchIndex, Math.min(content.length, matchIndex + 500));
    
    // Look for common dependency patterns
    const depPatterns = [
      /\.arn/g,
      /\.ref/g,
      /Ref:\s*(\w+)/g,
      /!Ref\s+(\w+)/g,
    ];
    
    for (const pattern of depPatterns) {
      const matches = Array.from(contextWindow.matchAll(pattern));
      matches.forEach(match => {
        if (match[1]) {
          dependencies.push(match[1]);
        }
      });
    }
    
    return [...new Set(dependencies)];
  }

  private extractCloudFormationDependencies(resource: any): string[] {
    const dependencies: string[] = [];
    
    if (resource.DependsOn) {
      if (Array.isArray(resource.DependsOn)) {
        dependencies.push(...resource.DependsOn);
      } else {
        dependencies.push(resource.DependsOn);
      }
    }
    
    // Extract Ref and GetAtt dependencies from Properties
    const extractRefs = (obj: any): void => {
      if (typeof obj === 'object' && obj !== null) {
        if (obj.Ref) {
          dependencies.push(obj.Ref);
        }
        if (obj['Fn::GetAtt'] && Array.isArray(obj['Fn::GetAtt'])) {
          dependencies.push(obj['Fn::GetAtt'][0]);
        }
        
        Object.values(obj).forEach(extractRefs);
      }
    };
    
    if (resource.Properties) {
      extractRefs(resource.Properties);
    }
    
    return [...new Set(dependencies)];
  }

  private mapCloudFormationTypeToSimpleType(cfType: string): string {
    const typeMap: Record<string, string> = {
      'AWS::Lambda::Function': 'lambda',
      'AWS::DynamoDB::Table': 'dynamodb',
      'AWS::AppSync::GraphQLApi': 'appsync',
      'AWS::Cognito::UserPool': 'cognito',
      'AWS::S3::Bucket': 's3',
      'AWS::CloudFront::Distribution': 'cloudfront',
      'AWS::ApiGateway::RestApi': 'apigateway',
      'AWS::ECS::Cluster': 'ecs',
      'AWS::ElasticLoadBalancingV2::LoadBalancer': 'elb',
      'AWS::SQS::Queue': 'sqs',
      'AWS::SNS::Topic': 'sns',
    };
    
    return typeMap[cfType] || 'unknown';
  }

  private deduplicateResources(resources: InfrastructureResource[]): InfrastructureResource[] {
    const seen = new Set<string>();
    return resources.filter(resource => {
      const key = `${resource.type}-${resource.name}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async identifyFeatures(codebase: Codebase): Promise<Feature[]> {
    const features: Feature[] = [];
    
    // Analyze modules to identify features
    const modulesByFeature = this.groupModulesByFeature(codebase.analysis.modules);
    
    for (const [featureName, modules] of Object.entries(modulesByFeature)) {
      const feature = await this.analyzeFeatureDetails(featureName, modules, codebase);
      features.push(feature);
    }
    
    // Add infrastructure-based features
    const infraFeatures = await this.identifyInfrastructureFeatures(codebase.infrastructure);
    features.push(...infraFeatures);
    
    return features;
  }

  private async analyzeFeatureDetails(featureName: string, modules: ModuleInfo[], codebase: Codebase): Promise<Feature> {
    const complexity = this.assessComplexity(modules);
    const userImpact = this.assessUserImpact(featureName);
    const isCore = this.isCoreFeature(featureName);
    const isDeprecated = await this.isFeatureDeprecated(featureName, modules);
    const dependencies = await this.extractFeatureDependencies(featureName, modules, codebase);
    
    return {
      name: featureName,
      description: await this.generateFeatureDescription(featureName, modules),
      modules: modules.map(m => m.path),
      complexity,
      userImpact,
      isCore,
      isDeprecated,
      dependencies,
    };
  }

  private async generateFeatureDescription(featureName: string, modules: ModuleInfo[]): Promise<string> {
    const moduleTypes = [...new Set(modules.map(m => m.type))];
    const moduleCount = modules.length;
    
    const descriptions: Record<string, string> = {
      'auth': 'User authentication and authorization system',
      'room': 'Room management and lifecycle functionality',
      'vote': 'Real-time voting and decision-making system',
      'media': 'Media handling and streaming capabilities',
      'user': 'User profile and account management',
      'notification': 'Push notifications and messaging system',
      'analytics': 'Data collection and analytics tracking',
      'api': 'API endpoints and external integrations',
      'ui': 'User interface components and screens',
      'database': 'Data persistence and database operations',
      'config': 'Configuration and environment management',
      'test': 'Testing utilities and test suites',
    };
    
    const baseDescription = descriptions[featureName] || `${featureName} functionality`;
    return `${baseDescription} (${moduleCount} modules across ${moduleTypes.join(', ')})`;
  }

  private async identifyInfrastructureFeatures(infrastructure: InfrastructureAnalysis): Promise<Feature[]> {
    const features: Feature[] = [];
    
    if (!Array.isArray(infrastructure.awsResources)) {
      return features;
    }
    
    // Group AWS resources by service type
    const resourcesByService = new Map<string, any[]>();
    
    for (const resource of infrastructure.awsResources) {
      if (resource && typeof resource === 'object' && resource.type) {
        const serviceType = this.mapResourceTypeToService(resource.type);
        if (!resourcesByService.has(serviceType)) {
          resourcesByService.set(serviceType, []);
        }
        resourcesByService.get(serviceType)!.push(resource);
      }
    }
    
    // Create features for each service
    for (const [serviceType, resources] of resourcesByService) {
      if (resources.length > 0) {
        features.push({
          name: `aws-${serviceType}`,
          description: `AWS ${serviceType} infrastructure (${resources.length} resources)`,
          modules: resources.map(r => r.filePath || r.id).filter(Boolean),
          complexity: resources.length > 5 ? 'high' : resources.length > 2 ? 'medium' : 'low',
          userImpact: this.assessInfrastructureUserImpact(serviceType),
          isCore: this.isCoreInfrastructure(serviceType),
          isDeprecated: false,
          dependencies: this.extractInfrastructureDependencies(resources),
        });
      }
    }
    
    return features;
  }

  private mapResourceTypeToService(resourceType: string): string {
    const serviceMap: Record<string, string> = {
      'lambda': 'compute',
      'dynamodb': 'database',
      'appsync': 'api',
      'cognito': 'authentication',
      's3': 'storage',
      'cloudfront': 'cdn',
      'apigateway': 'api',
      'ecs': 'compute',
      'elb': 'networking',
      'sqs': 'messaging',
      'sns': 'messaging',
    };
    
    return serviceMap[resourceType] || 'other';
  }

  private assessInfrastructureUserImpact(serviceType: string): 'low' | 'medium' | 'high' {
    const highImpactServices = ['database', 'api', 'authentication'];
    const mediumImpactServices = ['compute', 'storage', 'messaging'];
    
    if (highImpactServices.includes(serviceType)) return 'high';
    if (mediumImpactServices.includes(serviceType)) return 'medium';
    return 'low';
  }

  private isCoreInfrastructure(serviceType: string): boolean {
    const coreServices = ['database', 'api', 'authentication', 'compute'];
    return coreServices.includes(serviceType);
  }

  private extractInfrastructureDependencies(resources: any[]): string[] {
    const dependencies = new Set<string>();
    
    for (const resource of resources) {
      if (resource.dependencies && Array.isArray(resource.dependencies)) {
        resource.dependencies.forEach((dep: string) => dependencies.add(dep));
      }
    }
    
    return Array.from(dependencies);
  }

  private async isFeatureDeprecated(featureName: string, modules: ModuleInfo[]): Promise<boolean> {
    // Check for deprecation indicators
    const deprecationIndicators = [
      'deprecated',
      'legacy',
      'old',
      'obsolete',
      'unused',
    ];
    
    // Check module paths for deprecation indicators
    const hasDeprecatedPaths = modules.some(module => 
      deprecationIndicators.some(indicator => 
        module.path.toLowerCase().includes(indicator)
      )
    );
    
    // Check for very old last modified dates (older than 1 year)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const hasOldModules = modules.every(module => 
      module.lastModified < oneYearAgo
    );
    
    return hasDeprecatedPaths || (hasOldModules && modules.length > 0);
  }

  private async extractFeatureDependencies(featureName: string, modules: ModuleInfo[], codebase: Codebase): Promise<string[]> {
    const dependencies = new Set<string>();
    
    // Extract dependencies from module imports
    for (const module of modules) {
      const moduleDeps = Array.isArray(module.dependencies) ? module.dependencies : [];
      
      for (const dep of moduleDeps) {
        if (typeof dep === 'string') {
          // Check if dependency belongs to another feature
          const depFeature = this.identifyFeatureFromDependency(dep, codebase.analysis.modules);
          if (depFeature && depFeature !== featureName) {
            dependencies.add(depFeature);
          }
        }
      }
    }
    
    return Array.from(dependencies);
  }

  private identifyFeatureFromDependency(dependency: string, allModules: ModuleInfo[]): string | null {
    // Try to find which feature this dependency belongs to
    for (const module of allModules) {
      if (module.path.includes(dependency) || module.name === dependency) {
        return this.extractFeatureName(module.path);
      }
    }
    
    return null;
  }

  private async identifyMissingFeatures(codebase: Codebase): Promise<string[]> {
    const missingFeatures: string[] = [];
    const existingFeatures = new Set(
      (await this.identifyFeatures(codebase)).map(f => f.name)
    );
    
    // Common features that should exist in a complete application
    const expectedFeatures = [
      'auth',
      'user',
      'api',
      'database',
      'ui',
      'config',
      'test',
    ];
    
    // Trinity-specific features
    const trinityFeatures = [
      'room',
      'vote',
      'media',
      'realtime',
      'notification',
    ];
    
    // Check for missing common features
    for (const feature of expectedFeatures) {
      if (!existingFeatures.has(feature)) {
        missingFeatures.push(feature);
      }
    }
    
    // Check for missing Trinity-specific features
    for (const feature of trinityFeatures) {
      if (!existingFeatures.has(feature)) {
        missingFeatures.push(feature);
      }
    }
    
    return missingFeatures;
  }

  private async findObsoleteComponents(analysis: SystemAnalysis): Promise<ObsoleteComponent[]> {
    const components: ObsoleteComponent[] = [];
    
    // Find unused dependencies
    if (analysis.repository.dependencies.unusedDependencies && Array.isArray(analysis.repository.dependencies.unusedDependencies)) {
      for (const dep of analysis.repository.dependencies.unusedDependencies) {
        components.push({
          path: dep,
          type: 'dependency',
          reason: 'Unused dependency detected in package.json',
          safeToRemove: true,
          dependencies: [],
        });
      }
    }
    
    // Find dead code files
    const deadCodeFiles = await this.findDeadCodeFiles(analysis.repository.modules);
    components.push(...deadCodeFiles);
    
    // Find obsolete configuration files
    const obsoleteConfigs = this.findObsoleteConfigurations(analysis.repository.configurations);
    components.push(...obsoleteConfigs);
    
    // Find unused AWS resources
    const unusedAwsResources = await this.findUnusedAwsResources(analysis.infrastructure.awsResources);
    components.push(...unusedAwsResources);
    
    // Find duplicate dependencies across projects
    const duplicateDeps = await this.findDuplicateDependencies(analysis.repository.modules);
    components.push(...duplicateDeps);
    
    return components;
  }

  private async findDeadCodeFiles(modules: ModuleInfo[]): Promise<ObsoleteComponent[]> {
    const components: ObsoleteComponent[] = [];
    const moduleMap = new Map<string, ModuleInfo>();
    const referencedModules = new Set<string>();
    
    // Build module map
    for (const module of modules) {
      moduleMap.set(module.path, module);
    }
    
    // Find all referenced modules
    for (const module of modules) {
      // Ensure dependencies is an array
      const dependencies = Array.isArray(module.dependencies) ? module.dependencies : [];
      
      for (const dep of dependencies) {
        // Convert relative imports to absolute paths
        if (dep.startsWith('./') || dep.startsWith('../')) {
          const resolvedPath = this.resolveRelativePath(module.path, dep);
          referencedModules.add(resolvedPath);
        } else if (!dep.startsWith('@') && !dep.includes('node_modules')) {
          // Internal module reference
          referencedModules.add(dep);
        }
      }
    }
    
    // Find unreferenced modules (potential dead code)
    for (const module of modules) {
      const isReferenced = referencedModules.has(module.path) || 
                          referencedModules.has(module.name) ||
                          this.isEntryPoint(module.path);
      
      if (!isReferenced && this.isRemovableFile(module.path)) {
        const dependencies = Array.isArray(module.dependencies) ? module.dependencies : [];
        
        components.push({
          path: module.path,
          type: 'file',
          reason: 'Unreferenced module - potential dead code',
          safeToRemove: true,
          dependencies,
          lastUsed: module.lastModified,
        });
      }
    }
    
    return components;
  }

  private findObsoleteConfigurations(configurations: ConfigurationFiles[]): ObsoleteComponent[] {
    const components: ObsoleteComponent[] = [];
    
    for (const config of configurations) {
      if (config.isObsolete) {
        components.push({
          path: config.path,
          type: 'file',
          reason: `Obsolete ${config.type} configuration detected`,
          safeToRemove: this.isConfigSafeToRemove(config.type),
          dependencies: [],
        });
      }
    }
    
    // Find duplicate configurations
    const configsByType = new Map<string, ConfigurationFiles[]>();
    for (const config of configurations) {
      if (!configsByType.has(config.type)) {
        configsByType.set(config.type, []);
      }
      configsByType.get(config.type)!.push(config);
    }
    
    for (const [type, configs] of configsByType) {
      if (configs.length > 1 && type !== 'env') { // Multiple env files are normal
        // Mark all but the most recent as potentially obsolete
        const sorted = configs.sort((a, b) => {
          const aTime = this.getConfigLastModified(a);
          const bTime = this.getConfigLastModified(b);
          return bTime.getTime() - aTime.getTime();
        });
        
        for (let i = 1; i < sorted.length; i++) {
          components.push({
            path: sorted[i].path,
            type: 'file',
            reason: `Duplicate ${type} configuration - newer version exists`,
            safeToRemove: false, // Requires manual review
            dependencies: [],
          });
        }
      }
    }
    
    return components;
  }

  private async findUnusedAwsResources(awsResources: any[]): Promise<ObsoleteComponent[]> {
    const components: ObsoleteComponent[] = [];
    
    if (!Array.isArray(awsResources)) {
      return components;
    }
    
    for (const resource of awsResources) {
      if (resource && typeof resource === 'object') {
        // Check if resource appears to be unused
        const isUnused = this.isResourceUnused(resource);
        const hasExpensiveCost = resource.estimatedCost > 20; // $20+ per month
        
        if (isUnused || hasExpensiveCost) {
          components.push({
            path: resource.id || resource.name || 'unknown-resource',
            type: 'infrastructure',
            reason: isUnused 
              ? 'AWS resource appears unused - no recent activity'
              : `High-cost AWS resource ($${resource.estimatedCost}/month) - review for optimization`,
            safeToRemove: isUnused && (!resource.dependencies || resource.dependencies.length === 0),
            dependencies: resource.dependencies || [],
            lastUsed: resource.lastUsed,
          });
        }
      }
    }
    
    return components;
  }

  private async findDuplicateDependencies(modules: ModuleInfo[]): Promise<ObsoleteComponent[]> {
    const components: ObsoleteComponent[] = [];
    const dependencyVersions = new Map<string, Set<string>>();
    
    // Collect all dependency versions across modules
    for (const module of modules) {
      // Ensure dependencies is an array
      const dependencies = Array.isArray(module.dependencies) ? module.dependencies : [];
      
      for (const dep of dependencies) {
        if (typeof dep === 'string' && dep.includes('@')) {
          const [name, version] = dep.split('@');
          if (name && version) {
            if (!dependencyVersions.has(name)) {
              dependencyVersions.set(name, new Set());
            }
            dependencyVersions.get(name)!.add(version);
          }
        }
      }
    }
    
    // Find dependencies with multiple versions
    for (const [depName, versions] of dependencyVersions) {
      if (versions.size > 1) {
        const versionArray = Array.from(versions);
        // Assume the latest version should be kept, others are obsolete
        for (let i = 0; i < versionArray.length - 1; i++) {
          components.push({
            path: `${depName}@${versionArray[i]}`,
            type: 'dependency',
            reason: `Duplicate dependency version - newer version ${versionArray[versionArray.length - 1]} exists`,
            safeToRemove: false, // Requires careful migration
            dependencies: [],
          });
        }
      }
    }
    
    return components;
  }

  private resolveRelativePath(basePath: string, relativePath: string): string {
    const baseDir = path.dirname(basePath);
    return path.resolve(baseDir, relativePath);
  }

  private isEntryPoint(filePath: string): boolean {
    const entryPointPatterns = [
      /main\.(ts|js)$/,
      /index\.(ts|js)$/,
      /app\.(ts|js|tsx)$/,
      /_layout\.(ts|js|tsx)$/,
      /\+layout\.(ts|js|tsx)$/,
    ];
    
    return entryPointPatterns.some(pattern => pattern.test(filePath));
  }

  private isRemovableFile(filePath: string): boolean {
    // Don't mark certain critical files as removable
    const criticalPatterns = [
      /package\.json$/,
      /tsconfig.*\.json$/,
      /\.env/,
      /Dockerfile/,
      /README/i,
      /LICENSE/i,
    ];
    
    return !criticalPatterns.some(pattern => pattern.test(filePath));
  }

  private isConfigSafeToRemove(configType: string): boolean {
    const safeToRemoveTypes = ['prettier', 'eslint'];
    const dangerousTypes = ['package.json', 'tsconfig', 'env', 'docker'];
    
    if (safeToRemoveTypes.includes(configType)) return true;
    if (dangerousTypes.includes(configType)) return false;
    return false; // Conservative default
  }

  private getConfigLastModified(config: ConfigurationFiles): Date {
    // Try to extract modification time from config metadata
    // For now, return current date as fallback
    return new Date();
  }

  private isResourceUnused(resource: any): boolean {
    // Heuristics for determining if AWS resource is unused
    if (resource.lastUsed) {
      const daysSinceLastUse = (Date.now() - new Date(resource.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceLastUse > 30; // Unused for more than 30 days
    }
    
    // If no usage data, assume it might be unused if it has no dependencies
    return !resource.dependencies || resource.dependencies.length === 0;
  }

  private async calculateObsoleteSize(components: ObsoleteComponent[]): Promise<number> {
    // TODO: Implement size calculation
    return components.length * 1024; // Rough estimate
  }

  private estimateCostSavings(components: ObsoleteComponent[]): number {
    return components.filter(c => c.type === 'infrastructure').length * 10; // $10 per resource
  }

  private estimateComplexityReduction(components: ObsoleteComponent[]): number {
    return components.length * 0.1; // 10% complexity reduction per component
  }

  // Utility methods

  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async findFiles(
    rootPath: string,
    pattern: RegExp,
    excludePatterns: RegExp[] = [/node_modules/, /\.git/, /dist/, /build/]
  ): Promise<string[]> {
    const files: string[] = [];
    
    const scanDirectory = async (dirPath: string) => {
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

  private extractImports(content: string): string[] {
    const importRegex = /import.*from\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    return imports;
  }

  private extractExports(content: string): string[] {
    const exportRegex = /export\s+(?:class|function|const|let|var|interface|type)\s+(\w+)/g;
    const exports: string[] = [];
    let match;
    
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    
    return exports;
  }

  private groupModulesByFeature(modules: ModuleInfo[]): Record<string, ModuleInfo[]> {
    const groups: Record<string, ModuleInfo[]> = {};
    
    for (const module of modules) {
      const featureName = this.extractFeatureName(module.path);
      if (!groups[featureName]) {
        groups[featureName] = [];
      }
      groups[featureName].push(module);
    }
    
    return groups;
  }

  private extractFeatureName(modulePath: string): string {
    const pathParts = modulePath.split(path.sep);
    
    // Enhanced feature indicators with more comprehensive patterns
    const featureIndicators = [
      'auth', 'authentication', 'login', 'signin', 'signup',
      'room', 'rooms', 'meeting', 'session',
      'vote', 'voting', 'poll', 'ballot', 'decision',
      'media', 'video', 'audio', 'stream', 'content',
      'user', 'users', 'profile', 'account',
      'notification', 'notifications', 'push', 'alert',
      'analytics', 'tracking', 'metrics', 'stats',
      'api', 'endpoint', 'route', 'controller',
      'ui', 'component', 'screen', 'view', 'page',
      'database', 'db', 'data', 'model', 'entity',
      'config', 'configuration', 'settings', 'env',
      'test', 'testing', 'spec', '__tests__',
      'realtime', 'websocket', 'socket', 'live',
      'chat', 'message', 'messaging',
      'security', 'permission', 'role', 'access',
      'infrastructure', 'infra', 'deployment', 'deploy',
    ];
    
    // Check each path part for feature indicators
    for (const part of pathParts) {
      const lowerPart = part.toLowerCase();
      
      for (const indicator of featureIndicators) {
        if (lowerPart.includes(indicator)) {
          // Map specific indicators to canonical feature names
          return this.mapToCanonicalFeatureName(indicator);
        }
      }
    }
    
    // Check filename for feature indicators
    const filename = path.basename(modulePath, path.extname(modulePath)).toLowerCase();
    for (const indicator of featureIndicators) {
      if (filename.includes(indicator)) {
        return this.mapToCanonicalFeatureName(indicator);
      }
    }
    
    // Fallback: try to extract from directory structure
    const relevantParts = pathParts.filter(part => 
      !['src', 'lib', 'components', 'services', 'utils', 'helpers', 'types'].includes(part.toLowerCase())
    );
    
    if (relevantParts.length > 0) {
      return this.mapToCanonicalFeatureName(relevantParts[0].toLowerCase());
    }
    
    return 'unknown';
  }

  private mapToCanonicalFeatureName(indicator: string): string {
    const featureMap: Record<string, string> = {
      // Authentication
      'auth': 'auth',
      'authentication': 'auth',
      'login': 'auth',
      'signin': 'auth',
      'signup': 'auth',
      
      // Room management
      'room': 'room',
      'rooms': 'room',
      'meeting': 'room',
      'session': 'room',
      
      // Voting
      'vote': 'vote',
      'voting': 'vote',
      'poll': 'vote',
      'ballot': 'vote',
      'decision': 'vote',
      
      // Media
      'media': 'media',
      'video': 'media',
      'audio': 'media',
      'stream': 'media',
      'content': 'media',
      
      // User management
      'user': 'user',
      'users': 'user',
      'profile': 'user',
      'account': 'user',
      
      // Notifications
      'notification': 'notification',
      'notifications': 'notification',
      'push': 'notification',
      'alert': 'notification',
      
      // Analytics
      'analytics': 'analytics',
      'tracking': 'analytics',
      'metrics': 'analytics',
      'stats': 'analytics',
      
      // API
      'api': 'api',
      'endpoint': 'api',
      'route': 'api',
      'controller': 'api',
      
      // UI
      'ui': 'ui',
      'component': 'ui',
      'screen': 'ui',
      'view': 'ui',
      'page': 'ui',
      
      // Database
      'database': 'database',
      'db': 'database',
      'data': 'database',
      'model': 'database',
      'entity': 'database',
      
      // Configuration
      'config': 'config',
      'configuration': 'config',
      'settings': 'config',
      'env': 'config',
      
      // Testing
      'test': 'test',
      'testing': 'test',
      'spec': 'test',
      '__tests__': 'test',
      
      // Real-time
      'realtime': 'realtime',
      'websocket': 'realtime',
      'socket': 'realtime',
      'live': 'realtime',
      
      // Chat/Messaging
      'chat': 'chat',
      'message': 'chat',
      'messaging': 'chat',
      
      // Security
      'security': 'security',
      'permission': 'security',
      'role': 'security',
      'access': 'security',
      
      // Infrastructure
      'infrastructure': 'infrastructure',
      'infra': 'infrastructure',
      'deployment': 'infrastructure',
      'deploy': 'infrastructure',
    };
    
    return featureMap[indicator] || indicator;
  }

  private assessComplexity(modules: ModuleInfo[]): 'low' | 'medium' | 'high' {
    const totalSize = modules.reduce((sum, m) => sum + (m.size || 0), 0);
    const avgDependencies = modules.length > 0 
      ? modules.reduce((sum, m) => sum + (Array.isArray(m.dependencies) ? m.dependencies.length : 0), 0) / modules.length 
      : 0;
    
    if (totalSize > 50000 || avgDependencies > 10) return 'high';
    if (totalSize > 20000 || avgDependencies > 5) return 'medium';
    return 'low';
  }

  private assessUserImpact(featureName: string): 'low' | 'medium' | 'high' {
    const highImpactFeatures = ['auth', 'room', 'vote'];
    const mediumImpactFeatures = ['media', 'user'];
    
    if (highImpactFeatures.includes(featureName)) return 'high';
    if (mediumImpactFeatures.includes(featureName)) return 'medium';
    return 'low';
  }

  private isCoreFeature(featureName: string): boolean {
    const coreFeatures = ['auth', 'room', 'vote'];
    return coreFeatures.includes(featureName);
  }

  private estimateResourceCost(type: string): number {
    const costMap: Record<string, number> = {
      lambda: 5,
      dynamodb: 10,
      appsync: 15,
      cognito: 8,
      s3: 3,
      cloudfront: 12,
    };
    
    return costMap[type] || 5;
  }
}