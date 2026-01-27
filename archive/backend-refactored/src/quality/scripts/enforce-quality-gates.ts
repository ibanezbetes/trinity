#!/usr/bin/env ts-node

/**
 * Quality Gates Enforcement Script
 * Used in CI/CD pipelines to enforce quality standards
 */

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { QualityModule } from '../quality.module';
import type { QualityService } from '../quality.service';

async function enforceQualityGates(): Promise<void> {
  const logger = new Logger('QualityGatesEnforcer');
  
  try {
    logger.log('🚪 Enforcing quality gates for deployment...');
    
    // Create NestJS application context
    const app = await NestFactory.createApplicationContext(QualityModule);
    const qualityService = app.get(QualityService);
    
    // Enforce quality gates
    const passed = await qualityService.enforceQualityGates();
    
    if (passed) {
      logger.log('✅ All quality gates passed. Deployment approved.');
      logger.log('🚀 Ready for deployment to production.');
    } else {
      logger.error('❌ Quality gates failed. Deployment blocked.');
      logger.error('🛑 Fix all issues before attempting deployment.');
    }
    
    await app.close();
    
    // Exit with appropriate code for CI/CD
    process.exit(passed ? 0 : 1);
    
  } catch (error) {
    logger.error('❌ Quality gate enforcement failed:', error);
    process.exit(1);
  }
}

// Handle environment variables
const environment = process.env.NODE_ENV || 'development';
const branch = process.env.GIT_BRANCH || process.env.GITHUB_REF_NAME || 'unknown';

console.log(`Environment: ${environment}`);
console.log(`Branch: ${branch}`);

// Stricter rules for production deployments
if (environment === 'production' || branch === 'main' || branch === 'master') {
  process.env.QUALITY_STRICT_MODE = 'true';
  console.log('🔒 Strict quality mode enabled for production deployment');
}

// Run quality gate enforcement
enforceQualityGates().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});