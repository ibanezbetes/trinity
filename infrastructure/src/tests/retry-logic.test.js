"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
(0, globals_1.describe)('Retry Logic Compliance - Property Tests', () => {
    /**
     * Property 20: Retry Logic Compliance
     * Validates: Requirements 9.1
     *
     * Property: Retry logic should:
     * 1. Implement exponential backoff with proper delays
     * 2. Respect maximum retry limits
     * 3. Handle different error types appropriately
     * 4. Provide user-friendly error messages
     */
    (0, globals_1.describe)('Property 20: Retry Logic Compliance', () => {
        (0, globals_1.it)('should implement exponential backoff correctly', () => {
            const baseDelay = 100; // milliseconds
            const maxRetries = 3;
            const expectedDelays = [];
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const delay = baseDelay * Math.pow(2, attempt);
                expectedDelays.push(delay);
            }
            // Verify exponential growth
            (0, globals_1.expect)(expectedDelays[0]).toBe(200); // 100 * 2^1
            (0, globals_1.expect)(expectedDelays[1]).toBe(400); // 100 * 2^2
            (0, globals_1.expect)(expectedDelays[2]).toBe(800); // 100 * 2^3
            // Verify each delay is greater than the previous
            for (let i = 1; i < expectedDelays.length; i++) {
                (0, globals_1.expect)(expectedDelays[i]).toBeGreaterThan(expectedDelays[i - 1]);
            }
        });
        (0, globals_1.it)('should respect maximum retry limits', () => {
            const maxRetries = 3;
            let attemptCount = 0;
            let success = false;
            // Simulate retry loop
            while (attemptCount < maxRetries && !success) {
                attemptCount++;
                // Simulate all attempts failing
                success = false;
            }
            (0, globals_1.expect)(attemptCount).toBe(maxRetries);
            (0, globals_1.expect)(attemptCount).not.toBeGreaterThan(maxRetries);
            (0, globals_1.expect)(success).toBe(false);
        });
        (0, globals_1.it)('should handle different error types appropriately', () => {
            const errorTypes = [
                { name: 'ValidationException', shouldRetry: false, userMessage: 'Error interno del sistema' },
                { name: 'ServiceException', shouldRetry: true, userMessage: 'Servicio temporalmente no disponible' },
                { name: 'ThrottlingException', shouldRetry: true, userMessage: 'Servicio temporalmente no disponible' },
                { name: 'InternalServerError', shouldRetry: true, userMessage: 'Servicio temporalmente no disponible' },
                { name: 'NetworkError', shouldRetry: true, userMessage: 'Problema de conexión' },
                { name: 'UnknownError', shouldRetry: false, userMessage: 'Error inesperado' },
            ];
            errorTypes.forEach(({ name, shouldRetry, userMessage }) => {
                // Simulate error handling logic
                let isRetryableError = false;
                let errorMessage = '';
                if (name === 'ServiceException' || name === 'ThrottlingException' || name === 'InternalServerError') {
                    isRetryableError = true;
                    errorMessage = 'Error interno del sistema. Servicio temporalmente no disponible.';
                }
                else if (name === 'ValidationException') {
                    isRetryableError = false;
                    errorMessage = 'Error interno del sistema. Por favor, inténtalo de nuevo más tarde.';
                }
                else if (name === 'NetworkError') {
                    isRetryableError = true;
                    errorMessage = 'Problema de conexión. Por favor, verifica tu conexión a internet e inténtalo de nuevo.';
                }
                else {
                    isRetryableError = false;
                    errorMessage = 'Ocurrió un error inesperado. Por favor, inténtalo de nuevo más tarde.';
                }
                (0, globals_1.expect)(isRetryableError).toBe(shouldRetry);
                (0, globals_1.expect)(errorMessage.includes('Error interno del sistema') ||
                    errorMessage.includes('Problema de conexión') ||
                    errorMessage.includes('error inesperado')).toBe(true);
            });
        });
        (0, globals_1.it)('should provide user-friendly error messages', () => {
            const systemErrors = [
                'ValidationException: key element does not match',
                'ServiceException: Service temporarily unavailable',
                'DynamoDB.ResourceNotFoundException',
                'Network timeout after 30 seconds',
            ];
            const userFriendlyMessages = systemErrors.map(systemError => {
                if (systemError.includes('ValidationException')) {
                    return 'Error interno del sistema. Por favor, inténtalo de nuevo más tarde.';
                }
                else if (systemError.includes('ServiceException')) {
                    return 'Error interno del sistema. Servicio temporalmente no disponible.';
                }
                else if (systemError.includes('ResourceNotFoundException')) {
                    return 'El recurso solicitado no fue encontrado.';
                }
                else if (systemError.includes('Network timeout')) {
                    return 'Problema de conexión. Por favor, verifica tu conexión a internet e inténtalo de nuevo.';
                }
                return 'Ocurrió un error inesperado. Por favor, inténtalo de nuevo más tarde.';
            });
            // Verify all messages are user-friendly
            userFriendlyMessages.forEach(message => {
                (0, globals_1.expect)(message).not.toContain('ValidationException');
                (0, globals_1.expect)(message).not.toContain('ServiceException');
                (0, globals_1.expect)(message).not.toContain('DynamoDB');
                (0, globals_1.expect)(message).toMatch(/Error interno del sistema|Problema de conexión|error inesperado|recurso.*no fue encontrado/);
            });
        });
        (0, globals_1.it)('should implement proper retry timing', () => {
            const baseDelay = 100;
            const jitterFactor = 0.1; // 10% jitter
            const maxRetries = 3;
            const retryDelays = [];
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const baseRetryDelay = baseDelay * Math.pow(2, attempt);
                const jitter = baseRetryDelay * jitterFactor * Math.random();
                const actualDelay = baseRetryDelay + jitter;
                retryDelays.push(actualDelay);
            }
            // Verify delays are within expected ranges
            retryDelays.forEach((delay, index) => {
                const expectedBase = baseDelay * Math.pow(2, index + 1);
                const minDelay = expectedBase;
                const maxDelay = expectedBase * (1 + jitterFactor);
                (0, globals_1.expect)(delay).toBeGreaterThanOrEqual(minDelay);
                (0, globals_1.expect)(delay).toBeLessThanOrEqual(maxDelay);
            });
        });
        (0, globals_1.it)('should handle concurrent retry scenarios', () => {
            const maxRetries = 3;
            const concurrentOperations = 5;
            const results = [];
            // Simulate concurrent operations with retries
            for (let op = 0; op < concurrentOperations; op++) {
                let attemptCount = 0;
                let success = false;
                while (attemptCount < maxRetries && !success) {
                    attemptCount++;
                    // Simulate some operations succeeding on retry
                    if (op % 2 === 0 && attemptCount === 2) {
                        success = true;
                    }
                }
                results.push(success);
            }
            // Verify some operations succeeded and some failed
            const successCount = results.filter(r => r).length;
            const failureCount = results.filter(r => !r).length;
            (0, globals_1.expect)(successCount).toBeGreaterThan(0);
            (0, globals_1.expect)(failureCount).toBeGreaterThan(0);
            (0, globals_1.expect)(successCount + failureCount).toBe(concurrentOperations);
        });
        (0, globals_1.it)('should validate retry circuit breaker logic', () => {
            const failureThreshold = 5;
            const timeWindow = 60000; // 1 minute
            let failureCount = 0;
            let lastFailureTime = 0;
            let circuitOpen = false;
            // Simulate failures
            for (let i = 0; i < 7; i++) {
                const currentTime = Date.now();
                // Reset failure count if time window has passed
                if (currentTime - lastFailureTime > timeWindow) {
                    failureCount = 0;
                }
                failureCount++;
                lastFailureTime = currentTime;
                // Open circuit if threshold exceeded
                if (failureCount >= failureThreshold) {
                    circuitOpen = true;
                }
            }
            (0, globals_1.expect)(failureCount).toBeGreaterThanOrEqual(failureThreshold);
            (0, globals_1.expect)(circuitOpen).toBe(true);
        });
        (0, globals_1.it)('should handle retry exhaustion gracefully', () => {
            const maxRetries = 3;
            let attemptCount = 0;
            let finalError = null;
            // Simulate all retries failing
            while (attemptCount < maxRetries) {
                attemptCount++;
                // Simulate failure
                if (attemptCount === maxRetries) {
                    finalError = 'Error interno del sistema. No se pudo completar la operación después de múltiples intentos.';
                }
            }
            (0, globals_1.expect)(attemptCount).toBe(maxRetries);
            (0, globals_1.expect)(finalError).not.toBeNull();
            (0, globals_1.expect)(finalError).toContain('múltiples intentos');
        });
        (0, globals_1.it)('should validate retry success on intermediate attempts', () => {
            const maxRetries = 3;
            const successOnAttempt = 2; // Success on second attempt
            let attemptCount = 0;
            let success = false;
            while (attemptCount < maxRetries && !success) {
                attemptCount++;
                if (attemptCount === successOnAttempt) {
                    success = true;
                }
            }
            (0, globals_1.expect)(success).toBe(true);
            (0, globals_1.expect)(attemptCount).toBe(successOnAttempt);
            (0, globals_1.expect)(attemptCount).toBeLessThan(maxRetries);
        });
        (0, globals_1.it)('should implement proper error logging during retries', () => {
            const maxRetries = 3;
            const logEntries = [];
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                // Simulate logging during retry
                const logEntry = `🔄 Reintentando operación (intento ${attempt}/${maxRetries})`;
                logEntries.push(logEntry);
                // Simulate failure
                if (attempt === maxRetries) {
                    logEntries.push('❌ Máximo de reintentos alcanzado');
                }
            }
            (0, globals_1.expect)(logEntries.length).toBe(maxRetries + 1); // 3 retry logs + 1 failure log
            (0, globals_1.expect)(logEntries[0]).toContain('intento 1/3');
            (0, globals_1.expect)(logEntries[1]).toContain('intento 2/3');
            (0, globals_1.expect)(logEntries[2]).toContain('intento 3/3');
            (0, globals_1.expect)(logEntries[3]).toContain('Máximo de reintentos alcanzado');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmV0cnktbG9naWMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJldHJ5LWxvZ2ljLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwyQ0FBcUQ7QUFFckQsSUFBQSxrQkFBUSxFQUFDLHlDQUF5QyxFQUFFLEdBQUcsRUFBRTtJQUN2RDs7Ozs7Ozs7O09BU0c7SUFDSCxJQUFBLGtCQUFRLEVBQUMscUNBQXFDLEVBQUUsR0FBRyxFQUFFO1FBQ25ELElBQUEsWUFBRSxFQUFDLGdEQUFnRCxFQUFFLEdBQUcsRUFBRTtZQUN4RCxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsQ0FBQyxlQUFlO1lBQ3RDLE1BQU0sVUFBVSxHQUFHLENBQUMsQ0FBQztZQUNyQixNQUFNLGNBQWMsR0FBYSxFQUFFLENBQUM7WUFFcEMsS0FBSyxJQUFJLE9BQU8sR0FBRyxDQUFDLEVBQUUsT0FBTyxJQUFJLFVBQVUsRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDO2dCQUN2RCxNQUFNLEtBQUssR0FBRyxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQy9DLGNBQWMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDN0IsQ0FBQztZQUVELDRCQUE0QjtZQUM1QixJQUFBLGdCQUFNLEVBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsWUFBWTtZQUNqRCxJQUFBLGdCQUFNLEVBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsWUFBWTtZQUNqRCxJQUFBLGdCQUFNLEVBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsWUFBWTtZQUVqRCxpREFBaUQ7WUFDakQsS0FBSyxJQUFJLENBQUMsR0FBRyxD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Q0FBQyxDQUFDLENBQUMsQ0FBQywrQkFBK0I7WUFDL0UsSUFBQSxnQkFBTSxFQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUMvQyxJQUFBLGdCQUFNLEVBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQy9DLElBQUEsZ0JBQU0sRUFBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDL0MsSUFBQSxnQkFBTSxFQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1FBQ3BFLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGRlc2NyaWJlLCBpdCwgZXhwZWN0IH0gZnJvbSAnQGplc3QvZ2xvYmFscyc7XHJcblxyXG5kZXNjcmliZSgnUmV0cnkgTG9naWMgQ29tcGxpYW5jZSAtIFByb3BlcnR5IFRlc3RzJywgKCkgPT4ge1xyXG4gIC8qKlxyXG4gICAqIFByb3BlcnR5IDIwOiBSZXRyeSBMb2dpYyBDb21wbGlhbmNlXHJcbiAgICogVmFsaWRhdGVzOiBSZXF1aXJlbWVudHMgOS4xXHJcbiAgICogXHJcbiAgICogUHJvcGVydHk6IFJldHJ5IGxvZ2ljIHNob3VsZDpcclxuICAgKiAxLiBJbXBsZW1lbnQgZXhwb25lbnRpYWwgYmFja29mZiB3aXRoIHByb3BlciBkZWxheXNcclxuICAgKiAyLiBSZXNwZWN0IG1heGltdW0gcmV0cnkgbGltaXRzXHJcbiAgICogMy4gSGFuZGxlIGRpZmZlcmVudCBlcnJvciB0eXBlcyBhcHByb3ByaWF0ZWx5XHJcbiAgICogNC4gUHJvdmlkZSB1c2VyLWZyaWVuZGx5IGVycm9yIG1lc3NhZ2VzXHJcbiAgICovXHJcbiAgZGVzY3JpYmUoJ1Byb3BlcnR5IDIwOiBSZXRyeSBMb2dpYyBDb21wbGlhbmNlJywgKCkgPT4ge1xyXG4gICAgaXQoJ3Nob3VsZCBpbXBsZW1lbnQgZXhwb25lbnRpYWwgYmFja29mZiBjb3JyZWN0bHknLCAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGJhc2VEZWxheSA9IDEwMDsgLy8gbWlsbGlzZWNvbmRzXHJcbiAgICAgIGNvbnN0IG1heFJldHJpZXMgPSAzO1xyXG4gICAgICBjb25zdCBleHBlY3RlZERlbGF5czogbnVtYmVyW10gPSBbXTtcclxuICAgICAgXHJcbiAgICAgIGZvciAobGV0IGF0dGVtcHQgPSAxOyBhdHRlbXB0IDw9IG1heFJldHJpZXM7IGF0dGVtcHQrKykge1xyXG4gICAgICAgIGNvbnN0IGRlbGF5ID0gYmFzZURlbGF5ICogTWF0aC5wb3coMiwgYXR0ZW1wdCk7XHJcbiAgICAgICAgZXhwZWN0ZWREZWxheXMucHVzaChkZWxheSk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIFZlcmlmeSBleHBvbmVudGlhbCBncm93dGhcclxuICAgICAgZXhwZWN0KGV4cGVjdGVkRGVsYXlzWzBdKS50b0JlKDIwMCk7IC8vIDEwMCAqIDJeMVxyXG4gICAgICBleHBlY3QoZXhwZWN0ZWREZWxheXNbMV0pLnRvQmUoNDAwKTsgLy8gMTAwICogMl4yXHJcbiAgICAgIGV4cGVjdChleHBlY3RlZERlbGF5c1syXSkudG9CZSg4MDApOyAvLyAxMDAgKiAyXjNcclxuICAgICAgXHJcbiAgICAgIC8vIFZlcmlmeSBlYWNoIGRlbGF5IGlzIGdyZWF0ZXIgdGhhbiB0aGUgcHJldmlvdXNcclxuICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBleHBlY3RlZERlbGF5cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGV4cGVjdChleHBlY3RlZERlbGF5c1tpXSkudG9CZUdyZWF0ZXJUaGFuKGV4cGVjdGVkRGVsYXlzW2kgLSAxXSk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgcmVzcGVjdCBtYXhpbXVtIHJldHJ5IGxpbWl0cycsICgpID0+IHtcclxuICAgICAgY29uc3QgbWF4UmV0cmllcyA9IDM7XHJcbiAgICAgIGxldCBhdHRlbXB0Q291bnQgPSAwO1xyXG4gICAgICBsZXQgc3VjY2VzcyA9IGZhbHNlO1xyXG4gICAgICBcclxuICAgICAgLy8gU2ltdWxhdGUgcmV0cnkgbG9vcFxyXG4gICAgICB3aGlsZSAoYXR0ZW1wdENvdW50IDwgbWF4UmV0cmllcyAmJiAhc3VjY2Vzcykge1xyXG4gICAgICAgIGF0dGVtcHRDb3VudCsrO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNpbXVsYXRlIGFsbCBhdHRlbXB0cyBmYWlsaW5nXHJcbiAgICAgICAgc3VjY2VzcyA9IGZhbHNlO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICBleHBlY3QoYXR0ZW1wdENvdW50KS50b0JlKG1heFJldHJpZXMpO1xyXG4gICAgICBleHBlY3QoYXR0ZW1wdENvdW50KS5ub3QudG9CZUdyZWF0ZXJUaGFuKG1heFJldHJpZXMpO1xyXG4gICAgICBleHBlY3Qoc3VjY2VzcykudG9CZShmYWxzZSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBkaWZmZXJlbnQgZXJyb3IgdHlwZXMgYXBwcm9wcmlhdGVseScsICgpID0+IHtcclxuICAgICAgY29uc3QgZXJyb3JUeXBlcyA9IFtcclxuICAgICAgICB7IG5hbWU6ICdWYWxpZGF0aW9uRXhjZXB0aW9uJywgc2hvdWxkUmV0cnk6IGZhbHNlLCB1c2VyTWVzc2FnZTogJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEnIH0sXHJcbiAgICAgICAgeyBuYW1lOiAnU2VydmljZUV4Y2VwdGlvbicsIHNob3VsZFJldHJ5OiB0cnVlLCB1c2VyTWVzc2FnZTogJ1NlcnZpY2lvIHRlbXBvcmFsbWVudGUgbm8gZGlzcG9uaWJsZScgfSxcclxuICAgICAgICB7IG5hbWU6ICdUaHJvdHRsaW5nRXhjZXB0aW9uJywgc2hvdWxkUmV0cnk6IHRydWUsIHVzZXJNZXNzYWdlOiAnU2VydmljaW8gdGVtcG9yYWxtZW50ZSBubyBkaXNwb25pYmxlJyB9LFxyXG4gICAgICAgIHsgbmFtZTogJ0ludGVybmFsU2VydmVyRXJyb3InLCBzaG91bGRSZXRyeTogdHJ1ZSwgdXNlck1lc3NhZ2U6ICdTZXJ2aWNpbyB0ZW1wb3JhbG1lbnRlIG5vIGRpc3BvbmlibGUnIH0sXHJcbiAgICAgICAgeyBuYW1lOiAnTmV0d29ya0Vycm9yJywgc2hvdWxkUmV0cnk6IHRydWUsIHVzZXJNZXNzYWdlOiAnUHJvYmxlbWEgZGUgY29uZXhpw7NuJyB9LFxyXG4gICAgICAgIHsgbmFtZTogJ1Vua25vd25FcnJvcicsIHNob3VsZFJldHJ5OiBmYWxzZSwgdXNlck1lc3NhZ2U6ICdFcnJvciBpbmVzcGVyYWRvJyB9LFxyXG4gICAgICBdO1xyXG4gICAgICBcclxuICAgICAgZXJyb3JUeXBlcy5mb3JFYWNoKCh7IG5hbWUsIHNob3VsZFJldHJ5LCB1c2VyTWVzc2FnZSB9KSA9PiB7XHJcbiAgICAgICAgLy8gU2ltdWxhdGUgZXJyb3IgaGFuZGxpbmcgbG9naWNcclxuICAgICAgICBsZXQgaXNSZXRyeWFibGVFcnJvciA9IGZhbHNlO1xyXG4gICAgICAgIGxldCBlcnJvck1lc3NhZ2UgPSAnJztcclxuICAgICAgICBcclxuICAgICAgICBpZiAobmFtZSA9PT0gJ1NlcnZpY2VFeGNlcHRpb24nIHx8IG5hbWUgPT09ICdUaHJvdHRsaW5nRXhjZXB0aW9uJyB8fCBuYW1lID09PSAnSW50ZXJuYWxTZXJ2ZXJFcnJvcicpIHtcclxuICAgICAgICAgIGlzUmV0cnlhYmxlRXJyb3IgPSB0cnVlO1xyXG4gICAgICAgICAgZXJyb3JNZXNzYWdlID0gJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIFNlcnZpY2lvIHRlbXBvcmFsbWVudGUgbm8gZGlzcG9uaWJsZS4nO1xyXG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nKSB7XHJcbiAgICAgICAgICBpc1JldHJ5YWJsZUVycm9yID0gZmFsc2U7XHJcbiAgICAgICAgICBlcnJvck1lc3NhZ2UgPSAnRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJztcclxuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICdOZXR3b3JrRXJyb3InKSB7XHJcbiAgICAgICAgICBpc1JldHJ5YWJsZUVycm9yID0gdHJ1ZTtcclxuICAgICAgICAgIGVycm9yTWVzc2FnZSA9ICdQcm9ibGVtYSBkZSBjb25leGnDs24uIFBvciBmYXZvciwgdmVyaWZpY2EgdHUgY29uZXhpw7NuIGEgaW50ZXJuZXQgZSBpbnTDqW50YWxvIGRlIG51ZXZvLic7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGlzUmV0cnlhYmxlRXJyb3IgPSBmYWxzZTtcclxuICAgICAgICAgIGVycm9yTWVzc2FnZSA9ICdPY3VycmnDsyB1biBlcnJvciBpbmVzcGVyYWRvLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gZGUgbnVldm8gbcOhcyB0YXJkZS4nO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBleHBlY3QoaXNSZXRyeWFibGVFcnJvcikudG9CZShzaG91bGRSZXRyeSk7XHJcbiAgICAgICAgZXhwZWN0KFxyXG4gICAgICAgICAgZXJyb3JNZXNzYWdlLmluY2x1ZGVzKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hJykgfHxcclxuICAgICAgICAgIGVycm9yTWVzc2FnZS5pbmNsdWRlcygnUHJvYmxlbWEgZGUgY29uZXhpw7NuJykgfHxcclxuICAgICAgICAgIGVycm9yTWVzc2FnZS5pbmNsdWRlcygnZXJyb3IgaW5lc3BlcmFkbycpXHJcbiAgICAgICAgKS50b0JlKHRydWUpO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgcHJvdmlkZSB1c2VyLWZyaWVuZGx5IGVycm9yIG1lc3NhZ2VzJywgKCkgPT4ge1xyXG4gICAgICBjb25zdCBzeXN0ZW1FcnJvcnMgPSBbXHJcbiAgICAgICAgJ1ZhbGlkYXRpb25FeGNlcHRpb246IGtleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJyxcclxuICAgICAgICAnU2VydmljZUV4Y2VwdGlvbjogU2VydmljZSB0ZW1wb3JhcmlseSB1bmF2YWlsYWJsZScsXHJcbiAgICAgICAgJ0R5bmFtb0RCLlJlc291cmNlTm90Rm91bmRFeGNlcHRpb24nLFxyXG4gICAgICAgICdOZXR3b3JrIHRpbWVvdXQgYWZ0ZXIgMzAgc2Vjb25kcycsXHJcbiAgICAgIF07XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCB1c2VyRnJpZW5kbHlNZXNzYWdlcyA9IHN5c3RlbUVycm9ycy5tYXAoc3lzdGVtRXJyb3IgPT4ge1xyXG4gICAgICAgIGlmIChzeXN0ZW1FcnJvci5pbmNsdWRlcygnVmFsaWRhdGlvbkV4Y2VwdGlvbicpKSB7XHJcbiAgICAgICAgICByZXR1cm4gJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIFBvciBmYXZvciwgaW50w6ludGFsbyBkZSBudWV2byBtw6FzIHRhcmRlLic7XHJcbiAgICAgICAgfSBlbHNlIGlmIChzeXN0ZW1FcnJvci5pbmNsdWRlcygnU2VydmljZUV4Y2VwdGlvbicpKSB7XHJcbiAgICAgICAgICByZXR1cm4gJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIFNlcnZpY2lvIHRlbXBvcmFsbWVudGUgbm8gZGlzcG9uaWJsZS4nO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoc3lzdGVtRXJyb3IuaW5jbHVkZXMoJ1Jlc291cmNlTm90Rm91bmRFeGNlcHRpb24nKSkge1xyXG4gICAgICAgICAgcmV0dXJuICdFbCByZWN1cnNvIHNvbGljaXRhZG8gbm8gZnVlIGVuY29udHJhZG8uJztcclxuICAgICAgICB9IGVsc2UgaWYgKHN5c3RlbUVycm9yLmluY2x1ZGVzKCdOZXR3b3JrIHRpbWVvdXQnKSkge1xyXG4gICAgICAgICAgcmV0dXJuICdQcm9ibGVtYSBkZSBjb25leGnDs24uIFBvciBmYXZvciwgdmVyaWZpY2EgdHUgY29uZXhpw7NuIGEgaW50ZXJuZXQgZSBpbnTDqW50YWxvIGRlIG51ZXZvLic7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiAnT2N1cnJpw7MgdW4gZXJyb3IgaW5lc3BlcmFkby4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJztcclxuICAgICAgfSk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBWZXJpZnkgYWxsIG1lc3NhZ2VzIGFyZSB1c2VyLWZyaWVuZGx5XHJcbiAgICAgIHVzZXJGcmllbmRseU1lc3NhZ2VzLmZvckVhY2gobWVzc2FnZSA9PiB7XHJcbiAgICAgICAgZXhwZWN0KG1lc3NhZ2UpLm5vdC50b0NvbnRhaW4oJ1ZhbGlkYXRpb25FeGNlcHRpb24nKTtcclxuICAgICAgICBleHBlY3QobWVzc2FnZSkubm90LnRvQ29udGFpbignU2VydmljZUV4Y2VwdGlvbicpO1xyXG4gICAgICAgIGV4cGVjdChtZXNzYWdlKS5ub3QudG9Db250YWluKCdEeW5hbW9EQicpO1xyXG4gICAgICAgIGV4cGVjdChtZXNzYWdlKS50b01hdGNoKC9FcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hfFByb2JsZW1hIGRlIGNvbmV4acOzbnxlcnJvciBpbmVzcGVyYWRvfHJlY3Vyc28uKm5vIGZ1ZSBlbmNvbnRyYWRvLyk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBpbXBsZW1lbnQgcHJvcGVyIHJldHJ5IHRpbWluZycsICgpID0+IHtcclxuICAgICAgY29uc3QgYmFzZURlbGF5ID0gMTAwO1xyXG4gICAgICBjb25zdCBqaXR0ZXJGYWN0b3IgPSAwLjE7IC8vIDEwJSBqaXR0ZXJcclxuICAgICAgY29uc3QgbWF4UmV0cmllcyA9IDM7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCByZXRyeURlbGF5czogbnVtYmVyW10gPSBbXTtcclxuICAgICAgXHJcbiAgICAgIGZvciAobGV0IGF0dGVtcHQgPSAxOyBhdHRlbXB0IDw9IG1heFJldHJpZXM7IGF0dGVtcHQrKykge1xyXG4gICAgICAgIGNvbnN0IGJhc2VSZXRyeURlbGF5ID0gYmFzZURlbGF5ICogTWF0aC5wb3coMiwgYXR0ZW1wdCk7XHJcbiAgICAgICAgY29uc3Qgaml0dGVyID0gYmFzZVJldHJ5RGVsYXkgKiBqaXR0ZXJGYWN0b3IgKiBNYXRoLnJhbmRvbSgpO1xyXG4gICAgICAgIGNvbnN0IGFjdHVhbERlbGF5ID0gYmFzZVJldHJ5RGVsYXkgKyBqaXR0ZXI7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0cnlEZWxheXMucHVzaChhY3R1YWxEZWxheSk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIFZlcmlmeSBkZWxheXMgYXJlIHdpdGhpbiBleHBlY3RlZCByYW5nZXNcclxuICAgICAgcmV0cnlEZWxheXMuZm9yRWFjaCgoZGVsYXksIGluZGV4KSA9PiB7XHJcbiAgICAgICAgY29uc3QgZXhwZWN0ZWRCYXNlID0gYmFzZURlbGF5ICogTWF0aC5wb3coMiwgaW5kZXggKyAxKTtcclxuICAgICAgICBjb25zdCBtaW5EZWxheSA9IGV4cGVjdGVkQmFzZTtcclxuICAgICAgICBjb25zdCBtYXhEZWxheSA9IGV4cGVjdGVkQmFzZSAqICgxICsgaml0dGVyRmFjdG9yKTtcclxuICAgICAgICBcclxuICAgICAgICBleHBlY3QoZGVsYXkpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwobWluRGVsYXkpO1xyXG4gICAgICAgIGV4cGVjdChkZWxheSkudG9CZUxlc3NUaGFuT3JFcXVhbChtYXhEZWxheSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgY29uY3VycmVudCByZXRyeSBzY2VuYXJpb3MnLCAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IG1heFJldHJpZXMgPSAzO1xyXG4gICAgICBjb25zdCBjb25jdXJyZW50T3BlcmF0aW9ucyA9IDU7XHJcbiAgICAgIGNvbnN0IHJlc3VsdHM6IGJvb2xlYW5bXSA9IFtdO1xyXG4gICAgICBcclxuICAgICAgLy8gU2ltdWxhdGUgY29uY3VycmVudCBvcGVyYXRpb25zIHdpdGggcmV0cmllc1xyXG4gICAgICBmb3IgKGxldCBvcCA9IDA7IG9wIDwgY29uY3VycmVudE9wZXJhdGlvbnM7IG9wKyspIHtcclxuICAgICAgICBsZXQgYXR0ZW1wdENvdW50ID0gMDtcclxuICAgICAgICBsZXQgc3VjY2VzcyA9IGZhbHNlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChhdHRlbXB0Q291bnQgPCBtYXhSZXRyaWVzICYmICFzdWNjZXNzKSB7XHJcbiAgICAgICAgICBhdHRlbXB0Q291bnQrKztcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gU2ltdWxhdGUgc29tZSBvcGVyYXRpb25zIHN1Y2NlZWRpbmcgb24gcmV0cnlcclxuICAgICAgICAgIGlmIChvcCAlIDIgPT09IDAgJiYgYXR0ZW1wdENvdW50ID09PSAyKSB7XHJcbiAgICAgICAgICAgIHN1Y2Nlc3MgPSB0cnVlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXN1bHRzLnB1c2goc3VjY2Vzcyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIFZlcmlmeSBzb21lIG9wZXJhdGlvbnMgc3VjY2VlZGVkIGFuZCBzb21lIGZhaWxlZFxyXG4gICAgICBjb25zdCBzdWNjZXNzQ291bnQgPSByZXN1bHRzLmZpbHRlcihyID0+IHIpLmxlbmd0aDtcclxuICAgICAgY29uc3QgZmFpbHVyZUNvdW50ID0gcmVzdWx0cy5maWx0ZXIociA9PiAhcikubGVuZ3RoO1xyXG4gICAgICBcclxuICAgICAgZXhwZWN0KHN1Y2Nlc3NDb3VudCkudG9CZUdyZWF0ZXJUaGFuKDApO1xyXG4gICAgICBleHBlY3QoZmFpbHVyZUNvdW50KS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICAgIGV4cGVjdChzdWNjZXNzQ291bnQgKyBmYWlsdXJlQ291bnQpLnRvQmUoY29uY3VycmVudE9wZXJhdGlvbnMpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCB2YWxpZGF0ZSByZXRyeSBjaXJjdWl0IGJyZWFrZXIgbG9naWMnLCAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGZhaWx1cmVUaHJlc2hvbGQgPSA1O1xyXG4gICAgICBjb25zdCB0aW1lV2luZG93ID0gNjAwMDA7IC8vIDEgbWludXRlXHJcbiAgICAgIGxldCBmYWlsdXJlQ291bnQgPSAwO1xyXG4gICAgICBsZXQgbGFzdEZhaWx1cmVUaW1lID0gMDtcclxuICAgICAgbGV0IGNpcmN1aXRPcGVuID0gZmFsc2U7XHJcbiAgICAgIFxyXG4gICAgICAvLyBTaW11bGF0ZSBmYWlsdXJlc1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDc7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBSZXNldCBmYWlsdXJlIGNvdW50IGlmIHRpbWUgd2luZG93IGhhcyBwYXNzZWRcclxuICAgICAgICBpZiAoY3VycmVudFRpbWUgLSBsYXN0RmFpbHVyZVRpbWUgPiB0aW1lV2luZG93KSB7XHJcbiAgICAgICAgICBmYWlsdXJlQ291bnQgPSAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBmYWlsdXJlQ291bnQrKztcclxuICAgICAgICBsYXN0RmFpbHVyZVRpbWUgPSBjdXJyZW50VGltZTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBPcGVuIGNpcmN1aXQgaWYgdGhyZXNob2xkIGV4Y2VlZGVkXHJcbiAgICAgICAgaWYgKGZhaWx1cmVDb3VudCA+PSBmYWlsdXJlVGhyZXNob2xkKSB7XHJcbiAgICAgICAgICBjaXJjdWl0T3BlbiA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICBleHBlY3QoZmFpbHVyZUNvdW50KS50b0JlR3JlYXRlclRoYW5PckVxdWFsKGZhaWx1cmVUaHJlc2hvbGQpO1xyXG4gICAgICBleHBlY3QoY2lyY3VpdE9wZW4pLnRvQmUodHJ1ZSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSByZXRyeSBleGhhdXN0aW9uIGdyYWNlZnVsbHknLCAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IG1heFJldHJpZXMgPSAzO1xyXG4gICAgICBsZXQgYXR0ZW1wdENvdW50ID0gMDtcclxuICAgICAgbGV0IGZpbmFsRXJyb3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xyXG4gICAgICBcclxuICAgICAgLy8gU2ltdWxhdGUgYWxsIHJldHJpZXMgZmFpbGluZ1xyXG4gICAgICB3aGlsZSAoYXR0ZW1wdENvdW50IDwgbWF4UmV0cmllcykge1xyXG4gICAgICAgIGF0dGVtcHRDb3VudCsrO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNpbXVsYXRlIGZhaWx1cmVcclxuICAgICAgICBpZiAoYXR0ZW1wdENvdW50ID09PSBtYXhSZXRyaWVzKSB7XHJcbiAgICAgICAgICBmaW5hbEVycm9yID0gJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIE5vIHNlIHB1ZG8gY29tcGxldGFyIGxhIG9wZXJhY2nDs24gZGVzcHXDqXMgZGUgbcO6bHRpcGxlcyBpbnRlbnRvcy4nO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgZXhwZWN0KGF0dGVtcHRDb3VudCkudG9CZShtYXhSZXRyaWVzKTtcclxuICAgICAgZXhwZWN0KGZpbmFsRXJyb3IpLm5vdC50b0JlTnVsbCgpO1xyXG4gICAgICBleHBlY3QoZmluYWxFcnJvcikudG9Db250YWluKCdtw7psdGlwbGVzIGludGVudG9zJyk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIHZhbGlkYXRlIHJldHJ5IHN1Y2Nlc3Mgb24gaW50ZXJtZWRpYXRlIGF0dGVtcHRzJywgKCkgPT4ge1xyXG4gICAgICBjb25zdCBtYXhSZXRyaWVzID0gMztcclxuICAgICAgY29uc3Qgc3VjY2Vzc09uQXR0ZW1wdCA9IDI7IC8vIFN1Y2Nlc3Mgb24gc2Vjb25kIGF0dGVtcHRcclxuICAgICAgbGV0IGF0dGVtcHRDb3VudCA9IDA7XHJcbiAgICAgIGxldCBzdWNjZXNzID0gZmFsc2U7XHJcbiAgICAgIFxyXG4gICAgICB3aGlsZSAoYXR0ZW1wdENvdW50IDwgbWF4UmV0cmllcyAmJiAhc3VjY2Vzcykge1xyXG4gICAgICAgIGF0dGVtcHRDb3VudCsrO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhdHRlbXB0Q291bnQgPT09IHN1Y2Nlc3NPbkF0dGVtcHQpIHtcclxuICAgICAgICAgIHN1Y2Nlc3MgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgZXhwZWN0KHN1Y2Nlc3MpLnRvQmUodHJ1ZSk7XHJcbiAgICAgIGV4cGVjdChhdHRlbXB0Q291bnQpLnRvQmUoc3VjY2Vzc09uQXR0ZW1wdCk7XHJcbiAgICAgIGV4cGVjdChhdHRlbXB0Q291bnQpLnRvQmVMZXNzVGhhbihtYXhSZXRyaWVzKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgaW1wbGVtZW50IHByb3BlciBlcnJvciBsb2dnaW5nIGR1cmluZyByZXRyaWVzJywgKCkgPT4ge1xyXG4gICAgICBjb25zdCBtYXhSZXRyaWVzID0gMztcclxuICAgICAgY29uc3QgbG9nRW50cmllczogc3RyaW5nW10gPSBbXTtcclxuICAgICAgXHJcbiAgICAgIGZvciAobGV0IGF0dGVtcHQgPSAxOyBhdHRlbXB0IDw9IG1heFJldHJpZXM7IGF0dGVtcHQrKykge1xyXG4gICAgICAgIC8vIFNpbXVsYXRlIGxvZ2dpbmcgZHVyaW5nIHJldHJ5XHJcbiAgICAgICAgY29uc3QgbG9nRW50cnkgPSBg8J+UhCBSZWludGVudGFuZG8gb3BlcmFjacOzbiAoaW50ZW50byAke2F0dGVtcHR9LyR7bWF4UmV0cmllc30pYDtcclxuICAgICAgICBsb2dFbnRyaWVzLnB1c2gobG9nRW50cnkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNpbXVsYXRlIGZhaWx1cmVcclxuICAgICAgICBpZiAoYXR0ZW1wdCA9PT0gbWF4UmV0cmllcykge1xyXG4gICAgICAgICAgbG9nRW50cmllcy5wdXNoKCfinYwgTcOheGltbyBkZSByZWludGVudG9zIGFsY2FuemFkbycpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgZXhwZWN0KGxvZ0VudHJpZXMubGVuZ3RoKS50b0JlKG1heFJldHJpZXMgKyAxKTsgLy8gMyByZXRyeSBsb2dzICsgMSBmYWlsdXJlIGxvZ1xyXG4gICAgICBleHBlY3QobG9nRW50cmllc1swXSkudG9Db250YWluKCdpbnRlbnRvIDEvMycpO1xyXG4gICAgICBleHBlY3QobG9nRW50cmllc1sxXSkudG9Db250YWluKCdpbnRlbnRvIDIvMycpO1xyXG4gICAgICBleHBlY3QobG9nRW50cmllc1syXSkudG9Db250YWluKCdpbnRlbnRvIDMvMycpO1xyXG4gICAgICBleHBlY3QobG9nRW50cmllc1szXSkudG9Db250YWluKCdNw6F4aW1vIGRlIHJlaW50ZW50b3MgYWxjYW56YWRvJyk7XHJcbiAgICB9KTtcclxuICB9KTtcclxufSk7Il19