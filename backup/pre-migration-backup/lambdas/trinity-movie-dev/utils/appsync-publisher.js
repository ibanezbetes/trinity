"use strict";
/**
 * Enhanced AppSync Real-time Event Publisher
 * Publishes events to AppSync subscriptions for real-time updates with detailed progress information
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishMatchFoundEvent = publishMatchFoundEvent;
exports.publishVoteUpdateEvent = publishVoteUpdateEvent;
exports.publishConnectionStatusEvent = publishConnectionStatusEvent;
exports.publishRoomStateSyncEvent = publishRoomStateSyncEvent;
exports.getMovieTitle = getMovieTitle;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
/**
 * Publish Match Found event to all room subscribers with detailed participant information
 */
async function publishMatchFoundEvent(roomId, movieId, movieTitle, participants, votingStartTime) {
    try {
        // Get detailed participant information
        const participantDetails = await getDetailedParticipantInfo(roomId, participants);
        // Get movie details for enhanced information
        const movieDetails = await getEnhancedMovieInfo(movieId);
        // Calculate voting duration
        const votingDuration = votingStartTime
            ? Math.round((Date.now() - votingStartTime.getTime()) / 1000)
            : 0;
        const event = {
            id: `match_${roomId}_${movieId}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            roomId,
            eventType: 'MATCH_FOUND',
            matchId: `match_${roomId}_${movieId}`,
            mediaId: movieId,
            mediaTitle: movieTitle,
            participants: participantDetails,
            consensusType: 'UNANIMOUS', // Trinity uses unanimous consensus
            matchDetails: {
                totalVotesRequired: participants.length,
                finalVoteCount: participants.length,
                votingDuration,
                movieGenres: movieDetails.genres,
                movieYear: movieDetails.year,
                movieRating: movieDetails.rating
            }
        };
        console.log(`🎉 Enhanced MATCH_FOUND Event published for room ${roomId}:`, {
            movieId,
            movieTitle,
            participantCount: participants.length,
            votingDuration: `${votingDuration}s`,
            movieGenres: movieDetails.genres
        });
        // Store the match event for audit/history purposes
        await storeEventForAudit('MATCH_FOUND', roomId, event);
        // Publish immediate notification to all room subscribers
        await publishToRoomSubscribers(roomId, event);
    }
    catch (error) {
        console.error('❌ Error publishing enhanced match found event:', error);
        // Don't throw - real-time notifications are nice-to-have, not critical
    }
}
/**
 * Publish Vote Update event to room subscribers with detailed progress information
 */
async function publishVoteUpdateEvent(roomId, userId, movieId, voteType, currentVotes, totalMembers) {
    try {
        // Get detailed voting progress information
        const votingUsers = await getVotingUsers(roomId, movieId);
        const allMembers = await getAllRoomMembers(roomId);
        const pendingUsers = allMembers.filter(member => !votingUsers.includes(member));
        // Get enhanced movie information
        const movieInfo = await getEnhancedMovieInfo(movieId);
        // Estimate time to complete based on voting patterns
        const estimatedTimeToComplete = await estimateVotingCompletion(roomId, currentVotes, totalMembers);
        const event = {
            id: `vote_${roomId}_${userId}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            roomId,
            eventType: 'VOTE_UPDATE',
            userId,
            mediaId: movieId,
            voteType,
            progress: {
                totalVotes: currentVotes,
                likesCount: voteType === 'LIKE' ? currentVotes : 0, // Simplified for Trinity
                dislikesCount: 0,
                skipsCount: 0,
                remainingUsers: Math.max(0, totalMembers - currentVotes),
                percentage: totalMembers > 0 ? (currentVotes / totalMembers) * 100 : 0,
                votingUsers,
                pendingUsers,
                estimatedTimeToComplete
            },
            movieInfo: {
                title: movieInfo.title,
                genres: movieInfo.genres,
                year: movieInfo.year,
                posterPath: movieInfo.posterPath
            }
        };
        console.log(`🗳️ Enhanced VOTE_UPDATE Event published for room ${roomId}:`, {
            userId,
            movieId,
            movieTitle: movieInfo.title,
            progress: `${currentVotes}/${totalMembers} (${event.progress.percentage.toFixed(1)}%)`,
            pendingUsers: pendingUsers.length,
            estimatedCompletion: estimatedTimeToComplete ? `${estimatedTimeToComplete}s` : 'unknown'
        });
        // Store the vote event for audit/history purposes
        await storeEventForAudit('VOTE_UPDATE', roomId, event);
        // Publish to room subscribers
        await publishToRoomSubscribers(roomId, event);
    }
    catch (error) {
        console.error('❌ Error publishing enhanced vote update event:', error);
        // Don't throw - real-time notifications are nice-to-have, not critical
    }
}
/**
 * Publish connection status event for monitoring user connections
 */
async function publishConnectionStatusEvent(roomId, userId, status, connectionId, metadata) {
    try {
        const event = {
            id: `connection_${roomId}_${userId}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            roomId,
            eventType: 'CONNECTION_STATUS',
            userId,
            status,
            connectionId,
            metadata: {
                userAgent: metadata?.userAgent,
                lastSeen: new Date().toISOString(),
                reconnectionAttempts: metadata?.reconnectionAttempts || 0
            }
        };
        console.log(`🔌 CONNECTION_STATUS Event published for room ${roomId}:`, {
            userId,
            status,
            connectionId: connectionId.substring(0, 8) + '...',
            reconnectionAttempts: metadata?.reconnectionAttempts || 0
        });
        // Store connection event for monitoring
        await storeEventForAudit('CONNECTION_STATUS', roomId, event);
        // Publish to room subscribers
        await publishToRoomSubscribers(roomId, event);
    }
    catch (error) {
        console.error('❌ Error publishing connection status event:', error);
    }
}
/**
 * Publish room state synchronization event for reconnected users
 */
async function publishRoomStateSyncEvent(roomId, targetUserId) {
    try {
        // Get current room state
        const roomState = await getCurrentRoomState(roomId);
        const event = {
            id: `sync_${roomId}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            roomId,
            eventType: 'ROOM_STATE_SYNC',
            roomState
        };
        console.log(`🔄 ROOM_STATE_SYNC Event published for room ${roomId}:`, {
            targetUser: targetUserId || 'all',
            roomStatus: roomState.status,
            totalMembers: roomState.totalMembers,
            activeConnections: roomState.activeConnections,
            votingProgress: `${roomState.votingProgress.currentVotes}/${roomState.votingProgress.totalRequired}`
        });
        // Store sync event for audit
        await storeEventForAudit('ROOM_STATE_SYNC', roomId, event);
        // Publish to specific user or all room subscribers
        if (targetUserId) {
            await publishToUserInRoom(roomId, targetUserId, event);
        }
        else {
            await publishToRoomSubscribers(roomId, event);
        }
    }
    catch (error) {
        console.error('❌ Error publishing room state sync event:', error);
    }
}
async function getMovieTitle(movieId) {
    try {
        // Try to get movie title from cache
        const response = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.MOVIES_CACHE_TABLE,
            Key: { tmdbId: `movie_${movieId}` },
        }));
        if (response.Item?.movies) {
            const movies = response.Item.movies;
            const movie = movies.find((m) => m.id === movieId);
            if (movie?.title) {
                return movie.title;
            }
        }
        // Fallback to generic title
        return `Movie ${movieId}`;
    }
    catch (error) {
        console.warn('⚠️ Error getting movie title:', error);
        return `Movie ${movieId}`;
    }
}
/**
 * Store event for audit trail and debugging
 */
async function storeEventForAudit(eventType, roomId, eventData) {
    try {
        // In a production system, you might want to store events in a separate audit table
        // For now, we'll just log them with structured data for CloudWatch
        console.log(`📊 AUDIT_EVENT:${eventType}`, {
            roomId,
            timestamp: new Date().toISOString(),
            eventData: JSON.stringify(eventData)
        });
    }
    catch (error) {
        console.warn('⚠️ Error storing audit event:', error);
        // Don't throw - audit is optional
    }
}
/**
 * Get detailed participant information including connection status and voting status
 */
async function getDetailedParticipantInfo(roomId, participantIds) {
    try {
        const participants = [];
        // Get room info to identify host
        const roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { PK: roomId, SK: 'ROOM' },
        }));
        const hostId = roomResponse.Item?.hostId;
        for (const userId of participantIds) {
            // Get member info
            const memberResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.ROOM_MEMBERS_TABLE,
                Key: { roomId, userId },
            }));
            const member = memberResponse.Item;
            participants.push({
                userId,
                displayName: member?.displayName || `User ${userId.substring(0, 8)}`,
                isHost: userId === hostId,
                connectionStatus: member?.connectionStatus || 'CONNECTED',
                lastSeen: member?.lastSeen || new Date().toISOString(),
                hasVoted: true // All participants have voted if match was found
            });
        }
        return participants;
    }
    catch (error) {
        console.warn('⚠️ Error getting detailed participant info:', error);
        // Return basic participant info as fallback
        return participantIds.map(userId => ({
            userId,
            displayName: `User ${userId.substring(0, 8)}`,
            isHost: false,
            connectionStatus: 'CONNECTED',
            lastSeen: new Date().toISOString(),
            hasVoted: true
        }));
    }
}
/**
 * Get enhanced movie information including genres, year, and poster
 */
async function getEnhancedMovieInfo(movieId) {
    try {
        // Try to get from movie cache first
        const cacheResponse = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.MOVIE_CACHE_TABLE,
            IndexName: 'MovieIdIndex', // Assuming we have a GSI on movieId
            KeyConditionExpression: 'movieId = :movieId',
            ExpressionAttributeValues: {
                ':movieId': movieId
            },
            Limit: 1
        }));
        if (cacheResponse.Items && cacheResponse.Items.length > 0) {
            const cachedMovie = cacheResponse.Items[0];
            return {
                title: cachedMovie.title || `Movie ${movieId}`,
                genres: cachedMovie.genres || [],
                year: cachedMovie.year,
                rating: cachedMovie.rating,
                posterPath: cachedMovie.posterPath
            };
        }
        // Fallback to basic info
        return {
            title: `Movie ${movieId}`,
            genres: [],
        };
    }
    catch (error) {
        console.warn('⚠️ Error getting enhanced movie info:', error);
        return {
            title: `Movie ${movieId}`,
            genres: [],
        };
    }
}
/**
 * Get list of users who have voted for a specific movie
 */
