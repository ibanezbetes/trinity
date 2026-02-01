/**
 * Jest setup file for Trinity infrastructure tests
 */

// Increase timeout for property-based tests
jest.setTimeout(30000);

// Mock console.log to reduce noise during tests
const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
  // Only log if explicitly needed for debugging
  if (process.env.JEST_VERBOSE === 'true') {
    originalConsoleLog(...args);
  }
};

// Mock console.warn to reduce noise during tests
const originalConsoleWarn = console.warn;
console.warn = (...args: any[]) => {
  // Only log warnings if explicitly needed for debugging
  if (process.env.JEST_VERBOSE === 'true') {
    originalConsoleWarn(...args);
  }
};