#!/usr/bin/env ts-node

/**
 * Quality Checks Runner Script
 * Automated script to run all quality checks
 */

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { QualityModule } from '../quality.module';
import type { QualityService } from '../quality.service';

async function runQualityChecks(): Promise<void> {
  const logger = new Logger('QualityChecksRunner');
  
  try {
    logger.log('🚀 Starting automated quality checks...');
    
    // Create NestJS application context
    const app = await NestFactory.createApplicationContext(QualityModule);
    const qualityService = app.get(QualityService);
    
    // Run comprehensive quality check
    const report = await qualityService.runComprehensiveQualityCheck();
    
    // Generate reports
    const reportPath = await qualityService.generateComprehensiveReport(report);
    
    // Log results
    logger.log(`📊 Quality Check Results:`);
    logger.log(`   Overall Score: ${report.overallScore}/100`);
    logger.log(`   Status: ${report.overallPassed ? '✅ PASSED' : '❌ FAILED'}`);
    logger.log(`   Total Issues: ${report.summary.totalIssues}`);
    logger.log(`   Critical Issues: ${report.summary.criticalIssues}`);
    logger.log(`   Test Coverage: ${report.summary.testCoverage.toFixed(1)}%`);
    logger.log(`   Report: ${reportPath}`);
    
    // Print recommendations
    if (report.recommendations.length > 0) {
      logger.log(`\n💡 Recommendations:`);
      report.recommendations.forEach((rec, index) => {
        logger.log(`   ${index + 1}. ${rec}`);
      });
    }
    
    await app.close();
    
    // Exit with appropriate code
    process.exit(report.overallPassed ? 0 : 1);
    
  } catch (error) {
    logger.error('❌ Quality checks failed:', error);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
const isCI = process.env.CI === 'true' || args.includes('--ci');
const isVerbose = args.includes('--verbose') || args.includes('-v');

if (isVerbose) {
  process.env.LOG_LEVEL = 'debug';
}

if (isCI) {
  // In CI mode, be more strict
  process.env.QUALITY_STRICT_MODE = 'true';
}

// Run the quality checks
runQualityChecks().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});