async function getVotingUsers(roomId, movieId) {
    try {
        const roomMovieId = `${roomId}_${movieId}`;
        const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.USER_VOTES_TABLE,
            IndexName: 'RoomMovieIndex', // Assuming we have a GSI on roomMovieId
            KeyConditionExpression: 'roomMovieId = :roomMovieId',
            ExpressionAttributeValues: {
                ':roomMovieId': roomMovieId
            },
            ProjectionExpression: 'userId'
        }));
        return response.Items?.map(item => item.userId) || [];
    }
    catch (error) {
        console.warn('⚠️ Error getting voting users:', error);
        return [];
    }
}
/**
 * Get all active members of a room
 */
async function getAllRoomMembers(roomId) {
    try {
        const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            KeyConditionExpression: 'roomId = :roomId',
            FilterExpression: 'isActive = :active',
            ExpressionAttributeValues: {
                ':roomId': roomId,
                ':active': true
            },
            ProjectionExpression: 'userId'
        }));
        return response.Items?.map(item => item.userId) || [];
    }
    catch (error) {
        console.warn('⚠️ Error getting all room members:', error);
        return [];
    }
}
/**
 * Estimate time to complete voting based on historical patterns
 */
async function estimateVotingCompletion(roomId, currentVotes, totalMembers) {
    try {
        if (currentVotes >= totalMembers) {
            return 0; // Already complete
        }
        // Simple estimation: assume 30 seconds per remaining vote
        // In a real system, you might analyze historical voting patterns
        const remainingVotes = totalMembers - currentVotes;
        const estimatedSeconds = remainingVotes * 30;
        return estimatedSeconds;
    }
    catch (error) {
        console.warn('⚠️ Error estimating voting completion:', error);
        return undefined;
    }
}
/**
 * Get current room state for synchronization
 */
async function getCurrentRoomState(roomId) {
    try {
        // Get room info
        const roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { PK: roomId, SK: 'ROOM' },
        }));
        const room = roomResponse.Item;
        if (!room) {
            throw new Error(`Room ${roomId} not found`);
        }
        // Get member count
        const membersResponse = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            KeyConditionExpression: 'roomId = :roomId',
            FilterExpression: 'isActive = :active',
            ExpressionAttributeValues: {
                ':roomId': roomId,
                ':active': true
            },
            Select: 'COUNT'
        }));
        const totalMembers = membersResponse.Count || 0;
        // Get current voting progress if room is active
        let votingProgress = {
            currentVotes: 0,
            totalRequired: totalMembers,
            percentage: 0
        };
        if (room.status === 'ACTIVE' && room.currentMovieId) {
            const votesResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.VOTES_TABLE,
                Key: { roomId, movieId: room.currentMovieId },
            }));
            const currentVotes = votesResponse.Item?.votes || 0;
            votingProgress = {
                currentVotes,
                totalRequired: totalMembers,
                percentage: totalMembers > 0 ? (currentVotes / totalMembers) * 100 : 0
            };
        }
        // Get current movie info if available
        let currentMovieInfo;
        if (room.currentMovieId) {
            const movieInfo = await getEnhancedMovieInfo(room.currentMovieId);
            currentMovieInfo = {
                title: movieInfo.title,
                genres: movieInfo.genres,
                posterPath: movieInfo.posterPath
            };
        }
        // Get match result if room is matched
        let matchResult;
        if (room.status === 'MATCHED' && room.resultMovieId) {
            const matchMovieInfo = await getEnhancedMovieInfo(room.resultMovieId);
            matchResult = {
                movieId: room.resultMovieId,
                movieTitle: matchMovieInfo.title,
                foundAt: room.updatedAt || new Date().toISOString()
            };
        }
        return {
            status: room.status,
            currentMovieId: room.currentMovieId,
            currentMovieInfo,
            totalMembers,
            activeConnections: totalMembers, // Simplified - in real system track actual connections
            votingProgress,
            matchResult
        };
    }
    catch (error) {
        console.error('❌ Error getting current room state:', error);
        throw error;
    }
}
/**
 * Publish event to all subscribers of a room via AppSync Mutation
 */
async function publishToRoomSubscribers(roomId, event) {
    const endpoint = process.env.APPSYNC_ENDPOINT;
    const apiKey = process.env.APPSYNC_API_KEY; // If using API Key
    // Or use IAM signing if configured. For simple setups, usually API Key or just unauthenticated if enabled (but Lambda usually has IAM)
    // Actually, from a Lambda resolver, we often invoke the mutation directly via HTTP
    // But wait, if this code runs INSIDE a Lambda resolver, we are already in AppSync? no, we are in a Lambda data source.
    // To trigger a subscription, we MUST execute a mutation against the AppSync API.
    if (!endpoint) {
        console.warn('⚠️ APPSYNC_ENDPOINT not defined, cannot publish event');
        return;
    }
    // Determine which mutation to call based on event type
    let mutation = '';
    let variables = {};
    let operationName = '';
    switch (event.eventType) {
        case 'VOTE_UPDATE':
            operationName = 'PublishVoteUpdate';
            mutation = `
        mutation PublishVoteUpdate($roomId: ID!, $voteUpdateData: AWSJSON!) {
          publishVoteUpdateEvent(roomId: $roomId, voteUpdateData: $voteUpdateData) {
            id
            timestamp
            roomId
            eventType
            progress {
              totalVotes
              likesCount
              percentage
            }
          }
        }
      `;
            // ALSO call legacy publishVoteEvent for legacy subscribers
            const legacyMutation = `
        mutation PublishVote($roomId: ID!, $voteData: AWSJSON!) {
          publishVoteEvent(roomId: $roomId, voteData: $voteData) {
            id
            timestamp
            roomId
            eventType
            userId
            mediaId
            voteType
            progress {
              totalVotes
              likesCount
              percentage
            }
          }
        }
      `;
            // We'll execute this one too or instead. The logs showed errors on 'VoteEvent', so let's focus on legacy first if that's what frontend uses.
            // Frontent logs: "WebSocket error for vote-updates ... parent 'VoteEvent'"
            // Schema: onVoteUpdate -> publishVoteEvent -> returns VoteEvent
            // So we MUST call publishVoteEvent.
            // Construct VoteEvent payload from VoteUpdateEvent
            const voteData = {
                id: event.id,
                timestamp: event.timestamp,
                roomId: event.roomId,
                eventType: event.eventType,
                userId: event.userId,
                mediaId: event.mediaId,
                voteType: event.voteType,
                progress: event.progress
            };
            mutation = legacyMutation;
            variables = { roomId, voteData: JSON.stringify(voteData) };
            break;
        case 'MATCH_FOUND':
            // Schema: onMatchFound -> publishMatchEvent -> returns MatchEvent
            // Schema: MatchEvent has { id, timestamp, roomId, eventType, matchId, mediaId, mediaTitle... }
            mutation = `
          mutation PublishMatch($roomId: ID!, $matchData: AWSJSON!) {
            publishMatchFoundEvent(roomId: $roomId, matchData: $matchData) {
              id
              timestamp
              roomId
              eventType
              matchId
              mediaId
              mediaTitle
            }
          }
        `;
            const matchData = {
                id: event.id,
                timestamp: event.timestamp,
                roomId: event.roomId,
                eventType: event.eventType,
                matchId: event.matchId,
                mediaId: event.mediaId,
                mediaTitle: event.mediaTitle,
                participants: event.participants.map((p) => p.userId), // MatchEvent expects simple list of IDs as per Schema? 
                // Wait, schema says: participants: [ID!]! for MatchEvent
                // But appsync-publisher says participants: ParticipantInfo[] for MatchFoundEvent interface.
                // mapping:
                consensusType: event.consensusType || 'UNANIMOUS'
            };
            variables = { roomId, matchData: JSON.stringify(matchData) };
            break;
        default:
            console.warn(`Unmapped event type for publishing: ${event.eventType}`);
            return;
    }
    try {
        const fetch = require('node-fetch'); // Ensure node-fetch is available
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey || '', // Use API Key if available, else blank (might fail if IAM required)
            },
            body: JSON.stringify({ query: mutation, variables })
        });
        const result = await response.json();
        if (result.errors) {
            console.error('❌ AppSync Publish Error:', JSON.stringify(result.errors));
        }
        else {
            console.log(`✅ Event published successfully to ${endpoint}`);
        }
    }
    catch (error) {
        console.error('❌ Error publishing to AppSync:', error);
    }
}
/**
 * Publish event to a specific user in a room
 */
