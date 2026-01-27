#!/usr/bin/env node

/**
 * Trinity System Analysis Script
 * 
 * Executes comprehensive analysis of the current Trinity project
 * using the AnalysisEngineService to generate a complete migration plan.
 */

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AnalysisEngineService } from '../../domain/services/analysis-engine.service';
import { MigrationOrchestratorService } from '../../domain/services/migration-orchestrator.service';
import { AnalysisModule } from '../../domain/analysis.module';

interface AnalysisReport {
  timestamp: string;
  projectPath: string;
  analysis: any;
  migrationPlan: any;
  recommendations: string[];
  summary: {
    totalFiles: number;
    totalFeatures: number;
    obsoleteComponents: number;
    estimatedMigrationTime: string;
    riskLevel: 'low' | 'medium' | 'high';
  };
}

class SystemAnalysisRunner {
  private readonly logger = new Logger(SystemAnalysisRunner.name);
  private analysisEngine: AnalysisEngineService;
  private migrationOrchestrator: MigrationOrchestratorService;

  async run(): Promise<void> {
    this.logger.log('🔍 Iniciando análisis completo del sistema Trinity...');

    try {
      // Initialize NestJS application context
      const app = await NestFactory.createApplicationContext(AnalysisModule);
      
      this.analysisEngine = app.get(AnalysisEngineService);
      this.migrationOrchestrator = app.get(MigrationOrchestratorService);

      // Define project paths to analyze
      const projectPaths = this.getProjectPaths();
      
      this.logger.log(`📁 Analizando ${projectPaths.length} directorios del proyecto...`);

      // Execute comprehensive analysis
      const analysis = await this.executeComprehensiveAnalysis(projectPaths);
      
      // Generate migration plan
      const migrationPlan = await this.generateMigrationPlan(analysis);
      
      // Create analysis report
      const report = await this.createAnalysisReport(analysis, migrationPlan);
      
      // Save report to file
      await this.saveAnalysisReport(report);
      
      // Display summary
      this.displayAnalysisSummary(report);

      await app.close();
      
    } catch (error) {
      this.logger.error('❌ Error durante el análisis del sistema:', error);
      process.exit(1);
    }
  }

  private getProjectPaths(): string[] {
    const rootPath = process.cwd();
    
    return [
      path.join(rootPath, 'backend'),
      path.join(rootPath, 'backend-refactored'),
      path.join(rootPath, 'mobile'),
      path.join(rootPath, 'infrastructure'),
      path.join(rootPath, '.kiro/specs'),
    ];
  }

  private async executeComprehensiveAnalysis(projectPaths: string[]): Promise<any> {
    this.logger.log('🔬 Ejecutando análisis completo...');
    
    const analysisResults = [];
    
    for (const projectPath of projectPaths) {
      try {
        this.logger.log(`  📂 Analizando: ${path.basename(projectPath)}`);
        
        const pathExists = await this.pathExists(projectPath);
        if (!pathExists) {
          this.logger.warn(`  ⚠️  Directorio no encontrado: ${projectPath}`);
          continue;
        }

        const analysis = await this.analysisEngine.analyzeRepository(projectPath);
        analysisResults.push({
          path: projectPath,
          name: path.basename(projectPath),
          analysis,
        });
        
        this.logger.log(`  ✅ Completado: ${path.basename(projectPath)}`);
        
      } catch (error) {
        this.logger.error(`  ❌ Error analizando ${projectPath}:`, error.message);
      }
    }

    return {
      timestamp: new Date().toISOString(),
      projects: analysisResults,
      summary: this.generateAnalysisSummary(analysisResults),
    };
  }

  private async generateMigrationPlan(analysis: any): Promise<any> {
    this.logger.log('📋 Generando plan de migración...');
    
    try {
      // Extract features from all projects
      const allFeatures = analysis.projects.flatMap((project: any) => 
        project.analysis?.features || []
      );
      
      // Extract infrastructure from all projects
      const allInfrastructure = analysis.projects.flatMap((project: any) => 
        project.analysis?.infrastructure?.awsResources || []
      );

      // Create migration plan
      const migrationPlan = await this.migrationOrchestrator.createMigrationPlan({
        sourceFeatures: allFeatures,
        targetArchitecture: 'clean-architecture',
        preserveData: true,
        infrastructure: allInfrastructure,
      });

      this.logger.log('✅ Plan de migración generado exitosamente');
      return migrationPlan;
      
    } catch (error) {
      this.logger.error('❌ Error generando plan de migración:', error.message);
      return {
        error: error.message,
        phases: [],
        estimatedDuration: 'unknown',
      };
    }
  }

