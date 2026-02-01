"use strict";
/**
 * Trinity Vote Consensus Matchmaker Lambda
 * Implements Vote-Based Matchmaking via DynamoDB Streams
 *
 * Architecture: Vote → DynamoDB → Stream → Lambda → Check Consensus → AppSync Mutation → Subscription
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const logger_1 = require("../shared/logger");
const config_1 = require("../shared/config");
const database_1 = require("../shared/database");
const client_appsync_1 = require("@aws-sdk/client-appsync");
/**
 * Main Lambda handler for DynamoDB Streams
 * Detects vote consensus and triggers matchmaking
 */
const handler = async (event) => {
    logger_1.logger.info('🗳️ Vote Consensus Matchmaker triggered', { recordCount: event.Records.length });
    const results = [];
    for (const record of event.Records) {
        try {
            const result = await processStreamRecord(record);
            results.push(result);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error('❌ Error processing stream record', err);
            results.push({ success: false, action: 'error', error: err.message });
        }
    }
    logger_1.logger.info('✅ Vote consensus processing complete', { processedRecords: results.length });
    return { processedRecords: results.length, results };
};
exports.handler = handler;
/**
 * Process individual DynamoDB Stream record
 * Detects when vote consensus is reached
 */
async function processStreamRecord(record) {
    const { eventName, dynamodb } = record;
    logger_1.logger.info(`📝 Processing ${eventName} event`);
    // Only process INSERT and MODIFY events for vote counts
    if (!eventName || !['INSERT', 'MODIFY'].includes(eventName)) {
        logger_1.logger.info('⏭️ Skipping non-INSERT/MODIFY event');
        return { success: true, action: 'skipped', reason: 'not-insert-or-modify' };
    }
    const newImage = dynamodb?.NewImage;
    // Check if this is a movie vote count record
    if (!newImage?.PK?.S?.startsWith('ROOM#') || !newImage?.SK?.S?.startsWith('MOVIE_VOTES#')) {
        logger_1.logger.info('⏭️ Skipping non-movie-vote-count record');
        return { success: true, action: 'skipped', reason: 'not-movie-vote-count' };
    }
    const roomId = newImage.PK.S.replace('ROOM#', '');
    const movieId = newImage.SK.S.replace('MOVIE_VOTES#', '');
    const yesVoteCount = parseInt(newImage.yesVoteCount?.N || '0');
    logger_1.logger.info(`🎬 Room ${roomId}, Movie ${movieId}: ${yesVoteCount} YES votes`);
    // Get room metadata to check member count
    const config = await (0, config_1.getTrinityConfig)();
    const db = await (0, database_1.createDatabase)(config);
    const roomData = await getRoomMetadata(roomId, db, config);
    if (!roomData) {
        logger_1.logger.warn(`⚠️ Room ${roomId} not found`);
        return { success: true, action: 'room-not-found', roomId };
    }
    const memberCount = roomData.memberCount || 0;
    logger_1.logger.info(`🏠 Room ${roomId} has ${memberCount} members, ${yesVoteCount} YES votes for movie ${movieId}`);
    // Check if consensus is reached (all members voted YES for this movie)
    if (yesVoteCount >= memberCount && memberCount > 0) {
        logger_1.logger.info(`🎯 CONSENSUS REACHED! Room ${roomId}, Movie ${movieId} - ${yesVoteCount}/${memberCount} YES votes`);
        return await triggerConsensusMatch(roomId, movieId, yesVoteCount, memberCount, db, config);
    }
    logger_1.logger.info(`⏳ Consensus not yet reached for room ${roomId}, movie ${movieId} (${yesVoteCount}/${memberCount})`);
    return {
        success: true,
        action: 'consensus-pending',
        roomId,
        movieId,
        participantCount: yesVoteCount
    };
}
/**
 * Get room metadata including member count
 */
async function getRoomMetadata(roomId, db, config) {
    try {
        const result = await db.get(config.tables.matchmaking, {
            PK: `ROOM#${roomId}`,
            SK: 'METADATA'
        });
        return result;
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger_1.logger.error(`❌ Error getting room metadata for ${roomId}`, err);
        return null;
    }
}
/**
 * Trigger consensus match when all members vote YES for the same movie
 */
