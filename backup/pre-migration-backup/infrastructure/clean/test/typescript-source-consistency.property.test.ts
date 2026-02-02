/**
 * Property-Based Test: TypeScript Source Code Consistency
 * Validates: Requirements 2.1, 2.2
 * 
 * This test ensures that all Lambda functions have clean TypeScript source code
 * and that the compiled output matches the source structure.
 */

import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('Property 2: TypeScript Source Code Consistency', () => {
  const handlersDir = path.join(__dirname, '../src/handlers');
  const sharedDir = path.join(__dirname, '../src/shared');

  beforeAll(() => {
    // Ensure directories exist
    expect(fs.existsSync(handlersDir)).toBe(true);
    expect(fs.existsSync(sharedDir)).toBe(true);
  });

  /**
   * Property: All handler files must be TypeScript source files
   */
  test('**Validates: Requirements 2.1** - All handlers are TypeScript source files', () => {
    fc.assert(
      fc.property(
        fc.constant(null), // No input needed for this property
        () => {
          const handlerFiles = fs.readdirSync(handlersDir)
            .filter(file => file.endsWith('-handler.ts'));

          // Must have at least 7 handler files (one for each Lambda function)
          expect(handlerFiles.length).toBeGreaterThanOrEqual(7);

          // Each handler file must be TypeScript
          handlerFiles.forEach(file => {
            expect(file).toMatch(/^[a-z]+-handler\.ts$/);
            
            const filePath = path.join(handlersDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            
            // Must contain TypeScript-specific constructs
            expect(content).toContain('import');
            expect(content).toContain('export');
            expect(content).toContain('BaseHandler');
            expect(content).toContain('createHandler');
            
            // Must not contain compiled JavaScript artifacts
            expect(content).not.toContain('require(');
            expect(content).not.toContain('exports.');
            expect(content).not.toContain('__createBinding');
          });

          return true;
        }
      ),
      { numRuns: 1 } // Single run since this is a structural property
    );
  });

  /**
   * Property: All shared modules must be TypeScript source files
   */
  test('**Validates: Requirements 2.1** - All shared modules are TypeScript source files', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const sharedFiles = fs.readdirSync(sharedDir)
            .filter(file => file.endsWith('.ts'));

          // Must have core shared modules
          const requiredModules = ['types.ts', 'logger.ts', 'config.ts', 'database.ts'];
          requiredModules.forEach(module => {
            expect(sharedFiles).toContain(module);
          });

          // Each shared file must be TypeScript
          sharedFiles.forEach(file => {
            const filePath = path.join(sharedDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            
            // Must contain TypeScript-specific constructs
            expect(content).toContain('export');
            
            // Must not contain compiled JavaScript artifacts
            expect(content).not.toContain('require(');
            expect(content).not.toContain('exports.');
            expect(content).not.toContain('__createBinding');
          });

          return true;
        }
      ),
      { numRuns: 1 }
    );
  });

  /**
   * Property: TypeScript compilation must succeed without errors
   */
  test('**Validates: Requirements 2.2** - TypeScript compilation succeeds', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          try {
            // Run TypeScript compiler check
            const result = execSync('npx tsc --noEmit --project tsconfig.json', {
              cwd: path.join(__dirname, '..'),
              encoding: 'utf-8',
              stdio: 'pipe'
            });

            // If we get here, compilation succeeded
            return true;
          } catch (error: any) {
            // Log compilation errors for debugging
            console.error('TypeScript compilation failed:', error.stdout || error.message);
            throw new Error(`TypeScript compilation failed: ${error.stdout || error.message}`);
          }
        }
      ),
      { numRuns: 1 }
    );
  });

  /**
   * Property: All handlers must follow consistent structure
   */
  test('**Validates: Requirements 2.1, 2.2** - Handler structure consistency', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'auth-handler.ts',
          'room-handler.ts',
          'vote-handler.ts',
          'movie-handler.ts',
          'cache-handler.ts',
          'realtime-handler.ts',
          'matchmaker-handler.ts'
        ),
        (handlerFile) => {
          const filePath = path.join(handlersDir, handlerFile);
          
          if (!fs.existsSync(filePath)) {
            throw new Error(`Handler file ${handlerFile} does not exist`);
          }

          const content = fs.readFileSync(filePath, 'utf-8');

          // Must import BaseHandler and createHandler
          expect(content).toContain("import { BaseHandler, createHandler } from './base-handler'");
          
          // Must have a class that extends BaseHandler
          expect(content).toMatch(/class \w+Handler extends BaseHandler/);
          
          // Must have a handle method
          expect(content).toContain('async handle(event: AppSyncEvent)');
          
          // Must export the handler using createHandler
          expect(content).toMatch(/export const handler = createHandler\(\w+Handler\)/);
          
          // Must have proper TypeScript types
          expect(content).toContain('AppSyncEvent');
          expect(content).toContain('ValidationError');
          
          // Must use this.validateArgs for input validation
          expect(content).toContain('this.validateArgs');
          
          // Must use this.logger for logging
          expect(content).toContain('this.logger');
          
          // Must use this.db for database operations
          expect(content).toContain('this.db');

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: All handlers must have proper error handling
   */
  test('**Validates: Requirements 2.2** - Error handling consistency', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'auth-handler.ts',
          'room-handler.ts',
          'vote-handler.ts',
          'movie-handler.ts',
          'cache-handler.ts',
          'realtime-handler.ts',
          'matchmaker-handler.ts'
        ),
        (handlerFile) => {
          const filePath = path.join(handlersDir, handlerFile);
          const content = fs.readFileSync(filePath, 'utf-8');

          // Must import error types (check for any of the common error types, but not required for stream handlers)
          const isStreamHandler = content.includes('DynamoDBStreamEvent') || content.includes('StreamProcessResult');
          if (!isStreamHandler) {
            expect(content).toMatch(/ValidationError|NotFoundError|UnauthorizedError|ConflictError|TrinityError/);
          }
          
          // Must throw ValidationError for unknown operations (not required for stream handlers)
          const isStreamHandler2 = content.includes('DynamoDBStreamEvent') || content.includes('StreamProcessResult');
          if (!isStreamHandler2) {
            expect(content).toContain('throw new ValidationError');
          }
          
          // Must validate required arguments
          expect(content).toContain('this.validateArgs');
          
          // Must have proper switch statement for operations
          expect(content).toContain('switch (fieldName)');
          expect(content).toContain('default:');

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Base handler must provide consistent interface
   */
  test('**Validates: Requirements 2.1, 2.2** - Base handler interface consistency', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const baseHandlerPath = path.join(handlersDir, 'base-handler.ts');
          expect(fs.existsSync(baseHandlerPath)).toBe(true);

          const content = fs.readFileSync(baseHandlerPath, 'utf-8');

          // Must export BaseHandler class
          expect(content).toContain('export abstract class BaseHandler');
          
          // Must have abstract handle method
          expect(content).toContain('abstract handle(event: AppSyncEvent)');
          
          // Must have initialize method (public in actual implementation)
          expect(content).toContain('public async initialize()');
          
          // Must have validation methods
          expect(content).toContain('protected validateAuth');
          expect(content).toContain('protected validateArgs');
          
          // Must have response methods
          expect(content).toContain('protected success');
          expect(content).toContain('protected error');
          
          // Must export createHandler function
          expect(content).toContain('export function createHandler');
          
          // Must export HandlerUtils
          expect(content).toContain('export const HandlerUtils');

          return true;
        }
      ),
      { numRuns: 1 }
    );
  });

  /**
   * Property: Shared modules must provide consistent interfaces
   */
  test('**Validates: Requirements 2.1, 2.2** - Shared module interface consistency', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('types.ts', 'logger.ts', 'config.ts', 'database.ts'),
        (moduleFile) => {
          const filePath = path.join(sharedDir, moduleFile);
          const content = fs.readFileSync(filePath, 'utf-8');

          switch (moduleFile) {
            case 'types.ts':
              expect(content).toContain('export interface AppSyncEvent');
              expect(content).toContain('export interface TrinityConfig');
              expect(content).toContain('export class TrinityError');
              break;
              
            case 'logger.ts':
              expect(content).toContain('export const logger');
              expect(content).toContain('export function createLogger');
              expect(content).toContain('export class PerformanceTimer');
              expect(content).toContain('export const LogUtils');
              break;
              
            case 'config.ts':
              expect(content).toContain('export async function getTrinityConfig');
              expect(content).toContain('export async function getParameter');
              expect(content).toContain('export function clearConfigCache');
              break;
              
            case 'database.ts':
              expect(content).toContain('export class TrinityDatabase');
              expect(content).toContain('export async function createDatabase');
              expect(content).toContain('async get<T = any>');
              expect(content).toContain('async put<T extends Record<string, any>>');
              expect(content).toContain('async update<T = any>');
              expect(content).toContain('async delete');
              expect(content).toContain('async query<T = any>');
              break;
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: No compiled JavaScript files should exist in source directories
   */
  test('**Validates: Requirements 2.1** - No compiled JavaScript in source', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const checkDirectory = (dir: string) => {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            
            files.forEach(file => {
              if (file.isDirectory()) {
                checkDirectory(path.join(dir, file.name));
              } else if (file.name.endsWith('.js') || file.name.endsWith('.js.map')) {
                // Allow compiled files only in specific locations
                const allowedPaths = [
                  'node_modules',
                  'cdk.out',
                  'lib', // CDK compiled output
                  'dist',
                  'build'
                ];
                
                const isInAllowedPath = allowedPaths.some(allowed => 
                  dir.includes(allowed) || file.name.includes(allowed)
                );
                
                if (!isInAllowedPath) {
                  throw new Error(`Compiled JavaScript file found in source: ${path.join(dir, file.name)}`);
                }
              }
            });
          };

          checkDirectory(path.join(__dirname, '../src'));
          return true;
        }
      ),
      { numRuns: 1 }
    );
  });
});