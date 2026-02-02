#!/usr/bin/env node

/**
 * Generate aws-exports.json from CDK outputs
 * This script reads CDK outputs and generates the AWS configuration for the mobile app
 */

const fs = require('fs');
const path = require('path');

/**
 * Default configuration for different environments
 */
const DEFAULT_CONFIG = {
  production: {
    aws_project_region: 'eu-west-1',
    aws_cognito_region: 'eu-west-1',
    aws_user_pools_id: 'eu-west-1_TSlG71OQi',
    aws_user_pools_web_client_id: '3k120srs09npek1qbfhgip63n',
    aws_cognito_identity_pool_id: '',
    aws_cognito_signup_attributes: ['EMAIL'],
    aws_cognito_mfa_configuration: 'OFF',
    aws_cognito_mfa_types: ['SMS'],
    aws_cognito_password_protection_settings: {
      passwordPolicyMinLength: 8,
      passwordPolicyCharacters: []
    },
    aws_cognito_verification_mechanisms: ['EMAIL'],
    aws_appsync_graphqlEndpoint: 'https://b7vef3wm6jhfddfazbpru5ngki.appsync-api.eu-west-1.amazonaws.com/graphql',
    aws_appsync_region: 'eu-west-1',
    aws_appsync_authenticationType: 'AMAZON_COGNITO_USER_POOLS',
    aws_appsync_apiKey: '',
    aws_appsync_additionalAuthenticationTypes: [],
    oauth: {
      domain: '',
      scope: ['phone', 'email', 'openid', 'profile', 'aws.cognito.signin.user.admin'],
      redirectSignIn: 'trinity://auth/',
      redirectSignOut: 'trinity://auth/',
      responseType: 'code'
    }
  },
  development: {
    aws_project_region: 'eu-west-1',
    aws_cognito_region: 'eu-west-1',
    aws_user_pools_id: 'eu-west-1_TSlG71OQi',
    aws_user_pools_web_client_id: '3k120srs09npek1qbfhgip63n',
    aws_cognito_identity_pool_id: '',
    aws_cognito_signup_attributes: ['EMAIL'],
    aws_cognito_mfa_configuration: 'OFF',
    aws_cognito_mfa_types: ['SMS'],
    aws_cognito_password_protection_settings: {
      passwordPolicyMinLength: 8,
      passwordPolicyCharacters: []
    },
    aws_cognito_verification_mechanisms: ['EMAIL'],
    aws_appsync_graphqlEndpoint: 'https://b7vef3wm6jhfddfazbpru5ngki.appsync-api.eu-west-1.amazonaws.com/graphql',
    aws_appsync_region: 'eu-west-1',
    aws_appsync_authenticationType: 'AMAZON_COGNITO_USER_POOLS',
    aws_appsync_apiKey: '',
    aws_appsync_additionalAuthenticationTypes: [],
    oauth: {
      domain: '',
      scope: ['phone', 'email', 'openid', 'profile', 'aws.cognito.signin.user.admin'],
      redirectSignIn: 'trinity://auth/',
      redirectSignOut: 'trinity://auth/',
      responseType: 'code'
    }
  }
};

class AWSExportsGenerator {
  constructor(environment = 'production') {
    this.environment = environment;
    this.config = { ...DEFAULT_CONFIG[environment] };
    
    if (!this.config) {
      throw new Error(`Invalid environment: ${environment}. Use 'production' or 'development'`);
    }
    
    console.log(`🔧 Generating AWS exports for ${environment} environment...`);
  }

  /**
   * Load CDK outputs if available
   */
  loadCDKOutputs() {
    const cdkOutputsPath = path.join('..', 'infrastructure', 'clean', 'cdk-outputs.json');
    
    if (fs.existsSync(cdkOutputsPath)) {
      try {
        const cdkOutputs = JSON.parse(fs.readFileSync(cdkOutputsPath, 'utf8'));
        console.log('📄 Loading CDK outputs...');
        
        // Map CDK outputs to AWS exports configuration
        this.mapCDKOutputs(cdkOutputs);
        
      } catch (error) {
        console.warn('⚠️ Failed to load CDK outputs, using default configuration');
        console.warn('Error:', error.message);
      }
    } else {
      console.log('📄 CDK outputs not found, using default configuration');
    }
  }

