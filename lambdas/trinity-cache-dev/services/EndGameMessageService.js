/**
 * Service for managing end-game scenarios and user messaging
 * Implements different messages for regular users vs. last user
 * Tracks user voting progress independently
 */
class EndGameMessageService {
  constructor(dynamoClient) {
    this.dynamoClient = dynamoClient;
    this.VOTES_TABLE = process.env.VOTES_TABLE || 'trinity-votes-dev';
    this.ROOM_MEMBERS_TABLE = process.env.ROOM_MEMBERS_TABLE || 'trinity-room-members-dev';
    this.METADATA_TABLE = process.env.ROOM_CACHE_METADATA_TABLE || 'trinity-room-cache-metadata-dev';
    this.MOVIES_PER_ROOM = 50; // Business requirement: exactly 50 movies per room
  }

  /**
   * Determines appropriate end-game message based on user status
   * @param {string} roomId - Room identifier
   * @param {string} userId - User identifier
   * @returns {Promise<Object>} End-game message result
   */
  async determineEndGameMessage(roomId, userId) {
    console.log(`🏁 Determining end-game message for user ${userId} in room ${roomId}`);

    try {
      // Get room metadata to understand capacity
      const roomMetadata = await this.getRoomMetadata(roomId);
      if (!roomMetadata) {
        throw new Error(`No room metadata found for ${roomId}`);
      }

      const roomCapacity = roomMetadata.roomCapacity || roomMetadata.filterCriteria?.roomCapacity || 2;

      // Check if user has completed all 50 movies
      const userVotingProgress = await this.getUserVotingProgress(roomId, userId);
      
      if (userVotingProgress.votedCount < this.MOVIES_PER_ROOM) {
        // User hasn't finished voting yet
        return {
          isEndGame: false,
          message: null,
          votedCount: userVotingProgress.votedCount,
          totalMovies: this.MOVIES_PER_ROOM,
          remainingMovies: this.MOVIES_PER_ROOM - userVotingProgress.votedCount
        };
      }

      // User has completed all 50 movies - determine if they're the last user
      const isLastUser = await this.isLastUserToFinish(roomId, userId, roomCapacity);

      let message;
      let messageType;

      if (isLastUser) {
        // Last user gets the "no agreement" message
        message = "No os habeis puesto de acuerdo... Hacer otra sala.";
        messageType = 'LAST_USER_NO_MATCH';
        console.log(`🏁 User ${userId} is the LAST user to finish in room ${roomId}`);
      } else {
        // Regular user gets the "hope for luck" message
        message = "A ver si hay suerte y haceis un match";
        messageType = 'REGULAR_USER_FINISHED';
        console.log(`🏁 User ${userId} finished but is NOT the last user in room ${roomId}`);
      }

      return {
        isEndGame: true,
        message,
        messageType,
        votedCount: userVotingProgress.votedCount,
        totalMovies: this.MOVIES_PER_ROOM,
        isLastUser,
        roomCapacity,
        finishedUsers: await this.getFinishedUsersCount(roomId)
      };

    } catch (error) {
      console.error(`❌ Error determining end-game message for user ${userId} in room ${roomId}:`, error);
      
      // Fallback to generic message
      return {
        isEndGame: true,
        message: "A ver si hay suerte y haceis un match",
        messageType: 'FALLBACK',
        error: error.message
      };
    }
  }

  /**
   * Gets user voting progress in a room
   * @param {string} roomId - Room identifier
   * @param {string} userId - User identifier
   * @returns {Promise<Object>} Voting progress information
   */
  async getUserVotingProgress(roomId, userId) {
    try {
      const { QueryCommand } = require('@aws-sdk/lib-dynamodb');

      const response = await this.dynamoClient.send(new QueryCommand({
        TableName: this.VOTES_TABLE,
        KeyConditionExpression: 'roomId = :roomId AND begins_with(#userMovieId, :userIdPrefix)',
        ExpressionAttributeNames: {
          '#userMovieId': 'userId#movieId'
        },
        ExpressionAttributeValues: {
          ':roomId': roomId,
          ':userIdPrefix': `${userId}#`
        },
        ProjectionExpression: 'movieId, voteType, votedAt'
      }));

      const votes = response.Items || [];
      const votedMovieIds = new Set(votes.map(vote => vote.movieId));

      return {
        votedCount: votedMovieIds.size,
        totalVotes: votes.length,
        votedMovieIds: Array.from(votedMovieIds),
        hasFinishedAllMovies: votedMovieIds.size >= this.MOVIES_PER_ROOM
      };

    } catch (error) {
      console.error(`❌ Error getting voting progress for user ${userId} in room ${roomId}:`, error);
      return {
        votedCount: 0,
        totalVotes: 0,
        votedMovieIds: [],
        hasFinishedAllMovies: false
      };
    }
  }

