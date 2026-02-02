"use strict";
/**
 * Shared Components Index - Extracted from MONOLITH files
 *
 * Central export point for all shared business logic components
 *
 * Requirements: 1.4, 3.1, 3.5
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUSINESS_LOGIC_CONSTANTS = exports.MetricTimer = exports.MonitoringService = exports.monitoring = exports.ErrorFactory = exports.ErrorHandler = exports.handleErrors = exports.createLogger = exports.ConfigUtils = exports.configLoader = exports.ConfigLoader = exports.BusinessLogicFactory = exports.DynamoDBService = exports.ContentFilterService = exports.GENRE_MAPPING = exports.EnhancedTMDBClient = void 0;
exports.createBusinessLogicDependencies = createBusinessLogicDependencies;
exports.createRoomWithMovieCache = createRoomWithMovieCache;
exports.validateBusinessLogic = validateBusinessLogic;
// Core business logic components
var enhanced_tmdb_client_js_1 = require("./enhanced-tmdb-client.js");
Object.defineProperty(exports, "EnhancedTMDBClient", { enumerable: true, get: function () { return enhanced_tmdb_client_js_1.EnhancedTMDBClient; } });
Object.defineProperty(exports, "GENRE_MAPPING", { enumerable: true, get: function () { return enhanced_tmdb_client_js_1.GENRE_MAPPING; } });
var content_filter_service_js_1 = require("./content-filter-service.js");
Object.defineProperty(exports, "ContentFilterService", { enumerable: true, get: function () { return content_filter_service_js_1.ContentFilterService; } });
var dynamodb_service_js_1 = require("./dynamodb-service.js");
Object.defineProperty(exports, "DynamoDBService", { enumerable: true, get: function () { return dynamodb_service_js_1.DynamoDBService; } });
var business_logic_factory_js_1 = require("./business-logic-factory.js");
Object.defineProperty(exports, "BusinessLogicFactory", { enumerable: true, get: function () { return business_logic_factory_js_1.BusinessLogicFactory; } });
// Types and interfaces
__exportStar(require("./business-logic-types.js"), exports);
__exportStar(require("./types.js"), exports);
// Existing shared components
var config_loader_js_1 = require("./config-loader.js");
Object.defineProperty(exports, "ConfigLoader", { enumerable: true, get: function () { return config_loader_js_1.ConfigLoader; } });
Object.defineProperty(exports, "configLoader", { enumerable: true, get: function () { return config_loader_js_1.configLoader; } });
Object.defineProperty(exports, "ConfigUtils", { enumerable: true, get: function () { return config_loader_js_1.ConfigUtils; } });
var logger_js_1 = require("./logger.js");
Object.defineProperty(exports, "createLogger", { enumerable: true, get: function () { return logger_js_1.createLogger; } });
var error_handler_js_1 = require("./error-handler.js");
Object.defineProperty(exports, "handleErrors", { enumerable: true, get: function () { return error_handler_js_1.handleErrors; } });
Object.defineProperty(exports, "ErrorHandler", { enumerable: true, get: function () { return error_handler_js_1.ErrorHandler; } });
Object.defineProperty(exports, "ErrorFactory", { enumerable: true, get: function () { return error_handler_js_1.ErrorFactory; } });
var monitoring_js_1 = require("./monitoring.js");
Object.defineProperty(exports, "monitoring", { enumerable: true, get: function () { return monitoring_js_1.monitoring; } });
Object.defineProperty(exports, "MonitoringService", { enumerable: true, get: function () { return monitoring_js_1.MonitoringService; } });
Object.defineProperty(exports, "MetricTimer", { enumerable: true, get: function () { return monitoring_js_1.MetricTimer; } });
// Constants
var business_logic_types_js_1 = require("./business-logic-types.js");
Object.defineProperty(exports, "BUSINESS_LOGIC_CONSTANTS", { enumerable: true, get: function () { return business_logic_types_js_1.BUSINESS_LOGIC_CONSTANTS; } });
// Import for internal use
const business_logic_factory_js_2 = require("./business-logic-factory.js");
/**
 * Quick access factory function for getting all business logic dependencies
 */
function createBusinessLogicDependencies(apiKey) {
    return business_logic_factory_js_2.BusinessLogicFactory.getInstance().getAllDependencies(apiKey);
}
/**
 * Quick access function for creating a room with 50-movie cache
 */
function createRoomWithMovieCache(roomData, apiKey) {
    return business_logic_factory_js_2.BusinessLogicFactory.getInstance().createRoomWithCache(roomData, apiKey);
}
/**
 * Quick access function for validating business logic integrity
 */
