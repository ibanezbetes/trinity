/**
 * Bundle Lambda handlers using esbuild for deployment
 * Creates optimized bundles with all dependencies included
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const HANDLERS_DIR = path.join(__dirname, '..', 'src', 'handlers');
const OUTPUT_DIR = path.join(__dirname, '..', 'lib', 'handlers');

async function bundleHandlers() {
  console.log('🔨 Starting Lambda handler bundling...');
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Get all handler files (exclude base-handler and .d.ts files)
  const handlerFiles = fs.readdirSync(HANDLERS_DIR)
    .filter(file => 
      file.endsWith('.ts') && 
      file.includes('-handler') && 
      !file.includes('base-handler') &&
      !file.endsWith('.d.ts')
    )
    .map(file => ({
      name: file.replace('.ts', ''),
      input: path.join(HANDLERS_DIR, file),
      output: path.join(OUTPUT_DIR, file.replace('.ts', '.js'))
    }));
  
  console.log(`📦 Found ${handlerFiles.length} handlers to bundle:`);
  handlerFiles.forEach(handler => console.log(`   - ${handler.name}`));
  
  // Bundle each handler
  for (const handler of handlerFiles) {
    try {
      console.log(`🔨 Bundling ${handler.name}...`);
      
      await esbuild.build({
        entryPoints: [handler.input],
        bundle: true,
        outfile: handler.output,
        platform: 'node',
        target: 'node18',
        format: 'cjs',
        external: [
          // AWS SDK v3 is available in Lambda runtime
          '@aws-sdk/*'
        ],
        minify: false, // Keep readable for debugging
        sourcemap: true,
        metafile: false,
        logLevel: 'warning'
      });
      
      console.log(`✅ Bundled ${handler.name}`);
    } catch (error) {
      console.error(`❌ Failed to bundle ${handler.name}:`, error);
      process.exit(1);
    }
  }
  
  console.log('✅ All handlers bundled successfully!');
}

// Run bundling
bundleHandlers().catch(error => {
  console.error('❌ Bundling failed:', error);
  process.exit(1);
});