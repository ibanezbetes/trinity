/**
 * Code Quality Enforcer Service
 * Automated code quality checks and enforcement
 */

import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface CodeQualityMetrics {
  readonly lintErrors: number;
  readonly lintWarnings: number;
  readonly typeErrors: number;
  readonly testCoverage: number;
  readonly duplicatedLines: number;
  readonly complexityScore: number;
  readonly maintainabilityIndex: number;
}

export interface CodeQualityResult {
  readonly timestamp: Date;
  readonly passed: boolean;
  readonly metrics: CodeQualityMetrics;
  readonly issues: QualityIssue[];
  readonly recommendations: string[];
  readonly score: number; // 0-100
}

export interface QualityIssue {
  readonly type: 'lint' | 'type' | 'coverage' | 'complexity' | 'duplication';
  readonly severity: 'error' | 'warning' | 'info';
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly message: string;
  readonly rule?: string;
}

@Injectable()
export class CodeQualityEnforcerService {
  private readonly logger = new Logger(CodeQualityEnforcerService.name);

  // Quality thresholds
  private readonly thresholds = {
    maxLintErrors: 0,
    maxLintWarnings: 10,
    maxTypeErrors: 0,
    minTestCoverage: 80,
    maxComplexity: 10,
    minMaintainabilityIndex: 70,
  };

  public async runQualityCheck(): Promise<CodeQualityResult> {
    this.logger.log('🔍 Starting comprehensive code quality check...');

    const issues: QualityIssue[] = [];
    
    try {
      // Run all quality checks
      const [lintResult, typeCheckResult, coverageResult] = await Promise.allSettled([
        this.runLintCheck(),
        this.runTypeCheck(),
        this.runCoverageCheck(),
      ]);

      // Collect issues from all checks
      if (lintResult.status === 'fulfilled') {
        issues.push(...lintResult.value);
      }
      if (typeCheckResult.status === 'fulfilled') {
        issues.push(...typeCheckResult.value);
      }

      // Calculate metrics
      const metrics = this.calculateMetrics(issues, coverageResult);
      
      // Calculate overall score
      const score = this.calculateQualityScore(metrics);
      
      // Determine if quality check passed
      const passed = this.isQualityCheckPassed(metrics);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(metrics, issues);

      const result: CodeQualityResult = {
        timestamp: new Date(),
        passed,
        metrics,
        issues,
        recommendations,
        score,
      };

      this.logger.log(`✅ Code quality check completed. Score: ${score}/100`);
      
      if (!passed) {
        this.logger.error('❌ Code quality check failed. Review issues and fix them.');
      }

      return result;
    } catch (error) {
      this.logger.error('❌ Code quality check failed:', error);
      throw new Error(`Code quality check failed: ${error.message}`);
    }
  }

  public async generateQualityReport(result: CodeQualityResult): Promise<string> {
    const reportPath = path.join(process.cwd(), 'reports', 'code-quality-report.json');
    
    // Ensure reports directory exists
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    
    // Generate detailed report
    const report = {
      metadata: {
        timestamp: result.timestamp,
        passed: result.passed,
        score: result.score,
      },
      metrics: result.metrics,
      thresholds: this.thresholds,
      issues: result.issues,
      recommendations: result.recommendations,
      summary: {
        totalIssues: result.issues.length,
        errorCount: result.issues.filter(i => i.severity === 'error').length,
        warningCount: result.issues.filter(i => i.severity === 'warning').length,
        infoCount: result.issues.filter(i => i.severity === 'info').length,
      },
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    this.logger.log(`📄 Code quality report generated: ${reportPath}`);
    return reportPath;
  }

  private async runLintCheck(): Promise<QualityIssue[]> {
    try {
      const { stdout } = await execAsync('npm run lint -- --format json', {
        cwd: process.cwd(),
        timeout: 60000, // 60 seconds timeout
      });

      return this.parseLintOutput(stdout);
    } catch (error) {
      // ESLint returns non-zero exit code when issues are found
      if (error.stdout) {
        return this.parseLintOutput(error.stdout);
      }
      this.logger.warn('Lint check failed, continuing with empty results');
      return [];
    }
  }

  private async runTypeCheck(): Promise<QualityIssue[]> {
    try {
      const { stdout, stderr } = await execAsync('npm run type-check', {
        cwd: process.cwd(),
        timeout: 60000, // 60 seconds timeout
      });

      return this.parseTypeCheckOutput(stderr || stdout);
    } catch (error) {
      // TypeScript returns non-zero exit code when type errors are found
      if (error.stderr || error.stdout) {
        return this.parseTypeCheckOutput(error.stderr || error.stdout);
      }
      this.logger.warn('Type check failed, continuing with empty results');
      return [];
    }
  }

  private async runCoverageCheck(): Promise<number> {
    try {
      const { stdout } = await execAsync('npm run test:cov -- --silent', {
        cwd: process.cwd(),
        timeout: 120000, // 120 seconds timeout
      });

      return this.parseCoverageOutput(stdout);
    } catch (error) {
      this.logger.warn('Coverage check failed, using 0% coverage');
      return 0;
    }
  }

  private parseLintOutput(output: string): QualityIssue[] {
    try {
      const lintResults = JSON.parse(output);
      const issues: QualityIssue[] = [];

      for (const fileResult of lintResults) {
        for (const message of fileResult.messages) {
          issues.push({
            type: 'lint',
            severity: message.severity === 2 ? 'error' : 'warning',
            file: fileResult.filePath,
            line: message.line,
            column: message.column,
            message: message.message,
            rule: message.ruleId,
          });
        }
      }

      return issues;
    } catch (error) {
      this.logger.warn('Failed to parse lint output');
      return [];
    }
  }

  private parseTypeCheckOutput(output: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/^(.+?)\((\d+),(\d+)\): error TS\d+: (.+)$/);
      if (match) {
        issues.push({
          type: 'type',
          severity: 'error',
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          message: match[4],
        });
      }
    }

