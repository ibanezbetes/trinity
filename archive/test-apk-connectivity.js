/**
 * Test APK connectivity and services
 * This script helps diagnose issues in compiled APK
 */

const https = require('https');
const { URL } = require('url');

console.log('🔍 TESTING APK CONNECTIVITY');
console.log('============================');

// Test endpoints
const endpoints = [
  'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
  'https://cognito-idp.eu-west-1.amazonaws.com/',
  'https://api.themoviedb.org/3/movie/popular',
  'https://www.google.com'
];

async function testEndpoint(url) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': 'Trinity-APK-Test/1.0'
      }
    };

    const req = https.request(options, (res) => {
      resolve({
        url,
        status: res.statusCode,
        success: res.statusCode < 400,
        headers: {
          'content-type': res.headers['content-type'],
          'server': res.headers['server']
        }
      });
    });

    req.on('error', (error) => {
      resolve({
        url,
        status: 0,
        success: false,
        error: error.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        url,
        status: 0,
        success: false,
        error: 'Timeout after 10 seconds'
      });
    });

    req.end();
  });
}

async function runConnectivityTests() {
  console.log('\n📡 TESTING NETWORK CONNECTIVITY:');
  console.log('---------------------------------');

  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint);
    
    if (result.success) {
      console.log(`✅ ${endpoint} - Status: ${result.status}`);
    } else {
      console.log(`❌ ${endpoint} - Error: ${result.error || 'HTTP ' + result.status}`);
    }
  }
}

// Test GraphQL query
async function testGraphQLQuery() {
  console.log('\n🔍 TESTING GRAPHQL QUERY:');
  console.log('--------------------------');

  const query = {
    query: `
      query TestQuery {
        __typename
      }
    `
  };

  try {
    const response = await fetch('https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Trinity-APK-Test/1.0'
      },
      body: JSON.stringify(query)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ GraphQL endpoint accessible');
      console.log('📊 Response:', JSON.stringify(result, null, 2));
    } else {
      console.log('❌ GraphQL query failed:', response.status, response.statusText);
      console.log('📊 Error response:', JSON.stringify(result, null, 2));
    }
    
  } catch (error) {
    console.log('❌ GraphQL test failed:', error.message);
  }
}

// Main test function
async function main() {
  await runConnectivityTests();
  await testGraphQLQuery();
  
  console.log('\n💡 RECOMMENDATIONS FOR APK:');
  console.log('----------------------------');
  console.log('1. ✅ Network connectivity tests completed');
  console.log('2. 🔧 Google Sign-In: Add SHA-1 fingerprint to Google Console');
  console.log('3. 🗳️ Voting: Enhanced error handling implemented');
  console.log('4. 📱 APK: Ready for testing with improved error messages');
  
  console.log('\n🚀 NEXT STEPS:');
  console.log('1. Build new APK with fixes: npm run build:android');
  console.log('2. Install on device and test');
  console.log('3. Check logs for detailed error information');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testEndpoint, runConnectivityTests, testGraphQLQuery };