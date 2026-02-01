#!/usr/bin/env npx ts-node
"use strict";
/**
 * Trinity Workflow Helper
 *
 * Interactive guide for choosing the optimal deployment workflow
 * based on the type of changes being made
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrinityWorkflowHelper = void 0;
const child_process_1 = require("child_process");
const development_workflow_1 = require("../config/development-workflow");
class TrinityWorkflowHelper {
    /**
     * Analyze git changes to determine change types
     */
    analyzeChanges() {
        console.log('🔍 Analyzing changes...\n');
        let changedFiles = [];
        try {
            // Get changed files from git
            const gitOutput = (0, child_process_1.execSync)('git diff --name-only HEAD', { encoding: 'utf8' });
            changedFiles = gitOutput.trim().split('\n').filter(f => f.length > 0);
            if (changedFiles.length === 0) {
                // Check staged files
                const stagedOutput = (0, child_process_1.execSync)('git diff --cached --name-only', { encoding: 'utf8' });
                changedFiles = stagedOutput.trim().split('\n').filter(f => f.length > 0);
            }
        }
        catch (error) {
            console.log('⚠️ Could not analyze git changes - using manual mode');
        }
        const analysis = {
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
    displayAnalysis(analysis) {
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
    recommendWorkflow(analysis) {
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
        }
        else if (analysis.hasLambdaChanges && !analysis.hasInfrastructureChanges) {
            console.log('⚡ Lambda-only changes detected!');
            console.log('   Recommendation: Use hotswap for fastest deployment');
            console.log('   Workflow: Quick Lambda Update');
            console.log('   Command: npm run hotswap:lambda\n');
            console.log('💡 Development tips:');
            console.log('   - Use watch mode for continuous development: npm run hotswap:watch');
            console.log('   - Hotswap deployment takes 15-30 seconds');
            console.log('   - Test locally with unit tests first\n');
        }
        else if (analysis.hasApiChanges) {
            console.log('🔗 API changes detected!');
            console.log('   Recommendation: Full deployment required for AppSync changes');
            console.log('   Workflow: Standard Development Deploy');
            console.log('   Command: npm run deploy:api && npm run validate\n');
            console.log('📝 API deployment notes:');
            console.log('   - GraphQL schema changes require full deployment');
            console.log('   - Test queries in AppSync console after deployment');
            console.log('   - Validate backward compatibility\n');
        }
        else if (analysis.hasInfrastructureChanges) {
            console.log('🏗️ Infrastructure changes detected!');
            console.log('   Recommendation: Full deployment with validation');
            console.log('   Workflow: Standard Development Deploy');
            console.log('   Command: npm run deploy:all\n');
            console.log('🔍 Infrastructure deployment tips:');
            console.log('   - Review CDK diff output: npm run diff');
            console.log('   - Test in development environment first');
            console.log('   - Have rollback plan ready\n');
        }
        else if (analysis.changedFiles.length === 0) {
            console.log('📭 No changes detected!');
            console.log('   You may want to:');
            console.log('   - Check git status: git status');
            console.log('   - Stage your changes: git add .');
            console.log('   - Run validation: npm run validate\n');
        }
        else {
            console.log('🤔 Mixed or unclear changes detected!');
            console.log('   Recommendation: Use standard deployment workflow');
            console.log('   Workflow: Standard Development Deploy');
            console.log('   Command: npm run deploy:all\n');
        }
    }
    /**
     * Display available workflows
     */
    displayWorkflows() {
        console.log('📚 Available Workflows:\n');
        development_workflow_1.DEVELOPMENT_WORKFLOWS.forEach((workflow, index) => {
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
    displayRecommendations() {
        console.log('💡 Development Recommendations:\n');
        Object.entries(development_workflow_1.DEV_RECOMMENDATIONS).forEach(([category, rec]) => {
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
    async interactiveMode() {
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
    executeWorkflow(workflowName) {
        const workflow = development_workflow_1.DEVELOPMENT_WORKFLOWS.find(w => w.name === workflowName);
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
exports.TrinityWorkflowHelper = TrinityWorkflowHelper;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2Zsb3ctaGVscGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsid29ya2Zsb3ctaGVscGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBRUE7Ozs7O0dBS0c7OztBQUdILGlEQUF5QztBQUN6Qyx5RUFBcUk7QUFVckksTUFBTSxxQkFBcUI7SUFFekI7O09BRUc7SUFDSCxjQUFjO1FBQ1osT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBRXpDLElBQUksWUFBWSxHQUFhLEVBQUUsQ0FBQztRQUVoQyxJQUFJLENBQUM7WUFDSCw2QkFBNkI7WUFDN0IsTUFBTSxTQUFTLEdBQUcsSUFBQSx3QkFBUSxFQUFDLDJCQUEyQixFQUFFLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFDOUUsWUFBWSxHQUFHLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUV0RSxJQUFJLFlBQVksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQzlCLHFCQUFxQjtnQkFDckIsTUFBTSxZQUFZLEdBQUcsSUFBQSx3QkFBUSxFQUFDLCtCQUErQixFQUFFLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7Z0JBQ3JGLFlBQVksR0FBRyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDM0UsQ0FBQztRQUNILENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzREFBc0QsQ0FBQyxDQUFDO1FBQ3RFLENBQUM7UUFFRCxNQUFNLFFB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LENBQUMsQ0FBQztZQUNyQyxNQUFNO1FBRVI7WUFDRSxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQzdDLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0NBQWtDLENBQUMsQ0FBQztZQUNoRCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BCLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbnB4IHRzLW5vZGVcclxuXHJcbi8qKlxyXG4gKiBUcmluaXR5IFdvcmtmbG93IEhlbHBlclxyXG4gKiBcclxuICogSW50ZXJhY3RpdmUgZ3VpZGUgZm9yIGNob29zaW5nIHRoZSBvcHRpbWFsIGRlcGxveW1lbnQgd29ya2Zsb3dcclxuICogYmFzZWQgb24gdGhlIHR5cGUgb2YgY2hhbmdlcyBiZWluZyBtYWRlXHJcbiAqL1xyXG5cclxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xyXG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xyXG5pbXBvcnQgeyBERVZFTE9QTUVOVF9XT1JLRkxPV1MsIGdldFJlY29tbWVuZGVkV29ya2Zsb3csIHN1cHBvcnRzSG90c3dhcCwgREVWX1JFQ09NTUVOREFUSU9OUyB9IGZyb20gJy4uL2NvbmZpZy9kZXZlbG9wbWVudC13b3JrZmxvdyc7XHJcblxyXG5pbnRlcmZhY2UgQ2hhbmdlQW5hbHlzaXMge1xyXG4gIGhhc0xhbWJkYUNoYW5nZXM6IGJvb2xlYW47XHJcbiAgaGFzSW5mcmFzdHJ1Y3R1cmVDaGFuZ2VzOiBib29sZWFuO1xyXG4gIGhhc1NjaGVtYUNoYW5nZXM6IGJvb2xlYW47XHJcbiAgaGFzQXBpQ2hhbmdlczogYm9vbGVhbjtcclxuICBjaGFuZ2VkRmlsZXM6IHN0cmluZ1tdO1xyXG59XHJcblxyXG5jbGFzcyBUcmluaXR5V29ya2Zsb3dIZWxwZXIge1xyXG4gIFxyXG4gIC8qKlxyXG4gICAqIEFuYWx5emUgZ2l0IGNoYW5nZXMgdG8gZGV0ZXJtaW5lIGNoYW5nZSB0eXBlc1xyXG4gICAqL1xyXG4gIGFuYWx5emVDaGFuZ2VzKCk6IENoYW5nZUFuYWx5c2lzIHtcclxuICAgIGNvbnNvbGUubG9nKCfwn5SNIEFuYWx5emluZyBjaGFuZ2VzLi4uXFxuJyk7XHJcblxyXG4gICAgbGV0IGNoYW5nZWRGaWxlczogc3RyaW5nW10gPSBbXTtcclxuICAgIFxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gR2V0IGNoYW5nZWQgZmlsZXMgZnJvbSBnaXRcclxuICAgICAgY29uc3QgZ2l0T3V0cHV0ID0gZXhlY1N5bmMoJ2dpdCBkaWZmIC0tbmFtZS1vbmx5IEhFQUQnLCB7IGVuY29kaW5nOiAndXRmOCcgfSk7XHJcbiAgICAgIGNoYW5nZWRGaWxlcyA9IGdpdE91dHB1dC50cmltKCkuc3BsaXQoJ1xcbicpLmZpbHRlcihmID0+IGYubGVuZ3RoID4gMCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoY2hhbmdlZEZpbGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIC8vIENoZWNrIHN0YWdlZCBmaWxlc1xyXG4gICAgICAgIGNvbnN0IHN0YWdlZE91dHB1dCA9IGV4ZWNTeW5jKCdnaXQgZGlmZiAtLWNhY2hlZCAtLW5hbWUtb25seScsIHsgZW5jb2Rpbmc6ICd1dGY4JyB9KTtcclxuICAgICAgICBjaGFuZ2VkRmlsZXMgPSBzdGFnZWRPdXRwdXQudHJpbSgpLnNwbGl0KCdcXG4nKS5maWx0ZXIoZiA9PiBmLmxlbmd0aCA+IDApO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmxvZygn4pqg77iPIENvdWxkIG5vdCBhbmFseXplIGdpdCBjaGFuZ2VzIC0gdXNpbmcgbWFudWFsIG1vZGUnKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBhbmFseXNpczogQ2hhbmdlQW5hbHlzaXMgPSB7XHJcbiAgICAgIGhhc0xhbWJkYUNoYW5nZXM6IGZhbHNlLFxyXG4gICAgICBoYXNJbmZyYXN0cnVjdHVyZUNoYW5nZXM6IGZhbHNlLFxyXG4gICAgICBoYXNTY2hlbWFDaGFuZ2VzOiBmYWxzZSxcclxuICAgICAgaGFzQXBpQ2hhbmdlczogZmFsc2UsXHJcbiAgICAgIGNoYW5nZWRGaWxlc1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyBBbmFseXplIGZpbGUgcGF0dGVybnNcclxuICAgIGZvciAoY29uc3QgZmlsZSBvZiBjaGFuZ2VkRmlsZXMpIHtcclxuICAgICAgaWYgKGZpbGUuaW5jbHVkZXMoJ3NyYy9oYW5kbGVycy8nKSB8fCBmaWxlLmluY2x1ZGVzKCdzcmMvc2VydmljZXMvJykpIHtcclxuICAgICAgICBhbmFseXNpcy5oYXNMYW1iZGFDaGFuZ2VzID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgaWYgKGZpbGUuaW5jbHVkZXMoJ2xpYi8nKSAmJiBmaWxlLmVuZHNXaXRoKCcudHMnKSkge1xyXG4gICAgICAgIGFuYWx5c2lzLmhhc0luZnJhc3RydWN0dXJlQ2hhbmdlcyA9IHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGlmIChmaWxlLmluY2x1ZGVzKCdzY2hlbWEnKSB8fCBmaWxlLmluY2x1ZGVzKCdkYXRhYmFzZScpKSB7XHJcbiAgICAgICAgYW5hbHlzaXMuaGFzU2NoZW1hQ2hhbmdlcyA9IHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGlmIChmaWxlLmluY2x1ZGVzKCdhcGknKSB8fCBmaWxlLmluY2x1ZGVzKCdncmFwaHFsJykpIHtcclxuICAgICAgICBhbmFseXNpcy5oYXNBcGlDaGFuZ2VzID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBhbmFseXNpcztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIERpc3BsYXkgY2hhbmdlIGFuYWx5c2lzXHJcbiAgICovXHJcbiAgZGlzcGxheUFuYWx5c2lzKGFuYWx5c2lzOiBDaGFuZ2VBbmFseXNpcyk6IHZvaWQge1xyXG4gICAgY29uc29sZS5sb2coJ/Cfk4sgQ2hhbmdlIEFuYWx5c2lzOicpO1xyXG4gICAgY29uc29sZS5sb2coYCAgIPCfk4EgQ2hhbmdlZCBmaWxlczogJHthbmFseXNpcy5jaGFuZ2VkRmlsZXMubGVuZ3RofWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIOKaoSBMYW1iZGEgY2hhbmdlczogJHthbmFseXNpcy5oYXNMYW1iZGFDaGFuZ2VzID8gJ+KchScgOiAn4p2MJ31gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDwn4+X77iPIEluZnJhc3RydWN0dXJlIGNoYW5nZXM6ICR7YW5hbHlzaXMuaGFzSW5mcmFzdHJ1Y3R1cmVDaGFuZ2VzID8gJ+KchScgOiAn4p2MJ31gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICDwn5eE77iPIFNjaGVtYSBjaGFuZ2VzOiAke2FuYWx5c2lzLmhhc1NjaGVtYUNoYW5nZXMgPyAn4pyFJyA6ICfinYwnfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIPCflJcgQVBJIGNoYW5nZXM6ICR7YW5hbHlzaXMuaGFzQXBpQ2hhbmdlcyA/ICfinIUnIDogJ+KdjCd9YCk7XHJcbiAgICBcclxuICAgIGlmIChhbmFseXNpcy5jaGFuZ2VkRmlsZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zb2xlLmxvZygnXFxuICAg8J+TnSBDaGFuZ2VkIGZpbGVzOicpO1xyXG4gICAgICBhbmFseXNpcy5jaGFuZ2VkRmlsZXMuc2xpY2UoMCwgMTApLmZvckVhY2goZmlsZSA9PiB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgICAgIC0gJHtmaWxlfWApO1xyXG4gICAgICB9KTtcclxuICAgICAgaWYgKGFuYWx5c2lzLmNoYW5nZWRGaWxlcy5sZW5ndGggPiAxMCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgICAgICAuLi4gYW5kICR7YW5hbHlzaXMuY2hhbmdlZEZpbGVzLmxlbmd0aCAtIDEwfSBtb3JlYCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGNvbnNvbGUubG9nKCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZWNvbW1lbmQgd29ya2Zsb3cgYmFzZWQgb24gYW5hbHlzaXNcclxuICAgKi9cclxuICByZWNvbW1lbmRXb3JrZmxvdyhhbmFseXNpczogQ2hhbmdlQW5hbHlzaXMpOiB2b2lkIHtcclxuICAgIGNvbnNvbGUubG9nKCfwn46vIFdvcmtmbG93IFJlY29tbWVuZGF0aW9uczpcXG4nKTtcclxuXHJcbiAgICAvLyBEZXRlcm1pbmUgcHJpbWFyeSBjaGFuZ2UgdHlwZVxyXG4gICAgaWYgKGFuYWx5c2lzLmhhc1NjaGVtYUNoYW5nZXMpIHtcclxuICAgICAgY29uc29sZS5sb2coJ/CfmqggRGF0YWJhc2Ugc2NoZW1hIGNoYW5nZXMgZGV0ZWN0ZWQhJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICBSZWNvbW1lbmRhdGlvbjogVXNlIHNhZmUgZGVwbG95bWVudCB3aXRoIGZ1bGwgdmFsaWRhdGlvbicpO1xyXG4gICAgICBjb25zb2xlLmxvZygnICAgV29ya2Zsb3c6IFNhZmUgUHJvZHVjdGlvbiBEZXBsb3knKTtcclxuICAgICAgY29uc29sZS5sb2coJyAgIENvbW1hbmQ6IG5wbSBydW4gZGVwbG95OmFsbCAmJiBucG0gcnVuIHZhbGlkYXRlXFxuJyk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zb2xlLmxvZygn4pqg77iPIEltcG9ydGFudCBjb25zaWRlcmF0aW9uczonKTtcclxuICAgICAgY29uc29sZS5sb2coJyAgIC0gQmFja3VwIGRhdGFiYXNlIGJlZm9yZSBkZXBsb3ltZW50Jyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICAtIFRlc3Qgc2NoZW1hIGNoYW5nZXMgaW4gZGV2ZWxvcG1lbnQgZmlyc3QnKTtcclxuICAgICAgY29uc29sZS5sb2coJyAgIC0gUmV2aWV3IG1pZ3JhdGlvbiBpbXBhY3QgY2FyZWZ1bGx5XFxuJyk7XHJcbiAgICAgIFxyXG4gICAgfSBlbHNlIGlmIChhbmFseXNpcy5oYXNMYW1iZGFDaGFuZ2VzICYmICFhbmFseXNpcy5oYXNJbmZyYXN0cnVjdHVyZUNoYW5nZXMpIHtcclxuICAgICAgY29uc29sZS5sb2coJ+KaoSBMYW1iZGEtb25seSBjaGFuZ2VzIGRldGVjdGVkIScpO1xyXG4gICAgICBjb25zb2xlLmxvZygnICAgUmVjb21tZW5kYXRpb246IFVzZSBob3Rzd2FwIGZvciBmYXN0ZXN0IGRlcGxveW1lbnQnKTtcclxuICAgICAgY29uc29sZS5sb2coJyAgIFdvcmtmbG93OiBRdWljayBMYW1iZGEgVXBkYXRlJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICBDb21tYW5kOiBucG0gcnVuIGhvdHN3YXA6bGFtYmRhXFxuJyk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zb2xlLmxvZygn8J+SoSBEZXZlbG9wbWVudCB0aXBzOicpO1xyXG4gICAgICBjb25zb2xlLmxvZygnICAgLSBVc2Ugd2F0Y2ggbW9kZSBmb3IgY29udGludW91cyBkZXZlbG9wbWVudDogbnBtIHJ1biBob3Rzd2FwOndhdGNoJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICAtIEhvdHN3YXAgZGVwbG95bWVudCB0YWtlcyAxNS0zMCBzZWNvbmRzJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICAtIFRlc3QgbG9jYWxseSB3aXRoIHVuaXQgdGVzdHMgZmlyc3RcXG4nKTtcclxuICAgICAgXHJcbiAgICB9IGVsc2UgaWYgKGFuYWx5c2lzLmhhc0FwaUNoYW5nZXMpIHtcclxuICAgICAgY29uc29sZS5sb2coJ/CflJcgQVBJIGNoYW5nZXMgZGV0ZWN0ZWQhJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICBSZWNvbW1lbmRhdGlvbjogRnVsbCBkZXBsb3ltZW50IHJlcXVpcmVkIGZvciBBcHBTeW5jIGNoYW5nZXMnKTtcclxuICAgICAgY29uc29sZS5sb2coJyAgIFdvcmtmbG93OiBTdGFuZGFyZCBEZXZlbG9wbWVudCBEZXBsb3knKTtcclxuICAgICAgY29uc29sZS5sb2coJyAgIENvbW1hbmQ6IG5wbSBydW4gZGVwbG95OmFwaSAmJiBucG0gcnVuIHZhbGlkYXRlXFxuJyk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zb2xlLmxvZygn8J+TnSBBUEkgZGVwbG95bWVudCBub3RlczonKTtcclxuICAgICAgY29uc29sZS5sb2coJyAgIC0gR3JhcGhRTCBzY2hlbWEgY2hhbmdlcyByZXF1aXJlIGZ1bGwgZGVwbG95bWVudCcpO1xyXG4gICAgICBjb25zb2xlLmxvZygnICAgLSBUZXN0IHF1ZXJpZXMgaW4gQXBwU3luYyBjb25zb2xlIGFmdGVyIGRlcGxveW1lbnQnKTtcclxuICAgICAgY29uc29sZS5sb2coJyAgIC0gVmFsaWRhdGUgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxcbicpO1xyXG4gICAgICBcclxuICAgIH0gZWxzZSBpZiAoYW5hbHlzaXMuaGFzSW5mcmFzdHJ1Y3R1cmVDaGFuZ2VzKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn4+X77iPIEluZnJhc3RydWN0dXJlIGNoYW5nZXMgZGV0ZWN0ZWQhJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICBSZWNvbW1lbmRhdGlvbjogRnVsbCBkZXBsb3ltZW50IHdpdGggdmFsaWRhdGlvbicpO1xyXG4gICAgICBjb25zb2xlLmxvZygnICAgV29ya2Zsb3c6IFN0YW5kYXJkIERldmVsb3BtZW50IERlcGxveScpO1xyXG4gICAgICBjb25zb2xlLmxvZygnICAgQ29tbWFuZDogbnBtIHJ1biBkZXBsb3k6YWxsXFxuJyk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBJbmZyYXN0cnVjdHVyZSBkZXBsb3ltZW50IHRpcHM6Jyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICAtIFJldmlldyBDREsgZGlmZiBvdXRwdXQ6IG5wbSBydW4gZGlmZicpO1xyXG4gICAgICBjb25zb2xlLmxvZygnICAgLSBUZXN0IGluIGRldmVsb3BtZW50IGVudmlyb25tZW50IGZpcnN0Jyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICAtIEhhdmUgcm9sbGJhY2sgcGxhbiByZWFkeVxcbicpO1xyXG4gICAgICBcclxuICAgIH0gZWxzZSBpZiAoYW5hbHlzaXMuY2hhbmdlZEZpbGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBjb25zb2xlLmxvZygn8J+TrSBObyBjaGFuZ2VzIGRldGVjdGVkIScpO1xyXG4gICAgICBjb25zb2xlLmxvZygnICAgWW91IG1heSB3YW50IHRvOicpO1xyXG4gICAgICBjb25zb2xlLmxvZygnICAgLSBDaGVjayBnaXQgc3RhdHVzOiBnaXQgc3RhdHVzJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICAtIFN0YWdlIHlvdXIgY2hhbmdlczogZ2l0IGFkZCAuJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICAtIFJ1biB2YWxpZGF0aW9uOiBucG0gcnVuIHZhbGlkYXRlXFxuJyk7XHJcbiAgICAgIFxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5sb2coJ/CfpJQgTWl4ZWQgb3IgdW5jbGVhciBjaGFuZ2VzIGRldGVjdGVkIScpO1xyXG4gICAgICBjb25zb2xlLmxvZygnICAgUmVjb21tZW5kYXRpb246IFVzZSBzdGFuZGFyZCBkZXBsb3ltZW50IHdvcmtmbG93Jyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICBXb3JrZmxvdzogU3RhbmRhcmQgRGV2ZWxvcG1lbnQgRGVwbG95Jyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCcgICBDb21tYW5kOiBucG0gcnVuIGRlcGxveTphbGxcXG4nKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIERpc3BsYXkgYXZhaWxhYmxlIHdvcmtmbG93c1xyXG4gICAqL1xyXG4gIGRpc3BsYXlXb3JrZmxvd3MoKTogdm9pZCB7XHJcbiAgICBjb25zb2xlLmxvZygn8J+TmiBBdmFpbGFibGUgV29ya2Zsb3dzOlxcbicpO1xyXG4gICAgXHJcbiAgICBERVZFTE9QTUVOVF9XT1JLRkxPV1MuZm9yRWFjaCgod29ya2Zsb3csIGluZGV4KSA9PiB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGAke2luZGV4ICsgMX0uICR7d29ya2Zsb3cubmFtZX1gKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIERlc2NyaXB0aW9uOiAke3dvcmtmbG93LmRlc2NyaXB0aW9ufWApO1xyXG4gICAgICBjb25zb2xlLmxvZyhgICAgVGltZTogJHt3b3JrZmxvdy5lc3RpbWF0ZWRUaW1lfWApO1xyXG4gICAgICBjb25zb2xlLmxvZyhgICAgVXNlIGNhc2U6ICR7d29ya2Zsb3cudXNlQ2FzZX1gKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIENvbW1hbmRzOmApO1xyXG4gICAgICB3b3JrZmxvdy5jb21tYW5kcy5mb3JFYWNoKGNtZCA9PiB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgICAgLSAke2NtZH1gKTtcclxuICAgICAgfSk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIERpc3BsYXkgZGV2ZWxvcG1lbnQgcmVjb21tZW5kYXRpb25zXHJcbiAgICovXHJcbiAgZGlzcGxheVJlY29tbWVuZGF0aW9ucygpOiB2b2lkIHtcclxuICAgIGNvbnNvbGUubG9nKCfwn5KhIERldmVsb3BtZW50IFJlY29tbWVuZGF0aW9uczpcXG4nKTtcclxuICAgIFxyXG4gICAgT2JqZWN0LmVudHJpZXMoREVWX1JFQ09NTUVOREFUSU9OUykuZm9yRWFjaCgoW2NhdGVnb3J5LCByZWNdKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGAke2NhdGVnb3J5fTpgKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIFJlY29tbWVuZGVkIHdvcmtmbG93OiAke3JlYy53b3JrZmxvd31gKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIFRvb2xzOiAke3JlYy50b29scy5qb2luKCcsICcpfWApO1xyXG4gICAgICBjb25zb2xlLmxvZyhgICAgVGlwczpgKTtcclxuICAgICAgcmVjLnRpcHMuZm9yRWFjaCh0aXAgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgICAgIC0gJHt0aXB9YCk7XHJcbiAgICAgIH0pO1xyXG4gICAgICBjb25zb2xlLmxvZygpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJbnRlcmFjdGl2ZSB3b3JrZmxvdyBzZWxlY3Rpb25cclxuICAgKi9cclxuICBhc3luYyBpbnRlcmFjdGl2ZU1vZGUoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZygn8J+OriBJbnRlcmFjdGl2ZSBXb3JrZmxvdyBTZWxlY3Rpb25cXG4nKTtcclxuICAgIFxyXG4gICAgLy8gQW5hbHl6ZSBjaGFuZ2VzXHJcbiAgICBjb25zdCBhbmFseXNpcyA9IHRoaXMuYW5hbHl6ZUNoYW5nZXMoKTtcclxuICAgIHRoaXMuZGlzcGxheUFuYWx5c2lzKGFuYWx5c2lzKTtcclxuICAgIFxyXG4gICAgLy8gU2hvdyByZWNvbW1lbmRhdGlvbnNcclxuICAgIHRoaXMucmVjb21tZW5kV29ya2Zsb3coYW5hbHlzaXMpO1xyXG4gICAgXHJcbiAgICAvLyBBc2sgaWYgdXNlciB3YW50cyB0byBzZWUgYWxsIHdvcmtmbG93c1xyXG4gICAgY29uc29sZS5sb2coJ1dvdWxkIHlvdSBsaWtlIHRvIHNlZSBhbGwgYXZhaWxhYmxlIHdvcmtmbG93cz8gKHkvbiknKTtcclxuICAgIFxyXG4gICAgLy8gTm90ZTogSW4gYSByZWFsIGltcGxlbWVudGF0aW9uLCB5b3UnZCB1c2UgYSBsaWJyYXJ5IGxpa2UgJ2lucXVpcmVyJyBmb3IgaW50ZXJhY3RpdmUgcHJvbXB0c1xyXG4gICAgLy8gRm9yIG5vdywgd2UnbGwganVzdCBkaXNwbGF5IHRoZSB3b3JrZmxvd3NcclxuICAgIHRoaXMuZGlzcGxheVdvcmtmbG93cygpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRXhlY3V0ZSByZWNvbW1lbmRlZCB3b3JrZmxvd1xyXG4gICAqL1xyXG4gIGV4ZWN1dGVXb3JrZmxvdyh3b3JrZmxvd05hbWU6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgY29uc3Qgd29ya2Zsb3cgPSBERVZFTE9QTUVOVF9XT1JLRkxPV1MuZmluZCh3ID0+IHcubmFtZSA9PT0gd29ya2Zsb3dOYW1lKTtcclxuICAgIFxyXG4gICAgaWYgKCF3b3JrZmxvdykge1xyXG4gICAgICBjb25zb2xlLmxvZyhg4p2MIFdvcmtmbG93ICcke3dvcmtmbG93TmFtZX0nIG5vdCBmb3VuZGApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc29sZS5sb2coYPCfmoAgRXhlY3V0aW5nIHdvcmtmbG93OiAke3dvcmtmbG93Lm5hbWV9XFxuYCk7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+TnSBEZXNjcmlwdGlvbjogJHt3b3JrZmxvdy5kZXNjcmlwdGlvbn1gKTtcclxuICAgIGNvbnNvbGUubG9nKGDij7HvuI8gRXN0aW1hdGVkIHRpbWU6ICR7d29ya2Zsb3cuZXN0aW1hdGVkVGltZX1cXG5gKTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coJ0NvbW1hbmRzIHRvIHJ1bjonKTtcclxuICAgIHdvcmtmbG93LmNvbW1hbmRzLmZvckVhY2goKGNtZCwgaW5kZXgpID0+IHtcclxuICAgICAgY29uc29sZS5sb2coYCR7aW5kZXggKyAxfS4gJHtjbWR9YCk7XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfkqEgUnVuIHRoZXNlIGNvbW1hbmRzIGluIHNlcXVlbmNlLCBvciB1c2UgdGhlIGNvbWJpbmVkIHNjcmlwdCBpZiBhdmFpbGFibGUuJyk7XHJcbiAgfVxyXG59XHJcblxyXG4vLyBDTEkgaW50ZXJmYWNlXHJcbmlmIChyZXF1aXJlLm1haW4gPT09IG1vZHVsZSkge1xyXG4gIGNvbnN0IGFyZ3MgPSBwcm9jZXNzLmFyZ3Yuc2xpY2UoMik7XHJcbiAgY29uc3QgaGVscGVyID0gbmV3IFRyaW5pdHlXb3JrZmxvd0hlbHBlcigpO1xyXG4gIFxyXG4gIGlmIChhcmdzLmluY2x1ZGVzKCctLWhlbHAnKSB8fCBhcmdzLmluY2x1ZGVzKCctaCcpKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgXHJcblRyaW5pdHkgV29ya2Zsb3cgSGVscGVyXHJcblxyXG5Vc2FnZTpcclxuICBucHggdHMtbm9kZSB3b3JrZmxvdy1oZWxwZXIudHMgW2NvbW1hbmRdIFtvcHRpb25zXVxyXG5cclxuQ29tbWFuZHM6XHJcbiAgYW5hbHl6ZSAgICAgICAgICAgICAgQW5hbHl6ZSBjaGFuZ2VzIGFuZCByZWNvbW1lbmQgd29ya2Zsb3cgKGRlZmF1bHQpXHJcbiAgd29ya2Zsb3dzICAgICAgICAgICAgTGlzdCBhbGwgYXZhaWxhYmxlIHdvcmtmbG93c1xyXG4gIHJlY29tbWVuZGF0aW9ucyAgICAgIFNob3cgZGV2ZWxvcG1lbnQgcmVjb21tZW5kYXRpb25zXHJcbiAgaW50ZXJhY3RpdmUgICAgICAgICAgSW50ZXJhY3RpdmUgd29ya2Zsb3cgc2VsZWN0aW9uXHJcbiAgZXhlY3V0ZSA8d29ya2Zsb3c+ICAgU2hvdyBjb21tYW5kcyBmb3Igc3BlY2lmaWMgd29ya2Zsb3dcclxuXHJcbk9wdGlvbnM6XHJcbiAgLS1oZWxwLCAtaCAgICAgICAgICBTaG93IHRoaXMgaGVscCBtZXNzYWdlXHJcblxyXG5FeGFtcGxlczpcclxuICAjIEFuYWx5emUgY2hhbmdlcyBhbmQgZ2V0IHJlY29tbWVuZGF0aW9uc1xyXG4gIG5weCB0cy1ub2RlIHdvcmtmbG93LWhlbHBlci50cyBhbmFseXplXHJcbiAgXHJcbiAgIyBMaXN0IGFsbCB3b3JrZmxvd3NcclxuICBucHggdHMtbm9kZSB3b3JrZmxvdy1oZWxwZXIudHMgd29ya2Zsb3dzXHJcbiAgXHJcbiAgIyBJbnRlcmFjdGl2ZSBtb2RlXHJcbiAgbnB4IHRzLW5vZGUgd29ya2Zsb3ctaGVscGVyLnRzIGludGVyYWN0aXZlXHJcbiAgXHJcbiAgIyBFeGVjdXRlIHNwZWNpZmljIHdvcmtmbG93XHJcbiAgbnB4IHRzLW5vZGUgd29ya2Zsb3ctaGVscGVyLnRzIGV4ZWN1dGUgXCJRdWljayBMYW1iZGEgVXBkYXRlXCJcclxuYCk7XHJcbiAgICBwcm9jZXNzLmV4aXQoMCk7XHJcbiAgfVxyXG4gIFxyXG4gIGNvbnN0IGNvbW1hbmQgPSBhcmdzWzBdIHx8ICdhbmFseXplJztcclxuICBcclxuICBzd2l0Y2ggKGNvbW1hbmQpIHtcclxuICAgIGNhc2UgJ2FuYWx5emUnOlxyXG4gICAgICBjb25zdCBhbmFseXNpcyA9IGhlbHBlci5hbmFseXplQ2hhbmdlcygpO1xyXG4gICAgICBoZWxwZXIuZGlzcGxheUFuYWx5c2lzKGFuYWx5c2lzKTtcclxuICAgICAgaGVscGVyLnJlY29tbWVuZFdvcmtmbG93KGFuYWx5c2lzKTtcclxuICAgICAgYnJlYWs7XHJcbiAgICAgIFxyXG4gICAgY2FzZSAnd29ya2Zsb3dzJzpcclxuICAgICAgaGVscGVyLmRpc3BsYXlXb3JrZmxvd3MoKTtcclxuICAgICAgYnJlYWs7XHJcbiAgICAgIFxyXG4gICAgY2FzZSAncmVjb21tZW5kYXRpb25zJzpcclxuICAgICAgaGVscGVyLmRpc3BsYXlSZWNvbW1lbmRhdGlvbnMoKTtcclxuICAgICAgYnJlYWs7XHJcbiAgICAgIFxyXG4gICAgY2FzZSAnaW50ZXJhY3RpdmUnOlxyXG4gICAgICBoZWxwZXIuaW50ZXJhY3RpdmVNb2RlKCk7XHJcbiAgICAgIGJyZWFrO1xyXG4gICAgICBcclxuICAgIGNhc2UgJ2V4ZWN1dGUnOlxyXG4gICAgICBjb25zdCB3b3JrZmxvd05hbWUgPSBhcmdzWzFdO1xyXG4gICAgICBpZiAoIXdvcmtmbG93TmFtZSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCfinYwgUGxlYXNlIHNwZWNpZnkgYSB3b3JrZmxvdyBuYW1lJyk7XHJcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xyXG4gICAgICB9XHJcbiAgICAgIGhlbHBlci5leGVjdXRlV29ya2Zsb3cod29ya2Zsb3dOYW1lKTtcclxuICAgICAgYnJlYWs7XHJcbiAgICAgIFxyXG4gICAgZGVmYXVsdDpcclxuICAgICAgY29uc29sZS5sb2coYOKdjCBVbmtub3duIGNvbW1hbmQ6ICR7Y29tbWFuZH1gKTtcclxuICAgICAgY29uc29sZS5sb2coJ1VzZSAtLWhlbHAgZm9yIHVzYWdlIGluZm9ybWF0aW9uJyk7XHJcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCB7IFRyaW5pdHlXb3JrZmxvd0hlbHBlciB9OyJdfQ==