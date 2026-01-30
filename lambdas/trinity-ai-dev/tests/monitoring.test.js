/**
 * Tests for Monitoring and Observability Features
 * 
 * This test suite validates the CloudWatch metrics and structured logging
 * implementation for the Trini AI Assistant.
 * 
 * **Validates: Requirements 10.1.1, 10.1.2, 10.1.3, 10.1.4, 10.2.1, 10.2.2, 10.2.3, 10.2.4**
 */

const MetricsService = require('../services/metricsService');
const LoggingService = require('../services/loggingService');
const { ResilientJSONParser } = require('../utils/jsonParser');

// Mock AWS SDK
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-cloudwatch', () => ({
    CloudWatchClient: jest.fn(() => ({
        send: mockSend
    })),
    PutMetricDataCommand: jest.fn((params) => params)
}));

describe('Monitoring and Observability', () => {
    let metricsService;
    let loggingService;
    let consoleSpy;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        mockSend.mockResolvedValue({});
        
        // Mock console methods to capture structured logs
        consoleSpy = {
            log: jest.spyOn(console, 'log').mockImplementation(() => {}),
            warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
            error: jest.spyOn(console, 'error').mockImplementation(() => {})
        };
        
        // Initialize services
        metricsService = new MetricsService();
        loggingService = new LoggingService();
    });

    afterEach(() => {
        // Restore console methods
        Object.values(consoleSpy).forEach(spy => spy.mockRestore());
    });

    describe('MetricsService', () => {
        describe('JSON Parse Failure Metrics (10.1.1)', () => {
            test('should record JSON parse failure metrics', async () => {
                const requestId = 'test-request-123';
                const failureType = 'regex_fallback';

                await metricsService.recordJSONParseFailure(requestId, failureType);

                expect(mockSend).toHaveBeenCalledWith(
                    expect.objectContaining({
                        Namespace: 'Trinity/AI/Trini',
                        MetricData: expect.arrayContaining([
                            expect.objectContaining({
                                MetricName: 'JSONParseFailures',
                                Value: 1,
                                Unit: 'Count',
                                Dimensions: expect.arrayContaining([
                                    { Name: 'FailureType', Value: failureType }
                                ])
                            })
                        ])
                    })
                );
            });

            test('should handle different failure types', async () => {
                const requestId = 'test-request-123';
                const failureTypes = ['direct_parse', 'regex_fallback', 'complete_fallback'];

                for (const failureType of failureTypes) {
                    await metricsService.recordJSONParseFailure(requestId, failureType);
                }

                expect(mockSend).toHaveBeenCalledTimes(3);
            });
        });

        describe('Intent Classification Metrics (10.1.2)', () => {
            test('should record cinema intent metrics', async () => {
                const requestId = 'test-request-123';
                const intent = 'cinema';
                const confidence = 0.85;

                await metricsService.recordIntentClassification(requestId, intent, confidence);

                expect(mockSend).toHaveBeenCalledWith(
                    expect.objectContaining({
                        MetricData: expect.arrayContaining([
                            expect.objectContaining({
                                MetricName: 'Intent.Cinema',
                                Value: 1,
                                Unit: 'Count'
                            }),
                            expect.objectContaining({
                                MetricName: 'IntentConfidence',
                                Value: confidence,
                                Unit: 'None'
                            })
                        ])
                    })
                );
            });

            test('should record other intent metrics', async () => {
                const requestId = 'test-request-123';
                const intent = 'other';
                const confidence = 0.92;

                await metricsService.recordIntentClassification(requestId, intent, confidence);

                expect(mockSend).toHaveBeenCalledWith(
                    expect.objectContaining({
                        MetricData: expect.arrayContaining([
                            expect.objectContaining({
                                MetricName: 'Intent.Other',
                                Value: 1,
                                Unit: 'Count'
                            })
                        ])
                    })
                );
            });
        });

        describe('TMDB Latency Metrics (10.1.3)', () => {
            test('should record TMDB latency metrics', async () => {
                const requestId = 'test-request-123';
                const latencyMs = 250;
                const movieCount = 5;
                const successCount = 4;

                await metricsService.recordTMDBLatency(requestId, latencyMs, movieCount, successCount);

                expect(mockSend).toHaveBeenCalledWith(
                    expect.objectContaining({
                        MetricData: expect.arrayContaining([
                            expect.objectContaining({
                                MetricName: 'TMDB.Latency',
                                Value: latencyMs,
                                Unit: 'Milliseconds'
                            }),
                            expect.objectContaining({
                                MetricName: 'TMDB.MoviesProcessed',
                                Value: movieCount,
                                Unit: 'Count'
                            }),
                            expect.objectContaining({
                                MetricName: 'TMDB.SuccessRate',
                                Value: 80, // (4/5) * 100
                                Unit: 'Percent'
                            })
                        ])
                    })
                );
            });
        });

        describe('Fallback Activation Metrics (10.1.4)', () => {
            test('should record fallback activation metrics', async () => {
                const requestId = 'test-request-123';
                const fallbackType = 'rate_limit';
                const originalError = 'API rate limit exceeded';

                await metricsService.recordFallbackActivation(requestId, fallbackType, originalError);

                expect(mockSend).toHaveBeenCalledWith(
                    expect.objectContaining({
                        MetricData: expect.arrayContaining([
                            expect.objectContaining({
                                MetricName: 'FallbackActivated',
                                Value: 1,
                                Unit: 'Count',
                                Dimensions: expect.arrayContaining([
                                    { Name: 'FallbackType', Value: fallbackType }
                                ])
                            })
                        ])
                    })
                );
            });
        });

        describe('Error Handling', () => {
            test('should handle CloudWatch API errors gracefully', async () => {
                mockSend.mockRejectedValue(new Error('CloudWatch API error'));

                const requestId = 'test-request-123';
                
                // Should not throw error
                await expect(metricsService.recordJSONParseFailure(requestId, 'test')).resolves.toBeUndefined();
                
                // Should log error but continue execution
                expect(consoleSpy.error).toHaveBeenCalledWith(
                    expect.stringContaining('❌ [test-request-123] Failed to record JSONParseFailures metric'),
                    expect.any(Error)
                );
            });
        });
    });

    describe('LoggingService', () => {
        describe('Structured Logging (10.2.1)', () => {
            test('should create structured log entries with requestId', () => {
                const requestId = 'test-request-123';
                const message = 'Test log message';
                const metadata = { phase: 'test_phase' };

                loggingService.info(requestId, message, metadata);

                expect(consoleSpy.log).toHaveBeenCalledWith(
                    expect.stringContaining('"requestId":"test-request-123"')
                );
            });

            test('should support different log levels', () => {
                const requestId = 'test-request-123';
                const message = 'Test message';

                loggingService.info(requestId, message);
                loggingService.warn(requestId, message);
                loggingService.error(requestId, message, new Error('Test error'));

                expect(consoleSpy.log).toHaveBeenCalled();
                expect(consoleSpy.warn).toHaveBeenCalled();
                expect(consoleSpy.error).toHaveBeenCalled();
            });
        });

        describe('Raw LLM Response Logging (10.2.2)', () => {
            test('should log raw LLM response only on parsing failures', () => {
                const requestId = 'test-request-123';
                const rawResponse = '{"intent": "cinema", "titles": ["Movie 1"';
                const failureType = 'complete_fallback';
                const error = new Error('JSON parsing failed');

                loggingService.logJSONParsingFailure(requestId, rawResponse, failureType, error);

                expect(consoleSpy.error).toHaveBeenCalledWith(
                    expect.stringContaining('"rawResponse":"{\\"intent\\": \\"cinema\\"')
                );
            });
        });

        describe('Secure Logging (10.2.3)', () => {
            test('should sanitize sensitive data from input', () => {
                const sensitiveInput = {
                    query: 'test query',
                    token: 'hf_secret_token',
                    apiKey: 'secret_api_key',
                    authorization: 'Bearer secret'
                };

                const sanitized = loggingService.sanitizeInput(sensitiveInput);

                expect(sanitized.token).toBe('[REDACTED]');
                expect(sanitized.apiKey).toBe('[REDACTED]');
                expect(sanitized.authorization).toBe('[REDACTED]');
                expect(sanitized.query).toBe('test query');
            });

            test('should sanitize sensitive data from output', () => {
                const sensitiveOutput = {
                    result: 'success',
                    token: 'secret_token',
                    rawResponse: 'sensitive raw response'
                };

                const sanitized = loggingService.sanitizeOutput(sensitiveOutput);

                expect(sanitized.token).toBe('[REDACTED]');
                expect(sanitized.rawResponse).toBe('[REDACTED]');
                expect(sanitized.result).toBe('success');
            });
        });

        describe('Performance Timing Logs (10.2.4)', () => {
            test('should log performance timing', () => {
                const requestId = 'test-request-123';
                const operation = 'ai_service_query';
                const latencyMs = 1500;
                const metadata = { model: 'salamandra-2b' };

                loggingService.logPerformanceTiming(requestId, operation, latencyMs, metadata);

                expect(consoleSpy.log).toHaveBeenCalledWith(
                    expect.stringContaining('"operation":"ai_service_query"')
                );
            });

            test('should log request start and completion', () => {
                const requestId = 'test-request-123';
                const operation = 'test_operation';
                const input = { query: 'test query' };

                const startTime = loggingService.logRequestStart(requestId, operation, input);
                expect(typeof startTime).toBe('number');
                expect(consoleSpy.log).toHaveBeenCalledWith(
                    expect.stringContaining('Request started')
                );

                loggingService.logRequestComplete(requestId, operation, startTime, true, { result: 'success' });
                expect(consoleSpy.log).toHaveBeenCalledWith(
                    expect.stringContaining('Request completed')
                );
            });
        });
    });

    describe('Integration with JSON Parser', () => {
        test('should integrate metrics and logging with JSON parser', async () => {
            const parser = new ResilientJSONParser();
            const requestId = 'test-request-123';
            const malformedJson = '{"intent": "cinema", "titles": ["Movie 1"'; // Missing closing braces

            const result = await parser.parse(malformedJson, requestId);

            // Should return fallback response
            expect(result).toEqual({
                intent: 'other',
                reply: expect.any(String)
            });

            // Should have logged the parsing failure
            expect(consoleSpy.error).toHaveBeenCalled();
        });
    });

    describe('Correlation and Tracing', () => {
        test('should maintain requestId correlation across services', () => {
            const requestId = 'test-request-123';
            
            loggingService.info(requestId, 'Step 1: AI processing');
            loggingService.info(requestId, 'Step 2: TMDB verification');
            loggingService.info(requestId, 'Step 3: Response formatting');

            // All log calls should include the same requestId
            expect(consoleSpy.log).toHaveBeenCalledTimes(3);
            consoleSpy.log.mock.calls.forEach(call => {
                const logEntry = JSON.parse(call[0]);
                expect(logEntry.requestId).toBe(requestId);
            });
        });

        test('should create correlation IDs for distributed tracing', () => {
            const requestId = 'test-request-123';
            const operation = 'ai_service_call';

            const correlationId = loggingService.createCorrelationId(requestId, operation);

            expect(correlationId).toContain(requestId);
            expect(correlationId).toContain(operation);
            expect(correlationId).toMatch(/test-request-123-ai_service_call-\d+/);
        });
    });
});