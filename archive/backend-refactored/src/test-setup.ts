/**
 * Test setup configuration for Trinity Backend Refactored
 * Configures fast-check for property-based testing
 */

import * as fc from 'fast-check';

// Configure fast-check globally
beforeAll(() => {
  // Set global configuration for property-based tests
  fc.configureGlobal({
    numRuns: 100, // Minimum 100 iterations per property test as per design requirements
    seed: 42, // Deterministic seeding for reproducible test runs
    verbose: true, // Enable verbose output for debugging
  });
});

// Global test timeout for property-based tests
jest.setTimeout(30000); // 30 seconds for property tests that may take longer

// Custom matchers for better assertions
expect.extend({
  toSatisfyProperty(received: any, property: (value: any) => boolean) {
    const pass = property(received);
    if (pass) {
      return {
        message: () => `Expected ${received} not to satisfy the property`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected ${received} to satisfy the property`,
        pass: false,
      };
    }
  },
});

// Declare custom matcher types
declare global {
  namespace jest {
    interface Matchers<R> {
      toSatisfyProperty(property: (value: any) => boolean): R;
    }
  }
}