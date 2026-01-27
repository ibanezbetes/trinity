import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for validating invite codes from web landing page
 *
 * This handler is called by the web landing page to validate invite codes
 * and return room information for display.
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