async function triggerConsensusMatch(roomId, movieId, yesVoteCount, memberCount, db, config) {
    const startTime = Date.now();
    try {
        logger_1.logger.info(`🚀 Starting consensus match for room ${roomId}, movie ${movieId}`);
        // Step 1: Update room status to CONSENSUS_REACHED
        await db.update(config.tables.matchmaking, {
            PK: `ROOM#${roomId}`,
            SK: 'METADATA'
        }, 'SET #status = :consensusStatus, #currentMovieId = :movieId, #updatedAt = :now', {
            conditionExpression: '#status IN (:votingStatus, :waitingStatus)', // Only update if still voting
            expressionAttributeNames: {
                '#status': 'status',
                '#currentMovieId': 'currentMovieId',
                '#updatedAt': 'updatedAt'
            },
            expressionAttributeValues: {
                ':consensusStatus': 'CONSENSUS_REACHED',
                ':votingStatus': 'VOTING_IN_PROGRESS',
                ':waitingStatus': 'WAITING_FOR_MEMBERS',
                ':movieId': movieId,
                ':now': new Date().toISOString()
            }
        });
        logger_1.logger.info(`✅ Room ${roomId} status updated to CONSENSUS_REACHED for movie ${movieId}`);
        // Step 2: Get all participants who voted YES
        const participants = await getConsensusParticipants(roomId, movieId, db, config);
        // Step 3: Get movie details
        const movieTitle = await getMovieTitle(movieId);
        // Step 4: Trigger AppSync publishConsensusReached mutation
        const consensusData = {
            participants: participants,
            consensusReachedAt: new Date().toISOString(),
            movieId: movieId,
            movieTitle: movieTitle,
            yesVoteCount: yesVoteCount,
            memberCount: memberCount
        };
        await publishConsensusReachedEvent(roomId, consensusData, config);
        const duration = Date.now() - startTime;
        logger_1.logger.info(`⏱️ TriggerConsensusMatch: ${duration}ms (SUCCESS)`, { roomId, movieId, participantCount: participants.length });
        return {
            success: true,
            action: 'consensus-triggered',
            roomId,
            movieId,
            participantCount: participants.length,
            status: 'CONSENSUS_REACHED'
        };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        const err = error instanceof Error ? error : new Error(String(error));
        logger_1.logger.error(`❌ Consensus match failed for room ${roomId}, movie ${movieId}`, err);
        // If condition failed, room was already processed
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
            return {
                success: true,
                action: 'already-processed',
                roomId,
                movieId,
                reason: 'Room already reached consensus'
            };
        }
        throw error;
    }
}
/**
 * Get all participants who voted YES for the consensus movie
 */
async function getConsensusParticipants(roomId, movieId, db, config) {
    try {
        const result = await db.query(config.tables.matchmaking, 'PK = :roomPK AND begins_with(SK, :votePrefix)', {
            filterExpression: '#movieId = :movieId AND #voteType = :yesVote',
            expressionAttributeNames: {
                '#movieId': 'movieId',
                '#voteType': 'voteType'
            },
            expressionAttributeValues: {
                ':roomPK': `ROOM#${roomId}`,
                ':votePrefix': 'VOTE#',
                ':movieId': movieId,
                ':yesVote': 'YES'
            }
        });
        return result.items || [];
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger_1.logger.error(`❌ Error getting consensus participants for room ${roomId}, movie ${movieId}`, err);
        return [];
    }
}
/**
 * Get movie title (integrate with existing Trinity movie service)
 */
async function getMovieTitle(movieId) {
    // TODO: Integrate with Trinity's existing movie service or TMDB API
    // For now, return a placeholder
    logger_1.logger.info(`📽️ Getting movie title for ${movieId} (placeholder)`);
    return `Movie ${movieId}`;
}
/**
 * Publish consensus reached event via AppSync
 */
