/**
 * Quality Module
 * Automated code quality and security enforcement
 */

import { Module } from '@nestjs/common';
import { CodeQualityEnforcerService } from './code-quality-enforcer.service';
import { SecurityScannerService } from './security-scanner.service';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';

@Module({
  providers: [
    CodeQualityEnforcerService,
    SecurityScannerService,
    QualityService,
  ],
  controllers: [QualityController],
  exports: [
    CodeQualityEnforcerService,
    SecurityScannerService,
    QualityService,
  ],
})
export class QualityModule {}