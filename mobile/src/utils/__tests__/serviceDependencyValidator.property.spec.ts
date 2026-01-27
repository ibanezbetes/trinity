/**
 * Property-Based Tests for Service Import Resolution
 * Feature: mobile-apk-build-fixes, Property 1: Service Import Resolution
 * Validates: Requirements 1.1, 1.3
 */

import fc from 'fast-check';
import { serviceDependencyValidator, ServiceValidationResult, ServiceInfo } from '../serviceDependencyValidator';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Service Import Resolution Properties', () => {
  let testDir: string;
  let servicesDir: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), `service-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    servicesDir = join(testDir, 'src', 'services');
    mkdirSync(servicesDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Property 1: Service Import Resolution
   * For any valid service import configuration, the build system should successfully 
   * resolve all service dependencies without module resolution failures
   */
  test('Property 1: Valid service imports should resolve successfully', () => {
    fc.assert(
      fc.property(
        // Generator for valid service configurations
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
            exports: fc.array(
              fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
              { minLength: 1, maxLength: 5 }
            ),
            imports: fc.array(
              fc.record({
                from: fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
                names: fc.array(
                  fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
                  { minLength: 1, maxLength: 3 }
                )
              }),
              { maxLength: 3 }
            )
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (services) => {
          // Create service files with valid imports
          const serviceNames = services.map(s => s.name);
          
          for (const service of services) {
            const content = generateServiceContent(service, serviceNames);
            const filePath = join(servicesDir, `${service.name}.ts`);
            writeFileSync(filePath, content);
          }

          // Create validator instance for test directory
          const validator = new (require('../serviceDependencyValidator').default)(testDir);
          
          return validator.validateServices().then((result: ServiceValidationResult) => {
            // Property: Valid services should not have module resolution errors
            const moduleNotFoundErrors = result.errors.filter(error => 
              error.type === 'MODULE_NOT_FOUND'
            );

            // Property: All created services should be found
            const allServicesFound = result.services.every(service => service.exists);

            // Property: Valid imports should resolve
            const validImportsResolve = result.services.every(service =>
              service.imports.filter(imp => imp.isRelative).every(imp => imp.exists)
            );

            return moduleNotFoundErrors.length === 0 && allServicesFound && validImportsResolve;
          });
        }
      ),
      { numRuns: 50 } // Reduced for file system operations
    );
  });

  test('Property 1a: Missing service files should generate errors', () => {
    fc.assert(
      fc.property(
        fc.record({
          existingServices: fc.array(
            fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
            { minLength: 1, maxLength: 3 }
          ),
          missingServices: fc.array(
            fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
            { minLength: 1, maxLength: 2 }
          )
        }),
        ({ existingServices, missingServices }) => {
          // Ensure no overlap between existing and missing services
          const uniqueMissing = missingServices.filter(name => !existingServices.includes(name));
          if (uniqueMissing.length === 0) return true; // Skip if no unique missing services

          // Create existing service files
          for (const serviceName of existingServices) {
            const content = `export const ${serviceName} = 'service';`;
            writeFileSync(join(servicesDir, `${serviceName}.ts`), content);
          }

          // Create a service that imports missing services
          const importStatements = uniqueMissing.map(name => 
            `import { ${name} } from './${name}';`
          ).join('\n');
          
          const mainServiceContent = `${importStatements}\nexport const mainService = 'main';`;
          writeFileSync(join(servicesDir, 'mainService.ts'), mainServiceContent);

          // Create validator instance for test directory
          const validator = new (require('../serviceDependencyValidator').default)(testDir);
          
          return validator.validateServices().then((result: ServiceValidationResult) => {
            // Property: Missing services should generate MODULE_NOT_FOUND errors
            const moduleNotFoundErrors = result.errors.filter(error => 
              error.type === 'MODULE_NOT_FOUND'
            );

            return moduleNotFoundErrors.length >= uniqueMissing.length;
          });
        }
      ),
      { numRuns: 30 }
    );
  });

  test('Property 1b: Circular dependencies should be detected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }), // Number of services in circular dependency
        (circleSize) => {
          // Create circular dependency: A -> B -> C -> A
          const serviceNames = Array.from({ length: circleSize }, (_, i) => `Service${String.fromCharCode(65 + i)}`);
          
          for (let i = 0; i < serviceNames.length; i++) {
            const currentService = serviceNames[i];
            const nextService = serviceNames[(i + 1) % serviceNames.length];
            
            const content = `
import { ${nextService.toLowerCase()} } from './${nextService}';

