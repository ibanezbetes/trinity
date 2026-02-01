const RoomMovieCacheService = require('./services/RoomMovieCacheService');

/**
 * Trinity Cache Lambda Handler
 * Manages room-based movie pre-caching system
 */

let cacheService;

// Initialize service (reuse across invocations)
function initializeService() {
  if (!cacheService) {
    cacheService = new RoomMovieCacheService();
  }
  return cacheService;
}

/**
 * Main Lambda handler
 * @param {Object} event - Lambda event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response
 */
exports.handler = async (event, context) => {
  console.log('🎬 Trinity Cache Lambda invoked:', JSON.stringify(event, null, 2));

  try {
    const service = initializeService();
    const { action, roomId, filterCriteria, batchNumber, delayHours } = event;

    let result;

    switch (action) {
      case 'createCache':
        if (!roomId || !filterCriteria) {
          throw new Error('roomId and filterCriteria are required for createCache');
        }
        result = await service.createRoomCache(roomId, filterCriteria);
        break;

      case 'getNextMovie':
        if (!roomId) {
          throw new Error('roomId is required for getNextMovie');
        }
        result = await service.getNextMovie(roomId);
        break;

      case 'getCurrentIndex':
        if (!roomId) {
          throw new Error('roomId is required for getCurrentIndex');
        }
        result = await service.getCurrentMovieIndex(roomId);
        break;

      case 'getCacheMetadata':
        if (!roomId) {
          throw new Error('roomId is required for getCacheMetadata');
        }
        result = await service.getCacheMetadata(roomId);
        break;

      case 'loadBatch':
        if (!roomId || !batchNumber) {
          throw new Error('roomId and batchNumber are required for loadBatch');
        }
        result = await service.loadMovieBatch(roomId, batchNumber);
        break;

      case 'checkBatchRefresh':
        if (!roomId) {
          throw new Error('roomId is required for checkBatchRefresh');
        }
        result = await service.checkBatchRefreshNeeded(roomId);
        break;

      case 'preloadNextBatch':
        if (!roomId) {
          throw new Error('roomId is required for preloadNextBatch');
        }
        result = await service.preloadNextBatch(roomId);
        break;

      case 'cleanupCache':
        if (!roomId) {
          throw new Error('roomId is required for cleanupCache');
        }
        result = await service.cleanupRoomCache(roomId);
        break;

      case 'scheduleCleanup':
        if (!roomId) {
          throw new Error('roomId is required for scheduleCleanup');
        }
        result = await service.scheduleCleanup(roomId, delayHours || 1);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`✅ Action ${action} completed successfully`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        action,
        result,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error(`❌ Error in Trinity Cache Lambda:`, error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        action: event.action || 'unknown',
        timestamp: new Date().toISOString()
      })
    };
  }
};