  /**
   * Determines if user is the last one to finish voting in the room
   * @param {string} roomId - Room identifier
   * @param {string} userId - User identifier
   * @param {number} roomCapacity - Room capacity
   * @returns {Promise<boolean>} True if user is the last to finish
   */
  async isLastUserToFinish(roomId, userId, roomCapacity) {
    try {
      // Get all active room members
      const roomMembers = await this.getRoomMembers(roomId);
      
      if (roomMembers.length === 0) {
        console.warn(`⚠️ No room members found for room ${roomId}`);
        return false;
      }

      // Check voting progress for each member
      const memberProgressPromises = roomMembers.map(async (member) => {
        const progress = await this.getUserVotingProgress(roomId, member.userId);
        return {
          userId: member.userId,
          hasFinished: progress.hasFinishedAllMovies,
          votedCount: progress.votedCount
        };
      });

      const memberProgresses = await Promise.all(memberProgressPromises);
      
      // Count how many users have finished all 50 movies
      const finishedUsers = memberProgresses.filter(progress => progress.hasFinished);
      const unfinishedUsers = memberProgresses.filter(progress => !progress.hasFinished);

      console.log(`📊 Room ${roomId} voting status: ${finishedUsers.length}/${roomMembers.length} users finished`);
      console.log(`👥 Finished users: [${finishedUsers.map(u => u.userId).join(', ')}]`);
      console.log(`⏳ Unfinished users: [${unfinishedUsers.map(u => `${u.userId}(${u.votedCount}/50)`).join(', ')}]`);

      // User is the last to finish if:
      // 1. They have finished all movies
      // 2. All other room members have also finished OR there's only 1 unfinished user (themselves)
      const currentUserFinished = finishedUsers.some(user => user.userId === userId);
      
      if (!currentUserFinished) {
        return false; // User hasn't finished yet
      }

      // If all members have finished, the current user is among the last
      // But we need to determine if they're THE last one
      if (unfinishedUsers.length === 0) {
        // All users have finished - check if this user was the last to vote
        // This is a simplified check - in practice, you might want to track timestamps
        return finishedUsers.length === roomMembers.length && finishedUsers.length >= roomCapacity;
      }

      // If there are still unfinished users, current user is not the last
      return false;

    } catch (error) {
      console.error(`❌ Error checking if user ${userId} is last to finish in room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Gets all active members of a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object[]>} Array of room members
   */
  async getRoomMembers(roomId) {
    try {
      const { QueryCommand } = require('@aws-sdk/lib-dynamodb');

      const response = await this.dynamoClient.send(new QueryCommand({
        TableName: this.ROOM_MEMBERS_TABLE,
        KeyConditionExpression: 'roomId = :roomId',
        FilterExpression: 'isActive = :active',
        ExpressionAttributeValues: {
          ':roomId': roomId,
          ':active': true
        },
        ProjectionExpression: 'userId, #role, joinedAt',
        ExpressionAttributeNames: {
          '#role': 'role'
        }
      }));

      return response.Items || [];

    } catch (error) {
      console.error(`❌ Error getting room members for room ${roomId}:`, error);
      return [];
    }
  }

  /**
   * Gets room metadata
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object|null>} Room metadata
   */
  async getRoomMetadata(roomId) {
    try {
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');

      const response = await this.dynamoClient.send(new GetCommand({
        TableName: this.METADATA_TABLE,
        Key: { roomId }
      }));

      return response.Item || null;

    } catch (error) {
      console.error(`❌ Error getting room metadata for room ${roomId}:`, error);
      return null;
    }
  }

  /**
   * Gets count of users who have finished voting
   * @param {string} roomId - Room identifier
   * @returns {Promise<number>} Number of users who finished
   */
  async getFinishedUsersCount(roomId) {
    try {
      const roomMembers = await this.getRoomMembers(roomId);
      
      const finishedCount = await Promise.all(
        roomMembers.map(async (member) => {
          const progress = await this.getUserVotingProgress(roomId, member.userId);
          return progress.hasFinishedAllMovies ? 1 : 0;
        })
      );

      return finishedCount.reduce((sum, count) => sum + count, 0);

    } catch (error) {
      console.error(`❌ Error getting finished users count for room ${roomId}:`, error);
      return 0;
    }
  }

  /**
   * Tracks when a user finishes voting (for analytics)
   * @param {string} roomId - Room identifier
   * @param {string} userId - User identifier
   * @returns {Promise<void>}
   */
  async trackUserFinished(roomId, userId) {
    try {
      console.log(`📊 User ${userId} has finished voting in room ${roomId}`);
      
      const finishedUsersCount = await this.getFinishedUsersCount(roomId);
      const roomMembers = await this.getRoomMembers(roomId);
      
      console.log(`📈 Room ${roomId} progress: ${finishedUsersCount}/${roomMembers.length} users finished`);
      
      // You could store this information for analytics if needed
      // For now, just log it
      
    } catch (error) {
      console.error(`❌ Error tracking user finished for ${userId} in room ${roomId}:`, error);
    }
  }

  /**
   * Validates filter immutability (no changes allowed after room creation)
   * @param {string} roomId - Room identifier
   * @param {Object} newFilters - Attempted new filters
   * @returns {Promise<Object>} Validation result
   */
  async validateFilterImmutability(roomId, newFilters) {
    try {
      const roomMetadata = await this.getRoomMetadata(roomId);
      
      if (!roomMetadata) {
        return {
          isValid: false,
          error: 'Room metadata not found',
          canUpdate: false
        };
      }

      // Check if room already has filter criteria
      if (roomMetadata.filterCriteria || roomMetadata.businessLogicApplied) {
        return {
          isValid: false,
          error: 'Room filters cannot be modified after creation. Please create a new room with different filters.',
          canUpdate: false,
          existingFilters: roomMetadata.filterCriteria
        };
      }

      // If no existing filters, updates might be allowed (edge case)
      return {
        isValid: true,
        canUpdate: true,
        message: 'No existing filters found - update may be allowed'
      };

    } catch (error) {
      console.error(`❌ Error validating filter immutability for room ${roomId}:`, error);
      return {
        isValid: false,
        error: error.message,
        canUpdate: false
      };
    }
  }
}

module.exports = EndGameMessageService;