async function publishToUserInRoom(roomId, userId, event) {
    try {
        console.log(`📡 Publishing to user ${userId} in room ${roomId}:`, {
            eventType: event.eventType,
            eventId: event.id
        });
        // In production, this would target the specific user's subscription
    }
    catch (error) {
        console.error('❌ Error publishing to user in room:', error);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwc3luYy1wdWJsaXNoZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhcHBzeW5jLXB1Ymxpc2hlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOztBQThHSCx3REF5REM7QUFLRCx3REFrRUM7QUFLRCxvRUEwQ0M7QUFLRCw4REFxQ0M7QUFDRCxzQ0F1QkM7QUE3VkQsOERBQTBEO0FBQzFELHdEQUF5RjtBQUV6RixNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBcUc1RDs7R0FFRztBQUNJLEtBQUssVUFBVSxzQkFBc0IsQ0FDMUMsTUFBYyxFQUNkLE9BQWUsRUFDZixVQUFrQixFQUNsQixZQUFzQixFQUN0QixlQUFzQjtJQUV0QixJQUFJLENBQUM7UUFDSCx1Q0FBdUM7UUFDdkMsTUFBTSxrQkFBa0IsR0FBRyxNQUFNLDBCQUEwQixDQUFDLE1BQU0sRUFBRSxZQUFZLENBQUMsQ0FBQztRQUVsRiw2Q0FBNkM7UUFDN0MsTUFBTSxZQUFZLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUV6RCw0QkFBNEI7UUFDNUIsTUFBTSxjQUFjLEdBQUcsZUFBZTtZQUNwQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxlQUFlLENBQUMsT0FBTyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDN0QsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVOLE1BQU0sS0FBSyxHQUFvQjtZQUM3QixFQUFFLEVBQUUsU0FBUyxNQUFNLElBQUksT0FBTyxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRTtZQUM5QyxTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7WUFDbkMsTUFBTTtZQUNOLFNB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RXZlbnQgUHVibGlzaGVyXHJcbiAqIFB1Ymxpc2hlcyBldmVudHMgdG8gQXBwU3luYyBzdWJzY3JpcHRpb25zIGZvciByZWFsLXRpbWUgdXBkYXRlcyB3aXRoIGRldGFpbGVkIHByb2dyZXNzIGluZm9ybWF0aW9uXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kLCBRdWVyeUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xyXG5cclxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcclxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIE1hdGNoRm91bmRFdmVudCB7XHJcbiAgaWQ6IHN0cmluZztcclxuICB0aW1lc3RhbXA6IHN0cmluZztcclxuICByb29tSWQ6IHN0cmluZztcclxuICBldmVudFR5cGU6ICdNQVRDSF9GT1VORCc7XHJcbiAgbWF0Y2hJZDogc3RyaW5nO1xyXG4gIG1lZGlhSWQ6IHN0cmluZztcclxuICBtZWRpYVRpdGxlOiBzdHJpbmc7XHJcbiAgcGFydGljaXBhbnRzOiBQYXJ0aWNpcGFudEluZm9bXTtcclxuICBjb25zZW5zdXNUeXBlOiAnVU5BTklNT1VTJyB8ICdNQUpPUklUWSc7XHJcbiAgbWF0Y2hEZXRhaWxzOiB7XHJcbiAgICB0b3RhbFZvdGVzUmVxdWlyZWQ6IG51bWJlcjtcclxuICAgIGZpbmFsVm90ZUNvdW50OiBudW1iZXI7XHJcbiAgICB2b3RpbmdEdXJhdGlvbjogbnVtYmVyOyAvLyBpbiBzZWNvbmRzXHJcbiAgICBtb3ZpZUdlbnJlczogc3RyaW5nW107XHJcbiAgICBtb3ZpZVllYXI/OiBudW1iZXI7XHJcbiAgICBtb3ZpZVJhdGluZz86IG51bWJlcjtcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFZvdGVVcGRhdGVFdmVudCB7XHJcbiAgaWQ6IHN0cmluZztcclxuICB0aW1lc3RhbXA6IHN0cmluZztcclxuICByb29tSWQ6IHN0cmluZztcclxuICBldmVudFR5cGU6ICdWT1RFX1VQREFURSc7XHJcbiAgdXNlcklkOiBzdHJpbmc7XHJcbiAgbWVkaWFJZDogc3RyaW5nO1xyXG4gIHZvdGVUeXBlOiAnTElLRScgfCAnRElTTElLRScgfCAnU0tJUCc7XHJcbiAgcHJvZ3Jlc3M6IHtcclxuICAgIHRvdGFsVm90ZXM6IG51bWJlcjtcclxuICAgIGxpa2VzQ291bnQ6IG51bWJlcjtcclxuICAgIGRpc2xpa2VzQ291bnQ6IG51bWJlcjtcclxuICAgIHNraXBzQ291bnQ6IG51bWJlcjtcclxuICAgIHJlbWFpbmluZ1VzZXJzOiBudW1iZXI7XHJcbiAgICBwZXJjZW50YWdlOiBudW1iZXI7XHJcbiAgICB2b3RpbmdVc2Vyczogc3RyaW5nW107IC8vIFVzZXJzIHdobyBoYXZlIHZvdGVkXHJcbiAgICBwZW5kaW5nVXNlcnM6IHN0cmluZ1tdOyAvLyBVc2VycyB3aG8gaGF2ZW4ndCB2b3RlZCB5ZXRcclxuICAgIGVzdGltYXRlZFRpbWVUb0NvbXBsZXRlPzogbnVtYmVyOyAvLyBpbiBzZWNvbmRzXHJcbiAgfTtcclxuICBtb3ZpZUluZm86IHtcclxuICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICBnZW5yZXM6IHN0cmluZ1tdO1xyXG4gICAgeWVhcj86IG51bWJlcjtcclxuICAgIHBvc3RlclBhdGg/OiBzdHJpbmc7XHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBDb25uZWN0aW9uU3RhdHVzRXZlbnQge1xyXG4gIGlkOiBzdHJpbmc7XHJcbiAgdGltZXN0YW1wOiBzdHJpbmc7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgZXZlbnRUeXBlOiAnQ09OTkVDVElPTl9TVEFUVVMnO1xyXG4gIHVzZXJJZDogc3RyaW5nO1xyXG4gIHN0YXR1czogJ0NPTk5FQ1RFRCcgfCAnRElTQ09OTkVDVEVEJyB8ICdSRUNPTk5FQ1RFRCc7XHJcbiAgY29ubmVjdGlvbklkOiBzdHJpbmc7XHJcbiAgbWV0YWRhdGE6IHtcclxuICAgIHVzZXJBZ2VudD86IHN0cmluZztcclxuICAgIGxhc3RTZWVuOiBzdHJpbmc7XHJcbiAgICByZWNvbm5lY3Rpb25BdHRlbXB0cz86IG51bWJlcjtcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFJvb21TdGF0ZUV2ZW50IHtcclxuICBpZDogc3RyaW5nO1xyXG4gIHRpbWVzdGFtcDogc3RyaW5nO1xyXG4gIHJvb21JZDogc3RyaW5nO1xyXG4gIGV2ZW50VHlwZTogJ1JPT01fU1RBVEVfU1lOQyc7XHJcbiAgcm9vbVN0YXRlOiB7XHJcbiAgICBzdGF0dXM6ICdXQUlUSU5HJyB8ICdBQ1RJVkUnIHwgJ01BVENIRUQnIHwgJ0NPTVBMRVRFRCc7XHJcbiAgICBjdXJyZW50TW92aWVJZD86IHN0cmluZztcclxuICAgIGN1cnJlbnRNb3ZpZUluZm8/OiB7XHJcbiAgICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICAgIGdlbnJlczogc3RyaW5nW107XHJcbiAgICAgIHBvc3RlclBhdGg/OiBzdHJpbmc7XHJcbiAgICB9O1xyXG4gICAgdG90YWxNZW1iZXJzOiBudW1iZXI7XHJcbiAgICBhY3RpdmVDb25uZWN0aW9uczogbnVtYmVyO1xyXG4gICAgdm90aW5nUHJvZ3Jlc3M6IHtcclxuICAgICAgY3VycmVudFZvdGVzOiBudW1iZXI7XHJcbiAgICAgIHRvdGFsUmVxdWlyZWQ6IG51bWJlcjtcclxuICAgICAgcGVyY2VudGFnZTogbnVtYmVyO1xyXG4gICAgfTtcclxuICAgIG1hdGNoUmVzdWx0Pzoge1xyXG4gICAgICBtb3ZpZUlkOiBzdHJpbmc7XHJcbiAgICAgIG1vdmllVGl0bGU6IHN0cmluZztcclxuICAgICAgZm91bmRBdDogc3RyaW5nO1xyXG4gICAgfTtcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFBhcnRpY2lwYW50SW5mbyB7XHJcbiAgdXNlcklkOiBzdHJpbmc7XHJcbiAgZGlzcGxheU5hbWU/OiBzdHJpbmc7XHJcbiAgaXNIb3N0OiBib29sZWFuO1xyXG4gIGNvbm5lY3Rpb25TdGF0dXM6ICdDT05ORUNURUQnIHwgJ0RJU0NPTk5FQ1RFRCc7XHJcbiAgbGFzdFNlZW46IHN0cmluZztcclxuICBoYXNWb3RlZDogYm9vbGVhbjtcclxufVxyXG5cclxuLyoqXHJcbiAqIFB1Ymxpc2ggTWF0Y2ggRm91bmQgZXZlbnQgdG8gYWxsIHJvb20gc3Vic2NyaWJlcnMgd2l0aCBkZXRhaWxlZCBwYXJ0aWNpcGFudCBpbmZvcm1hdGlvblxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHB1Ymxpc2hNYXRjaEZvdW5kRXZlbnQoXHJcbiAgcm9vbUlkOiBzdHJpbmcsXHJcbiAgbW92aWVJZDogc3RyaW5nLFxyXG4gIG1vdmllVGl0bGU6IHN0cmluZyxcclxuICBwYXJ0aWNpcGFudHM6IHN0cmluZ1tdLFxyXG4gIHZvdGluZ1N0YXJ0VGltZT86IERhdGVcclxuKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgdHJ5IHtcclxuICAgIC8vIEdldCBkZXRhaWxlZCBwYXJ0aWNpcGFudCBpbmZvcm1hdGlvblxyXG4gICAgY29uc3QgcGFydGljaXBhbnREZXRhaWxzID0gYXdhaXQgZ2V0RGV0YWlsZWRQYXJ0aWNpcGFudEluZm8ocm9vbUlkLCBwYXJ0aWNpcGFudHMpO1xyXG5cclxuICAgIC8vIEdldCBtb3ZpZSBkZXRhaWxzIGZvciBlbmhhbmNlZCBpbmZvcm1hdGlvblxyXG4gICAgY29uc3QgbW92aWVEZXRhaWxzID0gYXdhaXQgZ2V0RW5oYW5jZWRNb3ZpZUluZm8obW92aWVJZCk7XHJcblxyXG4gICAgLy8gQ2FsY3VsYXRlIHZvdGluZyBkdXJhdGlvblxyXG4gICAgY29uc3Qgdm90aW5nRHVyYXRpb24gPSB2b3RpbmdTdGFydFRpbWVcclxuICAgICAgPyBNYXRoLnJvdW5kKChEYXRlLm5vdygpIC0gdm90aW5nU3RhcnRUaW1lLmdldFRpbWUoKSkgLyAxMDAwKVxyXG4gICAgICA6IDA7XHJcblxyXG4gICAgY29uc3QgZXZlbnQ6IE1hdGNoRm91bmRFdmVudCA9IHtcclxuICAgICAgaWQ6IGBtYXRjaF8ke3Jvb21JZH1fJHttb3ZpZUlkfV8ke0RhdGUubm93KCl9YCxcclxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHJvb21JZCxcclxuICAgICAgZXZlbnRUeXBlOiAnTUFUQ0hfRk9VTkQnLFxyXG4gICAgICBtYXRjaElkOiBgbWF0Y2hfJHtyb29tSWR9XyR7bW92aWVJZH1gLFxyXG4gICAgICBtZWRpYUlkOiBtb3ZpZUlkLFxyXG4gICAgICBtZWRpYVRpdGxlOiBtb3ZpZVRpdGxlLFxyXG4gICAgICBwYXJ0aWNpcGFudHM6IHBhcnRpY2lwYW50RGV0YWlscyxcclxuICAgICAgY29uc2Vuc3VzVHlwZTogJ1VOQU5JTU9VUycsIC8vIFRyaW5pdHkgdXNlcyB1bmFuaW1vdXMgY29uc2Vuc3VzXHJcbiAgICAgIG1hdGNoRGV0YWlsczoge1xyXG4gICAgICAgIHRvdGFsVm90ZXNSZXF1aXJlZDogcGFydGljaXBhbnRzLmxlbmd0aCxcclxuICAgICAgICBmaW5hbFZvdGVDb3VudDogcGFydGljaXBhbnRzLmxlbmd0aCxcclxuICAgICAgICB2b3RpbmdEdXJhdGlvbixcclxuICAgICAgICBtb3ZpZUdlbnJlczogbW92aWVEZXRhaWxzLmdlbnJlcyxcclxuICAgICAgICBtb3ZpZVllYXI6IG1vdmllRGV0YWlscy55ZWFyLFxyXG4gICAgICAgIG1vdmllUmF0aW5nOiBtb3ZpZURldGFpbHMucmF0aW5nXHJcbiAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgY29uc29sZS5sb2coYPCfjokgRW5oYW5jZWQgTUFUQ0hfRk9VTkQgRXZlbnQgcHVibGlzaGVkIGZvciByb29tICR7cm9vbUlkfTpgLCB7XHJcbiAgICAgIG1vdmllSWQsXHJcbiAgICAgIG1vdmllVGl0bGUsXHJcbiAgICAgIHBhcnRpY2lwYW50Q291bnQ6IHBhcnRpY2lwYW50cy5sZW5ndGgsXHJcbiAgICAgIHZvdGluZ0R1cmF0aW9uOiBgJHt2b3RpbmdEdXJhdGlvbn1zYCxcclxuICAgICAgbW92aWVHZW5yZXM6IG1vdmllRGV0YWlscy5nZW5yZXNcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFN0b3JlIHRoZSBtYXRjaCBldmVudCBmb3IgYXVkaXQvaGlzdG9yeSBwdXJwb3Nlc1xyXG4gICAgYXdhaXQgc3RvcmVFdmVudEZvckF1ZGl0KCdNQVRDSF9GT1VORCcsIHJvb21JZCwgZXZlbnQpO1xyXG5cclxuICAgIC8vIFB1Ymxpc2ggaW1tZWRpYXRlIG5vdGlmaWNhdGlvbiB0byBhbGwgcm9vbSBzdWJzY3JpYmVyc1xyXG4gICAgYXdhaXQgcHVibGlzaFRvUm9vbVN1YnNjcmliZXJzKHJvb21JZCwgZXZlbnQpO1xyXG5cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHB1Ymxpc2hpbmcgZW5oYW5jZWQgbWF0Y2ggZm91bmQgZXZlbnQ6JywgZXJyb3IpO1xyXG4gICAgLy8gRG9uJ3QgdGhyb3cgLSByZWFsLXRpbWUgbm90aWZpY2F0aW9ucyBhcmUgbmljZS10by1oYXZlLCBub3QgY3JpdGljYWxcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBQdWJsaXNoIFZvdGUgVXBkYXRlIGV2ZW50IHRvIHJvb20gc3Vic2NyaWJlcnMgd2l0aCBkZXRhaWxlZCBwcm9ncmVzcyBpbmZvcm1hdGlvblxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHB1Ymxpc2hWb3RlVXBkYXRlRXZlbnQoXHJcbiAgcm9vbUlkOiBzdHJpbmcsXHJcbiAgdXNlcklkOiBzdHJpbmcsXHJcbiAgbW92aWVJZDogc3RyaW5nLFxyXG4gIHZvdGVUeXBlOiAnTElLRScgfCAnRElTTElLRScgfCAnU0tJUCcsXHJcbiAgY3VycmVudFZvdGVzOiBudW1iZXIsXHJcbiAgdG90YWxNZW1iZXJzOiBudW1iZXJcclxuKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgdHJ5IHtcclxuICAgIC8vIEdldCBkZXRhaWxlZCB2b3RpbmcgcHJvZ3Jlc3MgaW5mb3JtYXRpb25cclxuICAgIGNvbnN0IHZvdGluZ1VzZXJzID0gYXdhaXQgZ2V0Vm90aW5nVXNlcnMocm9vbUlkLCBtb3ZpZUlkKTtcclxuICAgIGNvbnN0IGFsbE1lbWJlcnMgPSBhd2FpdCBnZXRBbGxSb29tTWVtYmVycyhyb29tSWQpO1xyXG4gICAgY29uc3QgcGVuZGluZ1VzZXJzID0gYWxsTWVtYmVycy5maWx0ZXIobWVtYmVyID0+ICF2b3RpbmdVc2Vycy5pbmNsdWRlcyhtZW1iZXIpKTtcclxuXHJcbiAgICAvLyBHZXQgZW5oYW5jZWQgbW92aWUgaW5mb3JtYXRpb25cclxuICAgIGNvbnN0IG1vdmllSW5mbyA9IGF3YWl0IGdldEVuaGFuY2VkTW92aWVJbmZvKG1vdmllSWQpO1xyXG5cclxuICAgIC8vIEVzdGltYXRlIHRpbWUgdG8gY29tcGxldGUgYmFzZWQgb24gdm90aW5nIHBhdHRlcm5zXHJcbiAgICBjb25zdCBlc3RpbWF0ZWRUaW1lVG9Db21wbGV0ZSA9IGF3YWl0IGVzdGltYXRlVm90aW5nQ29tcGxldGlvbihyb29tSWQsIGN1cnJlbnRWb3RlcywgdG90YWxNZW1iZXJzKTtcclxuXHJcbiAgICBjb25zdCBldmVudDogVm90ZVVwZGF0ZUV2ZW50ID0ge1xyXG4gICAgICBpZDogYHZvdGVfJHtyb29tSWR9XyR7dXNlcklkfV8ke0RhdGUubm93KCl9YCxcclxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHJvb21JZCxcclxuICAgICAgZXZlbnRUeXBlOiAnVk9URV9VUERBVEUnLFxyXG4gICAgICB1c2VySWQsXHJcbiAgICAgIG1lZGlhSWQ6IG1vdmllSWQsXHJcbiAgICAgIHZvdGVUeXBlLFxyXG4gICAgICBwcm9ncmVzczoge1xyXG4gICAgICAgIHRvdGFsVm90ZXM6IGN1cnJlbnRWb3RlcyxcclxuICAgICAgICBsaWtlc0NvdW50OiB2b3RlVHlwZSA9PT0gJ0xJS0UnID8gY3VycmVudFZvdGVzIDogMCwgLy8gU2ltcGxpZmllZCBmb3IgVHJpbml0eVxyXG4gICAgICAgIGRpc2xpa2VzQ291bnQ6IDAsXHJcbiAgICAgICAgc2tpcHNDb3VudDogMCxcclxuICAgICAgICByZW1haW5pbmdVc2VyczogTWF0aC5tYXgoMCwgdG90YWxNZW1iZXJzIC0gY3VycmVudFZvdGVzKSxcclxuICAgICAgICBwZXJjZW50YWdlOiB0b3RhbE1lbWJlcnMgPiAwID8gKGN1cnJlbnRWb3RlcyAvIHRvdGFsTWVtYmVycykgKiAxMDAgOiAwLFxyXG4gICAgICAgIHZvdGluZ1VzZXJzLFxyXG4gICAgICAgIHBlbmRpbmdVc2VycyxcclxuICAgICAgICBlc3RpbWF0ZWRUaW1lVG9Db21wbGV0ZVxyXG4gICAgICB9LFxyXG4gICAgICBtb3ZpZUluZm86IHtcclxuICAgICAgICB0aXRsZTogbW92aWVJbmZvLnRpdGxlLFxyXG4gICAgICAgIGdlbnJlczogbW92aWVJbmZvLmdlbnJlcyxcclxuICAgICAgICB5ZWFyOiBtb3ZpZUluZm8ueWVhcixcclxuICAgICAgICBwb3N0ZXJQYXRoOiBtb3ZpZUluZm8ucG9zdGVyUGF0aFxyXG4gICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDwn5ez77iPIEVuaGFuY2VkIFZPVEVfVVBEQVRFIEV2ZW50IHB1Ymxpc2hlZCBmb3Igcm9vbSAke3Jvb21JZH06YCwge1xyXG4gICAgICB1c2VySWQsXHJcbiAgICAgIG1vdmllSWQsXHJcbiAgICAgIG1vdmllVGl0bGU6IG1vdmllSW5mby50aXRsZSxcclxuICAgICAgcHJvZ3Jlc3M6IGAke2N1cnJlbnRWb3Rlc30vJHt0b3RhbE1lbWJlcnN9ICgke2V2ZW50LnByb2dyZXNzLnBlcmNlbnRhZ2UudG9GaXhlZCgxKX0lKWAsXHJcbiAgICAgIHBlbmRpbmdVc2VyczogcGVuZGluZ1VzZXJzLmxlbmd0aCxcclxuICAgICAgZXN0aW1hdGVkQ29tcGxldGlvbjogZXN0aW1hdGVkVGltZVRvQ29tcGxldGUgPyBgJHtlc3RpbWF0ZWRUaW1lVG9Db21wbGV0ZX1zYCA6ICd1bmtub3duJ1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gU3RvcmUgdGhlIHZvdGUgZXZlbnQgZm9yIGF1ZGl0L2hpc3RvcnkgcHVycG9zZXNcclxuICAgIGF3YWl0IHN0b3JlRXZlbnRGb3JBdWRpdCgnVk9URV9VUERBVEUnLCByb29tSWQsIGV2ZW50KTtcclxuXHJcbiAgICAvLyBQdWJsaXNoIHRvIHJvb20gc3Vic2NyaWJlcnNcclxuICAgIGF3YWl0IHB1Ymxpc2hUb1Jvb21TdWJzY3JpYmVycyhyb29tSWQsIGV2ZW50KTtcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBwdWJsaXNoaW5nIGVuaGFuY2VkIHZvdGUgdXBkYXRlIGV2ZW50OicsIGVycm9yKTtcclxuICAgIC8vIERvbid0IHRocm93IC0gcmVhbC10aW1lIG5vdGlmaWNhdGlvbnMgYXJlIG5pY2UtdG8taGF2ZSwgbm90IGNyaXRpY2FsXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUHVibGlzaCBjb25uZWN0aW9uIHN0YXR1cyBldmVudCBmb3IgbW9uaXRvcmluZyB1c2VyIGNvbm5lY3Rpb25zXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHVibGlzaENvbm5lY3Rpb25TdGF0dXNFdmVudChcclxuICByb29tSWQ6IHN0cmluZyxcclxuICB1c2VySWQ6IHN0cmluZyxcclxuICBzdGF0dXM6ICdDT05ORUNURUQnIHwgJ0RJU0NPTk5FQ1RFRCcgfCAnUkVDT05ORUNURUQnLFxyXG4gIGNvbm5lY3Rpb25JZDogc3RyaW5nLFxyXG4gIG1ldGFkYXRhPzoge1xyXG4gICAgdXNlckFnZW50Pzogc3RyaW5nO1xyXG4gICAgcmVjb25uZWN0aW9uQXR0ZW1wdHM/OiBudW1iZXI7XHJcbiAgfVxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZXZlbnQ6IENvbm5lY3Rpb25TdGF0dXNFdmVudCA9IHtcclxuICAgICAgaWQ6IGBjb25uZWN0aW9uXyR7cm9vbUlkfV8ke3VzZXJJZH1fJHtEYXRlLm5vdygpfWAsXHJcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICByb29tSWQsXHJcbiAgICAgIGV2ZW50VHlwZTogJ0NPTk5FQ1RJT05fU1RBVFVTJyxcclxuICAgICAgdXNlcklkLFxyXG4gICAgICBzdGF0dXMsXHJcbiAgICAgIGNvbm5lY3Rpb25JZCxcclxuICAgICAgbWV0YWRhdGE6IHtcclxuICAgICAgICB1c2VyQWdlbnQ6IG1ldGFkYXRhPy51c2VyQWdlbnQsXHJcbiAgICAgICAgbGFzdFNlZW46IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICByZWNvbm5lY3Rpb25BdHRlbXB0czogbWV0YWRhdGE/LnJlY29ubmVjdGlvbkF0dGVtcHRzIHx8IDBcclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg8J+UjCBDT05ORUNUSU9OX1NUQVRVUyBFdmVudCBwdWJsaXNoZWQgZm9yIHJvb20gJHtyb29tSWR9OmAsIHtcclxuICAgICAgdXNlcklkLFxyXG4gICAgICBzdGF0dXMsXHJcbiAgICAgIGNvbm5lY3Rpb25JZDogY29ubmVjdGlvbklkLnN1YnN0cmluZygwLCA4KSArICcuLi4nLFxyXG4gICAgICByZWNvbm5lY3Rpb25BdHRlbXB0czogbWV0YWRhdGE/LnJlY29ubmVjdGlvbkF0dGVtcHRzIHx8IDBcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFN0b3JlIGNvbm5lY3Rpb24gZXZlbnQgZm9yIG1vbml0b3JpbmdcclxuICAgIGF3YWl0IHN0b3JlRXZlbnRGb3JBdWRpdCgnQ09OTkVDVElPTl9TVEFUVVMnLCByb29tSWQsIGV2ZW50KTtcclxuXHJcbiAgICAvLyBQdWJsaXNoIHRvIHJvb20gc3Vic2NyaWJlcnNcclxuICAgIGF3YWl0IHB1Ymxpc2hUb1Jvb21TdWJzY3JpYmVycyhyb29tSWQsIGV2ZW50KTtcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBwdWJsaXNoaW5nIGNvbm5lY3Rpb24gc3RhdHVzIGV2ZW50OicsIGVycm9yKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBQdWJsaXNoIHJvb20gc3RhdGUgc3luY2hyb25pemF0aW9uIGV2ZW50IGZvciByZWNvbm5lY3RlZCB1c2Vyc1xyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHB1Ymxpc2hSb29tU3RhdGVTeW5jRXZlbnQoXHJcbiAgcm9vbUlkOiBzdHJpbmcsXHJcbiAgdGFyZ2V0VXNlcklkPzogc3RyaW5nXHJcbik6IFByb21pc2U8dm9pZD4ge1xyXG4gIHRyeSB7XHJcbiAgICAvLyBHZXQgY3VycmVudCByb29tIHN0YXRlXHJcbiAgICBjb25zdCByb29tU3RhdGUgPSBhd2FpdCBnZXRDdXJyZW50Um9vbVN0YXRlKHJvb21JZCk7XHJcblxyXG4gICAgY29uc3QgZXZlbnQ6IFJvb21TdGF0ZUV2ZW50ID0ge1xyXG4gICAgICBpZDogYHN5bmNfJHtyb29tSWR9XyR7RGF0ZS5ub3coKX1gLFxyXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgcm9vbUlkLFxyXG4gICAgICBldmVudFR5cGU6ICdST09NX1NUQVRFX1NZTkMnLFxyXG4gICAgICByb29tU3RhdGVcclxuICAgIH07XHJcblxyXG4gICAgY29uc29sZS5sb2coYPCflIQgUk9PTV9TVEFURV9TWU5DIEV2ZW50IHB1Ymxpc2hlZCBmb3Igcm9vbSAke3Jvb21JZH06YCwge1xyXG4gICAgICB0YXJnZXRVc2VyOiB0YXJnZXRVc2VySWQgfHwgJ2FsbCcsXHJcbiAgICAgIHJvb21TdGF0dXM6IHJvb21TdGF0ZS5zdGF0dXMsXHJcbiAgICAgIHRvdGFsTWVtYmVyczogcm9vbVN0YXRlLnRvdGFsTWVtYmVycyxcclxuICAgICAgYWN0aXZlQ29ubmVjdGlvbnM6IHJvb21TdGF0ZS5hY3RpdmVDb25uZWN0aW9ucyxcclxuICAgICAgdm90aW5nUHJvZ3Jlc3M6IGAke3Jvb21TdGF0ZS52b3RpbmdQcm9ncmVzcy5jdXJyZW50Vm90ZXN9LyR7cm9vbVN0YXRlLnZvdGluZ1Byb2dyZXNzLnRvdGFsUmVxdWlyZWR9YFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gU3RvcmUgc3luYyBldmVudCBmb3IgYXVkaXRcclxuICAgIGF3YWl0IHN0b3JlRXZlbnRGb3JBdWRpdCgnUk9PTV9TVEFURV9TWU5DJywgcm9vbUlkLCBldmVudCk7XHJcblxyXG4gICAgLy8gUHVibGlzaCB0byBzcGVjaWZpYyB1c2VyIG9yIGFsbCByb29tIHN1YnNjcmliZXJzXHJcbiAgICBpZiAodGFyZ2V0VXNlcklkKSB7XHJcbiAgICAgIGF3YWl0IHB1Ymxpc2hUb1VzZXJJblJvb20ocm9vbUlkLCB0YXJnZXRVc2VySWQsIGV2ZW50KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGF3YWl0IHB1Ymxpc2hUb1Jvb21TdWJzY3JpYmVycyhyb29tSWQsIGV2ZW50KTtcclxuICAgIH1cclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBwdWJsaXNoaW5nIHJvb20gc3RhdGUgc3luYyBldmVudDonLCBlcnJvcik7XHJcbiAgfVxyXG59XHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRNb3ZpZVRpdGxlKG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgdHJ5IHtcclxuICAgIC8vIFRyeSB0byBnZXQgbW92aWUgdGl0bGUgZnJvbSBjYWNoZVxyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuTU9WSUVTX0NBQ0hFX1RBQkxFISxcclxuICAgICAgS2V5OiB7IHRtZGJJZDogYG1vdmllXyR7bW92aWVJZH1gIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaWYgKHJlc3BvbnNlLkl0ZW0/Lm1vdmllcykge1xyXG4gICAgICBjb25zdCBtb3ZpZXMgPSByZXNwb25zZS5JdGVtLm1vdmllcztcclxuICAgICAgY29uc3QgbW92aWUgPSBtb3ZpZXMuZmluZCgobTogYW55KSA9PiBtLmlkID09PSBtb3ZpZUlkKTtcclxuICAgICAgaWYgKG1vdmllPy50aXRsZSkge1xyXG4gICAgICAgIHJldHVybiBtb3ZpZS50aXRsZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEZhbGxiYWNrIHRvIGdlbmVyaWMgdGl0bGVcclxuICAgIHJldHVybiBgTW92aWUgJHttb3ZpZUlkfWA7XHJcblxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBnZXR0aW5nIG1vdmllIHRpdGxlOicsIGVycm9yKTtcclxuICAgIHJldHVybiBgTW92aWUgJHttb3ZpZUlkfWA7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogU3RvcmUgZXZlbnQgZm9yIGF1ZGl0IHRyYWlsIGFuZCBkZWJ1Z2dpbmdcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHN0b3JlRXZlbnRGb3JBdWRpdChldmVudFR5cGU6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcsIGV2ZW50RGF0YTogYW55KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgdHJ5IHtcclxuICAgIC8vIEluIGEgcHJvZHVjdGlvbiBzeXN0ZW0sIHlvdSBtaWdodCB3YW50IHRvIHN0b3JlIGV2ZW50cyBpbiBhIHNlcGFyYXRlIGF1ZGl0IHRhYmxlXHJcbiAgICAvLyBGb3Igbm93LCB3ZSdsbCBqdXN0IGxvZyB0aGVtIHdpdGggc3RydWN0dXJlZCBkYXRhIGZvciBDbG91ZFdhdGNoXHJcbiAgICBjb25zb2xlLmxvZyhg8J+TiiBBVURJVF9FVkVOVDoke2V2ZW50VHlwZX1gLCB7XHJcbiAgICAgIHJvb21JZCxcclxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIGV2ZW50RGF0YTogSlNPTi5zdHJpbmdpZnkoZXZlbnREYXRhKVxyXG4gICAgfSk7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2Fybign4pqg77iPIEVycm9yIHN0b3JpbmcgYXVkaXQgZXZlbnQ6JywgZXJyb3IpO1xyXG4gICAgLy8gRG9uJ3QgdGhyb3cgLSBhdWRpdCBpcyBvcHRpb25hbFxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBkZXRhaWxlZCBwYXJ0aWNpcGFudCBpbmZvcm1hdGlvbiBpbmNsdWRpbmcgY29ubmVjdGlvbiBzdGF0dXMgYW5kIHZvdGluZyBzdGF0dXNcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldERldGFpbGVkUGFydGljaXBhbnRJbmZvKHJvb21JZDogc3RyaW5nLCBwYXJ0aWNpcGFudElkczogc3RyaW5nW10pOiBQcm9taXNlPFBhcnRpY2lwYW50SW5mb1tdPiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHBhcnRpY2lwYW50czogUGFydGljaXBhbnRJbmZvW10gPSBbXTtcclxuXHJcbiAgICAvLyBHZXQgcm9vbSBpbmZvIHRvIGlkZW50aWZ5IGhvc3RcclxuICAgIGNvbnN0IHJvb21SZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgIEtleTogeyBQSzogcm9vbUlkLCBTSzogJ1JPT00nIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgY29uc3QgaG9zdElkID0gcm9vbVJlc3BvbnNlLkl0ZW0/Lmhvc3RJZDtcclxuXHJcbiAgICBmb3IgKGNvbnN0IHVzZXJJZCBvZiBwYXJ0aWNpcGFudElkcykge1xyXG4gICAgICAvLyBHZXQgbWVtYmVyIGluZm9cclxuICAgICAgY29uc3QgbWVtYmVyUmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgICAgIEtleTogeyByb29tSWQsIHVzZXJJZCB9LFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBjb25zdCBtZW1iZXIgPSBtZW1iZXJSZXNwb25zZS5JdGVtO1xyXG5cclxuICAgICAgcGFydGljaXBhbnRzLnB1c2goe1xyXG4gICAgICAgIHVzZXJJZCxcclxuICAgICAgICBkaXNwbGF5TmFtZTogbWVtYmVyPy5kaXNwbGF5TmFtZSB8fCBgVXNlciAke3VzZXJJZC5zdWJzdHJpbmcoMCwgOCl9YCxcclxuICAgICAgICBpc0hvc3Q6IHVzZXJJZCA9PT0gaG9zdElkLFxyXG4gICAgICAgIGNvbm5lY3Rpb25TdGF0dXM6IG1lbWJlcj8uY29ubmVjdGlvblN0YXR1cyB8fCAnQ09OTkVDVEVEJyxcclxuICAgICAgICBsYXN0U2VlbjogbWVtYmVyPy5sYXN0U2VlbiB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgaGFzVm90ZWQ6IHRydWUgLy8gQWxsIHBhcnRpY2lwYW50cyBoYXZlIHZvdGVkIGlmIG1hdGNoIHdhcyBmb3VuZFxyXG4gICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcGFydGljaXBhbnRzO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBnZXR0aW5nIGRldGFpbGVkIHBhcnRpY2lwYW50IGluZm86JywgZXJyb3IpO1xyXG4gICAgLy8gUmV0dXJuIGJhc2ljIHBhcnRpY2lwYW50IGluZm8gYXMgZmFsbGJhY2tcclxuICAgIHJldHVybiBwYXJ0aWNpcGFudElkcy5tYXAodXNlcklkID0+ICh7XHJcbiAgICAgIHVzZXJJZCxcclxuICAgICAgZGlzcGxheU5hbWU6IGBVc2VyICR7dXNlcklkLnN1YnN0cmluZygwLCA4KX1gLFxyXG4gICAgICBpc0hvc3Q6IGZhbHNlLFxyXG4gICAgICBjb25uZWN0aW9uU3RhdHVzOiAnQ09OTkVDVEVEJyBhcyBjb25zdCxcclxuICAgICAgbGFzdFNlZW46IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgaGFzVm90ZWQ6IHRydWVcclxuICAgIH0pKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgZW5oYW5jZWQgbW92aWUgaW5mb3JtYXRpb24gaW5jbHVkaW5nIGdlbnJlcywgeWVhciwgYW5kIHBvc3RlclxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0RW5oYW5jZWRNb3ZpZUluZm8obW92aWVJZDogc3RyaW5nKTogUHJvbWlzZTx7XHJcbiAgdGl0bGU6IHN0cmluZztcclxuICBnZW5yZXM6IHN0cmluZ1tdO1xyXG4gIHllYXI/OiBudW1iZXI7XHJcbiAgcmF0aW5nPzogbnVtYmVyO1xyXG4gIHBvc3RlclBhdGg/OiBzdHJpbmc7XHJcbn0+IHtcclxuICB0cnkge1xyXG4gICAgLy8gVHJ5IHRvIGdldCBmcm9tIG1vdmllIGNhY2hlIGZpcnN0XHJcbiAgICBjb25zdCBjYWNoZVJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuTU9WSUVfQ0FDSEVfVEFCTEUhLFxyXG4gICAgICBJbmRleE5hbWU6ICdNb3ZpZUlkSW5kZXgnLCAvLyBBc3N1bWluZyB3ZSBoYXZlIGEgR1NJIG9uIG1vdmllSWRcclxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ21vdmllSWQgPSA6bW92aWVJZCcsXHJcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAnOm1vdmllSWQnOiBtb3ZpZUlkXHJcbiAgICAgIH0sXHJcbiAgICAgIExpbWl0OiAxXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaWYgKGNhY2hlUmVzcG9uc2UuSXRlbXMgJiYgY2FjaGVSZXNwb25zZS5JdGVtcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnN0IGNhY2hlZE1vdmllID0gY2FjaGVSZXNwb25zZS5JdGVtc1swXTtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICB0aXRsZTogY2FjaGVkTW92aWUudGl0bGUgfHwgYE1vdmllICR7bW92aWVJZH1gLFxyXG4gICAgICAgIGdlbnJlczogY2FjaGVkTW92aWUuZ2VucmVzIHx8IFtdLFxyXG4gICAgICAgIHllYXI6IGNhY2hlZE1vdmllLnllYXIsXHJcbiAgICAgICAgcmF0aW5nOiBjYWNoZWRNb3ZpZS5yYXRpbmcsXHJcbiAgICAgICAgcG9zdGVyUGF0aDogY2FjaGVkTW92aWUucG9zdGVyUGF0aFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZhbGxiYWNrIHRvIGJhc2ljIGluZm9cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHRpdGxlOiBgTW92aWUgJHttb3ZpZUlkfWAsXHJcbiAgICAgIGdlbnJlczogW10sXHJcbiAgICB9O1xyXG5cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3IgZ2V0dGluZyBlbmhhbmNlZCBtb3ZpZSBpbmZvOicsIGVycm9yKTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHRpdGxlOiBgTW92aWUgJHttb3ZpZUlkfWAsXHJcbiAgICAgIGdlbnJlczogW10sXHJcbiAgICB9O1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBsaXN0IG9mIHVzZXJzIHdobyBoYXZlIHZvdGVkIGZvciBhIHNwZWNpZmljIG1vdmllXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRWb3RpbmdVc2Vycyhyb29tSWQ6IHN0cmluZywgbW92aWVJZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByb29tTW92aWVJZCA9IGAke3Jvb21JZH1fJHttb3ZpZUlkfWA7XHJcblxyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5VU0VSX1ZPVEVTX1RBQkxFISxcclxuICAgICAgSW5kZXhOYW1lOiAnUm9vbU1vdmllSW5kZXgnLCAvLyBBc3N1bWluZyB3ZSBoYXZlIGEgR1NJIG9uIHJvb21Nb3ZpZUlkXHJcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICdyb29tTW92aWVJZCA9IDpyb29tTW92aWVJZCcsXHJcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAnOnJvb21Nb3ZpZUlkJzogcm9vbU1vdmllSWRcclxuICAgICAgfSxcclxuICAgICAgUHJvamVjdGlvbkV4cHJlc3Npb246ICd1c2VySWQnXHJcbiAgICB9KSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3BvbnNlLkl0ZW1zPy5tYXAoaXRlbSA9PiBpdGVtLnVzZXJJZCkgfHwgW107XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2Fybign4pqg77iPIEVycm9yIGdldHRpbmcgdm90aW5nIHVzZXJzOicsIGVycm9yKTtcclxuICAgIHJldHVybiBbXTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgYWxsIGFjdGl2ZSBtZW1iZXJzIG9mIGEgcm9vbVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0QWxsUm9vbU1lbWJlcnMocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ3Jvb21JZCA9IDpyb29tSWQnLFxyXG4gICAgICBGaWx0ZXJFeHByZXNzaW9uOiAnaXNBY3RpdmUgPSA6YWN0aXZlJyxcclxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICc6cm9vbUlkJzogcm9vbUlkLFxyXG4gICAgICAgICc6YWN0aXZlJzogdHJ1ZVxyXG4gICAgICB9LFxyXG4gICAgICBQcm9qZWN0aW9uRXhwcmVzc2lvbjogJ3VzZXJJZCdcclxuICAgIH0pKTtcclxuXHJcbiAgICByZXR1cm4gcmVzcG9uc2UuSXRlbXM/Lm1hcChpdGVtID0+IGl0ZW0udXNlcklkKSB8fCBbXTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3IgZ2V0dGluZyBhbGwgcm9vbSBtZW1iZXJzOicsIGVycm9yKTtcclxuICAgIHJldHVybiBbXTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBFc3RpbWF0ZSB0aW1lIHRvIGNvbXBsZXRlIHZvdGluZyBiYXNlZCBvbiBoaXN0b3JpY2FsIHBhdHRlcm5zXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBlc3RpbWF0ZVZvdGluZ0NvbXBsZXRpb24ocm9vbUlkOiBzdHJpbmcsIGN1cnJlbnRWb3RlczogbnVtYmVyLCB0b3RhbE1lbWJlcnM6IG51bWJlcik6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XHJcbiAgdHJ5IHtcclxuICAgIGlmIChjdXJyZW50Vm90ZXMgPj0gdG90YWxNZW1iZXJzKSB7XHJcbiAgICAgIHJldHVybiAwOyAvLyBBbHJlYWR5IGNvbXBsZXRlXHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2ltcGxlIGVzdGltYXRpb246IGFzc3VtZSAzMCBzZWNvbmRzIHBlciByZW1haW5pbmcgdm90ZVxyXG4gICAgLy8gSW4gYSByZWFsIHN5c3RlbSwgeW91IG1pZ2h0IGFuYWx5emUgaGlzdG9yaWNhbCB2b3RpbmcgcGF0dGVybnNcclxuICAgIGNvbnN0IHJlbWFpbmluZ1ZvdGVzID0gdG90YWxNZW1iZXJzIC0gY3VycmVudFZvdGVzO1xyXG4gICAgY29uc3QgZXN0aW1hdGVkU2Vjb25kcyA9IHJlbWFpbmluZ1ZvdGVzICogMzA7XHJcblxyXG4gICAgcmV0dXJuIGVzdGltYXRlZFNlY29uZHM7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2Fybign4pqg77iPIEVycm9yIGVzdGltYXRpbmcgdm90aW5nIGNvbXBsZXRpb246JywgZXJyb3IpO1xyXG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgY3VycmVudCByb29tIHN0YXRlIGZvciBzeW5jaHJvbml6YXRpb25cclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldEN1cnJlbnRSb29tU3RhdGUocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPFJvb21TdGF0ZUV2ZW50Wydyb29tU3RhdGUnXT4ge1xyXG4gIHRyeSB7XHJcbiAgICAvLyBHZXQgcm9vbSBpbmZvXHJcbiAgICBjb25zdCByb29tUmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGNvbnN0IHJvb20gPSByb29tUmVzcG9uc2UuSXRlbTtcclxuICAgIGlmICghcm9vbSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFJvb20gJHtyb29tSWR9IG5vdCBmb3VuZGApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCBtZW1iZXIgY291bnRcclxuICAgIGNvbnN0IG1lbWJlcnNSZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICdyb29tSWQgPSA6cm9vbUlkJyxcclxuICAgICAgRmlsdGVyRXhwcmVzc2lvbjogJ2lzQWN0aXZlID0gOmFjdGl2ZScsXHJcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAnOnJvb21JZCc6IHJvb21JZCxcclxuICAgICAgICAnOmFjdGl2ZSc6IHRydWVcclxuICAgICAgfSxcclxuICAgICAgU2VsZWN0OiAnQ09VTlQnXHJcbiAgICB9KSk7XHJcblxyXG4gICAgY29uc3QgdG90YWxNZW1iZXJzID0gbWVtYmVyc1Jlc3BvbnNlLkNvdW50IHx8IDA7XHJcblxyXG4gICAgLy8gR2V0IGN1cnJlbnQgdm90aW5nIHByb2dyZXNzIGlmIHJvb20gaXMgYWN0aXZlXHJcbiAgICBsZXQgdm90aW5nUHJvZ3Jlc3MgPSB7XHJcbiAgICAgIGN1cnJlbnRWb3RlczogMCxcclxuICAgICAgdG90YWxSZXF1aXJlZDogdG90YWxNZW1iZXJzLFxyXG4gICAgICBwZXJjZW50YWdlOiAwXHJcbiAgICB9O1xyXG5cclxuICAgIGlmIChyb29tLnN0YXR1cyA9PT0gJ0FDVElWRScgJiYgcm9vbS5jdXJyZW50TW92aWVJZCkge1xyXG4gICAgICBjb25zdCB2b3Rlc1Jlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuVk9URVNfVEFCTEUhLFxyXG4gICAgICAgIEtleTogeyByb29tSWQsIG1vdmllSWQ6IHJvb20uY3VycmVudE1vdmllSWQgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgY29uc3QgY3VycmVudFZvdGVzID0gdm90ZXNSZXNwb25zZS5JdGVtPy52b3RlcyB8fCAwO1xyXG4gICAgICB2b3RpbmdQcm9ncmVzcyA9IHtcclxuICAgICAgICBjdXJyZW50Vm90ZXMsXHJcbiAgICAgICAgdG90YWxSZXF1aXJlZDogdG90YWxNZW1iZXJzLFxyXG4gICAgICAgIHBlcmNlbnRhZ2U6IHRvdGFsTWVtYmVycyA+IDAgPyAoY3VycmVudFZvdGVzIC8gdG90YWxNZW1iZXJzKSAqIDEwMCA6IDBcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgY3VycmVudCBtb3ZpZSBpbmZvIGlmIGF2YWlsYWJsZVxyXG4gICAgbGV0IGN1cnJlbnRNb3ZpZUluZm87XHJcbiAgICBpZiAocm9vbS5jdXJyZW50TW92aWVJZCkge1xyXG4gICAgICBjb25zdCBtb3ZpZUluZm8gPSBhd2FpdCBnZXRFbmhhbmNlZE1vdmllSW5mbyhyb29tLmN1cnJlbnRNb3ZpZUlkKTtcclxuICAgICAgY3VycmVudE1vdmllSW5mbyA9IHtcclxuICAgICAgICB0aXRsZTogbW92aWVJbmZvLnRpdGxlLFxyXG4gICAgICAgIGdlbnJlczogbW92aWVJbmZvLmdlbnJlcyxcclxuICAgICAgICBwb3N0ZXJQYXRoOiBtb3ZpZUluZm8ucG9zdGVyUGF0aFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCBtYXRjaCByZXN1bHQgaWYgcm9vbSBpcyBtYXRjaGVkXHJcbiAgICBsZXQgbWF0Y2hSZXN1bHQ7XHJcbiAgICBpZiAocm9vbS5zdGF0dXMgPT09ICdNQVRDSEVEJyAmJiByb29tLnJlc3VsdE1vdmllSWQpIHtcclxuICAgICAgY29uc3QgbWF0Y2hNb3ZpZUluZm8gPSBhd2FpdCBnZXRFbmhhbmNlZE1vdmllSW5mbyhyb29tLnJlc3VsdE1vdmllSWQpO1xyXG4gICAgICBtYXRjaFJlc3VsdCA9IHtcclxuICAgICAgICBtb3ZpZUlkOiByb29tLnJlc3VsdE1vdmllSWQsXHJcbiAgICAgICAgbW92aWVUaXRsZTogbWF0Y2hNb3ZpZUluZm8udGl0bGUsXHJcbiAgICAgICAgZm91bmRBdDogcm9vbS51cGRhdGVkQXQgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RhdHVzOiByb29tLnN0YXR1cyxcclxuICAgICAgY3VycmVudE1vdmllSWQ6IHJvb20uY3VycmVudE1vdmllSWQsXHJcbiAgICAgIGN1cnJlbnRNb3ZpZUluZm8sXHJcbiAgICAgIHRvdGFsTWVtYmVycyxcclxuICAgICAgYWN0aXZlQ29ubmVjdGlvbnM6IHRvdGFsTWVtYmVycywgLy8gU2ltcGxpZmllZCAtIGluIHJlYWwgc3lzdGVtIHRyYWNrIGFjdHVhbCBjb25uZWN0aW9uc1xyXG4gICAgICB2b3RpbmdQcm9ncmVzcyxcclxuICAgICAgbWF0Y2hSZXN1bHRcclxuICAgIH07XHJcblxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZ2V0dGluZyBjdXJyZW50IHJvb20gc3RhdGU6JywgZXJyb3IpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUHVibGlzaCBldmVudCB0byBhbGwgc3Vic2NyaWJlcnMgb2YgYSByb29tIHZpYSBBcHBTeW5jIE11dGF0aW9uXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBwdWJsaXNoVG9Sb29tU3Vic2NyaWJlcnMocm9vbUlkOiBzdHJpbmcsIGV2ZW50OiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcclxuICBjb25zdCBlbmRwb2ludCA9IHByb2Nlc3MuZW52LkFQUFNZTkNfRU5EUE9JTlQ7XHJcbiAgY29uc3QgYXBpS2V5ID0gcHJvY2Vzcy5lbnYuQVBQU1lOQ19BUElfS0VZOyAvLyBJZiB1c2luZyBBUEkgS2V5XHJcbiAgLy8gT3IgdXNlIElBTSBzaWduaW5nIGlmIGNvbmZpZ3VyZWQuIEZvciBzaW1wbGUgc2V0dXBzLCB1c3VhbGx5IEFQSSBLZXkgb3IganVzdCB1bmF1dGhlbnRpY2F0ZWQgaWYgZW5hYmxlZCAoYnV0IExhbWJkYSB1c3VhbGx5IGhhcyBJQU0pXHJcblxyXG4gIC8vIEFjdHVhbGx5LCBmcm9tIGEgTGFtYmRhIHJlc29sdmVyLCB3ZSBvZnRlbiBpbnZva2UgdGhlIG11dGF0aW9uIGRpcmVjdGx5IHZpYSBIVFRQXHJcbiAgLy8gQnV0IHdhaXQsIGlmIHRoaXMgY29kZSBydW5zIElOU0lERSBhIExhbWJkYSByZXNvbHZlciwgd2UgYXJlIGFscmVhZHkgaW4gQXBwU3luYz8gbm8sIHdlIGFyZSBpbiBhIExhbWJkYSBkYXRhIHNvdXJjZS5cclxuICAvLyBUbyB0cmlnZ2VyIGEgc3Vic2NyaXB0aW9uLCB3ZSBNVVNUIGV4ZWN1dGUgYSBtdXRhdGlvbiBhZ2FpbnN0IHRoZSBBcHBTeW5jIEFQSS5cclxuXHJcbiAgaWYgKCFlbmRwb2ludCkge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gQVBQU1lOQ19FTkRQT0lOVCBub3QgZGVmaW5lZCwgY2Fubm90IHB1Ymxpc2ggZXZlbnQnKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIC8vIERldGVybWluZSB3aGljaCBtdXRhdGlvbiB0byBjYWxsIGJhc2VkIG9uIGV2ZW50IHR5cGVcclxuICBsZXQgbXV0YXRpb24gPSAnJztcclxuICBsZXQgdmFyaWFibGVzID0ge307XHJcbiAgbGV0IG9wZXJhdGlvbk5hbWUgPSAnJztcclxuXHJcbiAgc3dpdGNoIChldmVudC5ldmVudFR5cGUpIHtcclxuICAgIGNhc2UgJ1ZPVEVfVVBEQVRFJzpcclxuICAgICAgb3BlcmF0aW9uTmFtZSA9ICdQdWJsaXNoVm90ZVVwZGF0ZSc7XHJcbiAgICAgIG11dGF0aW9uID0gYFxyXG4gICAgICAgIG11dGF0aW9uIFB1Ymxpc2hWb3RlVXBkYXRlKCRyb29tSWQ6IElEISwgJHZvdGVVcGRhdGVEYXRhOiBBV1NKU09OISkge1xyXG4gICAgICAgICAgcHVibGlzaFZvdGVVcGRhdGVFdmVudChyb29tSWQ6ICRyb29tSWQsIHZvdGVVcGRhdGVEYXRhOiAkdm90ZVVwZGF0ZURhdGEpIHtcclxuICAgICAgICAgICAgaWRcclxuICAgICAgICAgICAgdGltZXN0YW1wXHJcbiAgICAgICAgICAgIHJvb21JZFxyXG4gICAgICAgICAgICBldmVudFR5cGVcclxuICAgICAgICAgICAgcHJvZ3Jlc3Mge1xyXG4gICAgICAgICAgICAgIHRvdGFsVm90ZXNcclxuICAgICAgICAgICAgICBsaWtlc0NvdW50XHJcbiAgICAgICAgICAgICAgcGVyY2VudGFnZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICBgO1xyXG4gICAgICAvLyBBTFNPIGNhbGwgbGVnYWN5IHB1Ymxpc2hWb3RlRXZlbnQgZm9yIGxlZ2FjeSBzdWJzY3JpYmVyc1xyXG4gICAgICBjb25zdCBsZWdhY3lNdXRhdGlvbiA9IGBcclxuICAgICAgICBtdXRhdGlvbiBQdWJsaXNoVm90ZSgkcm9vbUlkOiBJRCEsICR2b3RlRGF0YTogQVdTSlNPTiEpIHtcclxuICAgICAgICAgIHB1Ymxpc2hWb3RlRXZlbnQocm9vbUlkOiAkcm9vbUlkLCB2b3RlRGF0YTogJHZvdGVEYXRhKSB7XHJcbiAgICAgICAgICAgIGlkXHJcbiAgICAgICAgICAgIHRpbWVzdGFtcFxyXG4gICAgICAgICAgICByb29tSWRcclxuICAgICAgICAgICAgZXZlbnRUeXBlXHJcbiAgICAgICAgICAgIHVzZXJJZFxyXG4gICAgICAgICAgICBtZWRpYUlkXHJcbiAgICAgICAgICAgIHZvdGVUeXBlXHJcbiAgICAgICAgICAgIHByb2dyZXNzIHtcclxuICAgICAgICAgICAgICB0b3RhbFZvdGVzXHJcbiAgICAgICAgICAgICAgbGlrZXNDb3VudFxyXG4gICAgICAgICAgICAgIHBlcmNlbnRhZ2VcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgYDtcclxuICAgICAgLy8gV2UnbGwgZXhlY3V0ZSB0aGlzIG9uZSB0b28gb3IgaW5zdGVhZC4gVGhlIGxvZ3Mgc2hvd2VkIGVycm9ycyBvbiAnVm90ZUV2ZW50Jywgc28gbGV0J3MgZm9jdXMgb24gbGVnYWN5IGZpcnN0IGlmIHRoYXQncyB3aGF0IGZyb250ZW5kIHVzZXMuXHJcbiAgICAgIC8vIEZyb250ZW50IGxvZ3M6IFwiV2ViU29ja2V0IGVycm9yIGZvciB2b3RlLXVwZGF0ZXMgLi4uIHBhcmVudCAnVm90ZUV2ZW50J1wiXHJcbiAgICAgIC8vIFNjaGVtYTogb25Wb3RlVXBkYXRlIC0+IHB1Ymxpc2hWb3RlRXZlbnQgLT4gcmV0dXJucyBWb3RlRXZlbnRcclxuXHJcbiAgICAgIC8vIFNvIHdlIE1VU1QgY2FsbCBwdWJsaXNoVm90ZUV2ZW50LlxyXG4gICAgICAvLyBDb25zdHJ1Y3QgVm90ZUV2ZW50IHBheWxvYWQgZnJvbSBWb3RlVXBkYXRlRXZlbnRcclxuICAgICAgY29uc3Qgdm90ZURhdGEgPSB7XHJcbiAgICAgICAgaWQ6IGV2ZW50LmlkLFxyXG4gICAgICAgIHRpbWVzdGFtcDogZXZlbnQudGltZXN0YW1wLFxyXG4gICAgICAgIHJvb21JZDogZXZlbnQucm9vbUlkLFxyXG4gICAgICAgIGV2ZW50VHlwZTogZXZlbnQuZXZlbnRUeXBlLFxyXG4gICAgICAgIHVzZXJJZDogZXZlbnQudXNlcklkLFxyXG4gICAgICAgIG1lZGlhSWQ6IGV2ZW50Lm1lZGlhSWQsXHJcbiAgICAgICAgdm90ZVR5cGU6IGV2ZW50LnZvdGVUeXBlLFxyXG4gICAgICAgIHByb2dyZXNzOiBldmVudC5wcm9ncmVzc1xyXG4gICAgICB9O1xyXG5cclxuICAgICAgbXV0YXRpb24gPSBsZWdhY3lNdXRhdGlvbjtcclxuICAgICAgdmFyaWFibGVzID0geyByb29tSWQsIHZvdGVEYXRhOiBKU09OLnN0cmluZ2lmeSh2b3RlRGF0YSkgfTtcclxuICAgICAgYnJlYWs7XHJcblxyXG4gICAgY2FzZSAnTUFUQ0hfRk9VTkQnOlxyXG4gICAgICAvLyBTY2hlbWE6IG9uTWF0Y2hGb3VuZCAtPiBwdWJsaXNoTWF0Y2hFdmVudCAtPiByZXR1cm5zIE1hdGNoRXZlbnRcclxuICAgICAgLy8gU2NoZW1hOiBNYXRjaEV2ZW50IGhhcyB7IGlkLCB0aW1lc3RhbXAsIHJvb21JZCwgZXZlbnRUeXBlLCBtYXRjaElkLCBtZWRpYUlkLCBtZWRpYVRpdGxlLi4uIH1cclxuICAgICAgbXV0YXRpb24gPSBgXHJcbiAgICAgICAgICBtdXRhdGlvbiBQdWJsaXNoTWF0Y2goJHJvb21JZDogSUQhLCAkbWF0Y2hEYXRhOiBBV1NKU09OISkge1xyXG4gICAgICAgICAgICBwdWJsaXNoTWF0Y2hGb3VuZEV2ZW50KHJvb21JZDogJHJvb21JZCwgbWF0Y2hEYXRhOiAkbWF0Y2hEYXRhKSB7XHJcbiAgICAgICAgICAgICAgaWRcclxuICAgICAgICAgICAgICB0aW1lc3RhbXBcclxuICAgICAgICAgICAgICByb29tSWRcclxuICAgICAgICAgICAgICBldmVudFR5cGVcclxuICAgICAgICAgICAgICBtYXRjaElkXHJcbiAgICAgICAgICAgICAgbWVkaWFJZFxyXG4gICAgICAgICAgICAgIG1lZGlhVGl0bGVcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIGA7XHJcblxyXG4gICAgICBjb25zdCBtYXRjaERhdGEgPSB7XHJcbiAgICAgICAgaWQ6IGV2ZW50LmlkLFxyXG4gICAgICAgIHRpbWVzdGFtcDogZXZlbnQudGltZXN0YW1wLFxyXG4gICAgICAgIHJvb21JZDogZXZlbnQucm9vbUlkLFxyXG4gICAgICAgIGV2ZW50VHlwZTogZXZlbnQuZXZlbnRUeXBlLFxyXG4gICAgICAgIG1hdGNoSWQ6IGV2ZW50Lm1hdGNoSWQsXHJcbiAgICAgICAgbWVkaWFJZDogZXZlbnQubWVkaWFJZCxcclxuICAgICAgICBtZWRpYVRpdGxlOiBldmVudC5tZWRpYVRpdGxlLFxyXG4gICAgICAgIHBhcnRpY2lwYW50czogZXZlbnQucGFydGljaXBhbnRzLm1hcCgocDogYW55KSA9PiBwLnVzZXJJZCksIC8vIE1hdGNoRXZlbnQgZXhwZWN0cyBzaW1wbGUgbGlzdCBvZiBJRHMgYXMgcGVyIFNjaGVtYT8gXHJcbiAgICAgICAgLy8gV2FpdCwgc2NoZW1hIHNheXM6IHBhcnRpY2lwYW50czogW0lEIV0hIGZvciBNYXRjaEV2ZW50XHJcbiAgICAgICAgLy8gQnV0IGFwcHN5bmMtcHVibGlzaGVyIHNheXMgcGFydGljaXBhbnRzOiBQYXJ0aWNpcGFudEluZm9bXSBmb3IgTWF0Y2hGb3VuZEV2ZW50IGludGVyZmFjZS5cclxuICAgICAgICAvLyBtYXBwaW5nOlxyXG4gICAgICAgIGNvbnNlbnN1c1R5cGU6IGV2ZW50LmNvbnNlbnN1c1R5cGUgfHwgJ1VOQU5JTU9VUydcclxuICAgICAgfTtcclxuICAgICAgdmFyaWFibGVzID0geyByb29tSWQsIG1hdGNoRGF0YTogSlNPTi5zdHJpbmdpZnkobWF0Y2hEYXRhKSB9O1xyXG4gICAgICBicmVhaztcclxuXHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICBjb25zb2xlLndhcm4oYFVubWFwcGVkIGV2ZW50IHR5cGUgZm9yIHB1Ymxpc2hpbmc6ICR7ZXZlbnQuZXZlbnRUeXBlfWApO1xyXG4gICAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICB0cnkge1xyXG4gICAgY29uc3QgZmV0Y2ggPSByZXF1aXJlKCdub2RlLWZldGNoJyk7IC8vIEVuc3VyZSBub2RlLWZldGNoIGlzIGF2YWlsYWJsZVxyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChlbmRwb2ludCwge1xyXG4gICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgJ3gtYXBpLWtleSc6IGFwaUtleSB8fCAnJywgLy8gVXNlIEFQSSBLZXkgaWYgYXZhaWxhYmxlLCBlbHNlIGJsYW5rIChtaWdodCBmYWlsIGlmIElBTSByZXF1aXJlZClcclxuICAgICAgfSxcclxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBxdWVyeTogbXV0YXRpb24sIHZhcmlhYmxlcyB9KVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgcmVzdWx0OiBhbnkgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgQXBwU3luYyBQdWJsaXNoIEVycm9yOicsIEpTT04uc3RyaW5naWZ5KHJlc3VsdC5lcnJvcnMpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRXZlbnQgcHVibGlzaGVkIHN1Y2Nlc3NmdWxseSB0byAke2VuZHBvaW50fWApO1xyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgcHVibGlzaGluZyB0byBBcHBTeW5jOicsIGVycm9yKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBQdWJsaXNoIGV2ZW50IHRvIGEgc3BlY2lmaWMgdXNlciBpbiBhIHJvb21cclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHB1Ymxpc2hUb1VzZXJJblJvb20ocm9vbUlkOiBzdHJpbmcsIHVzZXJJZDogc3RyaW5nLCBldmVudDogYW55KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnNvbGUubG9nKGDwn5OhIFB1Ymxpc2hpbmcgdG8gdXNlciAke3VzZXJJZH0gaW4gcm9vbSAke3Jvb21JZH06YCwge1xyXG4gICAgICBldmVudFR5cGU6IGV2ZW50LmV2ZW50VHlwZSxcclxuICAgICAgZXZlbnRJZDogZXZlbnQuaWRcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEluIHByb2R1Y3Rpb24sIHRoaXMgd291bGQgdGFyZ2V0IHRoZSBzcGVjaWZpYyB1c2VyJ3Mgc3Vic2NyaXB0aW9uXHJcblxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgcHVibGlzaGluZyB0byB1c2VyIGluIHJvb206JywgZXJyb3IpO1xyXG4gIH1cclxufSJdfQ==