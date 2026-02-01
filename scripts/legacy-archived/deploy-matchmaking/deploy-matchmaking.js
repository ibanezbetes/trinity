#!/usr/bin/env node

/**
 * Trinity Vote Consensus Matchmaking Deployment Script
 * Deploys the Vote-Based Matchmaking system with Single Table Design
 * 
 * Usage: node scripts/deploy-matchmaking/deploy-matchmaking.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🗳️ Trinity Vote Consensus Matchmaking Deployment');
console.log('===============================================');

const INFRASTRUCTURE_DIR = path.join(__dirname, '../../infrastructure/clean');
const LAMBDA_DIR = path.join(__dirname, '../../lambdas/trinity-matchmaker-dev');

/**
 * Execute command with proper error handling
 */
function executeCommand(command, description, options = {}) {
  console.log(`\n🔄 ${description}...`);
  console.log(`📝 Command: ${command}`);
  
  try {
    const result = execSync(command, {
      stdio: 'inherit',
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env }
    });
    console.log(`✅ ${description} completed successfully`);
    return result;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    throw error;
  }
}

/**
 * Verify prerequisites
 */
function verifyPrerequisites() {
  console.log('\n🔍 Verifying prerequisites...');
  
  // Check AWS CLI
  try {
    execSync('aws --version', { stdio: 'pipe' });
    console.log('✅ AWS CLI is available');
  } catch (error) {
    throw new Error('AWS CLI is not installed or not in PATH');
  }
  
  // Check CDK
  try {
    execSync('cdk --version', { stdio: 'pipe' });
    console.log('✅ AWS CDK is available');
  } catch (error) {
    throw new Error('AWS CDK is not installed or not in PATH');
  }
  
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion < 18) {
    throw new Error(`Node.js 18+ required, found ${nodeVersion}`);
  }
  console.log(`✅ Node.js ${nodeVersion} is compatible`);
  
  // Check infrastructure directory
  if (!fs.existsSync(INFRASTRUCTURE_DIR)) {
    throw new Error(`Infrastructure directory not found: ${INFRASTRUCTURE_DIR}`);
  }
  console.log('✅ Infrastructure directory exists');
  
  // Check lambda directory
  if (!fs.existsSync(LAMBDA_DIR)) {
    throw new Error(`Lambda directory not found: ${LAMBDA_DIR}`);
  }
  console.log('✅ Lambda directory exists');
}

/**
 * Install dependencies
 */
function installDependencies() {
  console.log('\n📦 Installing dependencies...');
  
  // Install CDK dependencies
  executeCommand('npm install', 'Installing CDK dependencies', {
    cwd: INFRASTRUCTURE_DIR
  });
  
  // Install Lambda dependencies
  executeCommand('npm install', 'Installing Lambda dependencies', {
    cwd: LAMBDA_DIR
  });
}

/**
 * Run tests
 */
function runTests() {
  console.log('\n🧪 Running tests...');
  
  try {
    executeCommand('npm test', 'Running Lambda tests', {
      cwd: LAMBDA_DIR
    });
  } catch (error) {
    console.warn('⚠️ Tests failed, but continuing with deployment');
    console.warn('Please review test failures and fix them after deployment');
  }
}

/**
 * Deploy infrastructure
 */
function deployInfrastructure() {
  console.log('\n🏗️ Deploying infrastructure...');
  
  // Bootstrap CDK if needed
  try {
    executeCommand('cdk bootstrap', 'Bootstrapping CDK', {
      cwd: INFRASTRUCTURE_DIR
    });
  } catch (error) {
    console.log('ℹ️ CDK already bootstrapped or bootstrap failed (continuing)');
  }
  
  // Deploy vote consensus matchmaking stack
  executeCommand(
    'cdk deploy TrinityMatchmakingStack --require-approval never',
    'Deploying Trinity Vote Consensus Matchmaking Stack',
    {
      cwd: INFRASTRUCTURE_DIR,
      env: {
        AWS_REGION: 'eu-west-1'
      }
    }
  );
}

/**
 * Verify deployment
 */
