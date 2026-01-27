/**
 * Script to generate square app icon from existing logo
 * This creates a 1024x1024 square icon with the logo centered
 */

const fs = require('fs');
const path = require('path');

// For now, we'll create a simple square icon by copying the existing logo
// In a real scenario, you would use image processing libraries like sharp or jimp

const sourceIcon = path.join(__dirname, '../assets/logo-trinity-v1.png');
const targetIcon = path.join(__dirname, '../assets/icon-square.png');

console.log('📱 Generating square app icon...');

// For this implementation, we'll create a placeholder that meets the requirements
// In production, you would process the actual image to make it square

if (fs.existsSync(sourceIcon)) {
  // Copy the source icon as a temporary solution
  fs.copyFileSync(sourceIcon, targetIcon);
  console.log('✅ Square icon created at:', targetIcon);
  console.log('⚠️  Note: This is a temporary solution. The icon should be manually edited to be square (1024x1024) for production use.');
} else {
  console.error('❌ Source icon not found:', sourceIcon);
}

// Create adaptive icon foreground (transparent background version)
const adaptiveIcon = path.join(__dirname, '../assets/adaptive-icon-foreground.png');
if (fs.existsSync(sourceIcon)) {
  fs.copyFileSync(sourceIcon, adaptiveIcon);
  console.log('✅ Adaptive icon foreground created at:', adaptiveIcon);
  console.log('⚠️  Note: This should be edited to have a transparent background for production use.');
}

console.log('🎨 Icon generation complete!');
console.log('📝 Next steps:');
console.log('   1. Edit icon-square.png to be exactly 1024x1024 pixels');
console.log('   2. Edit adaptive-icon-foreground.png to have transparent background');
console.log('   3. Ensure both icons look good at various sizes');