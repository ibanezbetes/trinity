/**
 * Property-Based Tests for Configuration Error Handling
 * Feature: mobile-apk-build-fixes, Property 3: Configuration Error Handling
 * Validates: Requirements 2.3, 5.4
 */

import fc from 'fast-check';
import { configurationErrorHandler, ErrorGuide, WarningGuide } from '../configurationErrorHandler';
import { ValidationResult, ValidationError, ValidationWarning } from '../configurationValidator';

describe('Configuration Error Handling Properties', () => {
  /**
   * Property 3: Configuration Error Handling
   * For any invalid configuration property, the build system should provide specific 
   * guidance and clear error messages indicating how to fix each error
   */
  test('Property 3: Error guides should provide actionable solutions', () => {
    fc.assert(
      fc.property(
        // Generator for validation errors
        fc.array(
          fc.record({
            type: fc.constantFrom('SCHEMA', 'ASSET', 'CONFIGURATION', 'MISSING_FILE'),
            field: fc.oneof(
              fc.constant('expo.name'),
              fc.constant('expo.slug'),
              fc.constant('expo.version'),
              fc.constant('expo.icon'),
              fc.constant('expo.extra.cognitoUserPoolId'),
              fc.constant('expo.extra.googleWebClientId'),
              fc.constant('app.json')
            ),
            message: fc.string({ minLength: 10, maxLength: 100 }),
            suggestion: fc.option(fc.string({ minLength: 10, maxLength: 100 }))
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (errors: ValidationError[]) => {
          const validationResult: ValidationResult = {
            isValid: false,
            errors,
            warnings: []
          };

          const errorGuides = configurationErrorHandler.generateErrorGuides(validationResult);

          // Property: Every error should have at least one solution
          const allErrorsHaveSolutions = errorGuides.every(guide => 
            guide.solutions.length > 0
          );

          // Property: Every solution should have actionable steps
          const allSolutionsHaveSteps = errorGuides.every(guide =>
            guide.solutions.every(solution =>
              Array.isArray(solution.steps) &&
              solution.steps.length > 0 &&
              solution.steps.every(step => typeof step === 'string' && step.length > 0)
            )
          );

          // Property: Every solution should have a title and description
          const allSolutionsHaveDetails = errorGuides.every(guide =>
            guide.solutions.every(solution =>
              typeof solution.title === 'string' && solution.title.length > 0 &&
              typeof solution.description === 'string' && solution.description.length > 0
            )
          );

          return allErrorsHaveSolutions && allSolutionsHaveSteps && allSolutionsHaveDetails;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3a: Warning guides should have appropriate urgency levels', () => {
    fc.assert(
      fc.property(
        // Generator for validation warnings
        fc.array(
          fc.record({
            type: fc.constantFrom('OPTIMIZATION', 'COMPATIBILITY', 'BEST_PRACTICE', 'CONFIGURATION'),
            field: fc.oneof(
              fc.constant('expo.orientation'),
              fc.constant('expo.scheme'),
              fc.constant('expo.extra'),
              fc.constant('.easignore')
            ),
            message: fc.string({ minLength: 10, maxLength: 100 }),
            suggestion: fc.option(fc.string({ minLength: 10, maxLength: 100 }))
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (warnings: ValidationWarning[]) => {
          const validationResult: ValidationResult = {
            isValid: true,
            errors: [],
            warnings
          };

          const warningGuides = configurationErrorHandler.generateWarningGuides(validationResult);

          // Property: Compatibility warnings should have high impact and immediate urgency
          const compatibilityWarningsCorrect = warningGuides
            .filter(guide => guide.warning.type === 'COMPATIBILITY')
            .every(guide => 
              guide.impact === 'HIGH' && 
              guide.whenToFix === 'IMMEDIATELY'
            );

          // Property: All warning guides should have valid impact levels
          const validImpactLevels = warningGuides.every(guide =>
            ['LOW', 'MEDIUM', 'HIGH'].includes(guide.impact)
          );

          // Property: All warning guides should have valid urgency levels
          const validUrgencyLevels = warningGuides.every(guide =>
            ['IMMEDIATELY', 'BEFORE_PRODUCTION', 'OPTIONAL'].includes(guide.whenToFix)
          );

          // Property: All warning guides should have recommendations
          const allHaveRecommendations = warningGuides.every(guide =>
            typeof guide.recommendation === 'string' && guide.recommendation.length > 0
          );

          return compatibilityWarningsCorrect && 
                 validImpactLevels && 
                 validUrgencyLevels && 
                 allHaveRecommendations;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3b: Schema error solutions should include code examples', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constant('SCHEMA'),
            field: fc.oneof(
              fc.constant('expo.name'),
              fc.constant('expo.slug'),
              fc.constant('expo.version')
            ),
            message: fc.string({ minLength: 10 }),
            suggestion: fc.option(fc.string())
          }),
          { minLength: 1, maxLength: 3 }
        ),
        (schemaErrors: ValidationError[]) => {
          const validationResult: ValidationResult = {
            isValid: false,
            errors: schemaErrors,
            warnings: []
          };

          const errorGuides = configurationErrorHandler.generateErrorGuides(validationResult);

          // Property: Schema errors should have solutions with code examples
          const schemaErrorsHaveCodeExamples = errorGuides.every(guide =>
            guide.error.type === 'SCHEMA' ? 
              guide.solutions.some(solution => 
                solution.codeExample && 
                typeof solution.codeExample === 'string' &&
                solution.codeExample.length > 0
              ) : 
              true // Non-schema errors don't need to have code examples
          );

          // Property: Code examples should be valid JSON-like structures
          const codeExamplesAreValid = errorGuides.every(guide =>
            guide.solutions.every(solution =>
              !solution.codeExample || 
              (solution.codeExample.includes('{') && solution.codeExample.includes('}'))
            )
          );

          return schemaErrorsHaveCodeExamples && codeExamplesAreValid;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3c: Asset error solutions should provide multiple approaches', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constant('ASSET'),
            field: fc.oneof(
              fc.constant('expo.icon'),
              fc.constant('expo.android.adaptiveIcon.foregroundImage')
            ),
            message: fc.oneof(
              fc.constant('Icon file not found'),
              fc.constant('Icon should be a PNG file'),
              fc.constant('Icon should be square')
            ),
            suggestion: fc.option(fc.string())
          }),
          { minLength: 1, maxLength: 2 }
        ),
        (assetErrors: ValidationError[]) => {
          const validationResult: ValidationResult = {
            isValid: false,
            errors: assetErrors,
            warnings: []
          };

          const errorGuides = configurationErrorHandler.generateErrorGuides(validationResult);

          // Property: Asset errors should have multiple solution approaches
          const assetErrorsHaveMultipleSolutions = errorGuides
            .filter(guide => guide.error.type === 'ASSET')
            .every(guide => guide.solutions.length >= 1); // At least one solution

          // Property: Asset solutions should include time estimates
          const assetSolutionsHaveTimeEstimates = errorGuides
            .filter(guide => guide.error.type === 'ASSET')
            .every(guide =>
              guide.solutions.some(solution => 
                solution.estimatedTime && 
                typeof solution.estimatedTime === 'string'
              )
            );

          return assetErrorsHaveMultipleSolutions && assetSolutionsHaveTimeEstimates;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3d: Troubleshooting guide should be well-structured', () => {
    fc.assert(
      fc.property(
        fc.record({
          errors: fc.array(
            fc.record({
              type: fc.constantFrom('SCHEMA', 'ASSET', 'CONFIGURATION'),
              field: fc.string({ minLength: 1 }),
              message: fc.string({ minLength: 10 }),
              suggestion: fc.option(fc.string())
            }),
            { maxLength: 3 }
          ),
          warnings: fc.array(
            fc.record({
              type: fc.constantFrom('COMPATIBILITY', 'OPTIMIZATION', 'BEST_PRACTICE'),
              field: fc.string({ minLength: 1 }),
              message: fc.string({ minLength: 10 }),
              suggestion: fc.option(fc.string())
            }),
            { maxLength: 3 }
          )
        }),
        (validationData) => {
          const validationResult: ValidationResult = {
            isValid: validationData.errors.length === 0,
            errors: validationData.errors,
            warnings: validationData.warnings
          };

          const guide = configurationErrorHandler.generateTroubleshootingGuide(validationResult);

          // Property: Guide should be a non-empty string
          const isNonEmptyString = typeof guide === 'string' && guide.length > 0;

          // Property: Guide should have a title
          const hasTitle = guide.includes('Configuration Troubleshooting Guide');

          // Property: If there are errors, guide should mention them
          const mentionsErrors = validationData.errors.length === 0 || 
                                guide.includes('CRITICAL ERRORS');

          // Property: If there are warnings, guide should categorize them
          const categorizesWarnings = validationData.warnings.length === 0 || 
                                     guide.includes('WARNINGS');

          // Property: If no issues, guide should be positive
          const positiveWhenNoIssues = (validationData.errors.length > 0 || validationData.warnings.length > 0) ||
                                      guide.includes('No issues found');

          return isNonEmptyString && 
                 hasTitle && 
                 mentionsErrors && 
                 categorizesWarnings && 
                 positiveWhenNoIssues;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3e: Error solutions should have documentation links for complex issues', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom('CONFIGURATION', 'MISSING_FILE'),
            field: fc.oneof(
              fc.constant('expo.extra.cognitoUserPoolId'),
              fc.constant('expo.extra.googleWebClientId'),
              fc.constant('app.json')
            ),
            message: fc.string({ minLength: 10 }),
            suggestion: fc.option(fc.string())
          }),
          { minLength: 1, maxLength: 2 }
        ),
        (complexErrors: ValidationError[]) => {
          const validationResult: ValidationResult = {
            isValid: false,
            errors: complexErrors,
            warnings: []
          };

          const errorGuides = configurationErrorHandler.generateErrorGuides(validationResult);

          // Property: Complex configuration errors should have documentation links
          const complexErrorsHaveDocumentation = errorGuides
            .filter(guide => 
              guide.error.type === 'CONFIGURATION' || 
              guide.error.type === 'MISSING_FILE'
            )
            .every(guide =>
              guide.solutions.some(solution =>
                solution.documentationUrl &&
                typeof solution.documentationUrl === 'string' &&
                solution.documentationUrl.startsWith('http')
              )
            );

          // Property: Documentation URLs should be valid format
          const documentationUrlsAreValid = errorGuides.every(guide =>
            guide.solutions.every(solution =>
              !solution.documentationUrl ||
              (solution.documentationUrl.startsWith('http') && 
               solution.documentationUrl.includes('.'))
            )
          );

          return complexErrorsHaveDocumentation && documentationUrlsAreValid;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3f: Error handling should be consistent across error types', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom('SCHEMA', 'ASSET', 'CONFIGURATION', 'MISSING_FILE'),
            field: fc.string({ minLength: 1 }),
            message: fc.string({ minLength: 5 }),
            suggestion: fc.option(fc.string())
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (mixedErrors: ValidationError[]) => {
          const validationResult: ValidationResult = {
            isValid: false,
            errors: mixedErrors,
            warnings: []
          };

          const errorGuides = configurationErrorHandler.generateErrorGuides(validationResult);

          // Property: All error guides should have the same structure
          const consistentStructure = errorGuides.every(guide =>
            guide.error &&
            Array.isArray(guide.solutions) &&
            guide.solutions.every(solution =>
              typeof solution.title === 'string' &&
              typeof solution.description === 'string' &&
              Array.isArray(solution.steps)
            )
          );

          // Property: Number of guides should match number of errors
          const correctCount = errorGuides.length === mixedErrors.length;

          // Property: Each guide should correspond to its error
          const correctMapping = errorGuides.every((guide, index) =>
            guide.error.type === mixedErrors[index].type &&
            guide.error.field === mixedErrors[index].field &&
            guide.error.message === mixedErrors[index].message
          );

          return consistentStructure && correctCount && correctMapping;
        }
      ),
      { numRuns: 100 }
    );
  });
});