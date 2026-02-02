#!/usr/bin/env npx ts-node
"use strict";
/**
 * Trinity Hotswap Deployment Script
 *
 * Optimized deployment script for rapid development iterations
 * Uses CDK hotswap for Lambda functions and other supported resources
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrinityHotswapDeployer = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const client_cloudformation_1 = require("@aws-sdk/client-cloudformation");
class TrinityHotswapDeployer {
    constructor(config) {
        this.deploymentLog = [];
        this.config = config;
        this.cfClient = new client_cloudformation_1.CloudFormationClient({ region: config.region });
        this.log('⚡ Trinity Hotswap Deployer initialized');
        this.log(`📋 Environment: ${config.environment}`);
        this.log(`🌍 Region: ${config.region}`);
        this.log(`📦 Stacks: ${config.stacks.join(', ')}`);
    }
    log(message, level = 'info') {
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
    async validateHotswapPrerequisites() {
        this.log('🔍 Validating hotswap prerequisites...');
        try {
            // Check if stacks exist
            for (const stackName of this.config.stacks) {
                try {
                    await this.cfClient.send(new client_cloudformation_1.DescribeStacksCommand({ StackName: stackName }));
                    this.log(`✅ Stack ${stackName} exists`);
                }
                catch (error) {
                    this.log(`❌ Stack ${stackName} not found - hotswap requires existing stack`, 'error');
                    return false;
                }
            }
            // Check CDK version for hotswap support
            const cdkVersion = (0, child_process_1.execSync)('cdk --version', { encoding: 'utf8' }).trim();
            this.log(`✅ CDK version: ${cdkVersion}`);
            // Warn about production hotswap
            if (this.config.environment === 'production') {
                this.log('⚠️ Hotswap deployment in production is not recommended', 'warn');
            }
            return true;
        }
        catch (error) {
            this.log(`❌ Hotswap validation failed: ${error}`, 'error');
            return false;
        }
    }
    /**
     * Build TypeScript source
     */
    async buildSource() {
        this.log('🔨 Building TypeScript source...');
        try {
            (0, child_process_1.execSync)('npm run build', { stdio: 'pipe' });
            this.log('✅ TypeScript build completed');
            return true;
        }
        catch (error) {
            this.log(`❌ TypeScript build failed: ${error}`, 'error');
            return false;
        }
    }
    /**
     * Execute hotswap deployment
     */
    async executeHotswap() {
        this.log('⚡ Starting hotswap deployment...');
        try {
            // Prepare hotswap command
            const hotswapCommand = ['cdk', 'deploy'];
            if (this.config.stacks.length > 0) {
                hotswapCommand.push(...this.config.stacks);
            }
            else {
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
            const hotswapProcess = (0, child_process_1.spawn)(hotswapCommand[0], hotswapCommand.slice(1), {
                stdio: 'inherit',
                env: { ...process.env, CDK_DEFAULT_REGION: this.config.region }
            });
            return new Promise((resolve, reject) => {
                hotswapProcess.on('close', (code) => {
                    if (code === 0) {
                        this.log('✅ Hotswap deployment completed successfully');
                        resolve(true);
                    }
                    else {
                        this.log(`❌ Hotswap deployment failed with code ${code}`, 'error');
                        resolve(false);
                    }
                });
                hotswapProcess.on('error', (error) => {
                    this.log(`❌ Hotswap deployment error: ${error}`, 'error');
                    reject(error);
                });
            });
        }
        catch (error) {
            this.log(`❌ Hotswap deployment failed: ${error}`, 'error');
            return false;
        }
    }
    /**
     * Watch mode for continuous deployment
     */
    async startWatchMode() {
        this.log('👀 Starting watch mode for continuous deployment...');
        const chokidar = require('chokidar');
        // Watch TypeScript source files
        const watcher = chokidar.watch(['src/**/*.ts', 'lib/**/*.ts'], {
            ignored: /node_modules/,
            persistent: true,
            ignoreInitial: true
        });
        let deploymentInProgress = false;
        watcher.on('change', async (filePath) => {
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
            }
            catch (error) {
                this.log(`❌ Watch mode deployment failed: ${error}`, 'error');
            }
            finally {
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
    generateTimingReport(startTime) {
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
    async execute() {
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
            }
            else {
                this.log('❌ Hotswap deployment workflow failed', 'error');
            }
            return deploySuccess;
        }
        catch (error) {
            this.log(`❌ Hotswap workflow error: ${error}`, 'error');
            this.generateTimingReport(startTime);
            return false;
        }
    }
}
exports.TrinityHotswapDeployer = TrinityHotswapDeployer;
// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const config = {
        environment: args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG90c3dhcC1kZXBsb3kuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJob3Rzd2FwLWRlcGxveS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBOzs7OztHQUtHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxpREFBZ0Q7QUFDaEQsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUM3QiwwRUFBNkY7QUFXN0YsTUFBTSxzQkFBc0I7SUFLMUIsWUFBWSxNQUFxQjtRQUZ6QixrQkFBYSxHQUFhLEVBQUUsQ0FBQztRQUduQyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksNENBQW9CLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFFcEUsSUFBSSxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ25ELElBQUksQ0FBQyxHQUFHLENBQUMsbUJBQW1CLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ2xELElBQUksQ0FBQyxHQUFHLENBQUMsY0FBYyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFTyxHQUFHLENBQUMsT0FBZSxFQUFFLFFBQW1DLE1BQU07UUFDcEUsTUFBTSxTQUFTLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUMzQyxNQUFNLFFBQVEsR0FBRyxJQUFJLFNBQVMsS0FBSyxPQUFPLEVBQUUsQ0FBQztRQUU3QyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVsQyxRQUFRLEtBQUssRUFBRSxDQUFDO1lBQ2QsS0FBSyxNQUFNO2dC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QVEsQ0FBQyxTQUFTLENBQUM7S0FDOUQsQ0FBQztJQUVGLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDbkQsT0FBTyxDQUFDLEdBQUcsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBOEJmLENBQUMsQ0FBQztRQUNDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQztJQUVELE1BQU0sUUFBUSxHQUFHLElBQUksc0JBQXNCLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDcEQsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNoQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3RCLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDhCQUE4QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3JELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbnB4IHRzLW5vZGVcclxuXHJcbi8qKlxyXG4gKiBUcmluaXR5IEhvdHN3YXAgRGVwbG95bWVudCBTY3JpcHRcclxuICogXHJcbiAqIE9wdGltaXplZCBkZXBsb3ltZW50IHNjcmlwdCBmb3IgcmFwaWQgZGV2ZWxvcG1lbnQgaXRlcmF0aW9uc1xyXG4gKiBVc2VzIENESyBob3Rzd2FwIGZvciBMYW1iZGEgZnVuY3Rpb25zIGFuZCBvdGhlciBzdXBwb3J0ZWQgcmVzb3VyY2VzXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgZXhlY1N5bmMsIHNwYXduIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XHJcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcclxuaW1wb3J0IHsgQ2xvdWRGb3JtYXRpb25DbGllbnQsIERlc2NyaWJlU3RhY2tzQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1jbG91ZGZvcm1hdGlvbic7XHJcblxyXG5pbnRlcmZhY2UgSG90c3dhcENvbmZpZyB7XHJcbiAgZW52aXJvbm1lbnQ6ICdkZXYnIHwgJ3N0YWdpbmcnIHwgJ3Byb2R1Y3Rpb24nO1xyXG4gIHJlZ2lvbjogc3RyaW5nO1xyXG4gIHN0YWNrczogc3RyaW5nW107XHJcbiAgbGFtYmRhT25seTogYm9vbGVhbjtcclxuICBza2lwVmFsaWRhdGlvbjogYm9vbGVhbjtcclxuICB3YXRjaE1vZGU6IGJvb2xlYW47XHJcbn1cclxuXHJcbmNsYXNzIFRyaW5pdHlIb3Rzd2FwRGVwbG95ZXIge1xyXG4gIHByaXZhdGUgY29uZmlnOiBIb3Rzd2FwQ29uZmlnO1xyXG4gIHByaXZhdGUgY2ZDbGllbnQ6IENsb3VkRm9ybWF0aW9uQ2xpZW50O1xyXG4gIHByaXZhdGUgZGVwbG95bWVudExvZzogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgY29uc3RydWN0b3IoY29uZmlnOiBIb3Rzd2FwQ29uZmlnKSB7XHJcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgIHRoaXMuY2ZDbGllbnQgPSBuZXcgQ2xvdWRGb3JtYXRpb25DbGllbnQoeyByZWdpb246IGNvbmZpZy5yZWdpb24gfSk7XHJcbiAgICBcclxuICAgIHRoaXMubG9nKCfimqEgVHJpbml0eSBIb3Rzd2FwIERlcGxveWVyIGluaXRpYWxpemVkJyk7XHJcbiAgICB0aGlzLmxvZyhg8J+TiyBFbnZpcm9ubWVudDogJHtjb25maWcuZW52aXJvbm1lbnR9YCk7XHJcbiAgICB0aGlzLmxvZyhg8J+MjSBSZWdpb246ICR7Y29uZmlnLnJlZ2lvbn1gKTtcclxuICAgIHRoaXMubG9nKGDwn5OmIFN0YWNrczogJHtjb25maWcuc3RhY2tzLmpvaW4oJywgJyl9YCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGxvZyhtZXNzYWdlOiBzdHJpbmcsIGxldmVsOiAnaW5mbycgfCAnd2FybicgfCAnZXJyb3InID0gJ2luZm8nKSB7XHJcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcbiAgICBjb25zdCBsb2dFbnRyeSA9IGBbJHt0aW1lc3RhbXB9XSAke21lc3NhZ2V9YDtcclxuICAgIFxyXG4gICAgdGhpcy5kZXBsb3ltZW50TG9nLnB1c2gobG9nRW50cnkpO1xyXG4gICAgXHJcbiAgICBzd2l0Y2ggKGxldmVsKSB7XHJcbiAgICAgIGNhc2UgJ3dhcm4nOlxyXG4gICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICR7bWVzc2FnZX1gKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAnZXJyb3InOlxyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCAke21lc3NhZ2V9YCk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgY29uc29sZS5sb2cobWVzc2FnZSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBob3Rzd2FwIHByZXJlcXVpc2l0ZXNcclxuICAgKi9cclxuICBhc3luYyB2YWxpZGF0ZUhvdHN3YXBQcmVyZXF1aXNpdGVzKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgdGhpcy5sb2coJ/CflI0gVmFsaWRhdGluZyBob3Rzd2FwIHByZXJlcXVpc2l0ZXMuLi4nKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBDaGVjayBpZiBzdGFja3MgZXhpc3RcclxuICAgICAgZm9yIChjb25zdCBzdGFja05hbWUgb2YgdGhpcy5jb25maWcuc3RhY2tzKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGF3YWl0IHRoaXMuY2ZDbGllbnQuc2VuZChuZXcgRGVzY3JpYmVTdGFja3NDb21tYW5kKHsgU3RhY2tOYW1lOiBzdGFja05hbWUgfSkpO1xyXG4gICAgICAgICAgdGhpcy5sb2coYOKchSBTdGFjayAke3N0YWNrTmFtZX0gZXhpc3RzYCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIHRoaXMubG9nKGDinYwgU3RhY2sgJHtzdGFja05hbWV9IG5vdCBmb3VuZCAtIGhvdHN3YXAgcmVxdWlyZXMgZXhpc3Rpbmcgc3RhY2tgLCAnZXJyb3InKTtcclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIENoZWNrIENESyB2ZXJzaW9uIGZvciBob3Rzd2FwIHN1cHBvcnRcclxuICAgICAgY29uc3QgY2RrVmVyc2lvbiA9IGV4ZWNTeW5jKCdjZGsgLS12ZXJzaW9uJywgeyBlbmNvZGluZzogJ3V0ZjgnIH0pLnRyaW0oKTtcclxuICAgICAgdGhpcy5sb2coYOKchSBDREsgdmVyc2lvbjogJHtjZGtWZXJzaW9ufWApO1xyXG5cclxuICAgICAgLy8gV2FybiBhYm91dCBwcm9kdWN0aW9uIGhvdHN3YXBcclxuICAgICAgaWYgKHRoaXMuY29uZmlnLmVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicpIHtcclxuICAgICAgICB0aGlzLmxvZygn4pqg77iPIEhvdHN3YXAgZGVwbG95bWVudCBpbiBwcm9kdWN0aW9uIGlzIG5vdCByZWNvbW1lbmRlZCcsICd3YXJuJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nKGDinYwgSG90c3dhcCB2YWxpZGF0aW9uIGZhaWxlZDogJHtlcnJvcn1gLCAnZXJyb3InKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQnVpbGQgVHlwZVNjcmlwdCBzb3VyY2VcclxuICAgKi9cclxuICBhc3luYyBidWlsZFNvdXJjZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIHRoaXMubG9nKCfwn5SoIEJ1aWxkaW5nIFR5cGVTY3JpcHQgc291cmNlLi4uJyk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgZXhlY1N5bmMoJ25wbSBydW4gYnVpbGQnLCB7IHN0ZGlvOiAncGlwZScgfSk7XHJcbiAgICAgIHRoaXMubG9nKCfinIUgVHlwZVNjcmlwdCBidWlsZCBjb21wbGV0ZWQnKTtcclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZyhg4p2MIFR5cGVTY3JpcHQgYnVpbGQgZmFpbGVkOiAke2Vycm9yfWAsICdlcnJvcicpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFeGVjdXRlIGhvdHN3YXAgZGVwbG95bWVudFxyXG4gICAqL1xyXG4gIGFzeW5jIGV4ZWN1dGVIb3Rzd2FwKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgdGhpcy5sb2coJ+KaoSBTdGFydGluZyBob3Rzd2FwIGRlcGxveW1lbnQuLi4nKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBQcmVwYXJlIGhvdHN3YXAgY29tbWFuZFxyXG4gICAgICBjb25zdCBob3Rzd2FwQ29tbWFuZCA9IFsnY2RrJywgJ2RlcGxveSddO1xyXG4gICAgICBcclxuICAgICAgaWYgKHRoaXMuY29uZmlnLnN0YWNrcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgaG90c3dhcENvbW1hbmQucHVzaCguLi50aGlzLmNvbmZpZy5zdGFja3MpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGhvdHN3YXBDb21tYW5kLnB1c2goJy0tYWxsJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEFkZCBob3Rzd2FwIGZsYWdcclxuICAgICAgaG90c3dhcENvbW1hbmQucHVzaCgnLS1ob3Rzd2FwJyk7XHJcblxyXG4gICAgICAvLyBTa2lwIGFwcHJvdmFsIGZvciBkZXZlbG9wbWVudFxyXG4gICAgICBpZiAodGhpcy5jb25maWcuZW52aXJvbm1lbnQgPT09ICdkZXYnKSB7XHJcbiAgICAgICAgaG90c3dhcENvbW1hbmQucHVzaCgnLS1yZXF1aXJlLWFwcHJvdmFsJywgJ25ldmVyJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIExhbWJkYS1vbmx5IGhvdHN3YXAgZm9yIGZhc3RlciBkZXBsb3ltZW50c1xyXG4gICAgICBpZiAodGhpcy5jb25maWcubGFtYmRhT25seSkge1xyXG4gICAgICAgIGhvdHN3YXBDb21tYW5kLnB1c2goJy0taG90c3dhcC1mYWxsYmFjaycsICdmYWxzZScpO1xyXG4gICAgICAgIHRoaXMubG9nKCfwn46vIExhbWJkYS1vbmx5IGhvdHN3YXAgbW9kZSBlbmFibGVkJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEFkZCBvdXRwdXRzIGZpbGVcclxuICAgICAgaG90c3dhcENvbW1hbmQucHVzaCgnLS1vdXRwdXRzLWZpbGUnLCAnY2RrLW91dHB1dHMuanNvbicpO1xyXG5cclxuICAgICAgdGhpcy5sb2coYPCfk50gRXhlY3V0aW5nOiAke2hvdHN3YXBDb21tYW5kLmpvaW4oJyAnKX1gKTtcclxuXHJcbiAgICAgIC8vIEV4ZWN1dGUgaG90c3dhcCBkZXBsb3ltZW50XHJcbiAgICAgIGNvbnN0IGhvdHN3YXBQcm9jZXNzID0gc3Bhd24oaG90c3dhcENvbW1hbmRbMF0sIGhvdHN3YXBDb21tYW5kLnNsaWNlKDEpLCB7XHJcbiAgICAgICAgc3RkaW86ICdpbmhlcml0JyxcclxuICAgICAgICBlbnY6IHsgLi4ucHJvY2Vzcy5lbnYsIENES19ERUZBVUxUX1JFR0lPTjogdGhpcy5jb25maWcucmVnaW9uIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgIGhvdHN3YXBQcm9jZXNzLm9uKCdjbG9zZScsIChjb2RlKSA9PiB7XHJcbiAgICAgICAgICBpZiAoY29kZSA9PT0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmxvZygn4pyFIEhvdHN3YXAgZGVwbG95bWVudCBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XHJcbiAgICAgICAgICAgIHJlc29sdmUodHJ1ZSk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmxvZyhg4p2MIEhvdHN3YXAgZGVwbG95bWVudCBmYWlsZWQgd2l0aCBjb2RlICR7Y29kZX1gLCAnZXJyb3InKTtcclxuICAgICAgICAgICAgcmVzb2x2ZShmYWxzZSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGhvdHN3YXBQcm9jZXNzLm9uKCdlcnJvcicsIChlcnJvcikgPT4ge1xyXG4gICAgICAgICAgdGhpcy5sb2coYOKdjCBIb3Rzd2FwIGRlcGxveW1lbnQgZXJyb3I6ICR7ZXJyb3J9YCwgJ2Vycm9yJyk7XHJcbiAgICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZyhg4p2MIEhvdHN3YXAgZGVwbG95bWVudCBmYWlsZWQ6ICR7ZXJyb3J9YCwgJ2Vycm9yJyk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFdhdGNoIG1vZGUgZm9yIGNvbnRpbnVvdXMgZGVwbG95bWVudFxyXG4gICAqL1xyXG4gIGFzeW5jIHN0YXJ0V2F0Y2hNb2RlKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdGhpcy5sb2coJ/CfkYAgU3RhcnRpbmcgd2F0Y2ggbW9kZSBmb3IgY29udGludW91cyBkZXBsb3ltZW50Li4uJyk7XHJcbiAgICBcclxuICAgIGNvbnN0IGNob2tpZGFyID0gcmVxdWlyZSgnY2hva2lkYXInKTtcclxuICAgIFxyXG4gICAgLy8gV2F0Y2ggVHlwZVNjcmlwdCBzb3VyY2UgZmlsZXNcclxuICAgIGNvbnN0IHdhdGNoZXIgPSBjaG9raWRhci53YXRjaChbJ3NyYy8qKi8qLnRzJywgJ2xpYi8qKi8qLnRzJ10sIHtcclxuICAgICAgaWdub3JlZDogL25vZGVfbW9kdWxlcy8sXHJcbiAgICAgIHBlcnNpc3RlbnQ6IHRydWUsXHJcbiAgICAgIGlnbm9yZUluaXRpYWw6IHRydWVcclxuICAgIH0pO1xyXG5cclxuICAgIGxldCBkZXBsb3ltZW50SW5Qcm9ncmVzcyA9IGZhbHNlO1xyXG5cclxuICAgIHdhdGNoZXIub24oJ2NoYW5nZScsIGFzeW5jIChmaWxlUGF0aDogc3RyaW5nKSA9PiB7XHJcbiAgICAgIGlmIChkZXBsb3ltZW50SW5Qcm9ncmVzcykge1xyXG4gICAgICAgIHRoaXMubG9nKGDij7MgRGVwbG95bWVudCBpbiBwcm9ncmVzcywgaWdub3JpbmcgY2hhbmdlOiAke2ZpbGVQYXRofWApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGhpcy5sb2coYPCfk50gRmlsZSBjaGFuZ2VkOiAke2ZpbGVQYXRofWApO1xyXG4gICAgICBkZXBsb3ltZW50SW5Qcm9ncmVzcyA9IHRydWU7XHJcblxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIC8vIEJ1aWxkIGFuZCBkZXBsb3lcclxuICAgICAgICBjb25zdCBidWlsZFN1Y2Nlc3MgPSBhd2FpdCB0aGlzLmJ1aWxkU291cmNlKCk7XHJcbiAgICAgICAgaWYgKGJ1aWxkU3VjY2Vzcykge1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5leGVjdXRlSG90c3dhcCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICB0aGlzLmxvZyhg4p2MIFdhdGNoIG1vZGUgZGVwbG95bWVudCBmYWlsZWQ6ICR7ZXJyb3J9YCwgJ2Vycm9yJyk7XHJcbiAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgZGVwbG95bWVudEluUHJvZ3Jlc3MgPSBmYWxzZTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5sb2coJ+KchSBXYXRjaCBtb2RlIHN0YXJ0ZWQgLSBwcmVzcyBDdHJsK0MgdG8gc3RvcCcpO1xyXG4gICAgXHJcbiAgICAvLyBLZWVwIHByb2Nlc3MgYWxpdmVcclxuICAgIHByb2Nlc3Mub24oJ1NJR0lOVCcsICgpID0+IHtcclxuICAgICAgdGhpcy5sb2coJ/Cfm5EgU3RvcHBpbmcgd2F0Y2ggbW9kZS4uLicpO1xyXG4gICAgICB3YXRjaGVyLmNsb3NlKCk7XHJcbiAgICAgIHByb2Nlc3MuZXhpdCgwKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgZGVwbG95bWVudCB0aW1pbmcgcmVwb3J0XHJcbiAgICovXHJcbiAgZ2VuZXJhdGVUaW1pbmdSZXBvcnQoc3RhcnRUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgIGNvbnN0IGVuZFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgY29uc3QgZHVyYXRpb24gPSAoZW5kVGltZSAtIHN0YXJ0VGltZSkgLyAxMDAwO1xyXG5cclxuICAgIGNvbnN0IHJlcG9ydCA9IHtcclxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIGVudmlyb25tZW50OiB0aGlzLmNvbmZpZy5lbnZpcm9ubWVudCxcclxuICAgICAgcmVnaW9uOiB0aGlzLmNvbmZpZy5yZWdpb24sXHJcbiAgICAgIHN0YWNrczogdGhpcy5jb25maWcuc3RhY2tzLFxyXG4gICAgICBkZXBsb3ltZW50VHlwZTogJ2hvdHN3YXAnLFxyXG4gICAgICBkdXJhdGlvbjogYCR7ZHVyYXRpb24udG9GaXhlZCgyKX1zYCxcclxuICAgICAgZGVwbG95bWVudExvZzogdGhpcy5kZXBsb3ltZW50TG9nLFxyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCByZXBvcnRQYXRoID0gcGF0aC5qb2luKCdob3Rzd2FwLXJlcG9ydHMnLCBgaG90c3dhcC0ke0RhdGUubm93KCl9Lmpzb25gKTtcclxuICAgIFxyXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKCdob3Rzd2FwLXJlcG9ydHMnKSkge1xyXG4gICAgICBmcy5ta2RpclN5bmMoJ2hvdHN3YXAtcmVwb3J0cycsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmcy53cml0ZUZpbGVTeW5jKHJlcG9ydFBhdGgsIEpTT04uc3RyaW5naWZ5KHJlcG9ydCwgbnVsbCwgMikpO1xyXG5cclxuICAgIHRoaXMubG9nKGDimqEgSG90c3dhcCBjb21wbGV0ZWQgaW4gJHtkdXJhdGlvbi50b0ZpeGVkKDIpfXNgKTtcclxuICAgIHRoaXMubG9nKGDwn5OLIFRpbWluZyByZXBvcnQgc2F2ZWQ6ICR7cmVwb3J0UGF0aH1gKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEV4ZWN1dGUgaG90c3dhcCBkZXBsb3ltZW50IHdvcmtmbG93XHJcbiAgICovXHJcbiAgYXN5bmMgZXhlY3V0ZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgdGhpcy5sb2coJ+KaoSBTdGFydGluZyBUcmluaXR5IGhvdHN3YXAgZGVwbG95bWVudCB3b3JrZmxvdy4uLicpO1xyXG5cclxuICAgICAgLy8gVmFsaWRhdGUgcHJlcmVxdWlzaXRlc1xyXG4gICAgICBpZiAoIXRoaXMuY29uZmlnLnNraXBWYWxpZGF0aW9uKSB7XHJcbiAgICAgICAgY29uc3QgaXNWYWxpZCA9IGF3YWl0IHRoaXMudmFsaWRhdGVIb3Rzd2FwUHJlcmVxdWlzaXRlcygpO1xyXG4gICAgICAgIGlmICghaXNWYWxpZCkge1xyXG4gICAgICAgICAgdGhpcy5sb2coJ+KdjCBIb3Rzd2FwIHByZXJlcXVpc2l0ZXMgdmFsaWRhdGlvbiBmYWlsZWQnLCAnZXJyb3InKTtcclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEJ1aWxkIHNvdXJjZVxyXG4gICAgICBjb25zdCBidWlsZFN1Y2Nlc3MgPSBhd2FpdCB0aGlzLmJ1aWxkU291cmNlKCk7XHJcbiAgICAgIGlmICghYnVpbGRTdWNjZXNzKSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBFeGVjdXRlIGhvdHN3YXBcclxuICAgICAgY29uc3QgZGVwbG95U3VjY2VzcyA9IGF3YWl0IHRoaXMuZXhlY3V0ZUhvdHN3YXAoKTtcclxuICAgICAgXHJcbiAgICAgIC8vIEdlbmVyYXRlIHRpbWluZyByZXBvcnRcclxuICAgICAgdGhpcy5nZW5lcmF0ZVRpbWluZ1JlcG9ydChzdGFydFRpbWUpO1xyXG5cclxuICAgICAgaWYgKGRlcGxveVN1Y2Nlc3MpIHtcclxuICAgICAgICB0aGlzLmxvZygn8J+OiSBIb3Rzd2FwIGRlcGxveW1lbnQgd29ya2Zsb3cgY29tcGxldGVkIHN1Y2Nlc3NmdWxseSEnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTdGFydCB3YXRjaCBtb2RlIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy53YXRjaE1vZGUpIHtcclxuICAgICAgICAgIGF3YWl0IHRoaXMuc3RhcnRXYXRjaE1vZGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5sb2coJ+KdjCBIb3Rzd2FwIGRlcGxveW1lbnQgd29ya2Zsb3cgZmFpbGVkJywgJ2Vycm9yJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBkZXBsb3lTdWNjZXNzO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nKGDinYwgSG90c3dhcCB3b3JrZmxvdyBlcnJvcjogJHtlcnJvcn1gLCAnZXJyb3InKTtcclxuICAgICAgdGhpcy5nZW5lcmF0ZVRpbWluZ1JlcG9ydChzdGFydFRpbWUpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyBDTEkgaW50ZXJmYWNlXHJcbmlmIChyZXF1aXJlLm1haW4gPT09IG1vZHVsZSkge1xyXG4gIGNvbnN0IGFyZ3MgPSBwcm9jZXNzLmFyZ3Yuc2xpY2UoMik7XHJcbiAgXHJcbiAgY29uc3QgY29uZmlnOiBIb3Rzd2FwQ29uZmlnID0ge1xyXG4gICAgZW52aXJvbm1lbnQ6IChhcmdzLmZpbmQoYXJnID0+IGFyZy5zdGFydHNXaXRoKCctLWVudj0nKSk/LnNwbGl0KCc9JylbMV0gYXMgYW55KSB8fCAnZGV2JyxcclxuICAgIHJlZ2lvbjogYXJncy5maW5kKGFyZyA9PiBhcmcuc3RhcnRzV2l0aCgnLS1yZWdpb249JykpPy5zcGxpdCgnPScpWzFdIHx8ICdldS13ZXN0LTEnLFxyXG4gICAgc3RhY2tzOiBhcmdzLmZpbHRlcihhcmcgPT4gIWFyZy5zdGFydHNXaXRoKCctLScpICYmICFbJ3dhdGNoJ10uaW5jbHVkZXMoYXJnKSksXHJcbiAgICBsYW1iZGFPbmx5OiBhcmdzLmluY2x1ZGVzKCctLWxhbWJkYS1vbmx5JyksXHJcbiAgICBza2lwVmFsaWRhdGlvbjogYXJncy5pbmNsdWRlcygnLS1za2lwLXZhbGlkYXRpb24nKSxcclxuICAgIHdhdGNoTW9kZTogYXJncy5pbmNsdWRlcygnd2F0Y2gnKSB8fCBhcmdzLmluY2x1ZGVzKCctLXdhdGNoJyksXHJcbiAgfTtcclxuICBcclxuICBpZiAoYXJncy5pbmNsdWRlcygnLS1oZWxwJykgfHwgYXJncy5pbmNsdWRlcygnLWgnKSkge1xyXG4gICAgY29uc29sZS5sb2coYFxyXG5UcmluaXR5IEhvdHN3YXAgRGVwbG95bWVudFxyXG5cclxuVXNhZ2U6XHJcbiAgbnB4IHRzLW5vZGUgaG90c3dhcC1kZXBsb3kudHMgW29wdGlvbnNdIFtzdGFjay1uYW1lcy4uLl1cclxuICBucHggdHMtbm9kZSBob3Rzd2FwLWRlcGxveS50cyB3YXRjaCBbb3B0aW9uc11cclxuXHJcbk9wdGlvbnM6XHJcbiAgLS1lbnY9PGVudj4gICAgICAgICAgRW52aXJvbm1lbnQgKGRldnxzdGFnaW5nfHByb2R1Y3Rpb24pIFtkZWZhdWx0OiBkZXZdXHJcbiAgLS1yZWdpb249PHJlZ2lvbj4gICAgQVdTIHJlZ2lvbiBbZGVmYXVsdDogZXUtd2VzdC0xXVxyXG4gIC0tbGFtYmRhLW9ubHkgICAgICAgIE9ubHkgaG90c3dhcCBMYW1iZGEgZnVuY3Rpb25zIChmYXN0ZXIpXHJcbiAgLS1za2lwLXZhbGlkYXRpb24gICAgU2tpcCBwcmVyZXF1aXNpdGUgdmFsaWRhdGlvblxyXG4gIC0td2F0Y2ggICAgICAgICAgICAgRW5hYmxlIHdhdGNoIG1vZGUgZm9yIGNvbnRpbnVvdXMgZGVwbG95bWVudFxyXG4gIC0taGVscCwgLWggICAgICAgICAgU2hvdyB0aGlzIGhlbHAgbWVzc2FnZVxyXG5cclxuRXhhbXBsZXM6XHJcbiAgIyBIb3Rzd2FwIGFsbCBzdGFja3NcclxuICBucHggdHMtbm9kZSBob3Rzd2FwLWRlcGxveS50c1xyXG4gIFxyXG4gICMgSG90c3dhcCBzcGVjaWZpYyBzdGFja1xyXG4gIG5weCB0cy1ub2RlIGhvdHN3YXAtZGVwbG95LnRzIFRyaW5pdHlMYW1iZGFTdGFja1xyXG4gIFxyXG4gICMgTGFtYmRhLW9ubHkgaG90c3dhcCBmb3IgbWF4aW11bSBzcGVlZFxyXG4gIG5weCB0cy1ub2RlIGhvdHN3YXAtZGVwbG95LnRzIC0tbGFtYmRhLW9ubHkgVHJpbml0eUxhbWJkYVN0YWNrXHJcbiAgXHJcbiAgIyBXYXRjaCBtb2RlIGZvciBjb250aW51b3VzIGRlcGxveW1lbnRcclxuICBucHggdHMtbm9kZSBob3Rzd2FwLWRlcGxveS50cyB3YXRjaCAtLWxhbWJkYS1vbmx5XHJcbiAgXHJcbiAgIyBQcm9kdWN0aW9uIGhvdHN3YXAgKG5vdCByZWNvbW1lbmRlZClcclxuICBucHggdHMtbm9kZSBob3Rzd2FwLWRlcGxveS50cyAtLWVudj1wcm9kdWN0aW9uIC0tc2tpcC12YWxpZGF0aW9uXHJcbmApO1xyXG4gICAgcHJvY2Vzcy5leGl0KDApO1xyXG4gIH1cclxuICBcclxuICBjb25zdCBkZXBsb3llciA9IG5ldyBUcmluaXR5SG90c3dhcERlcGxveWVyKGNvbmZpZyk7XHJcbiAgZGVwbG95ZXIuZXhlY3V0ZSgpLnRoZW4oc3VjY2VzcyA9PiB7XHJcbiAgICBpZiAoIWNvbmZpZy53YXRjaE1vZGUpIHtcclxuICAgICAgcHJvY2Vzcy5leGl0KHN1Y2Nlc3MgPyAwIDogMSk7XHJcbiAgICB9XHJcbiAgfSkuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgY29uc29sZS5lcnJvcign4p2MIEhvdHN3YXAgZGVwbG95bWVudCBmYWlsZWQ6JywgZXJyb3IpO1xyXG4gICAgcHJvY2Vzcy5leGl0KDEpO1xyXG4gIH0pO1xyXG59XHJcblxyXG5leHBvcnQgeyBUcmluaXR5SG90c3dhcERlcGxveWVyLCBIb3Rzd2FwQ29uZmlnIH07Il19