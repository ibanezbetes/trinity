/**
 * Trinity Configuration Stack
 * Manages AWS Systems Manager Parameter Store configuration
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { TrinityParameterStore } from '../config/parameter-store';
import { TrinityEnvironmentConfig } from '../config/environments';

interface TrinityConfigStackProps extends cdk.StackProps {
  config: TrinityEnvironmentConfig;
}

export class TrinityConfigStack extends cdk.Stack {
  public readonly parameterStore: TrinityParameterStore;
  
  constructor(scope: Construct, id: string, props: TrinityConfigStackProps) {
    super(scope, id, props);
    
    const { config } = props;
    
    // Create Parameter Store configuration
    this.parameterStore = new TrinityParameterStore(this, 'ParameterStore', config);
    
    // Output parameter paths for reference
    new cdk.CfnOutput(this, 'ParameterStorePrefix', {
      description: 'Parameter Store prefix for this environment',
      value: `/trinity/${config.environment}`,
      exportName: `${this.stackName}:ParameterStorePrefix`,
    });
    
    new cdk.CfnOutput(this, 'TmdbApiKeyParameter', {
      description: 'TMDB API Key parameter path',
      value: this.parameterStore.parameters.tmdbApiKey.parameterName,
      exportName: `${this.stackName}:TmdbApiKeyParameter`,
    });
    
    new cdk.CfnOutput(this, 'TablesConfigParameter', {
      description: 'DynamoDB tables configuration parameter path',
      value: this.parameterStore.parameters.tableNames.parameterName,
      exportName: `${this.stackName}:TablesConfigParameter`,
    });
    
    // Add tags
    cdk.Tags.of(this).add('Project', 'Trinity');
    cdk.Tags.of(this).add('Environment', config.environment);
    cdk.Tags.of(this).add('Stack', 'Config');
  }
}