  private generateAnalysisSummary(analysisResults: any[]): any {
    const totalFiles = analysisResults.reduce((sum, project) => 
      sum + (project.analysis?.repository?.modules?.length || 0), 0
    );
    
    const totalFeatures = analysisResults.reduce((sum, project) => 
      sum + (project.analysis?.features?.length || 0), 0
    );
    
    const obsoleteComponents = analysisResults.reduce((sum, project) => 
      sum + (project.analysis?.obsoleteComponents?.length || 0), 0
    );

    return {
      totalProjects: analysisResults.length,
      totalFiles,
      totalFeatures,
      obsoleteComponents,
      projectBreakdown: analysisResults.map(project => ({
        name: project.name,
        files: project.analysis?.repository?.modules?.length || 0,
        features: project.analysis?.features?.length || 0,
        obsolete: project.analysis?.obsoleteComponents?.length || 0,
      })),
    };
  }

  private async createAnalysisReport(analysis: any, migrationPlan: any): Promise<AnalysisReport> {
    const summary = analysis.summary;
    
    // Calculate risk level based on complexity
    const riskLevel = this.calculateRiskLevel(summary, migrationPlan);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(analysis, migrationPlan);
    
    return {
      timestamp: new Date().toISOString(),
      projectPath: process.cwd(),
      analysis,
      migrationPlan,
      recommendations,
      summary: {
        totalFiles: summary.totalFiles,
        totalFeatures: summary.totalFeatures,
        obsoleteComponents: summary.obsoleteComponents,
        estimatedMigrationTime: migrationPlan.estimatedDuration || 'unknown',
        riskLevel,
      },
    };
  }

  private calculateRiskLevel(summary: any, migrationPlan: any): 'low' | 'medium' | 'high' {
    let riskScore = 0;
    
    // File count risk
    if (summary.totalFiles > 500) riskScore += 2;
    else if (summary.totalFiles > 200) riskScore += 1;
    
    // Feature complexity risk
    if (summary.totalFeatures > 20) riskScore += 2;
    else if (summary.totalFeatures > 10) riskScore += 1;
    
    // Obsolete components risk
    if (summary.obsoleteComponents > 50) riskScore += 2;
    else if (summary.obsoleteComponents > 20) riskScore += 1;
    
    // Migration phases risk
    const phaseCount = migrationPlan.phases?.length || 0;
    if (phaseCount > 8) riskScore += 2;
    else if (phaseCount > 4) riskScore += 1;

    if (riskScore >= 5) return 'high';
    if (riskScore >= 3) return 'medium';
    return 'low';
  }

  private generateRecommendations(analysis: any, migrationPlan: any): string[] {
    const recommendations: string[] = [];
    const summary = analysis.summary;
    
    // File-based recommendations
    if (summary.totalFiles > 300) {
      recommendations.push('Considerar dividir la migración en múltiples fases para reducir riesgo');
    }
    
    // Obsolete components recommendations
    if (summary.obsoleteComponents > 20) {
      recommendations.push('Priorizar limpieza de componentes obsoletos antes de la migración');
    }
    
    // Feature recommendations
    if (summary.totalFeatures > 15) {
      recommendations.push('Implementar migración incremental por features para mantener funcionalidad');
    }
    
    // Migration plan recommendations
    if (migrationPlan.phases?.length > 6) {
      recommendations.push('Plan de migración complejo - considerar simplificar arquitectura objetivo');
    }
    
    // Infrastructure recommendations
    const hasInfrastructure = analysis.projects.some((p: any) => 
      p.analysis?.infrastructure?.awsResources?.length > 0
    );
    
    if (hasInfrastructure) {
      recommendations.push('Validar compatibilidad de recursos AWS existentes con nueva arquitectura');
    }
    
    // Testing recommendations
    recommendations.push('Ejecutar suite completa de property tests antes de iniciar migración');
    recommendations.push('Configurar monitoreo continuo durante proceso de migración');
    
    return recommendations;
  }

  private async saveAnalysisReport(report: AnalysisReport): Promise<void> {
    const reportPath = path.join(process.cwd(), 'trinity-system-analysis-report.json');
    
    try {
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
      this.logger.log(`📄 Reporte guardado en: ${reportPath}`);
    } catch (error) {
      this.logger.error('❌ Error guardando reporte:', error.message);
    }
  }

  private displayAnalysisSummary(report: AnalysisReport): void {
    const { summary, recommendations } = report;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DEL ANÁLISIS DEL SISTEMA TRINITY');
    console.log('='.repeat(60));
    
    console.log(`\n📁 Archivos analizados: ${summary.totalFiles}`);
    console.log(`🎯 Features identificados: ${summary.totalFeatures}`);
    console.log(`🗑️  Componentes obsoletos: ${summary.obsoleteComponents}`);
    console.log(`⏱️  Tiempo estimado de migración: ${summary.estimatedMigrationTime}`);
    console.log(`⚠️  Nivel de riesgo: ${summary.riskLevel.toUpperCase()}`);
    
    if (recommendations.length > 0) {
      console.log('\n💡 RECOMENDACIONES:');
      recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    }
    
    console.log('\n✅ Análisis completo finalizado exitosamente');
    console.log('📄 Reporte detallado guardado en: trinity-system-analysis-report.json');
    console.log('='.repeat(60) + '\n');
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}

// Execute analysis if run directly
if (require.main === module) {
  const runner = new SystemAnalysisRunner();
  runner.run().catch(console.error);
}

export { SystemAnalysisRunner };