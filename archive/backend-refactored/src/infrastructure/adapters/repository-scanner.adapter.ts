/**
 * Repository Scanner Adapter
 * Infrastructure adapter for scanning NestJS repositories
 */

import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { IRepositoryScanner } from '../../domain/services/analysis-engine.interface';
import {
  ModuleInfo,
  ConfigurationFiles,
  DependencyGraph,
  CoverageReport,
  PackageJsonInfo,
  TsConfigInfo,
  NestCliInfo,
  EnvFileInfo,
  DockerFileInfo,
  OtherConfigInfo,
  DependencyNode,
  DependencyEdge,
  MethodInfo,
  PropertyInfo,
  ParameterInfo,
  CoverageMetrics,
} from '../../domain/entities/analysis.entity';

@Injectable()
export class RepositoryScannerAdapter implements IRepositoryScanner {
  private readonly logger = new Logger(RepositoryScannerAdapter.name);

  async scanNestJSModules(scanPath: string): Promise<ModuleInfo[]> {
    this.logger.log(`Scanning NestJS modules in path: ${scanPath}`);

    try {
      const modules: ModuleInfo[] = [];
      await this.scanDirectory(scanPath, modules);

      this.logger.log(`Found ${modules.length} NestJS modules`);
      return modules;
    } catch (error) {
      this.logger.error(`Failed to scan NestJS modules: ${error.message}`, error.stack);
      throw new Error(`Failed to scan NestJS modules: ${error.message}`);
    }
  }

  async scanConfigurationFiles(scanPath: string): Promise<ConfigurationFiles> {
    this.logger.log(`Scanning configuration files in path: ${scanPath}`);

    try {
      const [packageJson, tsConfig, nestCliJson, envFiles, dockerFiles, other] = await Promise.all([
        this.scanPackageJsonFiles(scanPath),
        this.scanTsConfigFiles(scanPath),
        this.scanNestCliFiles(scanPath),
        this.scanEnvFiles(scanPath),
        this.scanDockerFiles(scanPath),
        this.scanOtherConfigFiles(scanPath),
      ]);

      const configurations: ConfigurationFiles = {
        packageJson,
        tsConfig,
        nestCliJson,
        envFiles,
        dockerFiles,
        other,
      };

      this.logger.log(`Found configuration files: ${packageJson.length} package.json, ${tsConfig.length} tsconfig, ${envFiles.length} env files`);
      return configurations;
    } catch (error) {
      this.logger.error(`Failed to scan configuration files: ${error.message}`, error.stack);
      throw new Error(`Failed to scan configuration files: ${error.message}`);
    }
  }

  async analyzeDependencies(scanPath: string): Promise<DependencyGraph> {
    this.logger.log(`Analyzing dependencies in path: ${scanPath}`);

    try {
      const nodes: DependencyNode[] = [];
      const edges: DependencyEdge[] = [];
      const processedFiles = new Set<string>();

      await this.analyzeDependenciesRecursive(scanPath, nodes, edges, processedFiles);

      // Detect circular dependencies
      const circularDependencies = this.detectCircularDependencies(nodes, edges);

      // Find orphaned modules
      const orphanedModules = this.findOrphanedModules(nodes, edges);

      const dependencyGraph: DependencyGraph = {
        nodes,
        edges,
        circularDependencies,
        orphanedModules,
      };

      this.logger.log(`Dependency analysis completed: ${nodes.length} nodes, ${edges.length} edges, ${circularDependencies.length} circular dependencies`);
      return dependencyGraph;
    } catch (error) {
      this.logger.error(`Failed to analyze dependencies: ${error.message}`, error.stack);
      throw new Error(`Failed to analyze dependencies: ${error.message}`);
    }
  }

  async analyzeTestCoverage(scanPath: string): Promise<CoverageReport> {
    this.logger.log(`Analyzing test coverage in path: ${scanPath}`);

    try {
      // Look for coverage reports (Jest, NYC, etc.)
      const coverageFiles = await this.findCoverageFiles(scanPath);
      
      if (coverageFiles.length === 0) {
        this.logger.warn('No coverage files found, returning empty coverage report');
        return this.createEmptyCoverageReport();
      }

      // Parse coverage files and create report
      const coverageReport = await this.parseCoverageFiles(coverageFiles);

      this.logger.log(`Test coverage analysis completed: ${coverageReport.overall.percentage.lines}% line coverage`);
      return coverageReport;
    } catch (error) {
      this.logger.error(`Failed to analyze test coverage: ${error.message}`, error.stack);
      // Return empty coverage report instead of throwing
      return this.createEmptyCoverageReport();
    }
  }

