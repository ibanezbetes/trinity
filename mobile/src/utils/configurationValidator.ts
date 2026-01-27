/**
 * Configuration Schema Validator
 * Validates app.json configuration for Expo build compliance
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'SCHEMA' | 'ASSET' | 'CONFIGURATION' | 'MISSING_FILE';
  field: string;
  message: string;
  suggestion?: string;
  documentationUrl?: string;
}

export interface ValidationWarning {
  type: 'OPTIMIZATION' | 'COMPATIBILITY' | 'BEST_PRACTICE';
  field: string;
  message: string;
  suggestion?: string;
}

export interface AppConfig {
  expo: {
    name: string;
    slug: string;
    version: string;
    icon: string;
    android?: {
      package: string;
      adaptiveIcon?: {
        foregroundImage: string;
        backgroundColor: string;
      };
    };
    ios?: {
      bundleIdentifier: string;
    };
    plugins?: any[];
    extra?: Record<string, any>;
  };
}

class ConfigurationValidator {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Validate complete app configuration
   */
  validateConfiguration(): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // Load app.json
      const config = this.loadAppConfig();
      if (!config) {
        result.errors.push({
          type: 'MISSING_FILE',
          field: 'app.json',
          message: 'app.json file not found',
          suggestion: 'Create an app.json file in the project root',
          documentationUrl: 'https://docs.expo.dev/workflow/configuration/'
        });
        result.isValid = false;
        return result;
      }

      // Validate schema
      this.validateSchema(config, result);

      // Validate assets
      this.validateAssets(config, result);

      // Validate native project configuration
      this.validateNativeProjectConfig(config, result);

      // Validate authentication configuration
      this.validateAuthConfiguration(config, result);

      // Validate deep link configuration
      this.validateDeepLinkConfiguration(config, result);

      // Set overall validity
      result.isValid = result.errors.length === 0;

    } catch (error: any) {
      result.errors.push({
        type: 'CONFIGURATION',
        field: 'general',
        message: `Configuration validation failed: ${error.message}`,
        suggestion: 'Check app.json syntax and structure'
      });
      result.isValid = false;
    }

    return result;
  }

  /**
   * Load and parse app.json
   */
  private loadAppConfig(): AppConfig | null {
    const configPath = join(this.projectRoot, 'app.json');
    
    if (!existsSync(configPath)) {
      return null;
    }

    try {
      const configContent = readFileSync(configPath, 'utf-8');
      return JSON.parse(configContent) as AppConfig;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate app.json schema compliance
   */
  private validateSchema(config: AppConfig, result: ValidationResult): void {
    const { expo } = config;

    // Required fields
    const requiredFields = ['name', 'slug', 'version'];
    for (const field of requiredFields) {
      if (!expo[field as keyof typeof expo]) {
        result.errors.push({
          type: 'SCHEMA',
          field: `expo.${field}`,
          message: `Required field '${field}' is missing`,
          suggestion: `Add "${field}" to your app.json expo configuration`
        });
      }
    }

    // Check for problematic root-level properties in CNG projects
    if (this.hasNativeFolders()) {
      const problematicProps = ['adaptiveIcon', 'linking'];
      
      for (const prop of problematicProps) {
        if (expo[prop as keyof typeof expo]) {
          result.warnings.push({
            type: 'COMPATIBILITY',
            field: `expo.${prop}`,
            message: `Property '${prop}' at root level may not sync in projects with native folders`,
            suggestion: `Move '${prop}' to platform-specific section (android.${prop} or ios.${prop})`
          });
        }
      }
    }

    // Validate package names
    if (expo.android?.package && expo.ios?.bundleIdentifier) {
      const androidPkg = expo.android.package;
      const iosPkg = expo.ios.bundleIdentifier;
      
      if (androidPkg !== iosPkg) {
        result.warnings.push({
          type: 'BEST_PRACTICE',
          field: 'package',
          message: 'Android package and iOS bundle identifier should match for consistency',
          suggestion: `Use the same identifier: ${androidPkg} or ${iosPkg}`
        });
      }
    }
  }

  /**
   * Validate asset files and requirements
   */
  private validateAssets(config: AppConfig, result: ValidationResult): void {
    const { expo } = config;

    // Validate main icon
    if (expo.icon) {
      this.validateIconAsset(expo.icon, 'expo.icon', result);
    }

    // Validate adaptive icon
    if (expo.android?.adaptiveIcon?.foregroundImage) {
      this.validateIconAsset(
        expo.android.adaptiveIcon.foregroundImage,
        'expo.android.adaptiveIcon.foregroundImage',
        result
      );
    }
  }

  /**
   * Validate individual icon asset
   */
  private validateIconAsset(iconPath: string, fieldName: string, result: ValidationResult): void {
    const fullPath = join(this.projectRoot, iconPath);

    // Check if file exists
    if (!existsSync(fullPath)) {
      result.errors.push({
        type: 'ASSET',
        field: fieldName,
        message: `Icon file not found: ${iconPath}`,
        suggestion: 'Create the icon file or update the path in app.json'
      });
      return;
    }

    // Check file extension
    if (!iconPath.toLowerCase().endsWith('.png')) {
      result.errors.push({
        type: 'ASSET',
        field: fieldName,
        message: `Icon should be a PNG file, but got: ${iconPath}`,
        suggestion: 'Convert icon to PNG format or use a PNG file'
      });
    }

    // Note: In a real implementation, you would check image dimensions here
    // For now, we'll add a warning about manual verification
    result.warnings.push({
      type: 'OPTIMIZATION',
      field: fieldName,
      message: 'Icon dimensions should be verified to be square (1024x1024 recommended)',
      suggestion: 'Use image editing tools to ensure icon is exactly square'
    });
  }

  /**
   * Validate native project configuration
   */
  private validateNativeProjectConfig(config: AppConfig, result: ValidationResult): void {
    const hasNative = this.hasNativeFolders();
    
    if (hasNative) {
      // Check for .easignore file
      const easIgnorePath = join(this.projectRoot, '.easignore');
      if (!existsSync(easIgnorePath)) {
        result.warnings.push({
          type: 'BEST_PRACTICE',
          field: '.easignore',
          message: 'Projects with native folders should have .easignore file',
          suggestion: 'Create .easignore file and add /android and /ios to it'
        });
      }

      // Check for conflicting properties
      const conflictingProps = ['orientation', 'userInterfaceStyle', 'scheme', 'icon', 'splash'];
      for (const prop of conflictingProps) {
        if (config.expo[prop as keyof typeof config.expo]) {
          result.warnings.push({
            type: 'COMPATIBILITY',
            field: `expo.${prop}`,
            message: `Property '${prop}' may not sync when native folders are present`,
            suggestion: 'Consider using Prebuild or configure in native projects directly'
          });
        }
      }
    }
  }

  /**
   * Validate authentication configuration
   */
  private validateAuthConfiguration(config: AppConfig, result: ValidationResult): void {
    const { extra } = config.expo;

    if (!extra) {
      result.warnings.push({
        type: 'CONFIGURATION',
        field: 'expo.extra',
        message: 'No extra configuration found for authentication',
        suggestion: 'Add authentication configuration to expo.extra'
      });
      return;
    }

    // Validate Cognito configuration
    const cognitoFields = ['cognitoUserPoolId', 'cognitoClientId', 'cognitoRegion'];
    for (const field of cognitoFields) {
      if (!extra[field]) {
        result.warnings.push({
          type: 'CONFIGURATION',
          field: `expo.extra.${field}`,
          message: `Missing Cognito configuration: ${field}`,
          suggestion: `Add ${field} to expo.extra configuration`
        });
      }
    }

    // Validate Google Sign-In configuration
    const googleFields = ['googleWebClientId', 'googleAndroidClientId'];
    for (const field of googleFields) {
      if (!extra[field]) {
        result.warnings.push({
          type: 'CONFIGURATION',
          field: `expo.extra.${field}`,
          message: `Missing Google Sign-In configuration: ${field}`,
          suggestion: `Add ${field} to expo.extra configuration`
        });
      }
    }
  }

  /**
   * Validate deep link configuration
   */
  private validateDeepLinkConfiguration(config: AppConfig, result: ValidationResult): void {
    const { expo } = config;

    // Check for scheme
    if (!expo.scheme) {
      result.warnings.push({
        type: 'CONFIGURATION',
        field: 'expo.scheme',
        message: 'No custom URL scheme configured',
        suggestion: 'Add a custom scheme for deep linking'
      });
    }

    // Check Android intent filters
    if (expo.android?.intentFilters) {
      const intentFilters = expo.android.intentFilters;
      
      if (!Array.isArray(intentFilters) || intentFilters.length === 0) {
        result.warnings.push({
          type: 'CONFIGURATION',
          field: 'expo.android.intentFilters',
          message: 'No Android intent filters configured for deep linking',
          suggestion: 'Add intent filters for proper deep link handling on Android'
        });
      }
    }
  }

  /**
   * Check if project has native folders
   */
  private hasNativeFolders(): boolean {
    const androidPath = join(this.projectRoot, 'android');
    const iosPath = join(this.projectRoot, 'ios');
    
    return existsSync(androidPath) || existsSync(iosPath);
  }

  /**
   * Generate validation report
   */
  generateReport(result: ValidationResult): string {
    let report = '📋 Configuration Validation Report\n';
    report += '=====================================\n\n';

    if (result.isValid) {
      report += '✅ Configuration is valid!\n\n';
    } else {
      report += '❌ Configuration has errors that need to be fixed.\n\n';
    }

    if (result.errors.length > 0) {
      report += '🚨 Errors:\n';
      result.errors.forEach((error, index) => {
        report += `${index + 1}. [${error.type}] ${error.field}: ${error.message}\n`;
        if (error.suggestion) {
          report += `   💡 Suggestion: ${error.suggestion}\n`;
        }
        if (error.documentationUrl) {
          report += `   📖 Documentation: ${error.documentationUrl}\n`;
        }
        report += '\n';
      });
    }

    if (result.warnings.length > 0) {
      report += '⚠️  Warnings:\n';
      result.warnings.forEach((warning, index) => {
        report += `${index + 1}. [${warning.type}] ${warning.field}: ${warning.message}\n`;
        if (warning.suggestion) {
          report += `   💡 Suggestion: ${warning.suggestion}\n`;
        }
        report += '\n';
      });
    }

    if (result.errors.length === 0 && result.warnings.length === 0) {
      report += '🎉 No issues found! Your configuration looks great.\n';
    }

    return report;
  }
}

export const configurationValidator = new ConfigurationValidator();
export default ConfigurationValidator;