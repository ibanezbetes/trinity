const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

async function testCachePerformance() {
    console.log('⚡ Ejecutando tests de performance del sistema de cache...');
    
    const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-west-1' }));
    const lambdaClient = new LambdaClient({ region: 'eu-west-1' });
    
    const testRoomId = `perf-test-${Date.now()}`;
    const results = {
        cacheCreation: { time: 0, passed: false },
        movieRetrieval: { time: 0, passed: false },
        sequenceIncrement: { time: 0, passed: false },
        batchLoading: { time: 0, passed: false },
        cleanup: { time: 0, passed: false }
    };
    
    try {
        // 1. Test Cache Creation Performance
        console.log('📦 Testing cache creation performance...');
        const createStartTime = Date.now();
        
        const createPayload = {
            action: 'createRoomCache',
            roomId: testRoomId,
            filterCriteria: {
                mediaType: 'MOVIE',
                genreIds: [28, 12],
                roomId: testRoomId
            }
        };
        
        const createResponse = await lambdaClient.send(new InvokeCommand({
            FunctionName: 'trinity-cache-dev',
            Payload: JSON.stringify(createPayload),
        }));
        
        results.cacheCreation.time = Date.now() - createStartTime;
        results.cacheCreation.passed = createResponse.StatusCode === 200;
        
        console.log(`   ⏱️  Cache creation: ${results.cacheCreation.time}ms`);
        console.log(`   ✅ Target: < 10000ms (batch loading), Actual: ${results.cacheCreation.time}ms`);
        
        // 2. Test Movie Retrieval Performance (Critical: < 200ms)
        console.log('🎬 Testing movie retrieval performance...');
        
        const retrievalTimes = [];
        for (let i = 0; i < 10; i++) {
            const retrievalStartTime = Date.now();
            
            const retrievalPayload = {
                action: 'getNextMovie',
                roomId: testRoomId
            };
            
            const retrievalResponse = await lambdaClient.send(new InvokeCommand({
                FunctionName: 'trinity-cache-dev',
                Payload: JSON.stringify(retrievalPayload),
            }));
            
            const retrievalTime = Date.now() - retrievalStartTime;
            retrievalTimes.push(retrievalTime);
            
            if (retrievalResponse.StatusCode !== 200) {
                throw new Error(`Movie retrieval failed on iteration ${i + 1}`);
            }
        }
        
        results.movieRetrieval.time = Math.round(retrievalTimes.reduce((a, b) => a + b, 0) / retrievalTimes.length);
        results.movieRetrieval.passed = results.movieRetrieval.time < 200;
        
        console.log(`   ⏱️  Average movie retrieval: ${results.movieRetrieval.time}ms (10 iterations)`);
        console.log(`   ✅ Target: < 200ms, Actual: ${results.movieRetrieval.time}ms`);
        console.log(`   📊 Min: ${Math.min(...retrievalTimes)}ms, Max: ${Math.max(...retrievalTimes)}ms`);
        
        // 3. Test Sequence Increment Performance
        console.log('🔢 Testing sequence increment performance...');
        const sequenceStartTime = Date.now();
        
        // Reset sequence for testing
        const resetPayload = {
            action: 'resetSequence',
            roomId: testRoomId,
            newIndex: 0
        };
        
        await lambdaClient.send(new InvokeCommand({
            FunctionName: 'trinity-cache-dev',
            Payload: JSON.stringify(resetPayload),
        }));
        
        // Test multiple rapid increments
        const incrementPromises = [];
        for (let i = 0; i < 5; i++) {
            incrementPromises.push(
                lambdaClient.send(new InvokeCommand({
                    FunctionName: 'trinity-cache-dev',
                    Payload: JSON.stringify({
                        action: 'getNextMovie',
                        roomId: testRoomId
                    }),
                }))
            );
        }
        
        await Promise.all(incrementPromises);
        results.sequenceIncrement.time = Date.now() - sequenceStartTime;
        results.sequenceIncrement.passed = results.sequenceIncrement.time < 1000; // 5 operations in < 1s
        
        console.log(`   ⏱️  5 concurrent sequence increments: ${results.sequenceIncrement.time}ms`);
        console.log(`   ✅ Target: < 1000ms, Actual: ${results.sequenceIncrement.time}ms`);
        
        // 4. Test Batch Loading Performance
        console.log('📚 Testing batch loading performance...');
        const batchStartTime = Date.now();
        
        const batchPayload = {
            action: 'loadMovieBatch',
            roomId: testRoomId,
            batchNumber: 2
        };
        
        const batchResponse = await lambdaClient.send(new InvokeCommand({
            FunctionName: 'trinity-cache-dev',
            Payload: JSON.stringify(batchPayload),
        }));
        
        results.batchLoading.time = Date.now() - batchStartTime;
        results.batchLoading.passed = results.batchLoading.time < 10000 && batchResponse.StatusCode === 200;
        
        console.log(`   ⏱️  Batch loading (30 movies): ${results.batchLoading.time}ms`);
        console.log(`   ✅ Target: < 10000ms, Actual: ${results.batchLoading.time}ms`);
        
        // 5. Test Cleanup Performance
        console.log('🧹 Testing cleanup performance...');
        const cleanupStartTime = Date.now();
        
        const cleanupPayload = {
            action: 'cleanupRoomCache',
            roomId: testRoomId
        };
        
        const cleanupResponse = await lambdaClient.send(new InvokeCommand({
            FunctionName: 'trinity-cache-dev',
            Payload: JSON.stringify(cleanupPayload),
        }));
        
        results.cleanup.time = Date.now() - cleanupStartTime;
        results.cleanup.passed = results.cleanup.time < 5000 && cleanupResponse.StatusCode === 200;
        
        console.log(`   ⏱️  Cache cleanup: ${results.cleanup.time}ms`);
        console.log(`   ✅ Target: < 5000ms, Actual: ${results.cleanup.time}ms`);
        
        // Generate Performance Report
        console.log('\\n📊 REPORTE DE PERFORMANCE:');
        console.log('================================');
        
        const allPassed = Object.values(results).every(result => result.passed);
        
        Object.entries(results).forEach(([test, result]) => {
            const status = result.passed ? '✅ PASSED' : '❌ FAILED';
            console.log(`${test.padEnd(20)}: ${result.time.toString().padStart(6)}ms ${status}`);
        });
        
        console.log('\\n🎯 CRITERIOS DE PERFORMANCE:');
        console.log('- Movie Retrieval: < 200ms (CRÍTICO)');
        console.log('- Cache Creation: < 10000ms');
        console.log('- Sequence Increment: < 1000ms (5 ops)');
        console.log('- Batch Loading: < 10000ms');
        console.log('- Cleanup: < 5000ms');
        
        if (allPassed) {
            console.log('\\n🎉 ¡TODOS LOS TESTS DE PERFORMANCE PASARON!');
            return true;
        } else {
            console.log('\\n⚠️  ALGUNOS TESTS DE PERFORMANCE FALLARON');
            
            // Recommendations for failed tests
            if (!results.movieRetrieval.passed) {
                console.log('💡 Recomendación: Optimizar queries DynamoDB y aumentar memoria Lambda');
            }
            if (!results.batchLoading.passed) {
                console.log('💡 Recomendación: Implementar paralelización en batch loading');
            }
            if (!results.sequenceIncrement.passed) {
                console.log('💡 Recomendación: Optimizar operaciones atómicas DynamoDB');
            }
            
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error en tests de performance:', error.message);
        return false;
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    testCachePerformance().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { testCachePerformance };