export const ${currentService.toLowerCase()} = {
  name: '${currentService}',
  dependency: ${nextService.toLowerCase()}
};
`;
            writeFileSync(join(servicesDir, `${currentService}.ts`), content);
          }

          // Create validator instance for test directory
          const validator = new (require('../serviceDependencyValidator').default)(testDir);
          
          return validator.validateServices().then((result: ServiceValidationResult) => {
            // Property: Circular dependencies should be detected
            const circularDependencyErrors = result.errors.filter(error => 
              error.type === 'CIRCULAR_DEPENDENCY'
            );

            const hasCycles = result.dependencyGraph.cycles.length > 0;

            return circularDependencyErrors.length > 0 && hasCycles;
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 1c: Service exports should be validated', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
            hasExports: fc.boolean(),
            exportCount: fc.integer({ min: 0, max: 5 })
          }),
          { minLength: 1, maxLength: 4 }
        ),
        (serviceConfigs) => {
          // Create service files with varying export patterns
          for (const config of serviceConfigs) {
            let content = '';
            
            if (config.hasExports && config.exportCount > 0) {
              for (let i = 0; i < config.exportCount; i++) {
                content += `export const ${config.name}Export${i} = 'value${i}';\n`;
              }
            } else {
              // Service with no exports
              content = `const ${config.name}Internal = 'internal';\n`;
            }
            
            writeFileSync(join(servicesDir, `${config.name}.ts`), content);
          }

          // Create validator instance for test directory
          const validator = new (require('../serviceDependencyValidator').default)(testDir);
          
          return validator.validateServices().then((result: ServiceValidationResult) => {
            // Property: Services without exports should generate warnings
            const servicesWithoutExports = serviceConfigs.filter(config => 
              !config.hasExports || config.exportCount === 0
            );

            const unusedImportWarnings = result.warnings.filter(warning => 
              warning.type === 'UNUSED_IMPORT'
            );

            // Should have warnings for services without exports
            return servicesWithoutExports.length === 0 || unusedImportWarnings.length > 0;
          });
        }
      ),
      { numRuns: 30 }
    );
  });

  test('Property 1d: Large services should generate performance warnings', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
            isLarge: fc.boolean(),
            importCount: fc.integer({ min: 0, max: 25 })
          }),
          { minLength: 1, maxLength: 3 }
        ),
        (serviceConfigs) => {
          // Create service files with varying sizes
          for (const config of serviceConfigs) {
            let content = '';
            
            // Add imports
            for (let i = 0; i < config.importCount; i++) {
              content += `import { someFunction${i} } from 'some-package-${i}';\n`;
            }
            
            // Make large services by adding lots of content
            if (config.isLarge) {
              content += '\n// Large service content\n';
              for (let i = 0; i < 1000; i++) {
                content += `const largeContent${i} = 'This is a large service with lots of content to make it exceed size limits';\n`;
              }
            }
            
            content += `\nexport const ${config.name} = 'service';\n`;
            
            writeFileSync(join(servicesDir, `${config.name}.ts`), content);
          }

          // Create validator instance for test directory
          const validator = new (require('../serviceDependencyValidator').default)(testDir);
          
          return validator.validateServices().then((result: ServiceValidationResult) => {
            const largeServices = serviceConfigs.filter(config => config.isLarge);
            const servicesWithManyImports = serviceConfigs.filter(config => config.importCount > 20);
            
            const largeFileWarnings = result.warnings.filter(warning => 
              warning.type === 'LARGE_FILE'
            );
            
            const deepDependencyWarnings = result.warnings.filter(warning => 
              warning.type === 'DEEP_DEPENDENCY'
            );

            // Property: Large services should generate appropriate warnings
            const hasExpectedLargeFileWarnings = largeServices.length === 0 || largeFileWarnings.length > 0;
            const hasExpectedDependencyWarnings = servicesWithManyImports.length === 0 || deepDependencyWarnings.length > 0;

            return hasExpectedLargeFileWarnings && hasExpectedDependencyWarnings;
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 1e: Validation result structure should be consistent', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
          { minLength: 0, maxLength: 3 }
        ),
        (serviceNames) => {
          // Create simple service files
          for (const name of serviceNames) {
            const content = `export const ${name} = 'service';`;
            writeFileSync(join(servicesDir, `${name}.ts`), content);
          }

          // Create validator instance for test directory
          const validator = new (require('../serviceDependencyValidator').default)(testDir);
          
          return validator.validateServices().then((result: ServiceValidationResult) => {
            // Property: Result should have consistent structure
            const hasValidStructure = (
              typeof result.isValid === 'boolean' &&
              Array.isArray(result.services) &&
              Array.isArray(result.errors) &&
              Array.isArray(result.warnings) &&
              typeof result.dependencyGraph === 'object' &&
              Array.isArray(result.dependencyGraph.nodes) &&
              Array.isArray(result.dependencyGraph.edges) &&
              Array.isArray(result.dependencyGraph.cycles)
            );

            // Property: Service count should match created files
            const correctServiceCount = result.services.length === serviceNames.length;

            // Property: isValid should be false if there are errors
            const validityConsistent = result.errors.length === 0 ? true : !result.isValid;

            // Property: All services should have required properties
            const servicesHaveRequiredProps = result.services.every(service =>
              typeof service.name === 'string' &&
              typeof service.path === 'string' &&
              typeof service.exists === 'boolean' &&
              Array.isArray(service.exports) &&
              Array.isArray(service.imports) &&
              typeof service.size === 'number'
            );

            return hasValidStructure && 
                   correctServiceCount && 
                   validityConsistent && 
                   servicesHaveRequiredProps;
          });
        }
      ),
      { numRuns: 30 }
    );
  });
});

/**
 * Helper function to generate service content
 */
function generateServiceContent(service: any, allServiceNames: string[]): string {
  let content = '';
  
  // Add imports
  for (const importInfo of service.imports) {
    if (allServiceNames.includes(importInfo.from)) {
      const importNames = importInfo.names.join(', ');
      content += `import { ${importNames} } from './${importInfo.from}';\n`;
    }
  }
  
  content += '\n';
  
  // Add exports
  for (const exportName of service.exports) {
    content += `export const ${exportName} = '${exportName}-value';\n`;
  }
  
  // Add default export
  content += `\nexport const ${service.name} = {\n`;
  content += `  name: '${service.name}',\n`;
  content += `  exports: [${service.exports.map(e => `'${e}'`).join(', ')}]\n`;
  content += '};\n';
  
  return content;
}