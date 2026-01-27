/**
 * Configuration Error Handler
 * Provides specific error messages and actionable guidance for configuration issues
 */

import { ValidationResult, ValidationError, ValidationWarning } from './configurationValidator';

export interface ErrorSolution {
  title: string;
  description: string;
  steps: string[];
  codeExample?: string;
  documentationUrl?: string;
  estimatedTime?: string;
}

export interface ErrorGuide {
  error: ValidationError;
  solutions: ErrorSolution[];
  relatedIssues?: string[];
}

export interface WarningGuide {
  warning: ValidationWarning;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendation: string;
  whenToFix: 'IMMEDIATELY' | 'BEFORE_PRODUCTION' | 'OPTIONAL';
}

class ConfigurationErrorHandler {
  /**
   * Generate comprehensive error guidance
   */
  generateErrorGuides(result: ValidationResult): ErrorGuide[] {
    return result.errors.map(error => this.createErrorGuide(error));
  }

  /**
   * Generate warning guidance
   */
  generateWarningGuides(result: ValidationResult): WarningGuide[] {
    return result.warnings.map(warning => this.createWarningGuide(warning));
  }

  /**
   * Create detailed error guide
   */
  private createErrorGuide(error: ValidationError): ErrorGuide {
    const guide: ErrorGuide = {
      error,
      solutions: []
    };

    switch (error.type) {
      case 'SCHEMA':
        guide.solutions = this.getSchemaErrorSolutions(error);
        break;
      case 'ASSET':
        guide.solutions = this.getAssetErrorSolutions(error);
        break;
      case 'CONFIGURATION':
        guide.solutions = this.getConfigurationErrorSolutions(error);
        break;
      case 'MISSING_FILE':
        guide.solutions = this.getMissingFileErrorSolutions(error);
        break;
      default:
        guide.solutions = this.getGenericErrorSolutions(error);
    }

    return guide;
  }

  /**
   * Create warning guide
   */
  private createWarningGuide(warning: ValidationWarning): WarningGuide {
    const guide: WarningGuide = {
      warning,
      impact: this.determineWarningImpact(warning),
      recommendation: this.getWarningRecommendation(warning),
      whenToFix: this.determineWarningUrgency(warning)
    };

    return guide;
  }

  /**
   * Get solutions for schema errors
   */
  private getSchemaErrorSolutions(error: ValidationError): ErrorSolution[] {
    const solutions: ErrorSolution[] = [];

    if (error.field.includes('name')) {
      solutions.push({
        title: 'Add App Name',
        description: 'Your app.json is missing the required "name" field',
        steps: [
          'Open your app.json file',
          'Add a "name" field inside the "expo" object',
          'Use a descriptive name for your app (e.g., "My Awesome App")',
          'Save the file'
        ],
        codeExample: `{
  "expo": {
    "name": "Trinity",
    "slug": "trinity",
    "version": "1.0.0"
  }
}`,
        documentationUrl: 'https://docs.expo.dev/workflow/configuration/#name',
        estimatedTime: '2 minutes'
      });
    }

    if (error.field.includes('slug')) {
      solutions.push({
        title: 'Add App Slug',
        description: 'Your app.json is missing the required "slug" field',
        steps: [
          'Open your app.json file',
          'Add a "slug" field inside the "expo" object',
          'Use lowercase letters, numbers, and hyphens only',
          'Make it unique and descriptive (e.g., "my-awesome-app")',
          'Save the file'
        ],
        codeExample: `{
  "expo": {
    "name": "Trinity",
    "slug": "trinity",
    "version": "1.0.0"
  }
}`,
        documentationUrl: 'https://docs.expo.dev/workflow/configuration/#slug',
        estimatedTime: '2 minutes'
      });
    }

    if (error.field.includes('version')) {
      solutions.push({
        title: 'Add App Version',
        description: 'Your app.json is missing the required "version" field',
        steps: [
          'Open your app.json file',
          'Add a "version" field inside the "expo" object',
          'Use semantic versioning format (e.g., "1.0.0")',
          'Save the file'
        ],
        codeExample: `{
  "expo": {
    "name": "Trinity",
    "slug": "trinity",
    "version": "1.0.0"
  }
}`,
        documentationUrl: 'https://docs.expo.dev/workflow/configuration/#version',
        estimatedTime: '1 minute'
      });
    }

    return solutions;
  }

