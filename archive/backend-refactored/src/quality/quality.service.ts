/**
 * Quality Service
 * Orchestrates all quality checks and reporting
 */

import { Injectable, Logger } from '@nestjs/common';
import type { CodeQualityEnforcerService, CodeQualityResult } from './code-quality-enforcer.service';
import type { SecurityScannerService, SecurityScanResult } from './security-scanner.service';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ComprehensiveQualityReport {
  readonly timestamp: Date;
  readonly overallPassed: boolean;
  readonly overallScore: number;
  readonly codeQuality: CodeQualityResult;
  readonly security: SecurityScanResult;
  readonly summary: QualitySummary;
  readonly recommendations: string[];
}

export interface QualitySummary {
  readonly totalIssues: number;
  readonly criticalIssues: number;
  readonly codeQualityScore: number;
  readonly securityScore: number;
  readonly testCoverage: number;
  readonly passedChecks: string[];
  readonly failedChecks: string[];
}

@Injectable()
export class QualityService {
  private readonly logger = new Logger(QualityService.name);

  constructor(
    private readonly codeQualityEnforcer: CodeQualityEnforcerService,
    private readonly securityScanner: SecurityScannerService,
  ) {}

  public async runComprehensiveQualityCheck(): Promise<ComprehensiveQualityReport> {
    this.logger.log('🚀 Starting comprehensive quality assessment...');

    try {
      // Run all quality checks in parallel
      const [codeQualityResult, securityResult] = await Promise.all([
        this.codeQualityEnforcer.runQualityCheck(),
        this.securityScanner.runSecurityScan(),
      ]);

      // Calculate overall metrics
      const summary = this.calculateSummary(codeQualityResult, securityResult);
      const overallScore = this.calculateOverallScore(codeQualityResult, securityResult);
      const overallPassed = codeQualityResult.passed && securityResult.passed;
      
      // Generate comprehensive recommendations
      const recommendations = this.generateComprehensiveRecommendations(
        codeQualityResult,
        securityResult,
      );

      const report: ComprehensiveQualityReport = {
        timestamp: new Date(),
        overallPassed,
        overallScore,
        codeQuality: codeQualityResult,
        security: securityResult,
        summary,
        recommendations,
      };

      this.logger.log(`✅ Comprehensive quality check completed. Overall score: ${overallScore}/100`);
      
      if (!overallPassed) {
        this.logger.error('❌ Quality check failed. Review the report for details.');
      }

      return report;
    } catch (error) {
      this.logger.error('❌ Comprehensive quality check failed:', error);
      throw new Error(`Quality check failed: ${error.message}`);
    }
  }

  public async generateComprehensiveReport(report: ComprehensiveQualityReport): Promise<string> {
    const reportPath = path.join(process.cwd(), 'reports', 'comprehensive-quality-report.json');
    
    // Ensure reports directory exists
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    
    // Generate HTML report as well
    const htmlReportPath = await this.generateHtmlReport(report);
    
    // Save JSON report
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    this.logger.log(`📄 Comprehensive quality report generated:`);
    this.logger.log(`   JSON: ${reportPath}`);
    this.logger.log(`   HTML: ${htmlReportPath}`);
    
    return reportPath;
  }

  public async enforceQualityGates(): Promise<boolean> {
    this.logger.log('🚪 Enforcing quality gates...');

    const report = await this.runComprehensiveQualityCheck();
    
    // Generate reports
    await this.generateComprehensiveReport(report);
    
    if (!report.overallPassed) {
      this.logger.error('❌ Quality gates failed. Blocking deployment.');
      this.logQualityGateFailures(report);
      return false;
    }

    this.logger.log('✅ All quality gates passed. Deployment approved.');
    return true;
  }

  private calculateSummary(
    codeQuality: CodeQualityResult,
    security: SecurityScanResult,
  ): QualitySummary {
    const passedChecks: string[] = [];
    const failedChecks: string[] = [];

    // Check code quality gates
    if (codeQuality.metrics.lintErrors === 0) {
      passedChecks.push('Lint Errors');
    } else {
      failedChecks.push('Lint Errors');
    }

    if (codeQuality.metrics.typeErrors === 0) {
      passedChecks.push('Type Errors');
    } else {
      failedChecks.push('Type Errors');
    }

    if (codeQuality.metrics.testCoverage >= 80) {
      passedChecks.push('Test Coverage');
    } else {
      failedChecks.push('Test Coverage');
    }

    // Check security gates
    if (security.criticalCount === 0 && security.highCount === 0) {
      passedChecks.push('Security Vulnerabilities');
    } else {
      failedChecks.push('Security Vulnerabilities');
    }

    const totalIssues = codeQuality.issues.length + security.totalVulnerabilities;
    const criticalIssues = 
      codeQuality.issues.filter(i => i.severity === 'error').length +
      security.criticalCount +
      security.highCount;

    const securityScore = Math.max(0, 100 - (security.criticalCount * 25) - (security.highCount * 10));

    return {
      totalIssues,
      criticalIssues,
      codeQualityScore: codeQuality.score,
      securityScore,
      testCoverage: codeQuality.metrics.testCoverage,
      passedChecks,
      failedChecks,
    };
  }

  private calculateOverallScore(
    codeQuality: CodeQualityResult,
    security: SecurityScanResult,
  ): number {
    // Weighted average: 60% code quality, 40% security
    const securityScore = Math.max(0, 100 - (security.criticalCount * 25) - (security.highCount * 10));
    return Math.round((codeQuality.score * 0.6) + (securityScore * 0.4));
  }

