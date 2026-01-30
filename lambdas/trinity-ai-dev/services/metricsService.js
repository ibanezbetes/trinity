/**
 * CloudWatch Metrics Service for Trini AI Assistant
 * 
 * This service provides structured CloudWatch metrics collection for monitoring
 * the performance and behavior of the Trini AI Assistant.
 * 
 * **Validates: Requirements 10.1.1, 10.1.2, 10.1.3, 10.1.4**
 * 
 * Key Metrics:
 * - Trini.JSONParseFailures: Count of JSON parsing failures requiring fallback
 * - Trini.Intent.Cinema: Count of cinema-related queries
 * - Trini.Intent.Other: Count of off-topic queries
 * - Trini.TMDB.Latency: Time taken for TMDB API calls
 * - Trini.FallbackActivated: Count of fallback responses used
 */

const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

class MetricsService {
    constructor() {
        this.cloudWatch = new CloudWatchClient({});
        this.namespace = 'Trinity/AI/Trini';
        this.defaultDimensions = [
            {
                Name: 'Environment',
                Value: process.env.NODE_ENV || 'dev'
            },
            {
                Name: 'Service',
                Value: 'trinity-ai-dev'
            }
        ];
    }

    /**
     * Record JSON parsing failure metric
     * Called when resilient JSON parser falls back to regex or default response
     * 
     * @param {string} requestId - Request ID for correlation
     * @param {string} failureType - Type of failure: 'direct_parse', 'regex_fallback', 'complete_fallback'
     */
    async recordJSONParseFailure(requestId, failureType = 'unknown') {
        try {
            const params = {
                Namespace: this.namespace,
                MetricData: [
                    {
                        MetricName: 'JSONParseFailures',
                        Value: 1,
                        Unit: 'Count',
                        Timestamp: new Date(),
                        Dimensions: [
                            ...this.defaultDimensions,
                            {
                                Name: 'FailureType',
                                Value: failureType
                            }
                        ]
                    }
                ]
            };

            await this.cloudWatch.send(new PutMetricDataCommand(params));
            console.log(`📊 [${requestId}] Recorded JSONParseFailures metric: ${failureType}`);
        } catch (error) {
            console.error(`❌ [${requestId}] Failed to record JSONParseFailures metric:`, error);
            // Don't throw - metrics failures shouldn't break the main flow
        }
    }

    /**
     * Record intent classification metrics
     * Tracks the distribution of cinema vs off-topic queries
     * 
     * @param {string} requestId - Request ID for correlation
     * @param {string} intent - Intent type: 'cinema' or 'other'
     * @param {number} confidence - AI confidence score (0-1)
     */
    async recordIntentClassification(requestId, intent, confidence = 0) {
        try {
            const metricName = intent === 'cinema' ? 'Intent.Cinema' : 'Intent.Other';
            
            const params = {
                Namespace: this.namespace,
                MetricData: [
                    {
                        MetricName: metricName,
                        Value: 1,
                        Unit: 'Count',
                        Timestamp: new Date(),
                        Dimensions: [
                            ...this.defaultDimensions,
                            {
                                Name: 'Intent',
                                Value: intent
                            }
                        ]
                    },
                    {
                        MetricName: 'IntentConfidence',
                        Value: confidence,
                        Unit: 'None',
                        Timestamp: new Date(),
                        Dimensions: [
                            ...this.defaultDimensions,
                            {
                                Name: 'Intent',
                                Value: intent
                            }
                        ]
                    }
                ]
            };

            await this.cloudWatch.send(new PutMetricDataCommand(params));
            console.log(`📊 [${requestId}] Recorded intent metric: ${metricName} (confidence: ${confidence})`);
        } catch (error) {
            console.error(`❌ [${requestId}] Failed to record intent metric:`, error);
        }
    }

