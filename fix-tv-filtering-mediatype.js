#!/usr/bin/env node

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });
const lambda = new AWS.Lambda();

async function deployMovieHandlerFix() {
    console.log('🔧 Fixing TV filtering mediaType issue...');
    
    try {
        // Create deployment package
        console.log('📦 Creating deployment package...');
        
        const zipPath = path.join(__dirname, 'movie-handler-tv-fix.zip');
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
                
                console.log('\n🎯 TV filtering fix deployed successfully!');
                console.log('📺 TV shows should now appear correctly in rooms with mediaType: "TV"');
                
            } catch (error) {
                console.error('❌ Failed to update Lambda:', error);
                throw error;
            }
        });
        
        archive.on('error', (err) => {
            throw err;
        });
        
        archive.pipe(output);
        
        // Add the fixed handler files
        archive.file('infrastructure/src/handlers/movie.js', { name: 'movie.js' });
        archive.directory('infrastructure/lib/handlers/', 'handlers/');
        archive.directory('infrastructure/lib/services/', 'services/');
        archive.directory('infrastructure/lib/types/', 'types/');
        archive.directory('infrastructure/lib/utils/', 'utils/');
        
        // Add package.json if it exists
        if (fs.existsSync('infrastructure/package.json')) {
            archive.file('infrastructure/package.json', { name: 'package.json' });
        }
        
        await archive.finalize();
        
    } catch (error) {
        console.error('❌ Deployment failed:', error);
        process.exit(1);
    }
}

// Run the deployment
deployMovieHandlerFix().catch(console.error);