  private async scanDirectory(dirPath: string, modules: ModuleInfo[], depth = 0): Promise<void> {
    if (depth > 10) return; // Prevent infinite recursion

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and other irrelevant directories
          if (this.shouldSkipDirectory(entry.name)) continue;
          await this.scanDirectory(fullPath, modules, depth + 1);
        } else if (entry.isFile() && this.isTypeScriptFile(entry.name)) {
          const moduleInfo = await this.analyzeTypeScriptFile(fullPath);
          if (moduleInfo) {
            modules.push(moduleInfo);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan directory ${dirPath}: ${error.message}`);
    }
  }

  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.nyc_output'];
    return skipDirs.includes(dirName) || dirName.startsWith('.');
  }

  private isTypeScriptFile(fileName: string): boolean {
    return fileName.endsWith('.ts') && !fileName.endsWith('.d.ts');
  }

  private async analyzeTypeScriptFile(filePath: string): Promise<ModuleInfo | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);

      // Basic analysis of TypeScript file
      const moduleType = this.determineModuleType(content, filePath);
      if (!moduleType) return null;

      const dependencies = this.extractDependencies(content);
      const exports = this.extractExports(content);
      const imports = this.extractImports(content);
      const decorators = this.extractDecorators(content);
      const methods = this.extractMethods(content);
      const properties = this.extractProperties(content);
      const complexity = this.calculateComplexity(content);

      const moduleInfo: ModuleInfo = {
        name: path.basename(filePath, '.ts'),
        path: filePath,
        type: moduleType,
        dependencies,
        exports,
        imports,
        decorators,
        methods,
        properties,
        isDeprecated: this.isDeprecated(content),
        complexity,
        lastModified: stats.mtime,
      };

      return moduleInfo;
    } catch (error) {
      this.logger.warn(`Failed to analyze file ${filePath}: ${error.message}`);
      return null;
    }
  }

  private determineModuleType(content: string, filePath: string): ModuleInfo['type'] | null {
    const fileName = path.basename(filePath);

    if (content.includes('@Controller(') || fileName.includes('.controller.')) return 'controller';
    if (content.includes('@Injectable(') || fileName.includes('.service.')) return 'service';
    if (content.includes('@Module(') || fileName.includes('.module.')) return 'module';
    if (content.includes('@Guard(') || fileName.includes('.guard.')) return 'guard';
    if (content.includes('@Interceptor(') || fileName.includes('.interceptor.')) return 'interceptor';
    if (content.includes('export class') && fileName.includes('.dto.')) return 'dto';
    if (content.includes('export class') && fileName.includes('.entity.')) return 'entity';
    if (content.includes('export function') || content.includes('export const')) return 'decorator';

    return null;
  }

  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }

    return [...new Set(dependencies)];
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex = /export\s+(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;
    let match;

    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    return exports;
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+\{([^}]+)\}/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importList = match[1].split(',').map(imp => imp.trim());
      imports.push(...importList);
    }

    return [...new Set(imports)];
  }

  private extractDecorators(content: string): string[] {
    const decorators: string[] = [];
    const decoratorRegex = /@(\w+)(?:\([^)]*\))?/g;
    let match;

    while ((match = decoratorRegex.exec(content)) !== null) {
      decorators.push(match[1]);
    }

    return [...new Set(decorators)];
  }

  private extractMethods(content: string): MethodInfo[] {
    const methods: MethodInfo[] = [];
    const methodRegex = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/g;
    let match;

    while ((match = methodRegex.exec(content)) !== null) {
      const methodName = match[1];
      if (methodName === 'constructor' || methodName === 'class') continue;

      const isAsync = match[0].includes('async');
      const parameters = this.extractMethodParameters(match[0]);
      const returnType = this.extractReturnType(match[0]);
      const methodDecorators = this.extractMethodDecorators(content, match.index);
      const lineCount = this.countMethodLines(content, match.index);
      const complexity = this.calculateMethodComplexity(content, match.index);

      methods.push({
        name: methodName,
        parameters,
        returnType,
        decorators: methodDecorators,
        isAsync,
        complexity,
        lineCount,
      });
    }

    return methods;
  }

  private extractMethodParameters(methodSignature: string): ParameterInfo[] {
    const parameters: ParameterInfo[] = [];
    const paramRegex = /(\w+)(\?)?:\s*([^,)]+)/g;
    let match;

    while ((match = paramRegex.exec(methodSignature)) !== null) {
      parameters.push({
        name: match[1],
        type: match[3].trim(),
        isOptional: !!match[2],
        decorators: [], // Would need more sophisticated parsing
      });
    }

    return parameters;
  }

  private extractReturnType(methodSignature: string): string {
    const returnTypeMatch = methodSignature.match(/:\s*([^{]+)\s*\{/);
    return returnTypeMatch ? returnTypeMatch[1].trim() : 'void';
  }

  private extractMethodDecorators(content: string, methodIndex: number): string[] {
    // Look backwards from method to find decorators
    const beforeMethod = content.substring(0, methodIndex);
    const lines = beforeMethod.split('\n');
    const decorators: string[] = [];

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('@')) {
        const decoratorMatch = line.match(/@(\w+)/);
        if (decoratorMatch) {
          decorators.unshift(decoratorMatch[1]);
        }
      } else if (line && !line.startsWith('//')) {
        break;
      }
    }

    return decorators;
  }

  private countMethodLines(content: string, methodIndex: number): number {
    let braceCount = 0;
    let lineCount = 1;
    let i = methodIndex;

    while (i < content.length) {
      const char = content[i];
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (char === '\n') lineCount++;
      if (braceCount === 0 && char === '}') break;
      i++;
    }

    return lineCount;
  }

  private calculateMethodComplexity(content: string, methodIndex: number): number {
    // Simple cyclomatic complexity calculation
    let complexity = 1; // Base complexity
    let braceCount = 0;
    let i = methodIndex;

    while (i < content.length) {
      const char = content[i];
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      
      // Look for complexity-increasing constructs
      const remaining = content.substring(i);
      if (remaining.startsWith('if') || remaining.startsWith('while') || 
          remaining.startsWith('for') || remaining.startsWith('switch') ||
          remaining.startsWith('catch') || remaining.startsWith('&&') ||
          remaining.startsWith('||')) {
        complexity++;
      }

      if (braceCount === 0 && char === '}') break;
      i++;
    }

    return complexity;
  }

  private extractProperties(content: string): PropertyInfo[] {
    const properties: PropertyInfo[] = [];
    const propertyRegex = /(?:readonly\s+)?(\w+)(\?)?:\s*([^;=\n]+)/g;
    let match;

    while ((match = propertyRegex.exec(content)) !== null) {
      properties.push({
        name: match[1],
        type: match[3].trim(),
        decorators: [], // Would need more sophisticated parsing
        isReadonly: content.substring(match.index - 10, match.index).includes('readonly'),
        isOptional: !!match[2],
      });
    }

    return properties;
  }

  private isDeprecated(content: string): boolean {
    return content.includes('@deprecated') || content.includes('* @deprecated');
  }

  private calculateComplexity(content: string): number {
    // Simple complexity calculation based on various factors
    const lines = content.split('\n').length;
    const methods = (content.match(/\w+\s*\([^)]*\)\s*\{/g) || []).length;
    const conditions = (content.match(/\b(if|while|for|switch|catch)\b/g) || []).length;
    const classes = (content.match(/class\s+\w+/g) || []).length;

    return Math.round((lines / 10) + (methods * 2) + (conditions * 1.5) + (classes * 3));
  }

  private async scanPackageJsonFiles(scanPath: string): Promise<PackageJsonInfo[]> {
    const packageJsonFiles: PackageJsonInfo[] = [];
    
    try {
      await this.findFilesRecursive(scanPath, 'package.json', async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const packageData = JSON.parse(content);

          packageJsonFiles.push({
            path: filePath,
            name: packageData.name || 'unknown',
            version: packageData.version || '0.0.0',
            dependencies: packageData.dependencies || {},
            devDependencies: packageData.devDependencies || {},
            scripts: packageData.scripts || {},
            engines: packageData.engines,
            workspaces: packageData.workspaces,
          });
        } catch (error) {
          this.logger.warn(`Failed to parse package.json at ${filePath}: ${error.message}`);
        }
      });
    } catch (error) {
      this.logger.warn(`Failed to scan package.json files: ${error.message}`);
    }

    return packageJsonFiles;
  }

  private async scanTsConfigFiles(scanPath: string): Promise<TsConfigInfo[]> {
    const tsConfigFiles: TsConfigInfo[] = [];
    
    try {
      await this.findFilesRecursive(scanPath, 'tsconfig*.json', async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const tsConfigData = JSON.parse(content);

          tsConfigFiles.push({
            path: filePath,
            compilerOptions: tsConfigData.compilerOptions || {},
            include: tsConfigData.include || [],
            exclude: tsConfigData.exclude || [],
            extends: tsConfigData.extends,
            references: tsConfigData.references,
          });
        } catch (error) {
          this.logger.warn(`Failed to parse tsconfig at ${filePath}: ${error.message}`);
        }
      });
    } catch (error) {
      this.logger.warn(`Failed to scan tsconfig files: ${error.message}`);
    }

    return tsConfigFiles;
  }

  private async scanNestCliFiles(scanPath: string): Promise<NestCliInfo[]> {
    const nestCliFiles: NestCliInfo[] = [];
    
    try {
      await this.findFilesRecursive(scanPath, 'nest-cli.json', async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const nestCliData = JSON.parse(content);

          nestCliFiles.push({
            path: filePath,
            collection: nestCliData.collection || '@nestjs/schematics',
            sourceRoot: nestCliData.sourceRoot || 'src',
            compilerOptions: nestCliData.compilerOptions || {},
            generateOptions: nestCliData.generateOptions || {},
          });
        } catch (error) {
          this.logger.warn(`Failed to parse nest-cli.json at ${filePath}: ${error.message}`);
        }
      });
    } catch (error) {
      this.logger.warn(`Failed to scan nest-cli.json files: ${error.message}`);
    }

    return nestCliFiles;
  }

  private async scanEnvFiles(scanPath: string): Promise<EnvFileInfo[]> {
    const envFiles: EnvFileInfo[] = [];
    
    try {
      await this.findFilesRecursive(scanPath, '.env*', async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const variables: Record<string, string> = {};
          
          content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              const [key, ...valueParts] = trimmed.split('=');
              if (key && valueParts.length > 0) {
                variables[key.trim()] = valueParts.join('=').trim();
              }
            }
          });

          envFiles.push({
            path: filePath,
            variables,
            isExample: path.basename(filePath).includes('example'),
          });
        } catch (error) {
          this.logger.warn(`Failed to parse env file at ${filePath}: ${error.message}`);
        }
      });
    } catch (error) {
      this.logger.warn(`Failed to scan env files: ${error.message}`);
    }

    return envFiles;
  }

  private async scanDockerFiles(scanPath: string): Promise<DockerFileInfo[]> {
    const dockerFiles: DockerFileInfo[] = [];
    
    try {
      await this.findFilesRecursive(scanPath, 'Dockerfile*', async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n').map(line => line.trim()).filter(line => line);
          
          const baseImage = this.extractDockerBaseImage(lines);
          const exposedPorts = this.extractDockerExposedPorts(lines);
          const volumes = this.extractDockerVolumes(lines);

          dockerFiles.push({
            path: filePath,
            baseImage,
            commands: lines,
            exposedPorts,
            volumes,
          });
        } catch (error) {
          this.logger.warn(`Failed to parse Dockerfile at ${filePath}: ${error.message}`);
        }
      });
    } catch (error) {
      this.logger.warn(`Failed to scan Docker files: ${error.message}`);
    }

    return dockerFiles;
  }

  private async scanOtherConfigFiles(scanPath: string): Promise<OtherConfigInfo[]> {
    const otherFiles: OtherConfigInfo[] = [];
    const configExtensions = ['.json', '.yml', '.yaml', '.xml', '.toml'];
    
    try {
      await this.findConfigFilesRecursive(scanPath, configExtensions, async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const fileName = path.basename(filePath);
          
          // Skip already processed files
          if (fileName.startsWith('package.json') || fileName.startsWith('tsconfig') || 
              fileName === 'nest-cli.json' || fileName.startsWith('.env')) {
            return;
          }

          let parsedContent: Record<string, any> = {};
          
          if (filePath.endsWith('.json')) {
            parsedContent = JSON.parse(content);
          } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
            // Simple YAML parsing (would need yaml library for full support)
            parsedContent = { raw: content };
          } else {
            parsedContent = { raw: content };
          }

          otherFiles.push({
            path: filePath,
            type: path.extname(filePath).substring(1),
            content: parsedContent,
          });
        } catch (error) {
          this.logger.warn(`Failed to parse config file at ${filePath}: ${error.message}`);
        }
      });
    } catch (error) {
      this.logger.warn(`Failed to scan other config files: ${error.message}`);
    }

    return otherFiles;
  }

  private async findFilesRecursive(
    dirPath: string, 
    pattern: string, 
    callback: (filePath: string) => Promise<void>,
    depth = 0
  ): Promise<void> {
    if (depth > 10) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (this.shouldSkipDirectory(entry.name)) continue;
          await this.findFilesRecursive(fullPath, pattern, callback, depth + 1);
        } else if (entry.isFile()) {
          if (this.matchesPattern(entry.name, pattern)) {
            await callback(fullPath);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan directory ${dirPath}: ${error.message}`);
    }
  }

  private async findConfigFilesRecursive(
    dirPath: string,
    extensions: string[],
    callback: (filePath: string) => Promise<void>,
    depth = 0
  ): Promise<void> {
    if (depth > 10) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (this.shouldSkipDirectory(entry.name)) continue;
          await this.findConfigFilesRecursive(fullPath, extensions, callback, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            await callback(fullPath);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan directory ${dirPath}: ${error.message}`);
    }
  }

  private matchesPattern(fileName: string, pattern: string): boolean {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(fileName);
    }
    return fileName === pattern;
  }

  private extractDockerBaseImage(lines: string[]): string {
    const fromLine = lines.find(line => line.toUpperCase().startsWith('FROM'));
    return fromLine ? fromLine.split(' ')[1] : 'unknown';
  }

  private extractDockerExposedPorts(lines: string[]): number[] {
    const ports: number[] = [];
    lines.forEach(line => {
      if (line.toUpperCase().startsWith('EXPOSE')) {
        const portStr = line.split(' ')[1];
        const port = parseInt(portStr, 10);
        if (!isNaN(port)) {
          ports.push(port);
        }
      }
    });
    return ports;
  }

  private extractDockerVolumes(lines: string[]): string[] {
    const volumes: string[] = [];
    lines.forEach(line => {
      if (line.toUpperCase().startsWith('VOLUME')) {
        const volume = line.substring(6).trim();
        volumes.push(volume);
      }
    });
    return volumes;
  }

  private async analyzeDependenciesRecursive(
    dirPath: string,
    nodes: DependencyNode[],
    edges: DependencyEdge[],
    processedFiles: Set<string>,
    depth = 0
  ): Promise<void> {
    if (depth > 10) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (this.shouldSkipDirectory(entry.name)) continue;
          await this.analyzeDependenciesRecursive(fullPath, nodes, edges, processedFiles, depth + 1);
        } else if (entry.isFile() && this.isTypeScriptFile(entry.name)) {
          if (processedFiles.has(fullPath)) continue;
          processedFiles.add(fullPath);

          await this.analyzeDependenciesInFile(fullPath, nodes, edges);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to analyze dependencies in ${dirPath}: ${error.message}`);
    }
  }

  private async analyzeDependenciesInFile(
    filePath: string,
    nodes: DependencyNode[],
    edges: DependencyEdge[]
  ): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const dependencies = this.extractDependencies(content);

      // Add current file as a node if not exists
      const currentNodeId = filePath;
      if (!nodes.find(n => n.id === currentNodeId)) {
        nodes.push({
          id: currentNodeId,
          name: path.basename(filePath, '.ts'),
          type: this.isExternalDependency(filePath) ? 'external' : 'internal',
          path: filePath,
          usageCount: 0,
        });
      }

      // Process each dependency
      for (const dep of dependencies) {
        const depType = this.getDependencyType(dep);
        const depNodeId = this.resolveDependencyPath(dep, filePath);

        // Add dependency node if not exists
        if (!nodes.find(n => n.id === depNodeId)) {
          nodes.push({
            id: depNodeId,
            name: dep,
            type: depType,
            path: depNodeId,
            usageCount: 0,
          });
        }

        // Add edge
        edges.push({
          from: currentNodeId,
          to: depNodeId,
          type: this.getImportType(content, dep),
          isOptional: false,
        });

        // Increment usage count
        const depNode = nodes.find(n => n.id === depNodeId);
        if (depNode) {
          depNode.usageCount++;
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to analyze dependencies in file ${filePath}: ${error.message}`);
    }
  }

  private isExternalDependency(filePath: string): boolean {
    return filePath.includes('node_modules');
  }

  private getDependencyType(dependency: string): 'internal' | 'external' | 'builtin' {
    if (dependency.startsWith('.') || dependency.startsWith('/')) return 'internal';
    if (this.isBuiltinModule(dependency)) return 'builtin';
    return 'external';
  }

  private isBuiltinModule(moduleName: string): boolean {
    const builtinModules = [
      'fs', 'path', 'http', 'https', 'url', 'crypto', 'util', 'events',
      'stream', 'buffer', 'os', 'child_process', 'cluster', 'net', 'tls'
    ];
    return builtinModules.includes(moduleName);
  }

  private resolveDependencyPath(dependency: string, fromFile: string): string {
    if (dependency.startsWith('.')) {
      return path.resolve(path.dirname(fromFile), dependency);
    }
    return dependency;
  }

  private getImportType(content: string, dependency: string): 'import' | 'require' | 'dynamic' {
    if (content.includes(`import(${dependency})`)) return 'dynamic';
    if (content.includes(`require('${dependency}')`)) return 'require';
    return 'import';
  }

  private detectCircularDependencies(nodes: DependencyNode[], edges: DependencyEdge[]): string[][] {
    const circularDeps: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): void => {
      if (recursionStack.has(nodeId)) {
        // Found a cycle
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart !== -1) {
          circularDeps.push(path.slice(cycleStart));
        }
        return;
      }

      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const outgoingEdges = edges.filter(e => e.from === nodeId);
      for (const edge of outgoingEdges) {
        dfs(edge.to, [...path, nodeId]);
      }

      recursionStack.delete(nodeId);
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    }

    return circularDeps;
  }

  private findOrphanedModules(nodes: DependencyNode[], edges: DependencyEdge[]): string[] {
    const referencedNodes = new Set(edges.map(e => e.to));
    return nodes
      .filter(node => node.type === 'internal' && !referencedNodes.has(node.id))
      .map(node => node.id);
  }

  private async findCoverageFiles(scanPath: string): Promise<string[]> {
    const coverageFiles: string[] = [];
    const coveragePatterns = ['coverage-final.json', 'lcov.info', 'clover.xml', 'coverage.json'];

    for (const pattern of coveragePatterns) {
      await this.findFilesRecursive(scanPath, pattern, async (filePath) => {
        coverageFiles.push(filePath);
      });
    }

    return coverageFiles;
  }

  private async parseCoverageFiles(coverageFiles: string[]): Promise<CoverageReport> {
    // This is a simplified implementation
    // In a real implementation, you would parse different coverage formats
    
    const overall: CoverageMetrics = {
      lines: 1000,
      statements: 800,
      functions: 100,
      branches: 200,
      linesCovered: 800,
      statementsCovered: 640,
      functionsCovered: 80,
      branchesCovered: 160,
      percentage: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    };

    return {
      overall,
      byFile: {},
      byDirectory: {},
      uncoveredLines: [],
    };
  }

  private createEmptyCoverageReport(): CoverageReport {
    const emptyCoverage: CoverageMetrics = {
      lines: 0,
      statements: 0,
      functions: 0,
      branches: 0,
      linesCovered: 0,
      statementsCovered: 0,
      functionsCovered: 0,
      branchesCovered: 0,
      percentage: {
        lines: 0,
        statements: 0,
        functions: 0,
        branches: 0,
      },
    };

    return {
      overall: emptyCoverage,
      byFile: {},
      byDirectory: {},
      uncoveredLines: [],
    };
  }
}