  /**
   * Get solutions for asset errors
   */
  private getAssetErrorSolutions(error: ValidationError): ErrorSolution[] {
    const solutions: ErrorSolution[] = [];

    if (error.message.includes('not found')) {
      solutions.push({
        title: 'Create Missing Icon File',
        description: 'The icon file specified in your configuration does not exist',
        steps: [
          'Create the assets directory if it doesn\'t exist',
          'Add your icon file to the specified path',
          'Ensure the icon is in PNG format',
          'Make sure the icon is square (1024x1024 recommended)',
          'Update the path in app.json if needed'
        ],
        codeExample: `// File structure should be:
// assets/
//   ├── icon.png (1024x1024)
//   └── adaptive-icon.png (1024x1024)`,
        documentationUrl: 'https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/',
        estimatedTime: '10 minutes'
      });

      solutions.push({
        title: 'Use Icon Generator Tool',
        description: 'Generate proper icon assets automatically',
        steps: [
          'Use online tools like https://easyappicon.com/',
          'Upload your logo or design',
          'Download the generated icon pack',
          'Place the 1024x1024 PNG in your assets folder',
          'Update app.json to point to the correct file'
        ],
        estimatedTime: '5 minutes'
      });
    }

    if (error.message.includes('should be a PNG')) {
      solutions.push({
        title: 'Convert Icon to PNG Format',
        description: 'Expo requires icon files to be in PNG format',
        steps: [
          'Open your current icon file in an image editor',
          'Export/Save as PNG format',
          'Ensure transparency is preserved if needed',
          'Replace the old file with the PNG version',
          'Update the file extension in app.json'
        ],
        codeExample: `{
  "expo": {
    "icon": "./assets/icon.png",  // Must be .png
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png"  // Must be .png
      }
    }
  }
}`,
        estimatedTime: '5 minutes'
      });
    }

    return solutions;
  }

  /**
   * Get solutions for configuration errors
   */
  private getConfigurationErrorSolutions(error: ValidationError): ErrorSolution[] {
    const solutions: ErrorSolution[] = [];

    if (error.field.includes('cognito')) {
      solutions.push({
        title: 'Configure AWS Cognito Settings',
        description: 'Add your AWS Cognito configuration to the app',
        steps: [
          'Get your Cognito User Pool ID from AWS Console',
          'Get your Cognito App Client ID from AWS Console',
          'Add these values to the "extra" section in app.json',
          'Include the region where your User Pool is located'
        ],
        codeExample: `{
  "expo": {
    "extra": {
      "cognitoUserPoolId": "eu-west-1_YourPoolId",
      "cognitoClientId": "your-client-id",
      "cognitoRegion": "eu-west-1"
    }
  }
}`,
        documentationUrl: 'https://docs.aws.amazon.com/cognito/latest/developerguide/',
        estimatedTime: '10 minutes'
      });
    }

    if (error.field.includes('google')) {
      solutions.push({
        title: 'Configure Google Sign-In',
        description: 'Add Google Sign-In configuration for authentication',
        steps: [
          'Go to Google Cloud Console',
          'Create or select your project',
          'Enable Google Sign-In API',
          'Create OAuth 2.0 credentials',
          'Add the client IDs to your app.json'
        ],
        codeExample: `{
  "expo": {
    "extra": {
      "googleWebClientId": "your-web-client-id.apps.googleusercontent.com",
      "googleAndroidClientId": "your-android-client-id.apps.googleusercontent.com"
    }
  }
}`,
        documentationUrl: 'https://docs.expo.dev/guides/google-authentication/',
        estimatedTime: '15 minutes'
      });
    }

    return solutions;
  }

  /**
   * Get solutions for missing file errors
   */
  private getMissingFileErrorSolutions(error: ValidationError): ErrorSolution[] {
    if (error.field === 'app.json') {
      return [{
        title: 'Create app.json Configuration File',
        description: 'Your project is missing the required app.json configuration file',
        steps: [
          'Create a new file named "app.json" in your project root',
          'Add the basic Expo configuration structure',
          'Fill in your app details (name, slug, version)',
          'Add platform-specific configurations as needed'
        ],
        codeExample: `{
  "expo": {
    "name": "Your App Name",
    "slug": "your-app-slug",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FFFFFF"
      }
    },
    "web": {
      "favicon": "./assets/favicon.png"
    }
  }
}`,
        documentationUrl: 'https://docs.expo.dev/workflow/configuration/',
        estimatedTime: '10 minutes'
      }];
    }

    return [];
  }

  /**
   * Get generic error solutions
   */
  private getGenericErrorSolutions(error: ValidationError): ErrorSolution[] {
    return [{
      title: 'General Configuration Fix',
      description: 'Fix the configuration issue',
      steps: [
        'Review the error message carefully',
        'Check the Expo documentation for the specific field',
        'Verify your app.json syntax is valid JSON',
        'Test your configuration with expo doctor'
      ],
      documentationUrl: 'https://docs.expo.dev/workflow/configuration/',
      estimatedTime: '5-15 minutes'
    }];
  }

