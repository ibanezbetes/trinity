#!/usr/bin/env npx ts-node

/**
 * Trinity Hotswap Deployment Script
 * 
 * Optimized deployment script for rapid development iterations
 * Uses CDK hotswap for Lambda functions and other supported resources
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

interface HotswapConfig {
  environment: 'dev' | 'staging' | 'production';
  region: string;
  stacks: string[];
  lambdaOnly: boolean;
  skipValidation: boolean;
  watchMode: boolean;
}

class TrinityHotswapDeployer {
  private config: HotswapConfig;
  private cfClient: CloudFormationClient;
  private deploymentLog: string[] = [];

  constructor(config: HotswapConfig) {
    this.config = config;
    this.cfClient = new CloudFormationClient({ region: config.region });
    
    this.log('⚡ Trinity Hotswap Deployer initialized');
    this.log(`📋 Environment: ${config.environment}`);
    this.log(`🌍 Region: ${config.region}`);
    this.log(`📦 Stacks: ${config.stacks.join(', ')}`);
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    
    this.deploymentLog.push(logEntry);
    
    switch (level) {
      case 'warn':
        console.warn(`⚠️ ${message}`);
        break;
      case 'error':
        console.error(`❌ ${message}`);
        break;
      default:
        console.log(message);
    }
  }

  /**
   * Validate hotswap prerequisites
   */
  async validateHotswapPrerequisites(): Promise<boolean> {
    this.log('🔍 Validating hotswap prerequisites...');

    try {
      // Check if stacks exist
      for (const stackName of this.config.stacks) {
        try {
          await this.cfClient.send(new DescribeStacksCommand({ StackName: stackName }));
          this.log(`✅ Stack ${stackName} exists`);
        } catch (error) {
          this.log(`❌ Stack ${stackName} not found - hotswap requires existing stack`, 'error');
          return false;
        }
      }

      // Check CDK version for hotswap support
      const cdkVersion = execSync('cdk --version', { encoding: 'utf8' }).trim();
      this.log(`✅ CDK version: ${cdkVersion}`);

      // Warn about production hotswap
      if (this.config.environment === 'production') {
        this.log('⚠️ Hotswap deployment in production is not recommended', 'warn');
      }

      return true;

    } catch (error) {
      this.log(`❌ Hotswap validation failed: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Build TypeScript source
   */
  async buildSource(): Promise<boolean> {
    this.log('🔨 Building TypeScript source...');

    try {
      execSync('npm run build', { stdio: 'pipe' });
      this.log('✅ TypeScript build completed');
      return true;
    } catch (error) {
      this.log(`❌ TypeScript build failed: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Execute hotswap deployment
   */
  async executeHotswap(): Promise<boolean> {
    this.log('⚡ Starting hotswap deployment...');

    try {
      // Prepare hotswap command
      const hotswapCommand = ['cdk', 'deploy'];
      
      if (this.config.stacks.length > 0) {
        hotswapCommand.push(...this.config.stacks);
      } else {
        hotswapCommand.push('--all');
      }

      // Add hotswap flag
      hotswapCommand.push('--hotswap');

      // Skip approval for development
      if (this.config.environment === 'dev') {
        hotswapCommand.push('--require-approval', 'never');
      }

      // Lambda-only hotswap for faster deployments
      if (this.config.lambdaOnly) {
        hotswapCommand.push('--hotswap-fallback', 'false');
        this.log('🎯 Lambda-only hotswap mode enabled');
      }

      // Add outputs file
      hotswapCommand.push('--outputs-file', 'cdk-outputs.json');

      this.log(`📝 Executing: ${hotswapCommand.join(' ')}`);

      // Execute hotswap deployment
      const hotswapProcess = spawn(hotswapCommand[0], hotswapCommand.slice(1), {
        stdio: 'inherit',
        env: { ...process.env, CDK_DEFAULT_REGION: this.config.region }
      });

      return new Promise((resolve, reject) => {
        hotswapProcess.on('close', (code) => {
          if (code === 0) {
            this.log('✅ Hotswap deployment completed successfully');
            resolve(true);
          } else {
            this.log(`❌ Hotswap deployment failed with code ${code}`, 'error');
            resolve(false);
          }
        });

        hotswapProcess.on('error', (error) => {
          this.log(`❌ Hotswap deployment error: ${error}`, 'error');
          reject(error);
        });
      });

    } catch (error) {
      this.log(`❌ Hotswap deployment failed: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Watch mode for continuous deployment
   */
  async startWatchMode(): Promise<void> {
    this.log('👀 Starting watch mode for continuous deployment...');
    
    const chokidar = require('chokidar');
    
    // Watch TypeScript source files
    const watcher = chokidar.watch(['src/**/*.ts', 'lib/**/*.ts'], {
      ignored: /node_modules/,
      persistent: true,
      ignoreInitial: true
    });

    let deploymentInProgress = false;

    watcher.on('change', async (filePath: string) => {
      if (deploymentInProgress) {
        this.log(`⏳ Deployment in progress, ignoring change: ${filePath}`);
        return;
      }

      this.log(`📝 File changed: ${filePath}`);
      deploymentInProgress = true;

      try {
        // Build and deploy
        const buildSuccess = await this.buildSource();
        if (buildSuccess) {
          await this.executeHotswap();
        }
      } catch (error) {
        this.log(`❌ Watch mode deployment failed: ${error}`, 'error');
      } finally {
        deploymentInProgress = false;
      }
    });

    this.log('✅ Watch mode started - press Ctrl+C to stop');
    
    // Keep process alive
    process.on('SIGINT', () => {
      this.log('🛑 Stopping watch mode...');
      watcher.close();
      process.exit(0);
    });
  }

  /**
   * Generate deployment timing report
   */
  generateTimingReport(startTime: number): void {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    const report = {
      timestamp: new Date().toISOString(),
      environment: this.config.environment,
      region: this.config.region,
      stacks: this.config.stacks,
      deploymentType: 'hotswap',
      duration: `${duration.toFixed(2)}s`,
      deploymentLog: this.deploymentLog,
    };

    const reportPath = path.join('hotswap-reports', `hotswap-${Date.now()}.json`);
    
    if (!fs.existsSync('hotswap-reports')) {
      fs.mkdirSync('hotswap-reports', { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.log(`⚡ Hotswap completed in ${duration.toFixed(2)}s`);
    this.log(`📋 Timing report saved: ${reportPath}`);
  }

  /**
   * Execute hotswap deployment workflow
   */
  async execute(): Promise<boolean> {
    const startTime = Date.now();

    try {
      this.log('⚡ Starting Trinity hotswap deployment workflow...');

      // Validate prerequisites
      if (!this.config.skipValidation) {
        const isValid = await this.validateHotswapPrerequisites();
        if (!isValid) {
          this.log('❌ Hotswap prerequisites validation failed', 'error');
          return false;
        }
      }

      // Build source
      const buildSuccess = await this.buildSource();
      if (!buildSuccess) {
        return false;
      }

      // Execute hotswap
      const deploySuccess = await this.executeHotswap();
      
      // Generate timing report
      this.generateTimingReport(startTime);

      if (deploySuccess) {
        this.log('🎉 Hotswap deployment workflow completed successfully!');
        
        // Start watch mode if requested
        if (this.config.watchMode) {
          await this.startWatchMode();
        }
      } else {
        this.log('❌ Hotswap deployment workflow failed', 'error');
      }

      return deploySuccess;

    } catch (error) {
      this.log(`❌ Hotswap workflow error: ${error}`, 'error');
      this.generateTimingReport(startTime);
      return false;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const config: HotswapConfig = {
    environment: (args.find(arg => arg.startsWith('--env='))?.split('=')[1] as any) || 'dev',
    region: args.find(arg => arg.startsWith('--region='))?.split('=')[1] || 'eu-west-1',
    stacks: args.filter(arg => !arg.startsWith('--') && !['watch'].includes(arg)),
    lambdaOnly: args.includes('--lambda-only'),
    skipValidation: args.includes('--skip-validation'),
    watchMode: args.includes('watch') || args.includes('--watch'),
  };
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Trinity Hotswap Deployment

Usage:
  npx ts-node hotswap-deploy.ts [options] [stack-names...]
  npx ts-node hotswap-deploy.ts watch [options]

Options:
  --env=<env>          Environment (dev|staging|production) [default: dev]
  --region=<region>    AWS region [default: eu-west-1]
  --lambda-only        Only hotswap Lambda functions (faster)
  --skip-validation    Skip prerequisite validation
  --watch             Enable watch mode for continuous deployment
  --help, -h          Show this help message

Examples:
  # Hotswap all stacks
  npx ts-node hotswap-deploy.ts
  
  # Hotswap specific stack
  npx ts-node hotswap-deploy.ts TrinityLambdaStack
  
  # Lambda-only hotswap for maximum speed
  npx ts-node hotswap-deploy.ts --lambda-only TrinityLambdaStack
  
  # Watch mode for continuous deployment
  npx ts-node hotswap-deploy.ts watch --lambda-only
  
  # Production hotswap (not recommended)
  npx ts-node hotswap-deploy.ts --env=production --skip-validation
`);
    process.exit(0);
  }
  
  const deployer = new TrinityHotswapDeployer(config);
  deployer.execute().then(success => {
    if (!config.watchMode) {
      process.exit(success ? 0 : 1);
    }
  }).catch(error => {
    console.error('❌ Hotswap deployment failed:', error);
    process.exit(1);
  });
}

export { TrinityHotswapDeployer, HotswapConfig };