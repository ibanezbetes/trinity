#!/usr/bin/env node

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });
const lambda = new AWS.Lambda();

async function deployMovieHandlerWithCorrectStructure() {
    console.log('🔧 Fixing Lambda deployment with correct structure...');
    
    try {
        // Create deployment package
        console.log('📦 Creating deployment package with correct structure...');
        
        const zipPath = path.join(__dirname, 'movie-handler-fixed-structure.zip');
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        output.on('close', async () => {
            console.log(`✅ Package created: ${archive.pointer()} bytes`);
            
            try {
                // Update Lambda function
                console.log('🚀 Updating Lambda function...');
                
                const zipBuffer = fs.readFileSync(zipPath);
                
                const updateParams = {
                    FunctionName: 'trinity-movie-dev',
                    ZipFile: zipBuffer
                };
                
                const result = await lambda.updateFunctionCode(updateParams).promise();
                console.log('✅ Lambda function updated successfully');
                console.log(`📍 Function ARN: ${result.FunctionArn}`);
                console.log(`🔄 Last Modified: ${result.LastModified}`);
                
                // Clean up
                fs.unlinkSync(zipPath);
                console.log('🧹 Cleanup completed');
                
                console.log('\n🎯 Lambda deployment with correct structure completed!');
                
            } catch (error) {
                console.error('❌ Failed to update Lambda:', error);
                throw error;
            }
        });
        
        archive.on('error', (err) => {
            throw err;
        });
        
        archive.pipe(output);
        
        // Add files with correct structure to match the imports
        console.log('📁 Adding files with correct directory structure...');
        
        // Main handler file (this will be at root level in Lambda)
        archive.file('infrastructure/src/handlers/movie.js', { name: 'movie.js' });
        
        // Services directory (to match ../services/ import)
        archive.directory('infrastructure/lib/services/', 'services/');
        
        // Handlers directory (to match any handler imports)
        archive.directory('infrastructure/lib/handlers/', 'handlers/');
        
        // Types directory (to match any type imports)
        archive.directory('infrastructure/lib/types/', 'types/');
        
        // Utils directory (to match any util imports)
        archive.directory('infrastructure/lib/utils/', 'utils/');
        
        // Add package.json if it exists
        if (fs.existsSync('infrastructure/package.json')) {
            archive.file('infrastructure/package.json', { name: 'package.json' });
        }
        
        console.log('📁 Directory structure in Lambda will be:');
        console.log('  /var/task/movie.js (main handler)');
        console.log('  /var/task/services/ (content-filter-service, etc.)');
        console.log('  /var/task/handlers/ (other handlers)');
        console.log('  /var/task/types/ (type definitions)');
        console.log('  /var/task/utils/ (utility functions)');
        
        await archive.finalize();
        
    } catch (error) {
        console.error('❌ Deployment failed:', error);
        process.exit(1);
    }
}

// Run the deployment
deployMovieHandlerWithCorrectStructure().catch(console.error);
