/**
 * Service Dependency Validator
 * Validates service imports and dependencies for Metro bundler compatibility
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { glob } from 'glob';

export interface ServiceValidationResult {
  isValid: boolean;
  services: ServiceInfo[];
  errors: ServiceError[];
  warnings: ServiceWarning[];
  dependencyGraph: DependencyGraph;
}

export interface ServiceInfo {
  name: string;
  path: string;
  exists: boolean;
  exports: string[];
  imports: ImportInfo[];
  size: number;
}

export interface ImportInfo {
  module: string;
  importedNames: string[];
  isRelative: boolean;
  resolvedPath?: string;
  exists: boolean;
}

export interface ServiceError {
  type: 'MODULE_NOT_FOUND' | 'CIRCULAR_DEPENDENCY' | 'INVALID_EXPORT' | 'SYNTAX_ERROR';
  service: string;
  message: string;
  location?: string;
  suggestion?: string;
}

export interface ServiceWarning {
  type: 'UNUSED_IMPORT' | 'LARGE_FILE' | 'DEEP_DEPENDENCY' | 'PERFORMANCE';
  service: string;
  message: string;
  suggestion?: string;
}

export interface DependencyGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string }>;
  cycles: string[][];
}

class ServiceDependencyValidator {
  private projectRoot: string;
  private servicesDir: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.servicesDir = join(projectRoot, 'src', 'services');
  }

  /**
   * Validate all service dependencies
   */
  async validateServices(): Promise<ServiceValidationResult> {
    const result: ServiceValidationResult = {
      isValid: true,
      services: [],
      errors: [],
      warnings: [],
      dependencyGraph: { nodes: [], edges: [], cycles: [] }
    };

    try {
      // Find all service files
      const serviceFiles = await this.findServiceFiles();
      
      // Analyze each service
      for (const filePath of serviceFiles) {
        const serviceInfo = await this.analyzeService(filePath, result);
        result.services.push(serviceInfo);
      }

      // Build dependency graph
      result.dependencyGraph = this.buildDependencyGraph(result.services);

      // Check for circular dependencies
      this.detectCircularDependencies(result);

      // Validate imports
      this.validateImports(result);

      // Check for performance issues
      this.checkPerformanceIssues(result);

      // Set overall validity
      result.isValid = result.errors.length === 0;

    } catch (error: any) {
      result.errors.push({
        type: 'SYNTAX_ERROR',
        service: 'general',
        message: `Service validation failed: ${error.message}`,
        suggestion: 'Check service file syntax and structure'
      });
      result.isValid = false;
    }

    return result;
  }

  /**
   * Find all service files in the project
   */
  private async findServiceFiles(): Promise<string[]> {
    const patterns = [
      join(this.servicesDir, '**/*.ts'),
      join(this.servicesDir, '**/*.tsx'),
      join(this.servicesDir, '**/*.js'),
      join(this.servicesDir, '**/*.jsx')
    ];

    const files: string[] = [];
    for (const pattern of patterns) {
      try {
        const matches = await glob(pattern, { ignore: ['**/*.test.*', '**/*.spec.*', '**/node_modules/**'] });
        files.push(...matches);
      } catch (error) {
        // Ignore glob errors for non-existent patterns
      }
    }

    return [...new Set(files)]; // Remove duplicates
  }

  /**
   * Analyze a single service file
   */
  private async analyzeService(filePath: string, result: ServiceValidationResult): Promise<ServiceInfo> {
    const relativePath = filePath.replace(this.projectRoot, '').replace(/\\/g, '/');
    const serviceName = this.extractServiceName(filePath);

    const serviceInfo: ServiceInfo = {
      name: serviceName,
      path: relativePath,
      exists: existsSync(filePath),
      exports: [],
      imports: [],
      size: 0
    };

    if (!serviceInfo.exists) {
      result.errors.push({
        type: 'MODULE_NOT_FOUND',
        service: serviceName,
        message: `Service file not found: ${relativePath}`,
        suggestion: 'Create the service file or update import paths'
      });
      return serviceInfo;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      serviceInfo.size = content.length;

      // Extract exports
      serviceInfo.exports = this.extractExports(content);

      // Extract imports
      serviceInfo.imports = this.extractImports(content, filePath);

      // Validate exports
      this.validateExports(serviceInfo, result);

    } catch (error: any) {
      result.errors.push({
        type: 'SYNTAX_ERROR',
        service: serviceName,
        message: `Failed to analyze service: ${error.message}`,
        location: filePath,
        suggestion: 'Check file syntax and encoding'
      });
    }

    return serviceInfo;
  }

  /**
   * Extract service name from file path
   */
  private extractServiceName(filePath: string): string {
    const fileName = filePath.split(/[/\\]/).pop() || '';
    return fileName.replace(/\.(ts|tsx|js|jsx)$/, '');
  }

  /**
   * Extract exports from service content
   */
  private extractExports(content: string): string[] {
    const exports: string[] = [];
    
    // Match export statements
    const exportPatterns = [
      /export\s+const\s+(\w+)/g,
      /export\s+function\s+(\w+)/g,
      /export\s+class\s+(\w+)/g,
      /export\s+interface\s+(\w+)/g,
      /export\s+type\s+(\w+)/g,
      /export\s+enum\s+(\w+)/g,
      /export\s*{\s*([^}]+)\s*}/g,
      /export\s+default\s+(\w+)/g
    ];

    for (const pattern of exportPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) {
          if (match[1].includes(',')) {
            // Handle export { a, b, c } syntax
            const names = match[1].split(',').map(name => name.trim());
            exports.push(...names);
          } else {
            exports.push(match[1]);
          }
        }
      }
    }

    return [...new Set(exports)]; // Remove duplicates
  }

  /**
   * Extract imports from service content
   */
  private extractImports(content: string, filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    
    // Match import statements
    const importPattern = /import\s*(?:{([^}]+)}|\*\s+as\s+(\w+)|(\w+))\s*from\s*['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const [, namedImports, namespaceImport, defaultImport, modulePath] = match;
      
      let importedNames: string[] = [];
      if (namedImports) {
        importedNames = namedImports.split(',').map(name => name.trim());
      } else if (namespaceImport) {
        importedNames = [namespaceImport];
      } else if (defaultImport) {
        importedNames = [defaultImport];
      }

      const isRelative = modulePath.startsWith('./') || modulePath.startsWith('../');
      let resolvedPath: string | undefined;
      let exists = false;

      if (isRelative) {
        resolvedPath = this.resolveRelativePath(modulePath, filePath);
        exists = this.checkFileExists(resolvedPath);
      } else {
        // For node_modules, assume they exist if they're common packages
        exists = this.isKnownPackage(modulePath);
      }

      imports.push({
        module: modulePath,
        importedNames,
        isRelative,
        resolvedPath,
        exists
      });
    }

    return imports;
  }

  /**
   * Resolve relative import path
   */
  private resolveRelativePath(importPath: string, fromFile: string): string {
    const fromDir = dirname(fromFile);
    const resolved = resolve(fromDir, importPath);
    
    // Try different extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
    
    for (const ext of extensions) {
      const fullPath = resolved + ext;
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
    
    return resolved + '.ts'; // Default assumption
  }

  /**
   * Check if file exists with common extensions
   */
  private checkFileExists(filePath: string): boolean {
    if (existsSync(filePath)) return true;
    
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    return extensions.some(ext => existsSync(filePath + ext));
  }

  /**
   * Check if module is a known package
   */
  private isKnownPackage(moduleName: string): boolean {
    const knownPackages = [
      'react', 'react-native', 'expo', '@expo/', 'fast-check',
      'fs', 'path', 'os', 'crypto', 'util', 'events'
    ];
    
    return knownPackages.some(pkg => moduleName.startsWith(pkg));
  }

  /**
   * Validate service exports
   */
  private validateExports(serviceInfo: ServiceInfo, result: ServiceValidationResult): void {
    // Check if service has any exports
    if (serviceInfo.exports.length === 0) {
      result.warnings.push({
        type: 'UNUSED_IMPORT',
        service: serviceInfo.name,
        message: 'Service has no exports',
        suggestion: 'Add exports or remove unused service file'
      });
    }

    // Check for common export patterns
    const hasDefaultExport = serviceInfo.exports.includes('default');
    const hasNamedExports = serviceInfo.exports.length > (hasDefaultExport ? 1 : 0);

    if (!hasDefaultExport && !hasNamedExports) {
      result.warnings.push({
        type: 'UNUSED_IMPORT',
        service: serviceInfo.name,
        message: 'Service has no usable exports',
        suggestion: 'Add proper export statements'
      });
    }
  }

  /**
   * Build dependency graph from services
   */
  private buildDependencyGraph(services: ServiceInfo[]): DependencyGraph {
    const graph: DependencyGraph = {
      nodes: services.map(s => s.name),
      edges: [],
      cycles: []
    };

    for (const service of services) {
      for (const importInfo of service.imports) {
        if (importInfo.isRelative && importInfo.resolvedPath) {
          const targetService = services.find(s => 
            importInfo.resolvedPath?.includes(s.name)
          );
          
          if (targetService) {
            graph.edges.push({
              from: service.name,
              to: targetService.name
            });
          }
        }
      }
    }

    return graph;
  }

  /**
   * Detect circular dependencies
   */
  private detectCircularDependencies(result: ServiceValidationResult): void {
    const graph = result.dependencyGraph;
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]): void => {
      if (recursionStack.has(node)) {
        // Found a cycle
        const cycleStart = path.indexOf(node);
        const cycle = path.slice(cycleStart).concat([node]);
        cycles.push(cycle);
        return;
      }

      if (visited.has(node)) return;

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph.edges
        .filter(edge => edge.from === node)
        .map(edge => edge.to);

      for (const neighbor of neighbors) {
        dfs(neighbor, [...path]);
      }

      recursionStack.delete(node);
      path.pop();
    };

    for (const node of graph.nodes) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    result.dependencyGraph.cycles = cycles;

    // Add errors for circular dependencies
    for (const cycle of cycles) {
      result.errors.push({
        type: 'CIRCULAR_DEPENDENCY',
        service: cycle[0],
        message: `Circular dependency detected: ${cycle.join(' -> ')}`,
        suggestion: 'Refactor services to remove circular dependencies'
      });
    }
  }

  /**
   * Validate all imports
   */
  private validateImports(result: ServiceValidationResult): void {
    for (const service of result.services) {
      for (const importInfo of service.imports) {
        if (importInfo.isRelative && !importInfo.exists) {
          result.errors.push({
            type: 'MODULE_NOT_FOUND',
            service: service.name,
            message: `Cannot resolve import: ${importInfo.module}`,
            location: service.path,
            suggestion: 'Check import path and ensure target file exists'
          });
        }
      }
    }
  }

  /**
   * Check for performance issues
   */
  private checkPerformanceIssues(result: ServiceValidationResult): void {
    for (const service of result.services) {
      // Check file size
      if (service.size > 50000) { // 50KB
        result.warnings.push({
          type: 'LARGE_FILE',
          service: service.name,
          message: `Large service file (${Math.round(service.size / 1024)}KB)`,
          suggestion: 'Consider splitting into smaller modules'
        });
      }

      // Check import count
      if (service.imports.length > 20) {
        result.warnings.push({
          type: 'DEEP_DEPENDENCY',
          service: service.name,
          message: `Many imports (${service.imports.length})`,
          suggestion: 'Consider reducing dependencies or splitting service'
        });
      }
    }
  }

  /**
   * Generate validation report
   */
  generateReport(result: ServiceValidationResult): string {
    let report = '🔍 Service Dependency Validation Report\n';
    report += '======================================\n\n';

    if (result.isValid) {
      report += '✅ All service dependencies are valid!\n\n';
    } else {
      report += '❌ Service dependency issues found.\n\n';
    }

    // Summary
    report += `📊 Summary:\n`;
    report += `   Services analyzed: ${result.services.length}\n`;
    report += `   Errors: ${result.errors.length}\n`;
    report += `   Warnings: ${result.warnings.length}\n`;
    report += `   Circular dependencies: ${result.dependencyGraph.cycles.length}\n\n`;

    // Errors
    if (result.errors.length > 0) {
      report += '🚨 Errors:\n';
      result.errors.forEach((error, index) => {
        report += `${index + 1}. [${error.type}] ${error.service}: ${error.message}\n`;
        if (error.location) {
          report += `   Location: ${error.location}\n`;
        }
        if (error.suggestion) {
          report += `   💡 Suggestion: ${error.suggestion}\n`;
        }
        report += '\n';
      });
    }

    // Warnings
    if (result.warnings.length > 0) {
      report += '⚠️  Warnings:\n';
      result.warnings.forEach((warning, index) => {
        report += `${index + 1}. [${warning.type}] ${warning.service}: ${warning.message}\n`;
        if (warning.suggestion) {
          report += `   💡 Suggestion: ${warning.suggestion}\n`;
        }
        report += '\n';
      });
    }

    // Dependency graph info
    if (result.dependencyGraph.cycles.length > 0) {
      report += '🔄 Circular Dependencies:\n';
      result.dependencyGraph.cycles.forEach((cycle, index) => {
        report += `${index + 1}. ${cycle.join(' → ')}\n`;
      });
      report += '\n';
    }

    return report;
  }
}

export const serviceDependencyValidator = new ServiceDependencyValidator();
export default ServiceDependencyValidator;