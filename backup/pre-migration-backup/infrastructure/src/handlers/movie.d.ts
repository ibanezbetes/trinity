import { AppSyncResolverHandler } from 'aws-lambda';
/**
 * MovieHandler: Circuit Breaker + Cache
 * Implementa patrón Circuit Breaker para API TMDB con cache en DynamoDB
 */
export declare const handler: AppSyncResolverHandler<any, any>;
