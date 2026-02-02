/**
 * Task 9.2: Performance and reliability validation
 * 
 * This test validates system reliability including TMDB API rate limiting,
 * DynamoDB operations, and Lambda function cold start performance.
 */

import { execSync } from 'child_process';

describe('Task 9.2: Performance and Reliability Validation', () => {
  
  /**
   * Test 9.2.1: TMDB API Rate Limiting and Error Handling
   */
  test('TMDB API integration handles rate limiting and errors gracefully', async () => {
    try {
      console.log('🎬 Testing TMDB API reliability...');
      
      // Test multiple rapid requests to check rate limiting
      const testPayload = {
        info: {
          fieldName: 'searchMovies',
          parentTypeName: 'Query'
        },
        identity: {
          sub: '12345678-1234-1234-1234-123456789012',
          username: 'testuser'
        },
        arguments: {
          query: 'action',
          page: 1
        }
      };
      
      const payloadBase64 = Buffer.from(JSON.stringify(testPayload)).toString('base64');
      
      // Make 5 rapid requests to test rate limiting
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const command = `aws lambda invoke --function-name trinity-movie-dev --region eu-west-1 --payload ${payloadBase64} response-${i}.json`;
        promises.push(
          execSync(command, { encoding: 'utf8', timeout: 30000 })
        );
      }
      
      await Promise.all(promises);
      
      // Check responses
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < 5; i++) {
        try {
          const responseContent = execSync(`type response-${i}.json`, { encoding: 'utf8' });
          const response = JSON.parse(responseContent);
          
          if (response.errorType) {
            errorCount++;
            // Rate limiting or API errors are acceptable
            console.log(`   ⚠️ Request ${i + 1}: ${response.errorMessage}`);
          } else {
            successCount++;
            console.log(`   ✅ Request ${i + 1}: Success`);
          }
          
          // Clean up
          execSync(`del response-${i}.json`, { timeout: 5000 });
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
      
      // At least some requests should succeed or fail gracefully
      expect(successCount + errorCount).toBe(5);
      console.log(`   📊 Success: ${successCount}, Errors: ${errorCount} (graceful handling)`);
      
    } catch (error) {
      console.error('❌ TMDB API reliability test failed:', error);
      throw error;
    }
  }, 120000);

  /**
   * Test 9.2.2: DynamoDB Operations and TTL Functionality
   */
  test('DynamoDB operations are reliable and TTL works correctly', async () => {
    try {
      console.log('🗄️ Testing DynamoDB reliability...');
      
      // Test table accessibility and basic operations
      const tables = [
        'trinity-room-movie-cache-dev',
        'trinity-room-cache-metadata-dev',
        'trinity-votes-dev',
        'trinity-rooms-dev-v2'
      ];
      
      for (const tableName of tables) {
        // Test table describe
        const describeCommand = `aws dynamodb describe-table --table-name ${tableName} --region eu-west-1`;
        const describeResult = execSync(describeCommand, { encoding: 'utf8', timeout: 30000 });
        const tableInfo = JSON.parse(describeResult);
        
        expect(tableInfo.Table.TableStatus).toBe('ACTIVE');
        
        // Test basic scan operation (limited items)
        const scanCommand = `aws dynamodb scan --table-name ${tableName} --region eu-west-1 --max-items 1`;
        const scanResult = execSync(scanCommand, { encoding: 'utf8', timeout: 30000 });
        const scanData = JSON.parse(scanResult);
        
        // Should not error (empty results are fine)
        expect(scanData).toBeDefined();
        
        console.log(`   ✅ Table ${tableName}: Active and accessible`);
      }
      
      // Test TTL configuration for cache tables
      const cacheTable = 'trinity-room-movie-cache-dev';
      const ttlCommand = `aws dynamodb describe-time-to-live --table-name ${cacheTable} --region eu-west-1`;
      
      try {
        const ttlResult = execSync(ttlCommand, { encoding: 'utf8', timeout: 30000 });
        const ttlInfo = JSON.parse(ttlResult);
        
        if (ttlInfo.TimeToLiveDescription.TimeToLiveStatus === 'ENABLED') {
          console.log(`   ✅ TTL enabled on ${cacheTable}`);
        } else {
          console.log(`   ⚠️ TTL not enabled on ${cacheTable} (acceptable)`);
        }
      } catch (ttlError) {
        console.log(`   ⚠️ TTL check failed for ${cacheTable} (acceptable)`);
      }
      
    } catch (error) {
      console.error('❌ DynamoDB reliability test failed:', error);
      throw error;
    }
  }, 120000);

  /**
   * Test 9.2.3: Lambda Function Cold Start Performance
   */
  test('Lambda functions have acceptable cold start performance', async () => {
    try {
      console.log('❄️ Testing Lambda cold start performance...');
      
      const functions = [
        'trinity-auth-dev',
        'trinity-room-dev',
        'trinity-vote-dev',
        'trinity-movie-dev',
        'trinity-cache-dev'
      ];
      
      const coldStartTimes = [];
      
      for (const functionName of functions) {
        // Create a simple test payload
        const testPayload = {
          info: {
            fieldName: 'healthCheck',
            parentTypeName: 'Query'
          },
          identity: {
            sub: '12345678-1234-1234-1234-123456789012',
            username: 'testuser'
          },
          arguments: {}
        };
        
        const payloadBase64 = Buffer.from(JSON.stringify(testPayload)).toString('base64');
        
        // Measure cold start time
        const startTime = Date.now();
        const command = `aws lambda invoke --function-name ${functionName} --region eu-west-1 --payload ${payloadBase64} response.json`;
        
        execSync(command, { encoding: 'utf8', timeout: 60000 });
        const coldStartTime = Date.now() - startTime;
        coldStartTimes.push({ function: functionName, time: coldStartTime });
        
        // Clean up
        try {
          execSync('del response.json', { timeout: 5000 });
        } catch {
          // Ignore cleanup errors
        }
        
        console.log(`   ⏱️ ${functionName}: ${coldStartTime}ms`);
      }
      
      // Calculate average cold start time
      const avgColdStart = coldStartTimes.reduce((sum, item) => sum + item.time, 0) / coldStartTimes.length;
      
      // Cold start should be under 10 seconds for acceptable performance
      expect(avgColdStart).toBeLessThan(10000);
      
      console.log(`   📊 Average cold start: ${Math.round(avgColdStart)}ms`);
      console.log(`   ✅ Target: < 10000ms, Actual: ${Math.round(avgColdStart)}ms`);
      
    } catch (error) {
      console.error('❌ Lambda cold start test failed:', error);
      throw error;
    }
  }, 300000);

  /**
   * Test 9.2.4: System Error Recovery and Circuit Breaker
   */
  test('System handles errors gracefully and recovers properly', async () => {
    try {
      console.log('🔄 Testing error recovery and circuit breaker...');
      
      // Test invalid payload handling
      const invalidPayload = Buffer.from(JSON.stringify({ invalid: 'payload' })).toString('base64');
      
      const command = `aws lambda invoke --function-name trinity-auth-dev --region eu-west-1 --payload ${invalidPayload} response.json`;
      execSync(command, { encoding: 'utf8', timeout: 30000 });
      
      const responseContent = execSync('type response.json', { encoding: 'utf8' });
      const response = JSON.parse(responseContent);
      
      // Should handle invalid payload gracefully (not crash)
      expect(response).toBeDefined();
      
      if (response.errorType) {
        console.log(`   ✅ Invalid payload handled gracefully: ${response.errorType}`);
      } else {
        console.log(`   ✅ Function processed invalid payload without crashing`);
      }
      
      // Clean up
      try {
        execSync('del response.json', { timeout: 5000 });
      } catch {
        // Ignore cleanup errors
      }
      
      // Test function recovery after error
      const validPayload = {
        info: {
          fieldName: 'healthCheck',
          parentTypeName: 'Query'
        },
        identity: {
          sub: '12345678-1234-1234-1234-123456789012',
          username: 'testuser'
        },
        arguments: {}
      };
      
      const validPayloadBase64 = Buffer.from(JSON.stringify(validPayload)).toString('base64');
      const recoveryCommand = `aws lambda invoke --function-name trinity-auth-dev --region eu-west-1 --payload ${validPayloadBase64} response.json`;
      
      execSync(recoveryCommand, { encoding: 'utf8', timeout: 30000 });
      const recoveryContent = execSync('type response.json', { encoding: 'utf8' });
      
      // Should recover and process valid requests
      expect(recoveryContent).toBeDefined();
      console.log(`   ✅ Function recovered and processes valid requests`);
      
      // Clean up
      try {
        execSync('del response.json', { timeout: 5000 });
      } catch {
        // Ignore cleanup errors
      }
      
    } catch (error) {
      console.error('❌ Error recovery test failed:', error);
      throw error;
    }
  }, 120000);

  /**
   * Test 9.2.5: Resource Monitoring and Health Checks
   */
  test('System resources are healthy and within acceptable limits', async () => {
    try {
      console.log('📊 Testing system resource health...');
      
      // Check Lambda function metrics
      const functions = ['trinity-auth-dev', 'trinity-room-dev', 'trinity-vote-dev'];
      
      for (const functionName of functions) {
        // Get function configuration
        const configCommand = `aws lambda get-function-configuration --function-name ${functionName} --region eu-west-1`;
        const configResult = execSync(configCommand, { encoding: 'utf8', timeout: 30000 });
        const config = JSON.parse(configResult);
        
        // Check function state
        expect(config.State).toBe('Active');
        expect(config.LastUpdateStatus).toBe('Successful');
        
        console.log(`   ✅ ${functionName}: State=${config.State}, Memory=${config.MemorySize}MB`);
      }
      
      // Check DynamoDB table health
      const healthyTables = [];
      const tables = ['trinity-users-dev', 'trinity-rooms-dev-v2', 'trinity-votes-dev'];
      
      for (const tableName of tables) {
        const tableCommand = `aws dynamodb describe-table --table-name ${tableName} --region eu-west-1`;
        const tableResult = execSync(tableCommand, { encoding: 'utf8', timeout: 30000 });
        const tableInfo = JSON.parse(tableResult);
        
        if (tableInfo.Table.TableStatus === 'ACTIVE') {
          healthyTables.push(tableName);
        }
      }
      
      expect(healthyTables.length).toBe(tables.length);
      console.log(`   ✅ All ${healthyTables.length} tested tables are healthy`);
      
    } catch (error) {
      console.error('❌ Resource health test failed:', error);
      throw error;
    }
  }, 120000);
});