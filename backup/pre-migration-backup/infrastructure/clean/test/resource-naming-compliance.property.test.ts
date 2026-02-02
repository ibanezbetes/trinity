/**
 * Property Test: Resource Naming Convention Compliance
 * 
 * **Validates: Requirements 8.6**
 * 
 * This property test ensures that all Trinity resources follow consistent
 * naming conventions across all environments and resource types.
 */

import * as fc from 'fast-check';
import { 
  generateResourceNames, 
  validateResourceName, 
  validateStackResourceNames,
  generateResourceTags,
  NamingConfig 
} from '../config/resource-naming';

describe('Property Test: Resource Naming Convention Compliance', () => {
  
  /**
   * Property 11: Resource Naming Convention Compliance
   * 
   * All generated resource names must follow Trinity naming conventions
   * regardless of environment, region, or version configuration.
   */
  test('Property 11: All generated resource names follow Trinity conventions', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary naming configurations
        fc.record({
          project: fc.constant('trinity'),
          environment: fc.oneof(
            fc.constant('dev'),
            fc.constant('staging'),
            fc.constant('production')
          ),
          region: fc.oneof(
            fc.constant('eu-west-1'),
            fc.constant('us-east-1'),
            fc.constant('ap-southeast-1')
          ),
          version: fc.option(fc.oneof(
            fc.constant('v2'),
            fc.constant('v3'),
            fc.constant('beta')
          ))
        }),
        
        (config: NamingConfig) => {
          // Generate resource names using the configuration
          const resourceNames = generateResourceNames(config);
          
          // Test all DynamoDB table names
          Object.entries(resourceNames.tables).forEach(([tableKey, tableName]) => {
            const validation = validateResourceName(tableName, 'dynamodb-table', config);
            
            // Property: All table names must be valid
            expect(validation.valid).toBe(true);
            
            // Property: All table names must start with project name
            expect(tableName).toMatch(/^trinity-/);
            
            // Property: All table names must include environment
            expect(tableName).toContain(config.environment);
            
            // Property: All table names must use lowercase and hyphens only
            expect(tableName).toMatch(/^[a-z0-9-]+$/);
            
            // Property: Table names must not exceed DynamoDB limits
            expect(tableName.length).toBeLessThanOrEqual(255);
          });
          
          // Test all Lambda function names
          Object.entries(resourceNames.lambdas).forEach(([functionKey, functionName]) => {
            const validation = validateResourceName(functionName, 'lambda-function', config);
            
            // Property: All function names must be valid
            expect(validation.valid).toBe(true);
            
            // Property: All function names must start with project name
            expect(functionName).toMatch(/^trinity-/);
            
            // Property: All function names must include environment
            expect(functionName).toContain(config.environment);
            
            // Property: Function names must not exceed Lambda limits
            expect(functionName.length).toBeLessThanOrEqual(64);
          });
          
          // Test all CloudFormation stack names
          Object.entries(resourceNames.stacks).forEach(([stackKey, stackName]) => {
            const validation = validateResourceName(stackName, 'cloudformation-stack', config);
            
            // Property: All stack names must be valid
            expect(validation.valid).toBe(true);
            
            // Property: Stack names must start with Trinity
            expect(stackName).toMatch(/^Trinity/);
            
            // Property: Stack names must include environment (capitalized)
            const capitalizedEnv = config.environment.charAt(0).toUpperCase() + config.environment.slice(1);
            expect(stackName).toContain(capitalizedEnv);
            
            // Property: Stack names must end with Stack
            expect(stackName).toMatch(/Stack$/);
          });
          
          // Test API names
          Object.entries(resourceNames.apis).forEach(([apiKey, apiName]) => {
            // Property: API names must start with project name
            expect(apiName).toMatch(/^trinity-/);
            
            // Property: API names must use lowercase and hyphens only
            expect(apiName).toMatch(/^[a-z0-9-]+$/);
          });
          
          // Test Cognito resource names
          Object.entries(resourceNames.cognito).forEach(([cognitoKey, cognitoName]) => {
            // Property: Cognito names must start with project name
            expect(cognitoName).toMatch(/^trinity-/);
            
            // Property: Cognito names must include environment
            expect(cognitoName).toContain(config.environment);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Resource name uniqueness within categories
   * 
   * All resource names within the same category must be unique
   * to prevent naming conflicts.
   */
  test('Property: Resource names are unique within categories', () => {
    fc.assert(
      fc.property(
        fc.record({
          project: fc.constant('trinity'),
          environment: fc.oneof(
            fc.constant('dev'),
            fc.constant('staging'),
            fc.constant('production')
          ),
          region: fc.constant('eu-west-1'),
          version: fc.option(fc.constant('v2'))
        }),
        
        (config: NamingConfig) => {
          const resourceNames = generateResourceNames(config);
          
          // Test table name uniqueness
          const tableNames = Object.values(resourceNames.tables);
          const uniqueTableNames = new Set(tableNames);
          expect(uniqueTableNames.size).toBe(tableNames.length);
          
          // Test Lambda function name uniqueness
          const functionNames = Object.values(resourceNames.lambdas);
          const uniqueFunctionNames = new Set(functionNames);
          expect(uniqueFunctionNames.size).toBe(functionNames.length);
          
          // Test stack name uniqueness
          const stackNames = Object.values(resourceNames.stacks);
          const uniqueStackNames = new Set(stackNames);
          expect(uniqueStackNames.size).toBe(stackNames.length);
          
          // Test API name uniqueness
          const apiNames = Object.values(resourceNames.apis);
          const uniqueApiNames = new Set(apiNames);
          expect(uniqueApiNames.size).toBe(apiNames.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Environment isolation in naming
   * 
   * Resources from different environments must have different names
   * to ensure proper isolation.
   */
  test('Property: Environment isolation is maintained in resource names', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.oneof(fc.constant('dev'), fc.constant('staging'), fc.constant('production')),
          fc.oneof(fc.constant('dev'), fc.constant('staging'), fc.constant('production'))
        ).filter(([env1, env2]) => env1 !== env2),
        
        ([env1, env2]) => {
          const config1: NamingConfig = { project: 'trinity', environment: env1, region: 'eu-west-1' };
          const config2: NamingConfig = { project: 'trinity', environment: env2, region: 'eu-west-1' };
          
          const names1 = generateResourceNames(config1);
          const names2 = generateResourceNames(config2);
          
          // Property: Table names must be different across environments
          Object.keys(names1.tables).forEach(tableKey => {
            expect(names1.tables[tableKey]).not.toBe(names2.tables[tableKey]);
          });
          
          // Property: Lambda names must be different across environments
          Object.keys(names1.lambdas).forEach(functionKey => {
            expect(names1.lambdas[functionKey]).not.toBe(names2.lambdas[functionKey]);
          });
          
          // Property: Stack names must be different across environments
          Object.keys(names1.stacks).forEach(stackKey => {
            expect(names1.stacks[stackKey]).not.toBe(names2.stacks[stackKey]);
          });
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Resource tag consistency
   * 
   * All resources must have consistent tagging that follows
   * the naming conventions and includes required metadata.
   */
  test('Property: Resource tags are consistent with naming conventions', () => {
    fc.assert(
      fc.property(
        fc.record({
          project: fc.constant('trinity'),
          environment: fc.oneof(
            fc.constant('dev'),
            fc.constant('staging'),
            fc.constant('production')
          ),
          region: fc.constant('eu-west-1')
        }),
        fc.oneof(
          fc.constant('dynamodb-table'),
          fc.constant('lambda-function'),
          fc.constant('cloudformation-stack')
        ),
        fc.string({ minLength: 5, maxLength: 50 }).map(s => 
          `trinity-${s.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
        ),
        
        (config: NamingConfig, resourceType: string, resourceName: string) => {
          const tags = generateResourceTags(config, resourceType, resourceName);
          
          // Property: Required tags must be present
          expect(tags).toHaveProperty('Project');
          expect(tags).toHaveProperty('Environment');
          expect(tags).toHaveProperty('ResourceType');
          expect(tags).toHaveProperty('ResourceName');
          expect(tags).toHaveProperty('ManagedBy');
          
          // Property: Tag values must match configuration
          expect(tags.Project).toBe(config.project);
          expect(tags.Environment).toBe(config.environment);
          expect(tags.ResourceType).toBe(resourceType);
          expect(tags.ResourceName).toBe(resourceName);
          expect(tags.ManagedBy).toBe('CDK');
          
          // Property: Tag values must not be empty
          Object.values(tags).forEach(tagValue => {
            expect(tagValue).toBeTruthy();
            expect(typeof tagValue).toBe('string');
            expect(tagValue.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Naming validation consistency
   * 
   * The validation function must consistently identify valid and invalid
   * resource names according to the established rules.
   */
  test('Property: Naming validation is consistent and deterministic', () => {
    fc.assert(
      fc.property(
        fc.record({
          project: fc.constant('trinity'),
          environment: fc.oneof(
            fc.constant('dev'),
            fc.constant('staging'),
            fc.constant('production')
          ),
          region: fc.constant('eu-west-1')
        }),
        fc.oneof(
          fc.constant('dynamodb-table'),
          fc.constant('lambda-function'),
          fc.constant('cloudformation-stack')
        ),
        
        (config: NamingConfig, resourceType: string) => {
          // Generate a valid resource name
          const resourceNames = generateResourceNames(config);
          let validName: string;
          
          switch (resourceType) {
            case 'dynamodb-table':
              validName = resourceNames.tables.users;
              break;
            case 'lambda-function':
              validName = resourceNames.lambdas.auth;
              break;
            case 'cloudformation-stack':
              validName = resourceNames.stacks.database;
              break;
            default:
              validName = 'trinity-test-dev';
          }
          
          // Property: Valid names must always validate as valid
          const validation1 = validateResourceName(validName, resourceType, config);
          const validation2 = validateResourceName(validName, resourceType, config);
          
          expect(validation1.valid).toBe(true);
          expect(validation2.valid).toBe(true);
          expect(validation1.valid).toBe(validation2.valid);
          
          // Property: Invalid names must consistently fail validation
          const invalidNames = [
            'INVALID-UPPERCASE',
            'invalid_underscores',
            'invalid spaces',
            'invalid@symbols',
            '', // empty string
            'x'.repeat(300), // too long
            'not-trinity-prefix'
          ];
          
          invalidNames.forEach(invalidName => {
            const invalidValidation = validateResourceName(invalidName, resourceType, config);
            expect(invalidValidation.valid).toBe(false);
            expect(invalidValidation.issues.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Stack resource validation completeness
   * 
   * Stack resource validation must identify all naming issues
   * and provide comprehensive feedback.
   */
  test('Property: Stack resource validation is comprehensive', () => {
    fc.assert(
      fc.property(
        fc.record({
          project: fc.constant('trinity'),
          environment: fc.oneof(
            fc.constant('dev'),
            fc.constant('staging'),
            fc.constant('production')
          ),
          region: fc.constant('eu-west-1')
        }),
        
        (config: NamingConfig) => {
          // Create a mix of valid and invalid resource names
          const stackResources = {
            validTable: 'trinity-users-dev',
            invalidTable: 'INVALID-TABLE-NAME',
            validFunction: 'trinity-auth-dev',
            invalidFunction: 'invalid_function_name',
            validStack: 'TrinityDevDatabaseStack',
            invalidStack: 'invalid-stack-name'
          };
          
          const validation = validateStackResourceNames(stackResources, config);
          
          // Property: Validation must identify invalid resources
          expect(validation.valid).toBe(false);
          expect(validation.issues.length).toBeGreaterThan(0);
          
          // Property: Each invalid resource must be reported
          const reportedResources = validation.issues.map(issue => issue.resource);
          expect(reportedResources).toContain('invalidTable');
          expect(reportedResources).toContain('invalidFunction');
          expect(reportedResources).toContain('invalidStack');
          
          // Property: Valid resources should not be reported as issues
          expect(reportedResources).not.toContain('validTable');
          expect(reportedResources).not.toContain('validFunction');
          expect(reportedResources).not.toContain('validStack');
          
          // Property: Each issue must have descriptive messages
          validation.issues.forEach(issue => {
            expect(issue.issues).toBeDefined();
            expect(issue.issues.length).toBeGreaterThan(0);
            issue.issues.forEach(issueMessage => {
              expect(typeof issueMessage).toBe('string');
              expect(issueMessage.length).toBeGreaterThan(0);
            });
          });
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Version handling in resource names
   * 
   * When versions are specified, they must be consistently applied
   * to appropriate resources without breaking naming conventions.
   */
  test('Property: Version handling maintains naming consistency', () => {
    fc.assert(
      fc.property(
        fc.record({
          project: fc.constant('trinity'),
          environment: fc.constant('dev'),
          region: fc.constant('eu-west-1'),
          version: fc.option(fc.oneof(
            fc.constant('v2'),
            fc.constant('v3'),
            fc.constant('beta'),
            fc.constant('alpha')
          ))
        }),
        
        (config: NamingConfig) => {
          const resourceNames = generateResourceNames(config);
          
          if (config.version) {
            // Property: Versioned resources must include version suffix
            expect(resourceNames.tables.rooms).toContain(`-${config.version}`);
            expect(resourceNames.tables.roomInvites).toContain(`-${config.version}`);
            
            // Property: Versioned names must still be valid
            const roomsValidation = validateResourceName(resourceNames.tables.rooms, 'dynamodb-table', config);
            const invitesValidation = validateResourceName(resourceNames.tables.roomInvites, 'dynamodb-table', config);
            
            expect(roomsValidation.valid).toBe(true);
            expect(invitesValidation.valid).toBe(true);
          } else {
            // Property: Non-versioned resources must not have version suffix
            expect(resourceNames.tables.rooms).not.toMatch(/-v\d+$/);
            expect(resourceNames.tables.roomInvites).not.toMatch(/-v\d+$/);
          }
          
          // Property: All resources must remain valid regardless of versioning
          Object.values(resourceNames.tables).forEach(tableName => {
            const validation = validateResourceName(tableName, 'dynamodb-table', config);
            expect(validation.valid).toBe(true);
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});