    /**
     * Record TMDB API latency metrics
     * Tracks performance of movie verification calls
     * 
     * @param {string} requestId - Request ID for correlation
     * @param {number} latencyMs - Latency in milliseconds
     * @param {number} movieCount - Number of movies processed
     * @param {number} successCount - Number of successful verifications
     */
    async recordTMDBLatency(requestId, latencyMs, movieCount = 0, successCount = 0) {
        try {
            const params = {
                Namespace: this.namespace,
                MetricData: [
                    {
                        MetricName: 'TMDB.Latency',
                        Value: latencyMs,
                        Unit: 'Milliseconds',
                        Timestamp: new Date(),
                        Dimensions: [
                            ...this.defaultDimensions,
                            {
                                Name: 'Operation',
                                Value: 'MovieVerification'
                            }
                        ]
                    },
                    {
                        MetricName: 'TMDB.MoviesProcessed',
                        Value: movieCount,
                        Unit: 'Count',
                        Timestamp: new Date(),
                        Dimensions: this.defaultDimensions
                    },
                    {
                        MetricName: 'TMDB.SuccessRate',
                        Value: movieCount > 0 ? (successCount / movieCount) * 100 : 0,
                        Unit: 'Percent',
                        Timestamp: new Date(),
                        Dimensions: this.defaultDimensions
                    }
                ]
            };

            await this.cloudWatch.send(new PutMetricDataCommand(params));
            console.log(`📊 [${requestId}] Recorded TMDB latency: ${latencyMs}ms (${successCount}/${movieCount} success)`);
        } catch (error) {
            console.error(`❌ [${requestId}] Failed to record TMDB latency metric:`, error);
        }
    }

    /**
     * Record fallback activation metrics
     * Tracks when fallback responses are used due to service failures
     * 
     * @param {string} requestId - Request ID for correlation
     * @param {string} fallbackType - Type of fallback: 'ai_failure', 'tmdb_failure', 'network_error', 'rate_limit', 'timeout'
     * @param {string} originalError - Original error message (sanitized)
     */
    async recordFallbackActivation(requestId, fallbackType, originalError = '') {
        try {
            const params = {
                Namespace: this.namespace,
                MetricData: [
                    {
                        MetricName: 'FallbackActivated',
                        Value: 1,
                        Unit: 'Count',
                        Timestamp: new Date(),
                        Dimensions: [
                            ...this.defaultDimensions,
                            {
                                Name: 'FallbackType',
                                Value: fallbackType
                            }
                        ]
                    }
                ]
            };

            await this.cloudWatch.send(new PutMetricDataCommand(params));
            console.log(`📊 [${requestId}] Recorded fallback activation: ${fallbackType}`);
        } catch (error) {
            console.error(`❌ [${requestId}] Failed to record fallback metric:`, error);
        }
    }

    /**
     * Record AI service performance metrics
     * Tracks Hugging Face API performance and behavior
     * 
     * @param {string} requestId - Request ID for correlation
     * @param {number} latencyMs - AI service response time
     * @param {boolean} success - Whether the AI call succeeded
     * @param {string} model - AI model used
     */
    async recordAIServicePerformance(requestId, latencyMs, success, model = 'salamandra-2b') {
        try {
            const params = {
                Namespace: this.namespace,
                MetricData: [
                    {
                        MetricName: 'AI.Latency',
                        Value: latencyMs,
                        Unit: 'Milliseconds',
                        Timestamp: new Date(),
                        Dimensions: [
                            ...this.defaultDimensions,
                            {
                                Name: 'Model',
                                Value: model
                            },
                            {
                                Name: 'Success',
                                Value: success.toString()
                            }
                        ]
                    },
                    {
                        MetricName: 'AI.Requests',
                        Value: 1,
                        Unit: 'Count',
                        Timestamp: new Date(),
                        Dimensions: [
                            ...this.defaultDimensions,
                            {
                                Name: 'Model',
                                Value: model
                            },
                            {
                                Name: 'Success',
                                Value: success.toString()
                            }
                        ]
                    }
                ]
            };

            await this.cloudWatch.send(new PutMetricDataCommand(params));
            console.log(`📊 [${requestId}] Recorded AI service performance: ${latencyMs}ms (success: ${success})`);
        } catch (error) {
            console.error(`❌ [${requestId}] Failed to record AI performance metric:`, error);
        }
    }

