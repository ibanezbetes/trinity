/**
 * AppSync GraphQL Service
 * Handles GraphQL operations with AWS AppSync
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IAppSyncGraphQL } from './appsync.interface';

@Injectable()
export class AppSyncGraphQLService implements IAppSyncGraphQL {
  private readonly logger = new Logger(AppSyncGraphQLService.name);
  private readonly endpointUrl: string;
  private readonly apiKey: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.endpointUrl = this.configService.get('APPSYNC_ENDPOINT_URL', '');
    this.apiKey = this.configService.get('APPSYNC_API_KEY', '');
    this.region = this.configService.get('AWS_REGION', 'us-east-1');

    if (!this.endpointUrl || !this.apiKey) {
      this.logger.warn('AppSync endpoint URL or API key not configured');
    }
  }

  async executeMutation(mutation: string, variables: Record<string, any>): Promise<any> {
    try {
      const response = await this.executeGraphQL(mutation, variables);
      
      if (response.errors) {
        this.logger.error('GraphQL mutation errors:', response.errors);
        throw new Error(`GraphQL mutation failed: ${response.errors[0]?.message}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error('Failed to execute GraphQL mutation:', error);
      throw error;
    }
  }

  async executeQuery(query: string, variables: Record<string, any>): Promise<any> {
    try {
      const response = await this.executeGraphQL(query, variables);
      
      if (response.errors) {
        this.logger.error('GraphQL query errors:', response.errors);
        throw new Error(`GraphQL query failed: ${response.errors[0]?.message}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error('Failed to execute GraphQL query:', error);
      throw error;
    }
  }

  private async executeGraphQL(operation: string, variables: Record<string, any>): Promise<any> {
    const requestBody = {
      query: operation,
      variables,
    };

    const response = await fetch(this.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  getEndpointUrl(): string {
    return this.endpointUrl;
  }

  getApiKey(): string {
    return this.apiKey;
  }
}