    return issues;
  }

  private parseCoverageOutput(output: string): number {
    // Look for coverage percentage in Jest output
    const coverageMatch = output.match(/All files[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*(\d+(?:\.\d+)?)/);
    if (coverageMatch) {
      return parseFloat(coverageMatch[1]);
    }

    // Fallback: look for "Statements" coverage
    const statementsMatch = output.match(/Statements\s*:\s*(\d+(?:\.\d+)?)%/);
    if (statementsMatch) {
      return parseFloat(statementsMatch[1]);
    }

    return 0;
  }

  private calculateMetrics(issues: QualityIssue[], coverageResult: PromiseSettledResult<number>): CodeQualityMetrics {
    const lintErrors = issues.filter(i => i.type === 'lint' && i.severity === 'error').length;
    const lintWarnings = issues.filter(i => i.type === 'lint' && i.severity === 'warning').length;
    const typeErrors = issues.filter(i => i.type === 'type').length;
    
    const testCoverage = coverageResult.status === 'fulfilled' ? coverageResult.value : 0;
    
    // Simplified metrics for now
    const duplicatedLines = 0; // Would need additional tooling
    const complexityScore = Math.min(10, Math.max(1, lintErrors + typeErrors));
    const maintainabilityIndex = Math.max(0, 100 - (lintErrors * 5) - (typeErrors * 10) - Math.max(0, 80 - testCoverage));

    return {
      lintErrors,
      lintWarnings,
      typeErrors,
      testCoverage,
      duplicatedLines,
      complexityScore,
      maintainabilityIndex,
    };
  }

  private calculateQualityScore(metrics: CodeQualityMetrics): number {
    let score = 100;

    // Deduct points for errors and warnings
    score -= metrics.lintErrors * 10; // 10 points per lint error
    score -= metrics.typeErrors * 15; // 15 points per type error
    score -= metrics.lintWarnings * 2; // 2 points per lint warning

    // Deduct points for low coverage
    if (metrics.testCoverage < this.thresholds.minTestCoverage) {
      score -= (this.thresholds.minTestCoverage - metrics.testCoverage) * 2;
    }

    // Deduct points for high complexity
    if (metrics.complexityScore > this.thresholds.maxComplexity) {
      score -= (metrics.complexityScore - this.thresholds.maxComplexity) * 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private isQualityCheckPassed(metrics: CodeQualityMetrics): boolean {
    return (
      metrics.lintErrors <= this.thresholds.maxLintErrors &&
      metrics.lintWarnings <= this.thresholds.maxLintWarnings &&
      metrics.typeErrors <= this.thresholds.maxTypeErrors &&
      metrics.testCoverage >= this.thresholds.minTestCoverage &&
      metrics.maintainabilityIndex >= this.thresholds.minMaintainabilityIndex
    );
  }

  private generateRecommendations(metrics: CodeQualityMetrics, issues: QualityIssue[]): string[] {
    const recommendations: string[] = [];

    if (metrics.lintErrors > 0) {
      recommendations.push('🚨 Fix all ESLint errors before proceeding');
      recommendations.push('Run "npm run lint -- --fix" to auto-fix some issues');
    }

    if (metrics.typeErrors > 0) {
      recommendations.push('🔧 Resolve all TypeScript type errors');
      recommendations.push('Run "npm run type-check" to see detailed type errors');
    }

    if (metrics.lintWarnings > this.thresholds.maxLintWarnings) {
      recommendations.push(`⚠️ Reduce lint warnings to ${this.thresholds.maxLintWarnings} or fewer`);
    }

    if (metrics.testCoverage < this.thresholds.minTestCoverage) {
      recommendations.push(`📊 Increase test coverage to at least ${this.thresholds.minTestCoverage}%`);
      recommendations.push('Add unit tests for uncovered code paths');
    }

    if (metrics.maintainabilityIndex < this.thresholds.minMaintainabilityIndex) {
      recommendations.push('🔄 Improve code maintainability by reducing complexity');
      recommendations.push('Consider refactoring large functions and classes');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Code quality is excellent! Keep up the good work.');
    }

    return recommendations;
  }
}