  /**
   * Determine warning impact level
   */
  private determineWarningImpact(warning: ValidationWarning): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (warning.type === 'COMPATIBILITY') {
      return 'HIGH'; // Compatibility issues can break builds
    }
    if (warning.type === 'CONFIGURATION' && warning.field.includes('auth')) {
      return 'MEDIUM'; // Auth config issues affect functionality
    }
    return 'LOW'; // Most other warnings are optimizations
  }

  /**
   * Get warning recommendation
   */
  private getWarningRecommendation(warning: ValidationWarning): string {
    switch (warning.type) {
      case 'COMPATIBILITY':
        return 'Fix compatibility issues to ensure your app builds correctly across all platforms.';
      case 'CONFIGURATION':
        return 'Complete your configuration to ensure all features work as expected.';
      case 'OPTIMIZATION':
        return 'Apply optimizations to improve app performance and user experience.';
      case 'BEST_PRACTICE':
        return 'Follow best practices to maintain code quality and avoid future issues.';
      default:
        return 'Review and address this warning when convenient.';
    }
  }

  /**
   * Determine when warning should be fixed
   */
  private determineWarningUrgency(warning: ValidationWarning): 'IMMEDIATELY' | 'BEFORE_PRODUCTION' | 'OPTIONAL' {
    if (warning.type === 'COMPATIBILITY') {
      return 'IMMEDIATELY'; // Can break builds
    }
    if (warning.type === 'CONFIGURATION' && warning.field.includes('auth')) {
      return 'BEFORE_PRODUCTION'; // Affects functionality
    }
    return 'OPTIONAL'; // Optimizations and best practices
  }

  /**
   * Generate formatted troubleshooting guide
   */
  generateTroubleshootingGuide(result: ValidationResult): string {
    let guide = '🔧 Configuration Troubleshooting Guide\n';
    guide += '==========================================\n\n';

    const errorGuides = this.generateErrorGuides(result);
    const warningGuides = this.generateWarningGuides(result);

    if (errorGuides.length > 0) {
      guide += '🚨 CRITICAL ERRORS (Must Fix)\n';
      guide += '==============================\n\n';

      errorGuides.forEach((errorGuide, index) => {
        guide += `${index + 1}. ${errorGuide.error.message}\n`;
        guide += `   Field: ${errorGuide.error.field}\n\n`;

        errorGuide.solutions.forEach((solution, sIndex) => {
          guide += `   Solution ${sIndex + 1}: ${solution.title}\n`;
          guide += `   ${solution.description}\n\n`;
          
          guide += '   Steps:\n';
          solution.steps.forEach((step, stepIndex) => {
            guide += `   ${stepIndex + 1}. ${step}\n`;
          });
          
          if (solution.codeExample) {
            guide += '\n   Code Example:\n';
            guide += solution.codeExample.split('\n').map(line => `   ${line}`).join('\n');
            guide += '\n';
          }
          
          if (solution.documentationUrl) {
            guide += `\n   📖 Documentation: ${solution.documentationUrl}\n`;
          }
          
          if (solution.estimatedTime) {
            guide += `   ⏱️  Estimated Time: ${solution.estimatedTime}\n`;
          }
          
          guide += '\n';
        });

        guide += '---\n\n';
      });
    }

    if (warningGuides.length > 0) {
      guide += '⚠️  WARNINGS (Recommended Fixes)\n';
      guide += '=================================\n\n';

      // Group warnings by urgency
      const immediateWarnings = warningGuides.filter(w => w.whenToFix === 'IMMEDIATELY');
      const productionWarnings = warningGuides.filter(w => w.whenToFix === 'BEFORE_PRODUCTION');
      const optionalWarnings = warningGuides.filter(w => w.whenToFix === 'OPTIONAL');

      if (immediateWarnings.length > 0) {
        guide += '🔴 Fix Immediately:\n';
        immediateWarnings.forEach(w => {
          guide += `• ${w.warning.message}\n`;
          guide += `  ${w.recommendation}\n\n`;
        });
      }

      if (productionWarnings.length > 0) {
        guide += '🟡 Fix Before Production:\n';
        productionWarnings.forEach(w => {
          guide += `• ${w.warning.message}\n`;
          guide += `  ${w.recommendation}\n\n`;
        });
      }

      if (optionalWarnings.length > 0) {
        guide += '🟢 Optional Improvements:\n';
        optionalWarnings.forEach(w => {
          guide += `• ${w.warning.message}\n`;
          guide += `  ${w.recommendation}\n\n`;
        });
      }
    }

    if (errorGuides.length === 0 && warningGuides.length === 0) {
      guide += '🎉 No issues found! Your configuration is ready for build.\n\n';
      guide += 'Next steps:\n';
      guide += '1. Run "expo build" or "eas build" to create your app\n';
      guide += '2. Test your app on physical devices\n';
      guide += '3. Submit to app stores when ready\n';
    }

    return guide;
  }
}

export const configurationErrorHandler = new ConfigurationErrorHandler();
export default ConfigurationErrorHandler;