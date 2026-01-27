/**
 * Security Scanner Service
 * Automated security vulnerability scanning and reporting
 */

import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface SecurityVulnerability {
  readonly id: string;
  readonly severity: 'low' | 'moderate' | 'high' | 'critical';
  readonly title: string;
  readonly description: string;
  readonly package: string;
  readonly version: string;
  readonly fixedIn?: string;
  readonly recommendation: string;
}

export interface SecurityScanResult {
  readonly timestamp: Date;
  readonly totalVulnerabilities: number;
  readonly vulnerabilities: SecurityVulnerability[];
  readonly criticalCount: number;
  readonly highCount: number;
  readonly moderateCount: number;
  readonly lowCount: number;
  readonly passed: boolean;
}

@Injectable()
export class SecurityScannerService {
  private readonly logger = new Logger(SecurityScannerService.name);

  public async runSecurityScan(): Promise<SecurityScanResult> {
    this.logger.log('🔍 Starting security vulnerability scan...');

    try {
      // Run npm audit
      const auditResult = await this.runNpmAudit();
      
      // Parse vulnerabilities
      const vulnerabilities = this.parseAuditResult(auditResult);
      
      // Count by severity
      const counts = this.countBySeverity(vulnerabilities);
      
      // Determine if scan passed
      const passed = counts.criticalCount === 0 && counts.highCount === 0;
      
      const result: SecurityScanResult = {
        timestamp: new Date(),
        totalVulnerabilities: vulnerabilities.length,
        vulnerabilities,
        criticalCount: counts.criticalCount,
        highCount: counts.highCount,
        moderateCount: counts.moderateCount,
        lowCount: counts.lowCount,
        passed,
      };

      this.logger.log(`✅ Security scan completed: ${result.totalVulnerabilities} vulnerabilities found`);
      
      if (!passed) {
        this.logger.error(`❌ Security scan failed: ${counts.criticalCount} critical, ${counts.highCount} high severity vulnerabilities`);
      }

      return result;
    } catch (error) {
      this.logger.error('❌ Security scan failed:', error);
      throw new Error(`Security scan failed: ${error.message}`);
    }
  }

  public async generateSecurityReport(scanResult: SecurityScanResult): Promise<string> {
    const reportPath = path.join(process.cwd(), 'reports', 'security-report.json');
    
    // Ensure reports directory exists
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    
    // Generate detailed report
    const report = {
      metadata: {
        timestamp: scanResult.timestamp,
        scanType: 'npm-audit',
        passed: scanResult.passed,
      },
      summary: {
        totalVulnerabilities: scanResult.totalVulnerabilities,
        criticalCount: scanResult.criticalCount,
        highCount: scanResult.highCount,
        moderateCount: scanResult.moderateCount,
        lowCount: scanResult.lowCount,
      },
      vulnerabilities: scanResult.vulnerabilities,
      recommendations: this.generateRecommendations(scanResult),
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    this.logger.log(`📄 Security report generated: ${reportPath}`);
    return reportPath;
  }

  private async runNpmAudit(): Promise<string> {
    try {
      const { stdout } = await execAsync('npm audit --json', {
        cwd: process.cwd(),
        timeout: 30000, // 30 seconds timeout
      });
      return stdout;
    } catch (error) {
      // npm audit returns non-zero exit code when vulnerabilities are found
      if (error.stdout) {
        return error.stdout;
      }
      throw error;
    }
  }

  private parseAuditResult(auditOutput: string): SecurityVulnerability[] {
    try {
      const auditData = JSON.parse(auditOutput);
      const vulnerabilities: SecurityVulnerability[] = [];

      if (auditData.vulnerabilities) {
        for (const [packageName, vulnData] of Object.entries(auditData.vulnerabilities)) {
          const vuln = vulnData as any;
          
          if (vuln.via && Array.isArray(vuln.via)) {
            for (const viaItem of vuln.via) {
              if (typeof viaItem === 'object' && viaItem.title) {
                vulnerabilities.push({
                  id: viaItem.cwe || `${packageName}-${Date.now()}`,
                  severity: viaItem.severity || 'moderate',
                  title: viaItem.title,
                  description: viaItem.url || 'No description available',
                  package: packageName,
                  version: vuln.range || 'unknown',
                  fixedIn: vuln.fixAvailable ? 'Available' : undefined,
                  recommendation: this.generateRecommendation(viaItem.severity, vuln.fixAvailable),
                });
              }
            }
          }
        }
      }

      return vulnerabilities;
    } catch (error) {
      this.logger.warn('Failed to parse audit result, returning empty array');
      return [];
    }
  }

  private countBySeverity(vulnerabilities: SecurityVulnerability[]): {
    criticalCount: number;
    highCount: number;
    moderateCount: number;
    lowCount: number;
  } {
    return vulnerabilities.reduce(
      (counts, vuln) => {
        switch (vuln.severity) {
          case 'critical':
            counts.criticalCount++;
            break;
          case 'high':
            counts.highCount++;
            break;
          case 'moderate':
            counts.moderateCount++;
            break;
          case 'low':
            counts.lowCount++;
            break;
        }
        return counts;
      },
      { criticalCount: 0, highCount: 0, moderateCount: 0, lowCount: 0 }
    );
  }

  private generateRecommendation(severity: string, fixAvailable: boolean): string {
    if (fixAvailable) {
      return severity === 'critical' || severity === 'high'
        ? 'URGENT: Update package immediately using npm audit fix'
        : 'Update package when convenient using npm audit fix';
    }
    
    return severity === 'critical' || severity === 'high'
      ? 'URGENT: No automatic fix available. Manual intervention required.'
      : 'Monitor for updates. Consider alternative packages if needed.';
  }

  private generateRecommendations(scanResult: SecurityScanResult): string[] {
    const recommendations: string[] = [];

    if (scanResult.criticalCount > 0) {
      recommendations.push('🚨 CRITICAL: Address all critical vulnerabilities immediately');
      recommendations.push('Run "npm audit fix --force" to attempt automatic fixes');
    }

    if (scanResult.highCount > 0) {
      recommendations.push('⚠️ HIGH: Address high severity vulnerabilities within 24 hours');
    }

    if (scanResult.moderateCount > 0) {
      recommendations.push('📋 MODERATE: Schedule fixes for moderate vulnerabilities within a week');
    }

    if (scanResult.totalVulnerabilities === 0) {
      recommendations.push('✅ No vulnerabilities found. Keep dependencies updated.');
    }

    recommendations.push('🔄 Run security scans regularly as part of CI/CD pipeline');
    recommendations.push('📚 Review security best practices documentation');

    return recommendations;
  }
}