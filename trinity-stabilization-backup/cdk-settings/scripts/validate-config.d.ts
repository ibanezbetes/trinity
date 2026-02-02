#!/usr/bin/env node
/**
 * Configuration Validation Script
 * Validates Trinity configuration from both Parameter Store and environment variables
 */
declare function validateConfiguration(): Promise<void>;
export { validateConfiguration };