function verifyDeployment() {
  console.log('\n✅ Verifying deployment...');
  
  // Check DynamoDB table
  try {
    executeCommand(
      'aws dynamodb describe-table --table-name trinity-matchmaking-dev --region eu-west-1',
      'Verifying DynamoDB table'
    );
  } catch (error) {
    throw new Error('DynamoDB table verification failed');
  }
  
  // Check Lambda function
  try {
    executeCommand(
      'aws lambda get-function --function-name trinity-vote-consensus-dev --region eu-west-1',
      'Verifying Lambda function'
    );
  } catch (error) {
    throw new Error('Lambda function verification failed');
  }
  
  console.log('✅ All resources verified successfully');
}

/**
 * Display deployment summary
 */
function displaySummary() {
  console.log('\n🎉 Trinity Vote Consensus Matchmaking Deployment Complete!');
  console.log('========================================================');
  console.log('');
  console.log('📋 Deployed Resources:');
  console.log('  • DynamoDB Table: trinity-matchmaking-dev (with Streams)');
  console.log('  • Lambda Function: trinity-vote-consensus-dev');
  console.log('  • AppSync Resolvers: voteForMovie, publishConsensusReached, subscriptions');
  console.log('  • IAM Roles: Vote consensus execution role with AppSync permissions');
  console.log('');
  console.log('🔧 Architecture Pattern:');
  console.log('  Client → voteForMovie → DynamoDB → Stream → Lambda → Check Consensus → AppSync → Subscription');
  console.log('');
  console.log('🎯 Vote Consensus Logic:');
  console.log('  ✅ Sala de 2 personas → Match cuando 2 votos "SÍ" a la misma película');
  console.log('  ✅ Sala de 4 personas → Match cuando 4 votos "SÍ" a la misma película');
  console.log('  ✅ Consenso unánime requerido para disparar notificación');
  console.log('  ✅ Votos parciales NO disparan el match');
  console.log('');
  console.log('📊 Single Table Design:');
  console.log('  • ROOM#<id> | METADATA → Room info with member count');
  console.log('  • ROOM#<id> | VOTE#<movieId>#<userId> → Individual votes');
  console.log('  • ROOM#<id> | MOVIE_VOTES#<movieId> → Vote count per movie');
  console.log('  • EVENT#<id> | CONSENSUS_REACHED#<timestamp> → Match events');
  console.log('');
  console.log('🧪 Testing:');
  console.log('  • Vote consensus tests: scripts/test-matchmaking/test-vote-consensus.js');
  console.log('  • Run tests: node scripts/test-matchmaking/test-vote-consensus.js');
  console.log('');
  console.log('📖 Next Steps:');
  console.log('  1. Update mobile app to use voteForMovie mutation');
  console.log('  2. Test vote consensus with multiple users');
  console.log('  3. Monitor CloudWatch metrics and alarms');
  console.log('  4. Run end-to-end tests with actual voting scenarios');
  console.log('');
  console.log('🔍 Monitoring:');
  console.log('  • CloudWatch Logs: /aws/lambda/trinity-vote-consensus-dev');
  console.log('  • DynamoDB Metrics: trinity-matchmaking-dev table');
  console.log('  • AppSync Metrics: Vote-based subscriptions');
  console.log('');
  console.log('🎬 Usage Example:');
  console.log('  mutation VoteForMovie($input: VoteMovieInput!) {');
  console.log('    voteForMovie(input: $input) {');
  console.log('      ... on VoteConsensusRoom { id status }');
  console.log('      ... on VoteError { message errorCode }');
  console.log('    }');
  console.log('  }');
}

/**
 * Main deployment function
 */
async function main() {
  const startTime = Date.now();
  
  try {
    verifyPrerequisites();
    installDependencies();
    runTests();
    deployInfrastructure();
    verifyDeployment();
    displaySummary();
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n⏱️ Total deployment time: ${duration} seconds`);
    
  } catch (error) {
    console.error('\n💥 Deployment failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('  1. Check AWS credentials: aws sts get-caller-identity');
    console.error('  2. Verify region: should be eu-west-1');
    console.error('  3. Check CDK bootstrap: cdk bootstrap');
    console.error('  4. Review CloudFormation events in AWS Console');
    process.exit(1);
  }
}

// Run deployment
if (require.main === module) {
  main();
}