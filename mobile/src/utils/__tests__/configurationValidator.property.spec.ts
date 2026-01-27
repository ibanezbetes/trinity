/**
 * Property-Based Tests for Configuration Schema Validation
 * Feature: mobile-apk-build-fixes, Property 2: Configuration Schema Validation
 * Validates: Requirements 2.1, 2.2
 */

import fc from 'fast-check';
import { configurationValidator, AppConfig, ValidationResult } from '../configurationValidator';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Configuration Schema Validation Properties', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), `config-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Property 2: Configuration Schema Validation
   * For any properly formatted app.json configuration, the Expo build system should pass 
   * all schema validation checks and accept all configuration properties as valid
   */
  test('Property 2: Valid configurations should pass validation', () => {
    fc.assert(
      fc.property(
        // Generator for valid app configurations
        fc.record({
          expo: fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            slug: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-z0-9-]+$/.test(s)),
            version: fc.string().filter(s => /^\d+\.\d+\.\d+$/.test(s)),
            icon: fc.constant('./assets/icon.png'),
            android: fc.option(fc.record({
              package: fc.string().filter(s => /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/.test(s)),
              adaptiveIcon: fc.option(fc.record({
                foregroundImage: fc.constant('./assets/adaptive-icon.png'),
                backgroundColor: fc.string().filter(s => /^#[0-9A-Fa-f]{6}$/.test(s))
              }))
            })),
            ios: fc.option(fc.record({
              bundleIdentifier: fc.string().filter(s => /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/.test(s))
            })),
            scheme: fc.option(fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s))),
            extra: fc.option(fc.record({
              cognitoUserPoolId: fc.string().filter(s => /^[a-z0-9-]+_[a-zA-Z0-9]+$/.test(s)),
              cognitoClientId: fc.string({ minLength: 20, maxLength: 30 }),
              cognitoRegion: fc.string().filter(s => /^[a-z0-9-]+$/.test(s)),
              googleWebClientId: fc.string().filter(s => s.endsWith('.apps.googleusercontent.com'))
            }))
          })
        }),
        (config: AppConfig) => {
          // Create test app.json file
          const configPath = join(testDir, 'app.json');
          writeFileSync(configPath, JSON.stringify(config, null, 2));

          // Create required asset files
          const assetsDir = join(testDir, 'assets');
          mkdirSync(assetsDir, { recursive: true });
          writeFileSync(join(assetsDir, 'icon.png'), 'fake-png-content');
          writeFileSync(join(assetsDir, 'adaptive-icon.png'), 'fake-png-content');

          // Create validator instance for test directory
          const validator = new (require('../configurationValidator').default)(testDir);
          const result = validator.validateConfiguration();

          // Property: Valid configurations should not have critical errors
          const criticalErrors = result.errors.filter(error => 
            error.type === 'SCHEMA' || error.type === 'MISSING_FILE'
          );

          return criticalErrors.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2a: Required fields validation', () => {
    fc.assert(
      fc.property(
        // Generator for configurations missing required fields
        fc.record({
          expo: fc.record({
            name: fc.option(fc.string(), { nil: undefined }),
            slug: fc.option(fc.string(), { nil: undefined }),
            version: fc.option(fc.string(), { nil: undefined }),
            icon: fc.constant('./assets/icon.png')
          })
        }),
        (config: AppConfig) => {
          // Create test app.json file
          const configPath = join(testDir, 'app.json');
          writeFileSync(configPath, JSON.stringify(config, null, 2));

          // Create validator instance for test directory
          const validator = new (require('../configurationValidator').default)(testDir);
          const result = validator.validateConfiguration();

          // Property: Missing required fields should generate schema errors
          const requiredFields = ['name', 'slug', 'version'];
          const missingFields = requiredFields.filter(field => !config.expo[field as keyof typeof config.expo]);
          
          if (missingFields.length > 0) {
            const schemaErrors = result.errors.filter(error => error.type === 'SCHEMA');
            return schemaErrors.length >= missingFields.length;
          }

          return true; // If no fields are missing, no errors expected
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2b: Asset validation', () => {
    fc.assert(
      fc.property(
        fc.record({
          expo: fc.record({
            name: fc.constant('TestApp'),
            slug: fc.constant('test-app'),
            version: fc.constant('1.0.0'),
            icon: fc.oneof(
              fc.constant('./assets/icon.png'),
              fc.constant('./assets/missing-icon.png'),
              fc.constant('./assets/icon.jpg') // Wrong format
            )
          })
        }),
        (config: AppConfig) => {
          // Create test app.json file
          const configPath = join(testDir, 'app.json');
          writeFileSync(configPath, JSON.stringify(config, null, 2));

          // Create some assets but not all
          const assetsDir = join(testDir, 'assets');
          mkdirSync(assetsDir, { recursive: true });
          writeFileSync(join(assetsDir, 'icon.png'), 'fake-png-content');
          // Intentionally don't create missing-icon.png or icon.jpg

          // Create validator instance for test directory
          const validator = new (require('../configurationValidator').default)(testDir);
          const result = validator.validateConfiguration();

          // Property: Missing or invalid assets should generate asset errors
          if (config.expo.icon.includes('missing-icon') || config.expo.icon.endsWith('.jpg')) {
            const assetErrors = result.errors.filter(error => error.type === 'ASSET');
            return assetErrors.length > 0;
          }

          return true; // Valid assets should not generate errors
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2c: Native project configuration warnings', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // Whether to create native folders
        fc.record({
          expo: fc.record({
            name: fc.constant('TestApp'),
            slug: fc.constant('test-app'),
            version: fc.constant('1.0.0'),
            icon: fc.constant('./assets/icon.png'),
            orientation: fc.option(fc.constant('portrait')),
            scheme: fc.option(fc.constant('testapp'))
          })
        }),
        (hasNativeFolders: boolean, config: AppConfig) => {
          // Create test app.json file
          const configPath = join(testDir, 'app.json');
          writeFileSync(configPath, JSON.stringify(config, null, 2));

          // Create assets
          const assetsDir = join(testDir, 'assets');
          mkdirSync(assetsDir, { recursive: true });
          writeFileSync(join(assetsDir, 'icon.png'), 'fake-png-content');

          // Conditionally create native folders
          if (hasNativeFolders) {
            mkdirSync(join(testDir, 'android'), { recursive: true });
            mkdirSync(join(testDir, 'ios'), { recursive: true });
          }

          // Create validator instance for test directory
          const validator = new (require('../configurationValidator').default)(testDir);
          const result = validator.validateConfiguration();

          // Property: Projects with native folders should generate compatibility warnings
          // for certain properties
          if (hasNativeFolders && (config.expo.orientation || config.expo.scheme)) {
            const compatibilityWarnings = result.warnings.filter(warning => 
              warning.type === 'COMPATIBILITY'
            );
            return compatibilityWarnings.length > 0;
          }

          return true; // No native folders or no conflicting props = no warnings expected
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2d: Authentication configuration validation', () => {
    fc.assert(
      fc.property(
        fc.option(fc.record({
          cognitoUserPoolId: fc.option(fc.string()),
          cognitoClientId: fc.option(fc.string()),
          cognitoRegion: fc.option(fc.string()),
          googleWebClientId: fc.option(fc.string())
        })),
        (extraConfig) => {
          const config: AppConfig = {
            expo: {
              name: 'TestApp',
              slug: 'test-app',
              version: '1.0.0',
              icon: './assets/icon.png',
              extra: extraConfig
            }
          };

          // Create test app.json file
          const configPath = join(testDir, 'app.json');
          writeFileSync(configPath, JSON.stringify(config, null, 2));

          // Create assets
          const assetsDir = join(testDir, 'assets');
          mkdirSync(assetsDir, { recursive: true });
          writeFileSync(join(assetsDir, 'icon.png'), 'fake-png-content');

          // Create validator instance for test directory
          const validator = new (require('../configurationValidator').default)(testDir);
          const result = validator.validateConfiguration();

          // Property: Missing authentication configuration should generate warnings
          if (!extraConfig || Object.keys(extraConfig).length === 0) {
            const configWarnings = result.warnings.filter(warning => 
              warning.type === 'CONFIGURATION' && warning.field.includes('extra')
            );
            return configWarnings.length > 0;
          }

          return true; // Has auth config, validation depends on completeness
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2e: Validation result structure consistency', () => {
    fc.assert(
      fc.property(
        fc.record({
          expo: fc.record({
            name: fc.string({ minLength: 1 }),
            slug: fc.string({ minLength: 1 }),
            version: fc.string({ minLength: 1 }),
            icon: fc.constant('./assets/icon.png')
          })
        }),
        (config: AppConfig) => {
          // Create test app.json file
          const configPath = join(testDir, 'app.json');
          writeFileSync(configPath, JSON.stringify(config, null, 2));

          // Create validator instance for test directory
          const validator = new (require('../configurationValidator').default)(testDir);
          const result = validator.validateConfiguration();

          // Property: Validation result should always have consistent structure
          const hasValidStructure = (
            typeof result.isValid === 'boolean' &&
            Array.isArray(result.errors) &&
            Array.isArray(result.warnings) &&
            result.errors.every(error => 
              typeof error.type === 'string' &&
              typeof error.field === 'string' &&
              typeof error.message === 'string'
            ) &&
            result.warnings.every(warning => 
              typeof warning.type === 'string' &&
              typeof warning.field === 'string' &&
              typeof warning.message === 'string'
            )
          );

          // Property: isValid should be false if there are errors
          const validityConsistent = result.errors.length === 0 ? true : !result.isValid;

          return hasValidStructure && validityConsistent;
        }
      ),
      { numRuns: 100 }
    );
  });
});