/**
 * Jest Setup File for Trinity AI Assistant Tests
 * 
 * This file configures the test environment to properly load environment
 * variables from the root .env file and sets up test-specific configurations.
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from root .env file
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Set test-specific environment variables if not already set
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test';
}

// Ensure required test environment variables are set
// These are the actual values from the .env file for testing
if (!process.env.HF_API_TOKEN) {
    process.env.HF_API_TOKEN = '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';
}

if (!process.env.TMDB_API_KEY) {
    process.env.TMDB_API_KEY = 'dc4dbcd2404c1ca852f8eb964add267d';
}

if (!process.env.AWS_REGION) {
    process.env.AWS_REGION = 'eu-west-1';
}

// Set test-specific timeouts to avoid long-running tests
jest.setTimeout(30000);

// Mock console methods to reduce test output noise (optional)
// Uncomment if you want cleaner test output
// global.console = {
//     ...console,
//     log: jest.fn(),
//     debug: jest.fn(),
//     info: jest.fn(),
//     warn: jest.fn(),
//     error: jest.fn(),
// };