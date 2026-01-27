"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const deepLinkService_1 = require("../services/deepLinkService");
const metrics_1 = require("../utils/metrics");
/**
 * Lambda handler for validating invite codes from web landing page
 *
 * This handler is called by the web landing page to validate invite codes
 * and return room information for display.
 */
const handler = async (event) => {
    const timer = new metrics_1.PerformanceTimer('ValidateInviteHandler');
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
        const roomInfo = await deepLinkService_1.deepLinkService.validateInviteCode(normalizedCode);
        if (roomInfo) {
            // Log successful validation
            (0, metrics_1.logBusinessMetric)('WEB_INVITE_VALIDATED', roomInfo.roomId, 'web-user', {
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
        }
        else {
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
    }
    catch (error) {
        console.error('❌ Error in validate invite handler:', error);
        (0, metrics_1.logError)('ValidateInviteHandler', error, {
            event: event.body,
            httpMethod: event.httpMethod,
        });
        timer.finish(false, error.name);
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
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGVJbnZpdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2YWxpZGF0ZUludml0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxpRUFBOEQ7QUFDOUQsOENBQWlGO0FBRWpGOzs7OztHQUtHO0FBQ0ksTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUMxQixLQUEyQixFQUNLLEVBQUU7SUFDbEMsTUFBTSxLQUFLLEdBQUcsSUFBSSwwQkFBZ0IsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBRTVELGVBQWU7SUFDZixNQUFNLFdBQVcsR0FBRztRQUNsQiw2QkFBNkIsRUFBRSxHQUFHO1FBQ2xDLDhCQUE4QixFQUFFLGNBQWM7UUFDOUMsOEJBQThCLEVBQUUsZUFBZTtRQUMvQyxjQUFjLEVBQUUsa0JBQWtCO0tBQ25DLENBQUM7SUFFRiw0QkFBNEI7SUFDNUIsSUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQ25DLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRSxXQUFXO1lBQ3BCLElBQUksRUFBRSxFQUFFO1NBQ1QsQ0FBQztJQUNKLENBQUM7SUFFRCxJQUFJLENBQUM7UUFDSCxxQkFBcUI7UUFDckIsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU8sRUFBRSxXQUFXO2dCQUNwQixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDbkIsS0FBSyxFQUFFLEtBQUs7b0JBQ1osS0FBSyxFQUFFLDBCQUEwQjtpQkFDbEMsQ0FBQzthQUNILENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxFQUFFLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTlDLElBQUksQ0FBQyxVQUFVLElBQUksVUFBVSxDQUFDLElBQUksRUFBRSxLQUFL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SyxDQUFDLHFDQUFxQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzVELElBQUEsa0JBQVEsRUFBQyx1QkFBdUIsRUFBRSxLQUFjLEVBQUU7WUFDaEQsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJO1lBQ2pCLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVTtTQUM3QixDQUFDLENBQUM7UUFFSCxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRyxLQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFM0MsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsT0FBTyxFQUFFLFdBQVc7WUFDcEIsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ25CLEtBQUssRUFBRSxLQUFLO2dCQUNaLEtBQUssRUFBRSx1QkFBdUI7YUFDL0IsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBL0hXLFFBQUEsT0FBTyxXQStIbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XHJcbmltcG9ydCB7IGRlZXBMaW5rU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2RlZXBMaW5rU2VydmljZSc7XHJcbmltcG9ydCB7IGxvZ0J1c2luZXNzTWV0cmljLCBsb2dFcnJvciwgUGVyZm9ybWFuY2VUaW1lciB9IGZyb20gJy4uL3V0aWxzL21ldHJpY3MnO1xyXG5cclxuLyoqXHJcbiAqIExhbWJkYSBoYW5kbGVyIGZvciB2YWxpZGF0aW5nIGludml0ZSBjb2RlcyBmcm9tIHdlYiBsYW5kaW5nIHBhZ2VcclxuICogXHJcbiAqIFRoaXMgaGFuZGxlciBpcyBjYWxsZWQgYnkgdGhlIHdlYiBsYW5kaW5nIHBhZ2UgdG8gdmFsaWRhdGUgaW52aXRlIGNvZGVzXHJcbiAqIGFuZCByZXR1cm4gcm9vbSBpbmZvcm1hdGlvbiBmb3IgZGlzcGxheS5cclxuICovXHJcbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxyXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudFxyXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xyXG4gIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ1ZhbGlkYXRlSW52aXRlSGFuZGxlcicpO1xyXG4gIFxyXG4gIC8vIENPUlMgaGVhZGVyc1xyXG4gIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xyXG4gICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcclxuICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZScsXHJcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdQT1NULCBPUFRJT05TJyxcclxuICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgfTtcclxuXHJcbiAgLy8gSGFuZGxlIHByZWZsaWdodCByZXF1ZXN0c1xyXG4gIGlmIChldmVudC5odHRwTWV0aG9kID09PSAnT1BUSU9OUycpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcclxuICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXHJcbiAgICAgIGJvZHk6ICcnLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyBQYXJzZSByZXF1ZXN0IGJvZHlcclxuICAgIGlmICghZXZlbnQuYm9keSkge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcclxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICB2YWxpZDogZmFsc2UsXHJcbiAgICAgICAgICBlcnJvcjogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZCcsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgeyBpbnZpdGVDb2RlIH0gPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xyXG5cclxuICAgIGlmICghaW52aXRlQ29kZSB8fCBpbnZpdGVDb2RlLnRyaW0oKSA9PT0gJycpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXHJcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgdmFsaWQ6IGZhbHNlLFxyXG4gICAgICAgICAgZXJyb3I6ICdJbnZpdGUgY29kZSBpcyByZXF1aXJlZCcsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVmFsaWRhdGUgaW52aXRlIGNvZGUgZm9ybWF0XHJcbiAgICBpZiAoIS9eW0EtWjAtOV17Nn0kL2kudGVzdChpbnZpdGVDb2RlLnRyaW0oKSkpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXHJcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgdmFsaWQ6IGZhbHNlLFxyXG4gICAgICAgICAgZXJyb3I6ICdJbnZhbGlkIGludml0ZSBjb2RlIGZvcm1hdCcsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgbm9ybWFsaXplZENvZGUgPSBpbnZpdGVDb2RlLnRyaW0oKS50b1VwcGVyQ2FzZSgpO1xyXG4gICAgY29uc29sZS5sb2coYPCflI0gV2ViIHZhbGlkYXRpb24gcmVxdWVzdCBmb3IgaW52aXRlIGNvZGU6ICR7bm9ybWFsaXplZENvZGV9YCk7XHJcblxyXG4gICAgLy8gVmFsaWRhdGUgdGhlIGludml0ZSBjb2RlXHJcbiAgICBjb25zdCByb29tSW5mbyA9IGF3YWl0IGRlZXBMaW5rU2VydmljZS52YWxpZGF0ZUludml0ZUNvZGUobm9ybWFsaXplZENvZGUpO1xyXG5cclxuICAgIGlmIChyb29tSW5mbykge1xyXG4gICAgICAvLyBMb2cgc3VjY2Vzc2Z1bCB2YWxpZGF0aW9uXHJcbiAgICAgIGxvZ0J1c2luZXNzTWV0cmljKCdXRUJfSU5WSVRFX1ZBTElEQVRFRCcsIHJvb21JbmZvLnJvb21JZCwgJ3dlYi11c2VyJywge1xyXG4gICAgICAgIGludml0ZUNvZGUsXHJcbiAgICAgICAgcm9vbU5hbWU6IHJvb21JbmZvLm5hbWUsXHJcbiAgICAgICAgbWVtYmVyQ291bnQ6IHJvb21JbmZvLm1lbWJlckNvdW50LFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgV2ViIHZhbGlkYXRpb24gc3VjY2Vzc2Z1bDogJHtub3JtYWxpemVkQ29kZX0gLT4gJHtyb29tSW5mby5uYW1lfWApO1xyXG4gICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJlc3VsdDogJ3ZhbGlkJywgcm9vbUlkOiByb29tSW5mby5yb29tSWQgfSk7XHJcblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcclxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICB2YWxpZDogdHJ1ZSxcclxuICAgICAgICAgIHJvb206IHtcclxuICAgICAgICAgICAgcm9vbUlkOiByb29tSW5mby5yb29tSWQsXHJcbiAgICAgICAgICAgIG5hbWU6IHJvb21JbmZvLm5hbWUsXHJcbiAgICAgICAgICAgIGhvc3RJZDogcm9vbUluZm8uaG9zdElkLFxyXG4gICAgICAgICAgICBzdGF0dXM6IHJvb21JbmZvLnN0YXR1cyxcclxuICAgICAgICAgICAgbWVtYmVyQ291bnQ6IHJvb21JbmZvLm1lbWJlckNvdW50LFxyXG4gICAgICAgICAgICBpc1ByaXZhdGU6IHJvb21JbmZvLmlzUHJpdmF0ZSxcclxuICAgICAgICAgICAgY3JlYXRlZEF0OiByb29tSW5mby5jcmVhdGVkQXQsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgaW52aXRlQ29kZTogbm9ybWFsaXplZENvZGUsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH07XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zb2xlLmxvZyhg4p2MIFdlYiB2YWxpZGF0aW9uIGZhaWxlZDogJHtub3JtYWxpemVkQ29kZX0gLSBpbnZhbGlkIG9yIGV4cGlyZWRgKTtcclxuICAgICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByZXN1bHQ6ICdpbnZhbGlkJyB9KTtcclxuXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxyXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgIHZhbGlkOiBmYWxzZSxcclxuICAgICAgICAgIGVycm9yOiAnSW52YWxpZCBvciBleHBpcmVkIGludml0ZSBjb2RlJyxcclxuICAgICAgICAgIGludml0ZUNvZGU6IG5vcm1hbGl6ZWRDb2RlLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIHZhbGlkYXRlIGludml0ZSBoYW5kbGVyOicsIGVycm9yKTtcclxuICAgIGxvZ0Vycm9yKCdWYWxpZGF0ZUludml0ZUhhbmRsZXInLCBlcnJvciBhcyBFcnJvciwgeyBcclxuICAgICAgZXZlbnQ6IGV2ZW50LmJvZHksXHJcbiAgICAgIGh0dHBNZXRob2Q6IGV2ZW50Lmh0dHBNZXRob2QsXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcclxuICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXHJcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICB2YWxpZDogZmFsc2UsXHJcbiAgICAgICAgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InLFxyXG4gICAgICB9KSxcclxuICAgIH07XHJcbiAgfVxyXG59OyJdfQ==