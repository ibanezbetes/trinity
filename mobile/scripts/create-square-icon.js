/**
 * Create a simple square icon for testing
 * This creates a 1024x1024 solid color icon as a placeholder
 */

const fs = require('fs');
const path = require('path');

// Create a simple SVG square icon
const svgIcon = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0D0D0F"/>
  <circle cx="512" cy="512" r="300" fill="#FFFFFF" stroke="#666666" stroke-width="4"/>
  <text x="512" y="540" font-family="Arial, sans-serif" font-size="120" font-weight="bold" text-anchor="middle" fill="#0D0D0F">T</text>
</svg>`;

const iconPath = path.join(__dirname, '../assets/icon-square.svg');
const adaptiveIconPath = path.join(__dirname, '../assets/adaptive-icon-foreground.svg');

// Write the SVG files
fs.writeFileSync(iconPath, svgIcon);
fs.writeFileSync(adaptiveIconPath, svgIcon);

console.log('✅ Created square SVG icons:');
console.log('   - icon-square.svg');
console.log('   - adaptive-icon-foreground.svg');
console.log('📝 Note: SVG icons are vector-based and will scale properly');
console.log('🎨 For production, replace with proper PNG icons at 1024x1024 resolution');