#!/usr/bin/env node

/**
 * Create PNG Icon Placeholders
 * Creates placeholder PNG icons for the app
 */

const fs = require('fs');
const path = require('path');

// Simple function to create a minimal PNG placeholder
function createPngPlaceholder(width, height, filename) {
  const assetsDir = path.join(__dirname, '..', 'assets');
  
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  
  // Create a simple base64 encoded PNG (1x1 transparent pixel)
  const transparentPixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  
  // For now, we'll create a simple text file that indicates this is a placeholder
  const placeholderContent = `# PNG Icon Placeholder
# This is a placeholder for ${filename}
# Dimensions: ${width}x${height}
# 
# To replace with actual icon:
# 1. Create a ${width}x${height} PNG image
# 2. Save it as ${filename} in the assets directory
# 3. Remove this placeholder file

# Base64 transparent pixel for reference:
# ${transparentPixel}
`;

  const filePath = path.join(assetsDir, filename + '.placeholder');
  fs.writeFileSync(filePath, placeholderContent);
  
  console.log(`📝 Created placeholder: ${filename}.placeholder (${width}x${height})`);
}

// Create icon placeholders
createPngPlaceholder(1024, 1024, 'icon-square.png');
createPngPlaceholder(1024, 1024, 'adaptive-icon.png');
createPngPlaceholder(1024, 1024, 'splash.png');
createPngPlaceholder(48, 48, 'favicon.png');

console.log('\n✅ Created PNG icon placeholders');
console.log('🎨 Replace these with actual PNG icons for production builds');
console.log('📐 Recommended sizes:');
console.log('   - icon-square.png: 1024x1024');
console.log('   - adaptive-icon.png: 1024x1024 (foreground only)');
console.log('   - splash.png: 1284x2778 (or your preferred splash size)');
console.log('   - favicon.png: 48x48 or 32x32');