/**
 * Obsolete Component Detector Adapter
 * Infrastructure adapter for detecting obsolete components in the system
 */

import { Injectable, Logger } from '@nestjs/common';
import { IObsoleteComponentDetector } from '../../domain/services/analysis-engine.interface';
import {
  SystemAnalysis,
  InfrastructureAnalysis,
  DeadCodeInfo,
  DeprecatedCodeInfo,
} from '../../domain/entities/analysis.entity';

@Injectable()
export class ObsoleteComponentDetectorAdapter implements IObsoleteComponentDetector {
  private readonly logger = new Logger(ObsoleteComponentDetectorAdapter.name);

  async detectUnusedDependencies(analysis: SystemAnalysis): Promise<string[]> {
    this.logger.log('Detecting unused dependencies');

    try {
      const unusedDependencies: string[] = [];
      const dependencyGraph = analysis.repository.dependencies;
      const packageJsonFiles = analysis.repository.configurations.packageJson;

      for (const packageJson of packageJsonFiles) {
        const allDependencies = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        for (const [depName, version] of Object.entries(allDependencies)) {
          // Check if dependency is actually used in the code
          const isUsed = this.isDependencyUsed(depName, dependencyGraph);
          
          if (!isUsed && !this.isEssentialDependency(depName)) {
            unusedDependencies.push(`${depName}@${version}`);
          }
        }
      }

      this.logger.log(`Found ${unusedDependencies.length} unused dependencies`);
      return unusedDependencies;
    } catch (error) {
      this.logger.error(`Failed to detect unused dependencies: ${error.message}`, error.stack);
      throw new Error(`Failed to detect unused dependencies: ${error.message}`);
    }
  }

  async detectDeadCode(analysis: SystemAnalysis): Promise<DeadCodeInfo[]> {
    this.logger.log('Detecting dead code');

    try {
      const deadCode: DeadCodeInfo[] = [];
      const modules = analysis.repository.modules;
      const dependencyGraph = analysis.repository.dependencies;

      for (const module of modules) {
        // Check if module is referenced by other modules
        const isReferenced = this.isModuleReferenced(module.path, dependencyGraph);
        
        if (!isReferenced && !this.isEntryPoint(module)) {
          deadCode.push({
            file: module.path,
            type: 'class',
            name: module.name,
            line: 1,
            reason: 'Module is not imported or referenced by any other module',
            safeToRemove: true,
            dependencies: module.dependencies,
          });
        }

        // Check for unused exports within modules
        const unusedExports = this.findUnusedExports(module, dependencyGraph);
        deadCode.push(...unusedExports);

        // Check for unused methods within classes
        const unusedMethods = this.findUnusedMethods(module);
        deadCode.push(...unusedMethods);
      }

      this.logger.log(`Found ${deadCode.length} dead code items`);
      return deadCode;
    } catch (error) {
      this.logger.error(`Failed to detect dead code: ${error.message}`, error.stack);
      throw new Error(`Failed to detect dead code: ${error.message}`);
    }
  }

  async detectUnusedAWSResources(infrastructureAnalysis: InfrastructureAnalysis): Promise<string[]> {
    this.logger.log('Detecting unused AWS resources');

    try {
      const unusedResources: string[] = [];
      const resources = infrastructureAnalysis.awsResources;

      for (const resource of resources) {
        if (this.isResourceUnused(resource)) {
          unusedResources.push(resource.id);
        }
      }

      this.logger.log(`Found ${unusedResources.length} unused AWS resources`);
      return unusedResources;
    } catch (error) {
      this.logger.error(`Failed to detect unused AWS resources: ${error.message}`, error.stack);
      throw new Error(`Failed to detect unused AWS resources: ${error.message}`);
    }
  }

  async detectDeprecatedCode(analysis: SystemAnalysis): Promise<DeprecatedCodeInfo[]> {
    this.logger.log('Detecting deprecated code');

    try {
      const deprecatedCode: DeprecatedCodeInfo[] = [];
      const modules = analysis.repository.modules;

      for (const module of modules) {
        // Check for deprecated decorators and annotations
        const deprecatedDecorators = this.findDeprecatedDecorators(module);
        deprecatedCode.push(...deprecatedDecorators);

        // Check for deprecated dependencies
        const deprecatedDeps = this.findDeprecatedDependencies(module, analysis);
        deprecatedCode.push(...deprecatedDeps);

        // Check for deprecated patterns
        const deprecatedPatterns = this.findDeprecatedPatterns(module);
        deprecatedCode.push(...deprecatedPatterns);
      }

      this.logger.log(`Found ${deprecatedCode.length} deprecated code items`);
      return deprecatedCode;
    } catch (error) {
      this.logger.error(`Failed to detect deprecated code: ${error.message}`, error.stack);
      throw new Error(`Failed to detect deprecated code: ${error.message}`);
    }
  }

  // Helper Methods for Unused Dependencies
  private isDependencyUsed(depName: string, dependencyGraph: any): boolean {
    // Check if the dependency appears in the dependency graph
    return dependencyGraph.nodes.some((node: any) => 
      node.name === depName || node.id.includes(depName)
    );
  }

  private isEssentialDependency(depName: string): boolean {
    const essentialDeps = [
      '@nestjs/core',
      '@nestjs/common',
      '@nestjs/platform-express',
      'reflect-metadata',
      'rxjs',
      'typescript',
      'jest',
      'eslint',
      'prettier',
    ];

    return essentialDeps.some(essential => depName.includes(essential));
  }

  // Helper Methods for Dead Code Detection
  private isModuleReferenced(modulePath: string, dependencyGraph: any): boolean {
    // Check if any edge points to this module
    return dependencyGraph.edges.some((edge: any) => 
      edge.to === modulePath || edge.to.includes(modulePath)
    );
  }

