import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { deepLinkService } from '../services/deepLinkService';
import { logBusinessMetric, logError, PerformanceTimer } from '../utils/metrics';

/**
 * Lambda handler for validating invite codes from web landing page
 * 
 * This handler is called by the web landing page to validate invite codes
 * and return room information for display.
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const timer = new PerformanceTimer('ValidateInviteHandler');
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          valid: false,
          error: 'Request body is required',
        }),
      };
    }

    const { inviteCode } = JSON.parse(event.body);

    if (!inviteCode || inviteCode.trim() === '') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          valid: false,
          error: 'Invite code is required',
        }),
      };
    }

    // Validate invite code format
    if (!/^[A-Z0-9]{6}$/i.test(inviteCode.trim())) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          valid: false,
          error: 'Invalid invite code format',
        }),
      };
    }

    const normalizedCode = inviteCode.trim().toUpperCase();
    console.log(`🔍 Web validation request for invite code: ${normalizedCode}`);

    // Validate the invite code
    const roomInfo = await deepLinkService.validateInviteCode(normalizedCode);

    if (roomInfo) {
      // Log successful validation
      logBusinessMetric('WEB_INVITE_VALIDATED', roomInfo.roomId, 'web-user', {
        inviteCode,
        roomName: roomInfo.name,
        memberCount: roomInfo.memberCount,
      });

      console.log(`✅ Web validation successful: ${normalizedCode} -> ${roomInfo.name}`);
      timer.finish(true, undefined, { result: 'valid', roomId: roomInfo.roomId });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          valid: true,
          room: {
            roomId: roomInfo.roomId,
            name: roomInfo.name,
            hostId: roomInfo.hostId,
            status: roomInfo.status,
            memberCount: roomInfo.memberCount,
            isPrivate: roomInfo.isPrivate,
            createdAt: roomInfo.createdAt,
          },
          inviteCode: normalizedCode,
        }),
      };
    } else {
      console.log(`❌ Web validation failed: ${normalizedCode} - invalid or expired`);
      timer.finish(true, undefined, { result: 'invalid' });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          valid: false,
          error: 'Invalid or expired invite code',
          inviteCode: normalizedCode,
        }),
      };
    }

  } catch (error) {
    console.error('❌ Error in validate invite handler:', error);
    logError('ValidateInviteHandler', error as Error, { 
      event: event.body,
      httpMethod: event.httpMethod,
    });
    
    timer.finish(false, (error as Error).name);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        valid: false,
        error: 'Internal server error',
      }),
    };
  }
};