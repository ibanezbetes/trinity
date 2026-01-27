/**
 * Asset Validation System
 * Validates app icons, splash screens, and other assets for Expo build compliance
 */

import { existsSync, statSync, readFileSync } from 'fs';
import { join, extname } from 'path';

export interface AssetValidationResult {
  isValid: boolean;
  assets: AssetInfo[];
  errors: AssetError[];
  warnings: AssetWarning[];
  optimizations: AssetOptimization[];
}

export interface AssetInfo {
  path: string;
  type: 'ICON' | 'ADAPTIVE_ICON' | 'SPLASH' | 'OTHER';
  exists: boolean;
  format: string;
  dimensions?: { width: number; height: number };
  size: number;
  isSquare?: boolean;
  isOptimized?: boolean;
}

export interface AssetError {
  type: 'MISSING_FILE' | 'INVALID_FORMAT' | 'INVALID_DIMENSIONS' | 'CORRUPTED_FILE';
  asset: string;
  message: string;
  expected?: string;
  actual?: string;
  suggestion?: string;
}

export interface AssetWarning {
  type: 'SUBOPTIMAL_SIZE' | 'LARGE_FILE' | 'QUALITY_ISSUE' | 'COMPATIBILITY';
  asset: string;
  message: string;
  suggestion?: string;
}

export interface AssetOptimization {
  asset: string;
  type: 'RESIZE' | 'COMPRESS' | 'FORMAT_CHANGE' | 'QUALITY_ADJUST';
  description: string;
  estimatedSavings?: string;
}

export interface AssetRequirements {
  icon: {
    format: 'PNG';
    minSize: { width: 1024; height: 1024 };
    maxSize: { width: 1024; height: 1024 };
    aspectRatio: 1;
  };
  adaptiveIcon: {
    format: 'PNG';
    minSize: { width: 1024; height: 1024 };
    maxSize: { width: 1024; height: 1024 };
    aspectRatio: 1;
    transparentBackground: true;
  };
  splash: {
    format: 'PNG';
    minSize: { width: 1242; height: 2208 };
    maxSize: { width: 2048; height: 2732 };
  };
}

