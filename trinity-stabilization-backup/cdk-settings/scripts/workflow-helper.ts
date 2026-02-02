#!/usr/bin/env npx ts-node

/**
 * Trinity Workflow Helper
 * 
 * Interactive guide for choosing the optimal deployment workflow
 * based on the type of changes being made
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
import { DEVELOPMENT_WORKFLOWS, getRecommendedWorkflow, supportsHotswap, DEV_RECOMMENDATIONS } from '../config/development-workflow';

interface ChangeAnalysis {
  hasLambdaChanges: boolean;
  hasInfrastructureChanges: boolean;
  hasSchemaChanges: boolean;
  hasApiChanges: boolean;
  changedFiles: string[];
}

class TrinityWorkflowHelper {
  
  /**
   * Analyze git changes to determine change types
   */
  analyzeChanges(): ChangeAnalysis {
    console.log('🔍 Analyzing changes...\n');

    let changedFiles: string[] = [];
    
    try {
      // Get changed files from git
      const gitOutput = execSync('git diff --name-only HEAD', { encoding: 'utf8' });
      changedFiles = gitOutput.trim().split('\n').filter(f => f.length > 0);
      
      if (changedFiles.length === 0) {
        // Check staged files
        const stagedOutput = execSync('git diff --cached --name-only', { encoding: 'utf8' });
        changedFiles = stagedOutput.trim().split('\n').filter(f => f.length > 0);
      }
    } catch (error) {
      console.log('⚠️ Could not analyze git changes - using manual mode');
    }

    const analysis: ChangeAnalysis = {
      hasLambdaChanges: false,
      hasInfrastructureChanges: false,
      hasSchemaChanges: false,
      hasApiChanges: false,
      changedFiles
    };

    // Analyze file patterns
    for (const file of changedFiles) {
      if (file.includes('src/handlers/') || file.includes('src/services/')) {
        analysis.hasLambdaChanges = true;
      }
      
      if (file.includes('lib/') && file.endsWith('.ts')) {
        analysis.hasInfrastructureChanges = true;
      }
      
      if (file.includes('schema') || file.includes('database')) {
        analysis.hasSchemaChanges = true;
      }
      
      if (file.includes('api') || file.includes('graphql')) {
        analysis.hasApiChanges = true;
      }
    }

    return analysis;
  }

  /**
   * Display change analysis
   */
  displayAnalysis(analysis: ChangeAnalysis): void {
    console.log('📋 Change Analysis:');
    console.log(`   📁 Changed files: ${analysis.changedFiles.length}`);
    console.log(`   ⚡ Lambda changes: ${analysis.hasLambdaChanges ? '✅' : '❌'}`);
    console.log(`   🏗️ Infrastructure changes: ${analysis.hasInfrastructureChanges ? '✅' : '❌'}`);
    console.log(`   🗄️ Schema changes: ${analysis.hasSchemaChanges ? '✅' : '❌'}`);
    console.log(`   🔗 API changes: ${analysis.hasApiChanges ? '✅' : '❌'}`);
    
    if (analysis.changedFiles.length > 0) {
      console.log('\n   📝 Changed files:');
      analysis.changedFiles.slice(0, 10).forEach(file => {
        console.log(`      - ${file}`);
      });
      if (analysis.changedFiles.length > 10) {
        console.log(`      ... and ${analysis.changedFiles.length - 10} more`);
      }
    }
    console.log();
  }

  /**
   * Recommend workflow based on analysis
   */
  recommendWorkflow(analysis: ChangeAnalysis): void {
    console.log('🎯 Workflow Recommendations:\n');

    // Determine primary change type
    if (analysis.hasSchemaChanges) {
      console.log('🚨 Database schema changes detected!');
      console.log('   Recommendation: Use safe deployment with full validation');
      console.log('   Workflow: Safe Production Deploy');
      console.log('   Command: npm run deploy:all && npm run validate\n');
      
      console.log('⚠️ Important considerations:');
      console.log('   - Backup database before deployment');
      console.log('   - Test schema changes in development first');
      console.log('   - Review migration impact carefully\n');
      
    } else if (analysis.hasLambdaChanges && !analysis.hasInfrastructureChanges) {
      console.log('⚡ Lambda-only changes detected!');
      console.log('   Recommendation: Use hotswap for fastest deployment');
      console.log('   Workflow: Quick Lambda Update');
      console.log('   Command: npm run hotswap:lambda\n');
      
      console.log('💡 Development tips:');
      console.log('   - Use watch mode for continuous development: npm run hotswap:watch');
      console.log('   - Hotswap deployment takes 15-30 seconds');
      console.log('   - Test locally with unit tests first\n');
      
    } else if (analysis.hasApiChanges) {
      console.log('🔗 API changes detected!');
      console.log('   Recommendation: Full deployment required for AppSync changes');
      console.log('   Workflow: Standard Development Deploy');
      console.log('   Command: npm run deploy:api && npm run validate\n');
      
      console.log('📝 API deployment notes:');
      console.log('   - GraphQL schema changes require full deployment');
      console.log('   - Test queries in AppSync console after deployment');
      console.log('   - Validate backward compatibility\n');
      
    } else if (analysis.hasInfrastructureChanges) {
      console.log('🏗️ Infrastructure changes detected!');
      console.log('   Recommendation: Full deployment with validation');
      console.log('   Workflow: Standard Development Deploy');
      console.log('   Command: npm run deploy:all\n');
      
      console.log('🔍 Infrastructure deployment tips:');
      console.log('   - Review CDK diff output: npm run diff');
      console.log('   - Test in development environment first');
      console.log('   - Have rollback plan ready\n');
      
    } else if (analysis.changedFiles.length === 0) {
      console.log('📭 No changes detected!');
      console.log('   You may want to:');
      console.log('   - Check git status: git status');
      console.log('   - Stage your changes: git add .');
      console.log('   - Run validation: npm run validate\n');
      
    } else {
      console.log('🤔 Mixed or unclear changes detected!');
      console.log('   Recommendation: Use standard deployment workflow');
      console.log('   Workflow: Standard Development Deploy');
      console.log('   Command: npm run deploy:all\n');
    }
  }

  /**
   * Display available workflows
   */
  displayWorkflows(): void {
    console.log('📚 Available Workflows:\n');
    
    DEVELOPMENT_WORKFLOWS.forEach((workflow, index) => {
      console.log(`${index + 1}. ${workflow.name}`);
      console.log(`   Description: ${workflow.description}`);
      console.log(`   Time: ${workflow.estimatedTime}`);
      console.log(`   Use case: ${workflow.useCase}`);
      console.log(`   Commands:`);
      workflow.commands.forEach(cmd => {
        console.log(`     - ${cmd}`);
      });
      console.log();
    });
  }

  /**
   * Display development recommendations
   */
  displayRecommendations(): void {
    console.log('💡 Development Recommendations:\n');
    
    Object.entries(DEV_RECOMMENDATIONS).forEach(([category, rec]) => {
      console.log(`${category}:`);
      console.log(`   Recommended workflow: ${rec.workflow}`);
      console.log(`   Tools: ${rec.tools.join(', ')}`);
      console.log(`   Tips:`);
      rec.tips.forEach(tip => {
        console.log(`     - ${tip}`);
      });
      console.log();
    });
  }

  /**
   * Interactive workflow selection
   */
  async interactiveMode(): Promise<void> {
    console.log('🎮 Interactive Workflow Selection\n');
    
    // Analyze changes
    const analysis = this.analyzeChanges();
    this.displayAnalysis(analysis);
    
    // Show recommendations
    this.recommendWorkflow(analysis);
    
    // Ask if user wants to see all workflows
    console.log('Would you like to see all available workflows? (y/n)');
    
    // Note: In a real implementation, you'd use a library like 'inquirer' for interactive prompts
    // For now, we'll just display the workflows
    this.displayWorkflows();
  }

  /**
   * Execute recommended workflow
   */
  executeWorkflow(workflowName: string): void {
    const workflow = DEVELOPMENT_WORKFLOWS.find(w => w.name === workflowName);
    
    if (!workflow) {
      console.log(`❌ Workflow '${workflowName}' not found`);
      return;
    }

    console.log(`🚀 Executing workflow: ${workflow.name}\n`);
    console.log(`📝 Description: ${workflow.description}`);
    console.log(`⏱️ Estimated time: ${workflow.estimatedTime}\n`);
    
    console.log('Commands to run:');
    workflow.commands.forEach((cmd, index) => {
      console.log(`${index + 1}. ${cmd}`);
    });
    
    console.log('\n💡 Run these commands in sequence, or use the combined script if available.');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const helper = new TrinityWorkflowHelper();
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Trinity Workflow Helper

Usage:
  npx ts-node workflow-helper.ts [command] [options]

Commands:
  analyze              Analyze changes and recommend workflow (default)
  workflows            List all available workflows
  recommendations      Show development recommendations
  interactive          Interactive workflow selection
  execute <workflow>   Show commands for specific workflow

Options:
  --help, -h          Show this help message

Examples:
  # Analyze changes and get recommendations
  npx ts-node workflow-helper.ts analyze
  
  # List all workflows
  npx ts-node workflow-helper.ts workflows
  
  # Interactive mode
  npx ts-node workflow-helper.ts interactive
  
  # Execute specific workflow
  npx ts-node workflow-helper.ts execute "Quick Lambda Update"
`);
    process.exit(0);
  }
  
  const command = args[0] || 'analyze';
  
  switch (command) {
    case 'analyze':
      const analysis = helper.analyzeChanges();
      helper.displayAnalysis(analysis);
      helper.recommendWorkflow(analysis);
      break;
      
    case 'workflows':
      helper.displayWorkflows();
      break;
      
    case 'recommendations':
      helper.displayRecommendations();
      break;
      
    case 'interactive':
      helper.interactiveMode();
      break;
      
    case 'execute':
      const workflowName = args[1];
      if (!workflowName) {
        console.log('❌ Please specify a workflow name');
        process.exit(1);
      }
      helper.executeWorkflow(workflowName);
      break;
      
    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('Use --help for usage information');
      process.exit(1);
  }
}

export { TrinityWorkflowHelper };