    /**
     * Record overall request performance metrics
     * Tracks end-to-end request processing performance
     * 
     * @param {string} requestId - Request ID for correlation
     * @param {number} totalLatencyMs - Total request processing time
     * @param {string} operation - Operation type (e.g., 'getChatRecommendations', 'askTrini')
     * @param {boolean} success - Whether the request succeeded
     */
    async recordRequestPerformance(requestId, totalLatencyMs, operation, success) {
        try {
            const params = {
                Namespace: this.namespace,
                MetricData: [
                    {
                        MetricName: 'Request.Latency',
                        Value: totalLatencyMs,
                        Unit: 'Milliseconds',
                        Timestamp: new Date(),
                        Dimensions: [
                            ...this.defaultDimensions,
                            {
                                Name: 'Operation',
                                Value: operation
                            },
                            {
                                Name: 'Success',
                                Value: success.toString()
                            }
                        ]
                    },
                    {
                        MetricName: 'Request.Count',
                        Value: 1,
                        Unit: 'Count',
                        Timestamp: new Date(),
                        Dimensions: [
                            ...this.defaultDimensions,
                            {
                                Name: 'Operation',
                                Value: operation
                            },
                            {
                                Name: 'Success',
                                Value: success.toString()
                            }
                        ]
                    }
                ]
            };

            await this.cloudWatch.send(new PutMetricDataCommand(params));
            console.log(`📊 [${requestId}] Recorded request performance: ${operation} ${totalLatencyMs}ms (success: ${success})`);
        } catch (error) {
            console.error(`❌ [${requestId}] Failed to record request performance metric:`, error);
        }
    }

    /**
     * Record chat session metrics
     * Tracks chat session usage and persistence
     * 
     * @param {string} requestId - Request ID for correlation
     * @param {string} action - Action type: 'created', 'updated', 'retrieved'
     * @param {number} messageCount - Number of messages in session
     */
    async recordChatSessionMetric(requestId, action, messageCount = 0) {
        try {
            const params = {
                Namespace: this.namespace,
                MetricData: [
                    {
                        MetricName: 'ChatSession.Actions',
                        Value: 1,
                        Unit: 'Count',
                        Timestamp: new Date(),
                        Dimensions: [
                            ...this.defaultDimensions,
                            {
                                Name: 'Action',
                                Value: action
                            }
                        ]
                    },
                    {
                        MetricName: 'ChatSession.MessageCount',
                        Value: messageCount,
                        Unit: 'Count',
                        Timestamp: new Date(),
                        Dimensions: [
                            ...this.defaultDimensions,
                            {
                                Name: 'Action',
                                Value: action
                            }
                        ]
                    }
                ]
            };

            await this.cloudWatch.send(new PutMetricDataCommand(params));
            console.log(`📊 [${requestId}] Recorded chat session metric: ${action} (${messageCount} messages)`);
        } catch (error) {
            console.error(`❌ [${requestId}] Failed to record chat session metric:`, error);
        }
    }

    /**
     * Record batch metrics for efficiency
     * Allows recording multiple metrics in a single CloudWatch call
     * 
     * @param {string} requestId - Request ID for correlation
     * @param {Array} metrics - Array of metric objects
     */
    async recordBatchMetrics(requestId, metrics) {
        try {
            if (!metrics || metrics.length === 0) {
                return;
            }

            // CloudWatch allows up to 20 metrics per call
            const batchSize = 20;
            for (let i = 0; i < metrics.length; i += batchSize) {
                const batch = metrics.slice(i, i + batchSize);
                
                const params = {
                    Namespace: this.namespace,
                    MetricData: batch.map(metric => ({
                        MetricName: metric.name,
                        Value: metric.value,
                        Unit: metric.unit || 'Count',
                        Timestamp: new Date(),
                        Dimensions: [
                            ...this.defaultDimensions,
                            ...(metric.dimensions || [])
                        ]
                    }))
                };

                await this.cloudWatch.send(new PutMetricDataCommand(params));
            }

            console.log(`📊 [${requestId}] Recorded ${metrics.length} batch metrics`);
        } catch (error) {
            console.error(`❌ [${requestId}] Failed to record batch metrics:`, error);
        }
    }
}

module.exports = MetricsService;