class AssetValidator {
  private projectRoot: string;
  private requirements: AssetRequirements;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.requirements = {
      icon: {
        format: 'PNG',
        minSize: { width: 1024, height: 1024 },
        maxSize: { width: 1024, height: 1024 },
        aspectRatio: 1
      },
      adaptiveIcon: {
        format: 'PNG',
        minSize: { width: 1024, height: 1024 },
        maxSize: { width: 1024, height: 1024 },
        aspectRatio: 1,
        transparentBackground: true
      },
      splash: {
        format: 'PNG',
        minSize: { width: 1242, height: 2208 },
        maxSize: { width: 2048, height: 2732 }
      }
    };
  }

  /**
   * Validate all assets in the project
   */
  validateAssets(assetPaths: string[]): AssetValidationResult {
    const result: AssetValidationResult = {
      isValid: true,
      assets: [],
      errors: [],
      warnings: [],
      optimizations: []
    };

    try {
      for (const assetPath of assetPaths) {
        const assetInfo = this.analyzeAsset(assetPath, result);
        result.assets.push(assetInfo);
      }

      // Validate specific asset types
      this.validateIcons(result);
      this.validateSplashScreens(result);
      this.checkOptimizations(result);

      // Set overall validity
      result.isValid = result.errors.length === 0;

    } catch (error: any) {
      result.errors.push({
        type: 'CORRUPTED_FILE',
        asset: 'general',
        message: `Asset validation failed: ${error.message}`,
        suggestion: 'Check asset files and permissions'
      });
      result.isValid = false;
    }

    return result;
  }

  /**
   * Analyze a single asset file
   */
  private analyzeAsset(assetPath: string, result: AssetValidationResult): AssetInfo {
    const fullPath = join(this.projectRoot, assetPath);
    const assetType = this.determineAssetType(assetPath);

    const assetInfo: AssetInfo = {
      path: assetPath,
      type: assetType,
      exists: existsSync(fullPath),
      format: this.getFileFormat(assetPath),
      size: 0
    };

    if (!assetInfo.exists) {
      result.errors.push({
        type: 'MISSING_FILE',
        asset: assetPath,
        message: `Asset file not found: ${assetPath}`,
        suggestion: 'Create the asset file or update the path'
      });
      return assetInfo;
    }

    try {
      const stats = statSync(fullPath);
      assetInfo.size = stats.size;

      // Get image dimensions (simplified - in real implementation use image library)
      const dimensions = this.getImageDimensions(fullPath);
      if (dimensions) {
        assetInfo.dimensions = dimensions;
        assetInfo.isSquare = dimensions.width === dimensions.height;
      }

      // Check if optimized
      assetInfo.isOptimized = this.checkIfOptimized(assetInfo);

    } catch (error: any) {
      result.errors.push({
        type: 'CORRUPTED_FILE',
        asset: assetPath,
        message: `Cannot read asset file: ${error.message}`,
        suggestion: 'Check file permissions and integrity'
      });
    }

    return assetInfo;
  }

  /**
   * Determine asset type from path
   */
  private determineAssetType(assetPath: string): AssetInfo['type'] {
    const fileName = assetPath.toLowerCase();
    
    if (fileName.includes('adaptive') && fileName.includes('icon')) {
      return 'ADAPTIVE_ICON';
    }
    if (fileName.includes('icon')) {
      return 'ICON';
    }
    if (fileName.includes('splash')) {
      return 'SPLASH';
    }
    
    return 'OTHER';
  }

  /**
   * Get file format from extension
   */
  private getFileFormat(filePath: string): string {
    return extname(filePath).toLowerCase().replace('.', '').toUpperCase();
  }

  /**
   * Get image dimensions (simplified implementation)
   */
  private getImageDimensions(filePath: string): { width: number; height: number } | null {
    try {
      // This is a simplified implementation
      // In a real app, you would use an image processing library like sharp or jimp
      
      const buffer = readFileSync(filePath);
      
      // Check for PNG signature and try to read dimensions from IHDR chunk
      if (buffer.length >= 24 && buffer.toString('hex', 0, 8) === '89504e470d0a1a0a') {
        // PNG file - read dimensions from IHDR chunk
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }
      
      // For other formats or if we can't read dimensions, return null
      // In production, use proper image libraries
      return null;
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if asset is optimized
   */
  private checkIfOptimized(assetInfo: AssetInfo): boolean {
    // Simple heuristics for optimization
    if (assetInfo.type === 'ICON' || assetInfo.type === 'ADAPTIVE_ICON') {
      // Icons should be reasonably sized (not too large for 1024x1024)
      return assetInfo.size < 500000; // 500KB threshold
    }
    
    if (assetInfo.type === 'SPLASH') {
      // Splash screens can be larger but should still be reasonable
      return assetInfo.size < 2000000; // 2MB threshold
    }
    
    return true;
  }

  /**
   * Validate icon assets
   */
  private validateIcons(result: AssetValidationResult): void {
    const icons = result.assets.filter(asset => 
      asset.type === 'ICON' || asset.type === 'ADAPTIVE_ICON'
    );

    for (const icon of icons) {
      if (!icon.exists) continue;

      const requirements = icon.type === 'ICON' ? 
        this.requirements.icon : 
        this.requirements.adaptiveIcon;

      // Check format
      if (icon.format !== requirements.format) {
        result.errors.push({
          type: 'INVALID_FORMAT',
          asset: icon.path,
          message: `Icon should be ${requirements.format} format`,
          expected: requirements.format,
          actual: icon.format,
          suggestion: `Convert ${icon.path} to ${requirements.format} format`
        });
      }

      // Check dimensions
      if (icon.dimensions) {
        const { width, height } = icon.dimensions;
        const reqSize = requirements.minSize;

        if (width !== reqSize.width || height !== reqSize.height) {
          result.errors.push({
            type: 'INVALID_DIMENSIONS',
            asset: icon.path,
            message: `Icon dimensions should be ${reqSize.width}x${reqSize.height}`,
            expected: `${reqSize.width}x${reqSize.height}`,
            actual: `${width}x${height}`,
            suggestion: `Resize ${icon.path} to ${reqSize.width}x${reqSize.height} pixels`
          });
        }

        // Check if square
        if (!icon.isSquare) {
          result.errors.push({
            type: 'INVALID_DIMENSIONS',
            asset: icon.path,
            message: 'Icon must be square (1:1 aspect ratio)',
            expected: '1:1 aspect ratio',
            actual: `${width}:${height} aspect ratio`,
            suggestion: 'Make the icon square by adjusting width or height'
          });
        }
      }

      // Check file size
      if (icon.size > 1000000) { // 1MB
        result.warnings.push({
          type: 'LARGE_FILE',
          asset: icon.path,
          message: `Large icon file (${Math.round(icon.size / 1024)}KB)`,
          suggestion: 'Optimize icon to reduce file size'
        });
      }

      // Check optimization
      if (!icon.isOptimized) {
        result.optimizations.push({
          asset: icon.path,
          type: 'COMPRESS',
          description: 'Icon can be compressed to reduce file size',
          estimatedSavings: '20-50%'
        });
      }
    }
  }

  /**
   * Validate splash screen assets
   */
  private validateSplashScreens(result: AssetValidationResult): void {
    const splashScreens = result.assets.filter(asset => asset.type === 'SPLASH');

    for (const splash of splashScreens) {
      if (!splash.exists) continue;

      // Check format
      if (splash.format !== 'PNG') {
        result.warnings.push({
          type: 'COMPATIBILITY',
          asset: splash.path,
          message: 'Splash screen should preferably be PNG format',
          suggestion: 'Convert to PNG for better compatibility'
        });
      }

      // Check dimensions
      if (splash.dimensions) {
        const { width, height } = splash.dimensions;
        const minSize = this.requirements.splash.minSize;

        if (width < minSize.width || height < minSize.height) {
          result.warnings.push({
            type: 'SUBOPTIMAL_SIZE',
            asset: splash.path,
            message: `Splash screen may be too small (${width}x${height})`,
            suggestion: `Consider using at least ${minSize.width}x${minSize.height} for better quality`
          });
        }
      }

      // Check file size
      if (splash.size > 5000000) { // 5MB
        result.warnings.push({
          type: 'LARGE_FILE',
          asset: splash.path,
          message: `Large splash screen file (${Math.round(splash.size / 1024 / 1024)}MB)`,
          suggestion: 'Optimize splash screen to reduce app size'
        });
      }
    }
  }

  /**
   * Check for optimization opportunities
   */
  private checkOptimizations(result: AssetValidationResult): void {
    for (const asset of result.assets) {
      if (!asset.exists) continue;

      // Suggest format changes
      if (asset.format === 'JPG' || asset.format === 'JPEG') {
        if (asset.type === 'ICON' || asset.type === 'ADAPTIVE_ICON') {
          result.optimizations.push({
            asset: asset.path,
            type: 'FORMAT_CHANGE',
            description: 'Convert JPEG to PNG for icons to support transparency',
            estimatedSavings: 'Better quality'
          });
        }
      }

      // Suggest resizing for oversized assets
      if (asset.dimensions) {
        const { width, height } = asset.dimensions;
        
        if (asset.type === 'ICON' && (width > 1024 || height > 1024)) {
          result.optimizations.push({
            asset: asset.path,
            type: 'RESIZE',
            description: `Resize from ${width}x${height} to 1024x1024`,
            estimatedSavings: '30-70%'
          });
        }
      }

      // Suggest compression for large files
      if (asset.size > 500000 && asset.type !== 'SPLASH') {
        result.optimizations.push({
          asset: asset.path,
          type: 'COMPRESS',
          description: 'Compress image to reduce file size',
          estimatedSavings: '20-50%'
        });
      }
    }
  }

  /**
   * Generate asset validation report
   */
  generateReport(result: AssetValidationResult): string {
    let report = '🖼️  Asset Validation Report\n';
    report += '==========================\n\n';

    if (result.isValid) {
      report += '✅ All assets are valid!\n\n';
    } else {
      report += '❌ Asset validation issues found.\n\n';
    }

    // Summary
    report += `📊 Summary:\n`;
    report += `   Assets analyzed: ${result.assets.length}\n`;
    report += `   Errors: ${result.errors.length}\n`;
    report += `   Warnings: ${result.warnings.length}\n`;
    report += `   Optimization opportunities: ${result.optimizations.length}\n\n`;

    // Asset details
    if (result.assets.length > 0) {
      report += '📋 Asset Details:\n';
      result.assets.forEach(asset => {
        const status = asset.exists ? '✅' : '❌';
        const dimensions = asset.dimensions ? 
          `${asset.dimensions.width}x${asset.dimensions.height}` : 
          'Unknown';
        const size = asset.exists ? 
          `${Math.round(asset.size / 1024)}KB` : 
          'N/A';
        
        report += `${status} ${asset.path}\n`;
        report += `   Type: ${asset.type}, Format: ${asset.format}\n`;
        report += `   Dimensions: ${dimensions}, Size: ${size}\n\n`;
      });
    }

    // Errors
    if (result.errors.length > 0) {
      report += '🚨 Errors:\n';
      result.errors.forEach((error, index) => {
        report += `${index + 1}. [${error.type}] ${error.asset}: ${error.message}\n`;
        if (error.expected && error.actual) {
          report += `   Expected: ${error.expected}, Actual: ${error.actual}\n`;
        }
        if (error.suggestion) {
          report += `   💡 Suggestion: ${error.suggestion}\n`;
        }
        report += '\n';
      });
    }

    // Warnings
    if (result.warnings.length > 0) {
      report += '⚠️  Warnings:\n';
      result.warnings.forEach((warning, index) => {
        report += `${index + 1}. [${warning.type}] ${warning.asset}: ${warning.message}\n`;
        if (warning.suggestion) {
          report += `   💡 Suggestion: ${warning.suggestion}\n`;
        }
        report += '\n';
      });
    }

    // Optimizations
    if (result.optimizations.length > 0) {
      report += '🚀 Optimization Opportunities:\n';
      result.optimizations.forEach((opt, index) => {
        report += `${index + 1}. [${opt.type}] ${opt.asset}: ${opt.description}\n`;
        if (opt.estimatedSavings) {
          report += `   💾 Estimated savings: ${opt.estimatedSavings}\n`;
        }
        report += '\n';
      });
    }

    return report;
  }
}

export const assetValidator = new AssetValidator();
export default AssetValidator;