function validateBusinessLogic(apiKey) {
    return business_logic_factory_js_2.BusinessLogicFactory.getInstance().validateBusinessLogicIntegrity(apiKey);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7Ozs7Ozs7OztBQThDSCwwRUFFQztBQUtELDREQVdDO0FBS0Qsc0RBRUM7QUFyRUQsaUNBQWlDO0FBQ2pDLHFFQUE4RTtBQUFyRSw2SEFBQSxrQkFBa0IsT0FBQTtBQUFFLHdIQUFBLGFBQWEsT0FBQTtBQUMxQyx5RUFBbUU7QUFBMUQsaUlBQUEsb0JBQW9CLE9BQUE7QUFDN0IsNkRBQXdEO0FBQS9DLHNIQUFBLGVBQWUsT0FBQTtBQUN4Qix5RUFBbUU7QUFBMUQsaUlBQUEsb0JBQW9CLE9BQUE7QUFFN0IsdUJBQXVCO0FBQ3ZCLDREQUEwQztBQUMxQyw2Q0FBMkI7QUFFM0IsNkJBQTZCO0FBQzdCLHVEQUE2RTtBQUFwRSxnSEFBQSxZQUFZLE9BQUE7QUFBRSxnSEFBQSxZQUFZLE9BQUE7QUFBRSwrR0FBQSxXQUFXLE9BQUE7QUFDaEQseUNBQTJDO0FBQWxDLHlHQUFBLFlBQVksT0FBQTtBQUNyQix1REFBOEU7QUFBckUsZ0hBQUEsWUFBWSxPQUFBO0FBQUUsZ0hBQUEsWUFBWSxPQUFBO0FBQUUsZ0hBQUEsWUFBWSxPQUFBO0FBQ2pELGlEQUE2RTtBQUFwRSwyR0FBQSxVQUFVLE9BQUE7QUFBRSxrSEFBQSxpQkFBaUIsT0FBQTtBQUFFLDRHQUFBLFdBQVcsT0FBQTtBQXFCbkQsWUFBWTtBQUNaLHFFQUFxRTtBQUE1RCxtSUFBQSx3QkFBd0IsT0FBQTtBQUVqQywwQkFBMEI7QUFDMUIsMkVBQW1FO0FBRW5FOztHQUVHO0FBQ0gsU0FBZ0IsK0JBQStCLENBQUMsTUFBZTtJQUM3RCxPQUFPLGdEQUFvQixDQUFDLFdBQVcsRUFBRSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3ZFLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQWdCLHdCQUF3QixDQUN0QyxRQU1DLEVBQ0QsTUFBZTtJQUVmLE9BQU8sZ0RBQW9CLENBQUMsV0FBVyxFQUFFLENBQUMsbUJBQW1CLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQWdCLHFCQUFxQixDQUFDLE1BQWU7SUFDbkQsT0FBTyxnREFBb0IsQ0FBQyxXQUFXLEVBQUUsQ0FBQyw4QkFBOEIsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNuRixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIFNoYXJlZCBDb21wb25lbnRzIEluZGV4IC0gRXh0cmFjdGVkIGZyb20gTU9OT0xJVEggZmlsZXNcclxuICogXHJcbiAqIENlbnRyYWwgZXhwb3J0IHBvaW50IGZvciBhbGwgc2hhcmVkIGJ1c2luZXNzIGxvZ2ljIGNvbXBvbmVudHNcclxuICogXHJcbiAqIFJlcXVpcmVtZW50czogMS40LCAzLjEsIDMuNVxyXG4gKi9cclxuXHJcbi8vIENvcmUgYnVzaW5lc3MgbG9naWMgY29tcG9uZW50c1xyXG5leHBvcnQgeyBFbmhhbmNlZFRNREJDbGllbnQsIEdFTlJFX01BUFBJTkcgfSBmcm9tICcuL2VuaGFuY2VkLXRtZGItY2xpZW50LmpzJztcclxuZXhwb3J0IHsgQ29udGVudEZpbHRlclNlcnZpY2UgfSBmcm9tICcuL2NvbnRlbnQtZmlsdGVyLXNlcnZpY2UuanMnO1xyXG5leHBvcnQgeyBEeW5hbW9EQlNlcnZpY2UgfSBmcm9tICcuL2R5bmFtb2RiLXNlcnZpY2UuanMnO1xyXG5leHBvcnQgeyBCdXNpbmVzc0xvZ2ljRmFjdG9yeSB9IGZyb20gJy4vYnVzaW5lc3MtbG9naWMtZmFjdG9yeS5qcyc7XHJcblxyXG4vLyBUeXBlcyBhbmQgaW50ZXJmYWNlc1xyXG5leHBvcnQgKiBmcm9tICcuL2J1c2luZXNzLWxvZ2ljLXR5cGVzLmpzJztcclxuZXhwb3J0ICogZnJvbSAnLi90eXBlcy5qcyc7XHJcblxyXG4vLyBFeGlzdGluZyBzaGFyZWQgY29tcG9uZW50c1xyXG5leHBvcnQgeyBDb25maWdMb2FkZXIsIGNvbmZpZ0xvYWRlciwgQ29uZmlnVXRpbHMgfSBmcm9tICcuL2NvbmZpZy1sb2FkZXIuanMnO1xyXG5leHBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuL2xvZ2dlci5qcyc7XHJcbmV4cG9ydCB7IGhhbmRsZUVycm9ycywgRXJyb3JIYW5kbGVyLCBFcnJvckZhY3RvcnkgfSBmcm9tICcuL2Vycm9yLWhhbmRsZXIuanMnO1xyXG5leHBvcnQgeyBtb25pdG9yaW5nLCBNb25pdG9yaW5nU2VydmljZSwgTWV0cmljVGltZXIgfSBmcm9tICcuL21vbml0b3JpbmcuanMnO1xyXG5cclxuLy8gUmUtZXhwb3J0IGNvbW1vbmx5IHVzZWQgdHlwZXMgZm9yIGNvbnZlbmllbmNlXHJcbmV4cG9ydCB0eXBlIHtcclxuICBUTURCU2VhcmNoUGFyYW1zLFxyXG4gIFRNREJJdGVtLFxyXG4gIFRNREJHZW5yZSxcclxuICBGaWx0ZXJDcml0ZXJpYSxcclxuICBWYWxpZGF0ZWRDb250ZW50LFxyXG4gIEJ1c2luZXNzTG9naWNEZXBlbmRlbmNpZXNcclxufSBmcm9tICcuL2J1c2luZXNzLWxvZ2ljLXR5cGVzLmpzJztcclxuXHJcbmV4cG9ydCB0eXBlIHtcclxuICBBcHBTeW5jRXZlbnQsXHJcbiAgTGFtYmRhUmVzcG9uc2UsXHJcbiAgVHJpbml0eVJvb20sXHJcbiAgVHJpbml0eVVzZXIsXHJcbiAgVHJpbml0eVZvdGUsXHJcbiAgVHJpbml0eU1vdmllXHJcbn0gZnJvbSAnLi90eXBlcy5qcyc7XHJcblxyXG4vLyBDb25zdGFudHNcclxuZXhwb3J0IHsgQlVTSU5FU1NfTE9HSUNfQ09OU1RBTlRTIH0gZnJvbSAnLi9idXNpbmVzcy1sb2dpYy10eXBlcy5qcyc7XHJcblxyXG4vLyBJbXBvcnQgZm9yIGludGVybmFsIHVzZVxyXG5pbXBvcnQgeyBCdXNpbmVzc0xvZ2ljRmFjdG9yeSB9IGZyb20gJy4vYnVzaW5lc3MtbG9naWMtZmFjdG9yeS5qcyc7XHJcblxyXG4vKipcclxuICogUXVpY2sgYWNjZXNzIGZhY3RvcnkgZnVuY3Rpb24gZm9yIGdldHRpbmcgYWxsIGJ1c2luZXNzIGxvZ2ljIGRlcGVuZGVuY2llc1xyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUJ1c2luZXNzTG9naWNEZXBlbmRlbmNpZXMoYXBpS2V5Pzogc3RyaW5nKSB7XHJcbiAgcmV0dXJuIEJ1c2luZXNzTG9naWNGYWN0b3J5LmdldEluc3RhbmNlKCkuZ2V0QWxsRGVwZW5kZW5jaWVzKGFwaUtleSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBRdWljayBhY2Nlc3MgZnVuY3Rpb24gZm9yIGNyZWF0aW5nIGEgcm9vbSB3aXRoIDUwLW1vdmllIGNhY2hlXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUm9vbVdpdGhNb3ZpZUNhY2hlKFxyXG4gIHJvb21EYXRhOiB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBtZWRpYVR5cGU6ICdNT1ZJRScgfCAnVFYnO1xyXG4gICAgZ2VucmVJZHM6IG51bWJlcltdO1xyXG4gICAgaG9zdElkOiBzdHJpbmc7XHJcbiAgICBtYXhNZW1iZXJzOiBudW1iZXI7XHJcbiAgfSxcclxuICBhcGlLZXk/OiBzdHJpbmdcclxuKSB7XHJcbiAgcmV0dXJuIEJ1c2luZXNzTG9naWNGYWN0b3J5LmdldEluc3RhbmNlKCkuY3JlYXRlUm9vbVdpdGhDYWNoZShyb29tRGF0YSwgYXBpS2V5KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFF1aWNrIGFjY2VzcyBmdW5jdGlvbiBmb3IgdmFsaWRhdGluZyBidXNpbmVzcyBsb2dpYyBpbnRlZ3JpdHlcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZUJ1c2luZXNzTG9naWMoYXBpS2V5Pzogc3RyaW5nKSB7XHJcbiAgcmV0dXJuIEJ1c2luZXNzTG9naWNGYWN0b3J5LmdldEluc3RhbmNlKCkudmFsaWRhdGVCdXNpbmVzc0xvZ2ljSW50ZWdyaXR5KGFwaUtleSk7XHJcbn0iXX0=