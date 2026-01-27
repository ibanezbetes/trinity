/**
 * Quality Controller
 * REST API endpoints for quality checks and reports
 */

import { Controller, Get, Post, Logger } from '@nestjs/common';
import type { QualityService, ComprehensiveQualityReport } from './quality.service';
import type { CodeQualityEnforcerService, CodeQualityResult } from './code-quality-enforcer.service';
import type { SecurityScannerService, SecurityScanResult } from './security-scanner.service';

@Controller('quality')
export class QualityController {
  private readonly logger = new Logger(QualityController.name);

  constructor(
    private readonly qualityService: QualityService,
    private readonly codeQualityEnforcer: CodeQualityEnforcerService,
    private readonly securityScanner: SecurityScannerService,
  ) {}

  @Get('status')
  public async getQualityStatus(): Promise<{ status: string; timestamp: Date }> {
    return {
      status: 'Quality service is running',
      timestamp: new Date(),
    };
  }

  @Post('check/comprehensive')
  public async runComprehensiveCheck(): Promise<ComprehensiveQualityReport> {
    this.logger.log('🚀 API: Starting comprehensive quality check...');
    
    const report = await this.qualityService.runComprehensiveQualityCheck();
    
    // Generate reports
    await this.qualityService.generateComprehensiveReport(report);
    
    return report;
  }

  @Post('check/code-quality')
  public async runCodeQualityCheck(): Promise<CodeQualityResult> {
    this.logger.log('🔍 API: Starting code quality check...');
    
    const result = await this.codeQualityEnforcer.runQualityCheck();
    
    // Generate report
    await this.codeQualityEnforcer.generateQualityReport(result);
    
    return result;
  }

  @Post('check/security')
  public async runSecurityCheck(): Promise<SecurityScanResult> {
    this.logger.log('🔒 API: Starting security scan...');
    
    const result = await this.securityScanner.runSecurityScan();
    
    // Generate report
    await this.securityScanner.generateSecurityReport(result);
    
    return result;
  }

  @Post('gates/enforce')
  public async enforceQualityGates(): Promise<{ passed: boolean; message: string }> {
    this.logger.log('🚪 API: Enforcing quality gates...');
    
    const passed = await this.qualityService.enforceQualityGates();
    
    return {
      passed,
      message: passed 
        ? 'All quality gates passed. Deployment approved.' 
        : 'Quality gates failed. Deployment blocked.',
    };
  }

  @Get('reports/latest')
  public async getLatestReport(): Promise<{ reportPath: string; exists: boolean }> {
    const reportPath = 'reports/comprehensive-quality-report.json';
    
    try {
      const fs = await import('fs/promises');
      await fs.access(reportPath);
      return { reportPath, exists: true };
    } catch {
      return { reportPath, exists: false };
    }
  }
}