  private isEntryPoint(module: any): boolean {
    const entryPointPatterns = [
      'main.ts',
      'app.module.ts',
      'index.ts',
      '.controller.ts',
      '.gateway.ts',
    ];

    return entryPointPatterns.some(pattern => 
      module.path.includes(pattern) || module.name.includes(pattern.replace('.ts', ''))
    );
  }

  private findUnusedExports(module: any, dependencyGraph: any): DeadCodeInfo[] {
    const deadCode: DeadCodeInfo[] = [];

    for (const exportName of module.exports) {
      // Check if this export is imported anywhere
      const isImported = dependencyGraph.edges.some((edge: any) => 
        edge.from !== module.path && // Not self-reference
        this.edgeImportsSymbol(edge, exportName)
      );

      if (!isImported && !this.isPublicAPI(exportName)) {
        deadCode.push({
          file: module.path,
          type: 'export',
          name: exportName,
          line: 1, // Would need more sophisticated parsing to get actual line
          reason: 'Export is not imported by any other module',
          safeToRemove: true,
          dependencies: [],
        });
      }
    }

    return deadCode;
  }

  private findUnusedMethods(module: any): DeadCodeInfo[] {
    const deadCode: DeadCodeInfo[] = [];

    if (module.methods) {
      for (const method of module.methods) {
        // Simple heuristic: private methods that are not called internally
        if (this.isPrivateMethod(method) && !this.isMethodCalled(method, module)) {
          deadCode.push({
            file: module.path,
            type: 'function',
            name: method.name,
            line: 1, // Would need more sophisticated parsing
            reason: 'Private method is not called within the class',
            safeToRemove: true,
            dependencies: [],
          });
        }
      }
    }

    return deadCode;
  }

  private edgeImportsSymbol(edge: any, symbolName: string): boolean {
    // This is a simplified check - in reality, you'd need to parse import statements
    return edge.type === 'import' && edge.symbols && edge.symbols.includes(symbolName);
  }

  private isPublicAPI(exportName: string): boolean {
    // Heuristics for public API detection
    const publicPatterns = [
      'Controller',
      'Service',
      'Module',
      'Gateway',
      'Guard',
      'Interceptor',
      'Pipe',
      'Decorator',
    ];

    return publicPatterns.some(pattern => exportName.includes(pattern));
  }

  private isPrivateMethod(method: any): boolean {
    return method.name.startsWith('_') || 
           method.decorators.includes('private') ||
           method.name.startsWith('private');
  }

  private isMethodCalled(method: any, module: any): boolean {
    // This is a simplified check - in reality, you'd need to parse method calls
    // For now, assume all methods are called unless they start with underscore
    return !method.name.startsWith('_');
  }

  // Helper Methods for Unused AWS Resources
  private isResourceUnused(resource: any): boolean {
    // Check various indicators of resource usage
    const usageIndicators = [
      resource.usage?.requests || 0,
      resource.usage?.cpu || 0,
      resource.usage?.memory || 0,
      resource.usage?.network || 0,
    ];

    const hasUsage = usageIndicators.some(indicator => indicator > 0);
    
    // Also check if resource is active
    return !resource.isActive || !hasUsage;
  }

  // Helper Methods for Deprecated Code Detection
  private findDeprecatedDecorators(module: any): DeprecatedCodeInfo[] {
    const deprecatedCode: DeprecatedCodeInfo[] = [];
    const deprecatedDecorators = [
      '@deprecated',
      '@Deprecated',
    ];

    for (const decorator of module.decorators) {
      if (deprecatedDecorators.includes(decorator)) {
        deprecatedCode.push({
          file: module.path,
          type: 'api',
          name: decorator,
          line: 1,
          deprecatedSince: 'unknown',
          replacement: 'Check documentation for replacement',
        });
      }
    }

    return deprecatedCode;
  }

  private findDeprecatedDependencies(module: any, analysis: SystemAnalysis): DeprecatedCodeInfo[] {
    const deprecatedCode: DeprecatedCodeInfo[] = [];
    
    // Known deprecated packages and their replacements
    const deprecatedPackages = new Map([
      ['@nestjs/swagger', '@nestjs/swagger v6+'],
      ['class-transformer', 'Use built-in validation'],
      ['moment', 'dayjs or date-fns'],
      ['request', 'axios or node-fetch'],
      ['lodash', 'Native ES6+ methods'],
    ]);

    for (const dependency of module.dependencies) {
      if (deprecatedPackages.has(dependency)) {
        deprecatedCode.push({
          file: module.path,
          type: 'library',
          name: dependency,
          line: 1,
          deprecatedSince: 'unknown',
          replacement: deprecatedPackages.get(dependency),
        });
      }
    }

    return deprecatedCode;
  }

  private findDeprecatedPatterns(module: any): DeprecatedCodeInfo[] {
    const deprecatedCode: DeprecatedCodeInfo[] = [];

    // Check for deprecated patterns in method names or decorators
    const deprecatedPatterns = [
      { pattern: 'createConnection', replacement: 'Use TypeORM DataSource' },
      { pattern: 'getConnection', replacement: 'Use TypeORM DataSource' },
      { pattern: '@UseGuards(AuthGuard)', replacement: 'Use @UseGuards(JwtAuthGuard)' },
    ];

    if (module.methods) {
      for (const method of module.methods) {
        for (const { pattern, replacement } of deprecatedPatterns) {
          if (method.name.includes(pattern) || 
              method.decorators.some((d: string) => d.includes(pattern))) {
            deprecatedCode.push({
              file: module.path,
              type: 'pattern',
              name: pattern,
              line: 1,
              deprecatedSince: 'unknown',
              replacement,
            });
          }
        }
      }
    }

    return deprecatedCode;
  }
}