  private generateComprehensiveRecommendations(
    codeQuality: CodeQualityResult,
    security: SecurityScanResult,
  ): string[] {
    const recommendations: string[] = [];

    // Priority 1: Critical security issues
    if (security.criticalCount > 0) {
      recommendations.push('🚨 URGENT: Address critical security vulnerabilities immediately');
    }

    // Priority 2: Code quality errors
    if (codeQuality.metrics.lintErrors > 0 || codeQuality.metrics.typeErrors > 0) {
      recommendations.push('🔧 Fix all code quality errors before deployment');
    }

    // Priority 3: High security issues
    if (security.highCount > 0) {
      recommendations.push('⚠️ Address high severity security vulnerabilities');
    }

    // Priority 4: Test coverage
    if (codeQuality.metrics.testCoverage < 80) {
      recommendations.push('📊 Improve test coverage to meet quality standards');
    }

    // Add specific recommendations from each service
    recommendations.push(...codeQuality.recommendations);
    
    // Add unique security recommendations
    const securityRecs = security.vulnerabilities
      .filter(v => v.severity === 'critical' || v.severity === 'high')
      .map(v => `🔒 Update ${v.package}: ${v.recommendation}`)
      .slice(0, 3); // Limit to top 3
    
    recommendations.push(...securityRecs);

    // General recommendations
    recommendations.push('🔄 Set up automated quality checks in CI/CD pipeline');
    recommendations.push('📚 Review and update coding standards documentation');

    return [...new Set(recommendations)]; // Remove duplicates
  }

  private async generateHtmlReport(report: ComprehensiveQualityReport): Promise<string> {
    const htmlPath = path.join(process.cwd(), 'reports', 'quality-report.html');
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trinity Quality Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .score { font-size: 48px; font-weight: bold; color: ${report.overallScore >= 80 ? '#4CAF50' : report.overallScore >= 60 ? '#FF9800' : '#F44336'}; }
        .status { font-size: 24px; margin: 10px 0; }
        .passed { color: #4CAF50; }
        .failed { color: #F44336; }
        .section { margin: 20px 0; padding: 15px; border-left: 4px solid #2196F3; background-color: #f8f9fa; }
        .metric { display: inline-block; margin: 10px 20px; text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; }
        .metric-label { font-size: 14px; color: #666; }
        .recommendations { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; }
        .issue { margin: 5px 0; padding: 8px; background-color: #f8f9fa; border-radius: 4px; }
        .error { border-left: 4px solid #F44336; }
        .warning { border-left: 4px solid #FF9800; }
        .info { border-left: 4px solid #2196F3; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Trinity Quality Report</h1>
            <div class="score">${report.overallScore}/100</div>
            <div class="status ${report.overallPassed ? 'passed' : 'failed'}">
                ${report.overallPassed ? '✅ PASSED' : '❌ FAILED'}
            </div>
            <p>Generated: ${report.timestamp.toLocaleString()}</p>
        </div>

        <div class="section">
            <h2>📊 Summary</h2>
            <div class="metric">
                <div class="metric-value">${report.summary.totalIssues}</div>
                <div class="metric-label">Total Issues</div>
            </div>
            <div class="metric">
                <div class="metric-value">${report.summary.criticalIssues}</div>
                <div class="metric-label">Critical Issues</div>
            </div>
            <div class="metric">
                <div class="metric-value">${report.summary.testCoverage.toFixed(1)}%</div>
                <div class="metric-label">Test Coverage</div>
            </div>
            <div class="metric">
                <div class="metric-value">${report.summary.codeQualityScore}</div>
                <div class="metric-label">Code Quality</div>
            </div>
            <div class="metric">
                <div class="metric-value">${report.summary.securityScore}</div>
                <div class="metric-label">Security Score</div>
            </div>
        </div>

        <div class="section">
            <h2>🔧 Code Quality</h2>
            <p><strong>Status:</strong> ${report.codeQuality.passed ? '✅ Passed' : '❌ Failed'}</p>
            <p><strong>Lint Errors:</strong> ${report.codeQuality.metrics.lintErrors}</p>
            <p><strong>Type Errors:</strong> ${report.codeQuality.metrics.typeErrors}</p>
            <p><strong>Lint Warnings:</strong> ${report.codeQuality.metrics.lintWarnings}</p>
            <p><strong>Test Coverage:</strong> ${report.codeQuality.metrics.testCoverage.toFixed(1)}%</p>
        </div>

        <div class="section">
            <h2>🔒 Security</h2>
            <p><strong>Status:</strong> ${report.security.passed ? '✅ Passed' : '❌ Failed'}</p>
            <p><strong>Total Vulnerabilities:</strong> ${report.security.totalVulnerabilities}</p>
            <p><strong>Critical:</strong> ${report.security.criticalCount}</p>
            <p><strong>High:</strong> ${report.security.highCount}</p>
            <p><strong>Moderate:</strong> ${report.security.moderateCount}</p>
            <p><strong>Low:</strong> ${report.security.lowCount}</p>
        </div>

        <div class="section recommendations">
            <h2>💡 Recommendations</h2>
            <ul>
                ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
    </div>
</body>
</html>`;

    await fs.writeFile(htmlPath, html);
    return htmlPath;
  }

  private logQualityGateFailures(report: ComprehensiveQualityReport): void {
    this.logger.error('Quality Gate Failures:');
    
    if (!report.codeQuality.passed) {
      this.logger.error(`  Code Quality: ${report.codeQuality.metrics.lintErrors} lint errors, ${report.codeQuality.metrics.typeErrors} type errors`);
    }
    
    if (!report.security.passed) {
      this.logger.error(`  Security: ${report.security.criticalCount} critical, ${report.security.highCount} high vulnerabilities`);
    }
    
    this.logger.error(`Overall Score: ${report.overallScore}/100 (minimum required: 80)`);
  }
}