  /**
   * Map CDK outputs to AWS exports format
   */
  mapCDKOutputs(cdkOutputs) {
    // Look for relevant stack outputs
    for (const [stackName, outputs] of Object.entries(cdkOutputs)) {
      console.log(`📋 Processing stack: ${stackName}`);
      
      // Map Cognito outputs
      if (outputs.UserPoolId) {
        this.config.aws_user_pools_id = outputs.UserPoolId;
        console.log(`✅ User Pool ID: ${outputs.UserPoolId}`);
      }
      
      if (outputs.UserPoolClientId) {
        this.config.aws_user_pools_web_client_id = outputs.UserPoolClientId;
        console.log(`✅ User Pool Client ID: ${outputs.UserPoolClientId}`);
      }
      
      if (outputs.IdentityPoolId) {
        this.config.aws_cognito_identity_pool_id = outputs.IdentityPoolId;
        console.log(`✅ Identity Pool ID: ${outputs.IdentityPoolId}`);
      }
      
      // Map AppSync outputs
      if (outputs.GraphQLAPIEndpoint) {
        this.config.aws_appsync_graphqlEndpoint = outputs.GraphQLAPIEndpoint;
        console.log(`✅ GraphQL Endpoint: ${outputs.GraphQLAPIEndpoint}`);
      }
      
      if (outputs.GraphQLAPIKey) {
        this.config.aws_appsync_apiKey = outputs.GraphQLAPIKey;
        console.log(`✅ GraphQL API Key: ${outputs.GraphQLAPIKey.substring(0, 10)}...`);
      }
      
      // Map OAuth domain
      if (outputs.OAuthDomain) {
        this.config.oauth.domain = outputs.OAuthDomain;
        console.log(`✅ OAuth Domain: ${outputs.OAuthDomain}`);
      }
    }
  }

  /**
   * Generate aws-exports.js file
   */
  generateExports() {
    const exportsContent = `// Auto-generated AWS configuration for ${this.environment} environment
// Generated on: ${new Date().toISOString()}

const awsconfig = ${JSON.stringify(this.config, null, 2)};

export default awsconfig;
`;
    
    const outputPath = path.join('src', 'aws-exports.js');
    
    // Ensure src directory exists
    const srcDir = path.dirname(outputPath);
    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, exportsContent);
    console.log(`✅ AWS exports generated: ${outputPath}`);
    
    return outputPath;
  }

  /**
   * Generate aws-exports.json file for React Native
   */
  generateJSONExports() {
    const outputPath = path.join('src', 'aws-exports.json');
    
    // Ensure src directory exists
    const srcDir = path.dirname(outputPath);
    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(this.config, null, 2));
    console.log(`✅ AWS exports JSON generated: ${outputPath}`);
    
    return outputPath;
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    const requiredFields = [
      'aws_user_pools_id',
      'aws_user_pools_web_client_id',
      'aws_appsync_graphqlEndpoint'
    ];
    
    const missingFields = requiredFields.filter(field => !this.config[field]);
    
    if (missingFields.length > 0) {
      console.warn('⚠️ Missing required configuration fields:');
      missingFields.forEach(field => console.warn(`   - ${field}`));
      return false;
    }
    
    console.log('✅ Configuration validation passed');
    return true;
  }

  /**
   * Generate all export formats
   */
  generate() {
    try {
      this.loadCDKOutputs();
      
      if (!this.validateConfig()) {
        console.warn('⚠️ Configuration validation failed, but continuing with available values');
      }
      
      const jsPath = this.generateExports();
      const jsonPath = this.generateJSONExports();
      
      console.log('\n🎉 AWS exports generation completed!');
      console.log(`📄 JavaScript: ${jsPath}`);
      console.log(`📄 JSON: ${jsonPath}`);
      
      return { jsPath, jsonPath };
      
    } catch (error) {
      console.error('❌ Failed to generate AWS exports:', error.message);
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const environment = process.argv[2] || 'production';
  
  if (!['production', 'development'].includes(environment)) {
    console.error('Usage: node generate-aws-exports.js [production|development]');
    process.exit(1);
  }
  
  const generator = new AWSExportsGenerator(environment);
  generator.generate().catch(() => process.exit(1));
}

module.exports = AWSExportsGenerator;