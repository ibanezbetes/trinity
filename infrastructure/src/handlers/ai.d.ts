import { AppSyncResolverHandler } from 'aws-lambda';
declare global {
    function fetch(input: string, init?: any): Promise<any>;
}
/**
 * AIHandler: Chat Contextual con Trini (Salamandra)
 * Integración con Hugging Face Inference API usando el modelo Salamandra-7b-instruct
 */
export declare const handler: AppSyncResolverHandler<any, any>;