async function publishConsensusReachedEvent(roomId, consensusData, config) {
    const mutation = `
    mutation PublishConsensusReached($roomId: ID!, $consensusData: AWSJSON!) {
      publishConsensusReached(roomId: $roomId, consensusData: $consensusData) {
        roomId
        movieId
        movieTitle
        participants {
          userId
          votedAt
          voteType
        }
        consensusReachedAt
        eventType
      }
    }
  `;
    const variables = {
        roomId: roomId,
        consensusData: JSON.stringify(consensusData)
    };
    try {
        const appSyncClient = new client_appsync_1.AppSyncClient({
            region: config.region
        });
        // Use AppSync's EvaluateCode for GraphQL execution with IAM auth
        const result = await appSyncClient.send(new client_appsync_1.EvaluateCodeCommand({
            runtime: {
                name: 'APPSYNC_JS',
                runtimeVersion: '1.0.0'
            },
            code: `
        import { util } from '@aws-appsync/utils';
        
        export function request(ctx) {
          return {
            operation: 'Invoke',
            payload: {
              query: \`${mutation}\`,
              variables: ${JSON.stringify(variables)}
            }
          };
        }
        
        export function response(ctx) {
          return ctx.result;
        }
      `,
            context: JSON.stringify({
                arguments: variables
            })
        }));
        logger_1.logger.info(`✅ Published consensus reached event for room ${roomId}`, { result });
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger_1.logger.error(`❌ Failed to publish consensus reached event for room ${roomId}`, err);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0Y2htYWtlci1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibWF0Y2htYWtlci1oYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7R0FLRzs7O0FBR0gsNkNBQTBDO0FBQzFDLDZDQUFvRDtBQUNwRCxpREFBb0Q7QUFFcEQsNERBQTZFO0FBOEI3RTs7O0dBR0c7QUFDSSxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsS0FBMEIsRUFBeUUsRUFBRTtJQUNqSSxlQUFNLENBQUMsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUU5RixNQUFNLE9BQU8sR0FBMEIsRUFBRSxDQUFDO0lBRTFDLEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQztZQUNILE1BQU0sTUFBTSxHQUFHLE1BQU0sbUJBQW1CLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakQsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2QixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sR0FBRyxHQUFHLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDdEUsZUFBTSxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUN0RCxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUN4RSxDQUFDO0lBQ0gsQ0FBQztJQUVELGVBQU0sQ0FBQyxJQUFJLENBQUMsc0NBQXND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LEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUN0RSxlQUFNLENBQUMsS0FBSyxDQUFDLHdEQUF3RCxNQUFNLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNwRixNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIFRyaW5pdHkgVm90ZSBDb25zZW5zdXMgTWF0Y2htYWtlciBMYW1iZGFcclxuICogSW1wbGVtZW50cyBWb3RlLUJhc2VkIE1hdGNobWFraW5nIHZpYSBEeW5hbW9EQiBTdHJlYW1zXHJcbiAqIFxyXG4gKiBBcmNoaXRlY3R1cmU6IFZvdGUg4oaSIER5bmFtb0RCIOKGkiBTdHJlYW0g4oaSIExhbWJkYSDihpIgQ2hlY2sgQ29uc2Vuc3VzIOKGkiBBcHBTeW5jIE11dGF0aW9uIOKGkiBTdWJzY3JpcHRpb25cclxuICovXHJcblxyXG5pbXBvcnQgeyBEeW5hbW9EQlN0cmVhbUV2ZW50LCBEeW5hbW9EQlJlY29yZCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9zaGFyZWQvbG9nZ2VyJztcclxuaW1wb3J0IHsgZ2V0VHJpbml0eUNvbmZpZyB9IGZyb20gJy4uL3NoYXJlZC9jb25maWcnO1xyXG5pbXBvcnQgeyBjcmVhdGVEYXRhYmFzZSB9IGZyb20gJy4uL3NoYXJlZC9kYXRhYmFzZSc7XHJcbmltcG9ydCB7IFRyaW5pdHlSb29tLCBUcmluaXR5Vm90ZSwgVHJpbml0eUNvbmZpZyB9IGZyb20gJy4uL3NoYXJlZC90eXBlcyc7XHJcbmltcG9ydCB7IEFwcFN5bmNDbGllbnQsIEV2YWx1YXRlQ29kZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtYXBwc3luYyc7XHJcblxyXG5pbnRlcmZhY2UgU3RyZWFtUHJvY2Vzc1Jlc3VsdCB7XHJcbiAgc3VjY2VzczogYm9vbGVhbjtcclxuICBhY3Rpb246IHN0cmluZztcclxuICByb29tSWQ/OiBzdHJpbmc7XHJcbiAgbW92aWVJZD86IHN0cmluZztcclxuICBwYXJ0aWNpcGFudENvdW50PzogbnVtYmVyO1xyXG4gIHN0YXR1cz86IHN0cmluZztcclxuICByZWFzb24/OiBzdHJpbmc7XHJcbiAgZXJyb3I/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDb25zZW5zdXNEYXRhIHtcclxuICBwYXJ0aWNpcGFudHM6IFRyaW5pdHlWb3RlW107XHJcbiAgY29uc2Vuc3VzUmVhY2hlZEF0OiBzdHJpbmc7XHJcbiAgbW92aWVJZDogc3RyaW5nO1xyXG4gIG1vdmllVGl0bGU6IHN0cmluZztcclxuICB5ZXNWb3RlQ291bnQ6IG51bWJlcjtcclxuICBtZW1iZXJDb3VudDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgUm9vbU1ldGFkYXRhIHtcclxuICBQSzogc3RyaW5nO1xyXG4gIFNLOiBzdHJpbmc7XHJcbiAgbWVtYmVyQ291bnQ6IG51bWJlcjtcclxuICBzdGF0dXM6IHN0cmluZztcclxuICBba2V5OiBzdHJpbmddOiBhbnk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYWluIExhbWJkYSBoYW5kbGVyIGZvciBEeW5hbW9EQiBTdHJlYW1zXHJcbiAqIERldGVjdHMgdm90ZSBjb25zZW5zdXMgYW5kIHRyaWdnZXJzIG1hdGNobWFraW5nXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogRHluYW1vREJTdHJlYW1FdmVudCk6IFByb21pc2U8eyBwcm9jZXNzZWRSZWNvcmRzOiBudW1iZXI7IHJlc3VsdHM6IFN0cmVhbVByb2Nlc3NSZXN1bHRbXSB9PiA9PiB7XHJcbiAgbG9nZ2VyLmluZm8oJ/Cfl7PvuI8gVm90ZSBDb25zZW5zdXMgTWF0Y2htYWtlciB0cmlnZ2VyZWQnLCB7IHJlY29yZENvdW50OiBldmVudC5SZWNvcmRzLmxlbmd0aCB9KTtcclxuICBcclxuICBjb25zdCByZXN1bHRzOiBTdHJlYW1Qcm9jZXNzUmVzdWx0W10gPSBbXTtcclxuICBcclxuICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwcm9jZXNzU3RyZWFtUmVjb3JkKHJlY29yZCk7XHJcbiAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBsb2dnZXIuZXJyb3IoJ+KdjCBFcnJvciBwcm9jZXNzaW5nIHN0cmVhbSByZWNvcmQnLCBlcnIpO1xyXG4gICAgICByZXN1bHRzLnB1c2goeyBzdWNjZXNzOiBmYWxzZSwgYWN0aW9uOiAnZXJyb3InLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIFxyXG4gIGxvZ2dlci5pbmZvKCfinIUgVm90ZSBjb25zZW5zdXMgcHJvY2Vzc2luZyBjb21wbGV0ZScsIHsgcHJvY2Vzc2VkUmVjb3JkczogcmVzdWx0cy5sZW5ndGggfSk7XHJcbiAgcmV0dXJuIHsgcHJvY2Vzc2VkUmVjb3JkczogcmVzdWx0cy5sZW5ndGgsIHJlc3VsdHMgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBQcm9jZXNzIGluZGl2aWR1YWwgRHluYW1vREIgU3RyZWFtIHJlY29yZFxyXG4gKiBEZXRlY3RzIHdoZW4gdm90ZSBjb25zZW5zdXMgaXMgcmVhY2hlZFxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1N0cmVhbVJlY29yZChyZWNvcmQ6IER5bmFtb0RCUmVjb3JkKTogUHJvbWlzZTxTdHJlYW1Qcm9jZXNzUmVzdWx0PiB7XHJcbiAgY29uc3QgeyBldmVudE5hbWUsIGR5bmFtb2RiIH0gPSByZWNvcmQ7XHJcbiAgXHJcbiAgbG9nZ2VyLmluZm8oYPCfk50gUHJvY2Vzc2luZyAke2V2ZW50TmFtZX0gZXZlbnRgKTtcclxuICBcclxuICAvLyBPbmx5IHByb2Nlc3MgSU5TRVJUIGFuZCBNT0RJRlkgZXZlbnRzIGZvciB2b3RlIGNvdW50c1xyXG4gIGlmICghZXZlbnROYW1lIHx8ICFbJ0lOU0VSVCcsICdNT0RJRlknXS5pbmNsdWRlcyhldmVudE5hbWUpKSB7XHJcbiAgICBsb2dnZXIuaW5mbygn4o+t77iPIFNraXBwaW5nIG5vbi1JTlNFUlQvTU9ESUZZIGV2ZW50Jyk7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBhY3Rpb246ICdza2lwcGVkJywgcmVhc29uOiAnbm90LWluc2VydC1vci1tb2RpZnknIH07XHJcbiAgfVxyXG4gIFxyXG4gIGNvbnN0IG5ld0ltYWdlID0gZHluYW1vZGI/Lk5ld0ltYWdlO1xyXG4gIFxyXG4gIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBtb3ZpZSB2b3RlIGNvdW50IHJlY29yZFxyXG4gIGlmICghbmV3SW1hZ2U/LlBLPy5TPy5zdGFydHNXaXRoKCdST09NIycpIHx8ICFuZXdJbWFnZT8uU0s/LlM/LnN0YXJ0c1dpdGgoJ01PVklFX1ZPVEVTIycpKSB7XHJcbiAgICBsb2dnZXIuaW5mbygn4o+t77iPIFNraXBwaW5nIG5vbi1tb3ZpZS12b3RlLWNvdW50IHJlY29yZCcpO1xyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgYWN0aW9uOiAnc2tpcHBlZCcsIHJlYXNvbjogJ25vdC1tb3ZpZS12b3RlLWNvdW50JyB9O1xyXG4gIH1cclxuICBcclxuICBjb25zdCByb29tSWQgPSBuZXdJbWFnZS5QSy5TLnJlcGxhY2UoJ1JPT00jJywgJycpO1xyXG4gIGNvbnN0IG1vdmllSWQgPSBuZXdJbWFnZS5TSy5TLnJlcGxhY2UoJ01PVklFX1ZPVEVTIycsICcnKTtcclxuICBjb25zdCB5ZXNWb3RlQ291bnQgPSBwYXJzZUludChuZXdJbWFnZS55ZXNWb3RlQ291bnQ/Lk4gfHwgJzAnKTtcclxuICBcclxuICBsb2dnZXIuaW5mbyhg8J+OrCBSb29tICR7cm9vbUlkfSwgTW92aWUgJHttb3ZpZUlkfTogJHt5ZXNWb3RlQ291bnR9IFlFUyB2b3Rlc2ApO1xyXG4gIFxyXG4gIC8vIEdldCByb29tIG1ldGFkYXRhIHRvIGNoZWNrIG1lbWJlciBjb3VudFxyXG4gIGNvbnN0IGNvbmZpZyA9IGF3YWl0IGdldFRyaW5pdHlDb25maWcoKTtcclxuICBjb25zdCBkYiA9IGF3YWl0IGNyZWF0ZURhdGFiYXNlKGNvbmZpZyk7XHJcbiAgXHJcbiAgY29uc3Qgcm9vbURhdGEgPSBhd2FpdCBnZXRSb29tTWV0YWRhdGEocm9vbUlkLCBkYiwgY29uZmlnKTtcclxuICBpZiAoIXJvb21EYXRhKSB7XHJcbiAgICBsb2dnZXIud2Fybihg4pqg77iPIFJvb20gJHtyb29tSWR9IG5vdCBmb3VuZGApO1xyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgYWN0aW9uOiAncm9vbS1ub3QtZm91bmQnLCByb29tSWQgfTtcclxuICB9XHJcbiAgXHJcbiAgY29uc3QgbWVtYmVyQ291bnQgPSByb29tRGF0YS5tZW1iZXJDb3VudCB8fCAwO1xyXG4gIGxvZ2dlci5pbmZvKGDwn4+gIFJvb20gJHtyb29tSWR9IGhhcyAke21lbWJlckNvdW50fSBtZW1iZXJzLCAke3llc1ZvdGVDb3VudH0gWUVTIHZvdGVzIGZvciBtb3ZpZSAke21vdmllSWR9YCk7XHJcbiAgXHJcbiAgLy8gQ2hlY2sgaWYgY29uc2Vuc3VzIGlzIHJlYWNoZWQgKGFsbCBtZW1iZXJzIHZvdGVkIFlFUyBmb3IgdGhpcyBtb3ZpZSlcclxuICBpZiAoeWVzVm90ZUNvdW50ID49IG1lbWJlckNvdW50ICYmIG1lbWJlckNvdW50ID4gMCkge1xyXG4gICAgbG9nZ2VyLmluZm8oYPCfjq8gQ09OU0VOU1VTIFJFQUNIRUQhIFJvb20gJHtyb29tSWR9LCBNb3ZpZSAke21vdmllSWR9IC0gJHt5ZXNWb3RlQ291bnR9LyR7bWVtYmVyQ291bnR9IFlFUyB2b3Rlc2ApO1xyXG4gICAgXHJcbiAgICByZXR1cm4gYXdhaXQgdHJpZ2dlckNvbnNlbnN1c01hdGNoKHJvb21JZCwgbW92aWVJZCwgeWVzVm90ZUNvdW50LCBtZW1iZXJDb3VudCwgZGIsIGNvbmZpZyk7XHJcbiAgfVxyXG4gIFxyXG4gIGxvZ2dlci5pbmZvKGDij7MgQ29uc2Vuc3VzIG5vdCB5ZXQgcmVhY2hlZCBmb3Igcm9vbSAke3Jvb21JZH0sIG1vdmllICR7bW92aWVJZH0gKCR7eWVzVm90ZUNvdW50fS8ke21lbWJlckNvdW50fSlgKTtcclxuICByZXR1cm4geyBcclxuICAgIHN1Y2Nlc3M6IHRydWUsIFxyXG4gICAgYWN0aW9uOiAnY29uc2Vuc3VzLXBlbmRpbmcnLCBcclxuICAgIHJvb21JZCwgXHJcbiAgICBtb3ZpZUlkLCBcclxuICAgIHBhcnRpY2lwYW50Q291bnQ6IHllc1ZvdGVDb3VudFxyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgcm9vbSBtZXRhZGF0YSBpbmNsdWRpbmcgbWVtYmVyIGNvdW50XHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRSb29tTWV0YWRhdGEocm9vbUlkOiBzdHJpbmcsIGRiOiBhbnksIGNvbmZpZzogVHJpbml0eUNvbmZpZyk6IFByb21pc2U8Um9vbU1ldGFkYXRhIHwgbnVsbD4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYi5nZXQoXHJcbiAgICAgIGNvbmZpZy50YWJsZXMubWF0Y2htYWtpbmcsXHJcbiAgICAgIHtcclxuICAgICAgICBQSzogYFJPT00jJHtyb29tSWR9YCxcclxuICAgICAgICBTSzogJ01FVEFEQVRBJ1xyXG4gICAgICB9XHJcbiAgICApO1xyXG4gICAgXHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zdCBlcnIgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSk7XHJcbiAgICBsb2dnZXIuZXJyb3IoYOKdjCBFcnJvciBnZXR0aW5nIHJvb20gbWV0YWRhdGEgZm9yICR7cm9vbUlkfWAsIGVycik7XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUcmlnZ2VyIGNvbnNlbnN1cyBtYXRjaCB3aGVuIGFsbCBtZW1iZXJzIHZvdGUgWUVTIGZvciB0aGUgc2FtZSBtb3ZpZVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gdHJpZ2dlckNvbnNlbnN1c01hdGNoKFxyXG4gIHJvb21JZDogc3RyaW5nLCBcclxuICBtb3ZpZUlkOiBzdHJpbmcsIFxyXG4gIHllc1ZvdGVDb3VudDogbnVtYmVyLCBcclxuICBtZW1iZXJDb3VudDogbnVtYmVyLFxyXG4gIGRiOiBhbnksXHJcbiAgY29uZmlnOiBUcmluaXR5Q29uZmlnXHJcbik6IFByb21pc2U8U3RyZWFtUHJvY2Vzc1Jlc3VsdD4ge1xyXG4gIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgXHJcbiAgdHJ5IHtcclxuICAgIGxvZ2dlci5pbmZvKGDwn5qAIFN0YXJ0aW5nIGNvbnNlbnN1cyBtYXRjaCBmb3Igcm9vbSAke3Jvb21JZH0sIG1vdmllICR7bW92aWVJZH1gKTtcclxuICAgIFxyXG4gICAgLy8gU3RlcCAxOiBVcGRhdGUgcm9vbSBzdGF0dXMgdG8gQ09OU0VOU1VTX1JFQUNIRURcclxuICAgIGF3YWl0IGRiLnVwZGF0ZShcclxuICAgICAgY29uZmlnLnRhYmxlcy5tYXRjaG1ha2luZyxcclxuICAgICAge1xyXG4gICAgICAgIFBLOiBgUk9PTSMke3Jvb21JZH1gLFxyXG4gICAgICAgIFNLOiAnTUVUQURBVEEnXHJcbiAgICAgIH0sXHJcbiAgICAgICdTRVQgI3N0YXR1cyA9IDpjb25zZW5zdXNTdGF0dXMsICNjdXJyZW50TW92aWVJZCA9IDptb3ZpZUlkLCAjdXBkYXRlZEF0ID0gOm5vdycsXHJcbiAgICAgIHtcclxuICAgICAgICBjb25kaXRpb25FeHByZXNzaW9uOiAnI3N0YXR1cyBJTiAoOnZvdGluZ1N0YXR1cywgOndhaXRpbmdTdGF0dXMpJywgLy8gT25seSB1cGRhdGUgaWYgc3RpbGwgdm90aW5nXHJcbiAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7XHJcbiAgICAgICAgICAnI3N0YXR1cyc6ICdzdGF0dXMnLFxyXG4gICAgICAgICAgJyNjdXJyZW50TW92aWVJZCc6ICdjdXJyZW50TW92aWVJZCcsXHJcbiAgICAgICAgICAnI3VwZGF0ZWRBdCc6ICd1cGRhdGVkQXQnXHJcbiAgICAgICAgfSxcclxuICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOmNvbnNlbnN1c1N0YXR1cyc6ICdDT05TRU5TVVNfUkVBQ0hFRCcsXHJcbiAgICAgICAgICAnOnZvdGluZ1N0YXR1cyc6ICdWT1RJTkdfSU5fUFJPR1JFU1MnLFxyXG4gICAgICAgICAgJzp3YWl0aW5nU3RhdHVzJzogJ1dBSVRJTkdfRk9SX01FTUJFUlMnLFxyXG4gICAgICAgICAgJzptb3ZpZUlkJzogbW92aWVJZCxcclxuICAgICAgICAgICc6bm93JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICApO1xyXG4gICAgXHJcbiAgICBsb2dnZXIuaW5mbyhg4pyFIFJvb20gJHtyb29tSWR9IHN0YXR1cyB1cGRhdGVkIHRvIENPTlNFTlNVU19SRUFDSEVEIGZvciBtb3ZpZSAke21vdmllSWR9YCk7XHJcbiAgICBcclxuICAgIC8vIFN0ZXAgMjogR2V0IGFsbCBwYXJ0aWNpcGFudHMgd2hvIHZvdGVkIFlFU1xyXG4gICAgY29uc3QgcGFydGljaXBhbnRzID0gYXdhaXQgZ2V0Q29uc2Vuc3VzUGFydGljaXBhbnRzKHJvb21JZCwgbW92aWVJZCwgZGIsIGNvbmZpZyk7XHJcbiAgICBcclxuICAgIC8vIFN0ZXAgMzogR2V0IG1vdmllIGRldGFpbHNcclxuICAgIGNvbnN0IG1vdmllVGl0bGUgPSBhd2FpdCBnZXRNb3ZpZVRpdGxlKG1vdmllSWQpO1xyXG4gICAgXHJcbiAgICAvLyBTdGVwIDQ6IFRyaWdnZXIgQXBwU3luYyBwdWJsaXNoQ29uc2Vuc3VzUmVhY2hlZCBtdXRhdGlvblxyXG4gICAgY29uc3QgY29uc2Vuc3VzRGF0YTogQ29uc2Vuc3VzRGF0YSA9IHtcclxuICAgICAgcGFydGljaXBhbnRzOiBwYXJ0aWNpcGFudHMsXHJcbiAgICAgIGNvbnNlbnN1c1JlYWNoZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICBtb3ZpZUlkOiBtb3ZpZUlkLFxyXG4gICAgICBtb3ZpZVRpdGxlOiBtb3ZpZVRpdGxlLFxyXG4gICAgICB5ZXNWb3RlQ291bnQ6IHllc1ZvdGVDb3VudCxcclxuICAgICAgbWVtYmVyQ291bnQ6IG1lbWJlckNvdW50XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBhd2FpdCBwdWJsaXNoQ29uc2Vuc3VzUmVhY2hlZEV2ZW50KHJvb21JZCwgY29uc2Vuc3VzRGF0YSwgY29uZmlnKTtcclxuICAgIFxyXG4gICAgY29uc3QgZHVyYXRpb24gPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xyXG4gICAgbG9nZ2VyLmluZm8oYOKPse+4jyBUcmlnZ2VyQ29uc2Vuc3VzTWF0Y2g6ICR7ZHVyYXRpb259bXMgKFNVQ0NFU1MpYCwgeyByb29tSWQsIG1vdmllSWQsIHBhcnRpY2lwYW50Q291bnQ6IHBhcnRpY2lwYW50cy5sZW5ndGggfSk7XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgIGFjdGlvbjogJ2NvbnNlbnN1cy10cmlnZ2VyZWQnLFxyXG4gICAgICByb29tSWQsXHJcbiAgICAgIG1vdmllSWQsXHJcbiAgICAgIHBhcnRpY2lwYW50Q291bnQ6IHBhcnRpY2lwYW50cy5sZW5ndGgsXHJcbiAgICAgIHN0YXR1czogJ0NPTlNFTlNVU19SRUFDSEVEJ1xyXG4gICAgfTtcclxuICAgIFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XHJcbiAgICBjb25zdCBlcnIgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSk7XHJcbiAgICBsb2dnZXIuZXJyb3IoYOKdjCBDb25zZW5zdXMgbWF0Y2ggZmFpbGVkIGZvciByb29tICR7cm9vbUlkfSwgbW92aWUgJHttb3ZpZUlkfWAsIGVycik7XHJcbiAgICBcclxuICAgIC8vIElmIGNvbmRpdGlvbiBmYWlsZWQsIHJvb20gd2FzIGFscmVhZHkgcHJvY2Vzc2VkXHJcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnJvci5uYW1lID09PSAnQ29uZGl0aW9uYWxDaGVja0ZhaWxlZEV4Y2VwdGlvbicpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgIGFjdGlvbjogJ2FscmVhZHktcHJvY2Vzc2VkJyxcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgbW92aWVJZCxcclxuICAgICAgICByZWFzb246ICdSb29tIGFscmVhZHkgcmVhY2hlZCBjb25zZW5zdXMnXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBhbGwgcGFydGljaXBhbnRzIHdobyB2b3RlZCBZRVMgZm9yIHRoZSBjb25zZW5zdXMgbW92aWVcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldENvbnNlbnN1c1BhcnRpY2lwYW50cyhcclxuICByb29tSWQ6IHN0cmluZywgXHJcbiAgbW92aWVJZDogc3RyaW5nLCBcclxuICBkYjogYW55LCBcclxuICBjb25maWc6IFRyaW5pdHlDb25maWdcclxuKTogUHJvbWlzZTxUcmluaXR5Vm90ZVtdPiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5KFxyXG4gICAgICBjb25maWcudGFibGVzLm1hdGNobWFraW5nLFxyXG4gICAgICAnUEsgPSA6cm9vbVBLIEFORCBiZWdpbnNfd2l0aChTSywgOnZvdGVQcmVmaXgpJyxcclxuICAgICAge1xyXG4gICAgICAgIGZpbHRlckV4cHJlc3Npb246ICcjbW92aWVJZCA9IDptb3ZpZUlkIEFORCAjdm90ZVR5cGUgPSA6eWVzVm90ZScsXHJcbiAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7XHJcbiAgICAgICAgICAnI21vdmllSWQnOiAnbW92aWVJZCcsXHJcbiAgICAgICAgICAnI3ZvdGVUeXBlJzogJ3ZvdGVUeXBlJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzpyb29tUEsnOiBgUk9PTSMke3Jvb21JZH1gLFxyXG4gICAgICAgICAgJzp2b3RlUHJlZml4JzogJ1ZPVEUjJyxcclxuICAgICAgICAgICc6bW92aWVJZCc6IG1vdmllSWQsXHJcbiAgICAgICAgICAnOnllc1ZvdGUnOiAnWUVTJ1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHJlc3VsdC5pdGVtcyB8fCBbXTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgbG9nZ2VyLmVycm9yKGDinYwgRXJyb3IgZ2V0dGluZyBjb25zZW5zdXMgcGFydGljaXBhbnRzIGZvciByb29tICR7cm9vbUlkfSwgbW92aWUgJHttb3ZpZUlkfWAsIGVycik7XHJcbiAgICByZXR1cm4gW107XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IG1vdmllIHRpdGxlIChpbnRlZ3JhdGUgd2l0aCBleGlzdGluZyBUcmluaXR5IG1vdmllIHNlcnZpY2UpXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRNb3ZpZVRpdGxlKG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgLy8gVE9ETzogSW50ZWdyYXRlIHdpdGggVHJpbml0eSdzIGV4aXN0aW5nIG1vdmllIHNlcnZpY2Ugb3IgVE1EQiBBUElcclxuICAvLyBGb3Igbm93LCByZXR1cm4gYSBwbGFjZWhvbGRlclxyXG4gIGxvZ2dlci5pbmZvKGDwn5O977iPIEdldHRpbmcgbW92aWUgdGl0bGUgZm9yICR7bW92aWVJZH0gKHBsYWNlaG9sZGVyKWApO1xyXG4gIHJldHVybiBgTW92aWUgJHttb3ZpZUlkfWA7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBQdWJsaXNoIGNvbnNlbnN1cyByZWFjaGVkIGV2ZW50IHZpYSBBcHBTeW5jXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBwdWJsaXNoQ29uc2Vuc3VzUmVhY2hlZEV2ZW50KFxyXG4gIHJvb21JZDogc3RyaW5nLCBcclxuICBjb25zZW5zdXNEYXRhOiBDb25zZW5zdXNEYXRhLCBcclxuICBjb25maWc6IFRyaW5pdHlDb25maWdcclxuKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgY29uc3QgbXV0YXRpb24gPSBgXHJcbiAgICBtdXRhdGlvbiBQdWJsaXNoQ29uc2Vuc3VzUmVhY2hlZCgkcm9vbUlkOiBJRCEsICRjb25zZW5zdXNEYXRhOiBBV1NKU09OISkge1xyXG4gICAgICBwdWJsaXNoQ29uc2Vuc3VzUmVhY2hlZChyb29tSWQ6ICRyb29tSWQsIGNvbnNlbnN1c0RhdGE6ICRjb25zZW5zdXNEYXRhKSB7XHJcbiAgICAgICAgcm9vbUlkXHJcbiAgICAgICAgbW92aWVJZFxyXG4gICAgICAgIG1vdmllVGl0bGVcclxuICAgICAgICBwYXJ0aWNpcGFudHMge1xyXG4gICAgICAgICAgdXNlcklkXHJcbiAgICAgICAgICB2b3RlZEF0XHJcbiAgICAgICAgICB2b3RlVHlwZVxyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zZW5zdXNSZWFjaGVkQXRcclxuICAgICAgICBldmVudFR5cGVcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIGA7XHJcbiAgXHJcbiAgY29uc3QgdmFyaWFibGVzID0ge1xyXG4gICAgcm9vbUlkOiByb29tSWQsXHJcbiAgICBjb25zZW5zdXNEYXRhOiBKU09OLnN0cmluZ2lmeShjb25zZW5zdXNEYXRhKVxyXG4gIH07XHJcbiAgXHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGFwcFN5bmNDbGllbnQgPSBuZXcgQXBwU3luY0NsaWVudCh7IFxyXG4gICAgICByZWdpb246IGNvbmZpZy5yZWdpb25cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFVzZSBBcHBTeW5jJ3MgRXZhbHVhdGVDb2RlIGZvciBHcmFwaFFMIGV4ZWN1dGlvbiB3aXRoIElBTSBhdXRoXHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBhcHBTeW5jQ2xpZW50LnNlbmQobmV3IEV2YWx1YXRlQ29kZUNvbW1hbmQoe1xyXG4gICAgICBydW50aW1lOiB7XHJcbiAgICAgICAgbmFtZTogJ0FQUFNZTkNfSlMnLFxyXG4gICAgICAgIHJ1bnRpbWVWZXJzaW9uOiAnMS4wLjAnXHJcbiAgICAgIH0sXHJcbiAgICAgIGNvZGU6IGBcclxuICAgICAgICBpbXBvcnQgeyB1dGlsIH0gZnJvbSAnQGF3cy1hcHBzeW5jL3V0aWxzJztcclxuICAgICAgICBcclxuICAgICAgICBleHBvcnQgZnVuY3Rpb24gcmVxdWVzdChjdHgpIHtcclxuICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIG9wZXJhdGlvbjogJ0ludm9rZScsXHJcbiAgICAgICAgICAgIHBheWxvYWQ6IHtcclxuICAgICAgICAgICAgICBxdWVyeTogXFxgJHttdXRhdGlvbn1cXGAsXHJcbiAgICAgICAgICAgICAgdmFyaWFibGVzOiAke0pTT04uc3RyaW5naWZ5KHZhcmlhYmxlcyl9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGV4cG9ydCBmdW5jdGlvbiByZXNwb25zZShjdHgpIHtcclxuICAgICAgICAgIHJldHVybiBjdHgucmVzdWx0O1xyXG4gICAgICAgIH1cclxuICAgICAgYCxcclxuICAgICAgY29udGV4dDogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgIGFyZ3VtZW50czogdmFyaWFibGVzXHJcbiAgICAgIH0pXHJcbiAgICB9KSk7XHJcbiAgICBcclxuICAgIGxvZ2dlci5pbmZvKGDinIUgUHVibGlzaGVkIGNvbnNlbnN1cyByZWFjaGVkIGV2ZW50IGZvciByb29tICR7cm9vbUlkfWAsIHsgcmVzdWx0IH0pO1xyXG4gICAgXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnN0IGVyciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKTtcclxuICAgIGxvZ2dlci5lcnJvcihg4p2MIEZhaWxlZCB0byBwdWJsaXNoIGNvbnNlbnN1cyByZWFjaGVkIGV2ZW50IGZvciByb29tICR7cm9vbUlkfWAsIGVycik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn0iXX0=