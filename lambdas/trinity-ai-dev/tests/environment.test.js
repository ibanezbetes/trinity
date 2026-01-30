/**
 * Environment setup tests for Trinity AI Assistant
 */

const fs = require('fs');
const path = require('path');

describe('Environment Setup', () => {
    test('should have all required directories', () => {
        const requiredDirs = ['utils', 'services', 'types', 'tests'];
        
        requiredDirs.forEach(dir => {
            const dirPath = path.join(__dirname, '..', dir);
            expect(fs.existsSync(dirPath)).toBe(true);
        });
    });

    test('should have main handler file', () => {
        const handlerPath = path.join(__dirname, '..', 'ai.js');
        expect(fs.existsSync(handlerPath)).toBe(true);
    });

    test('should have package.json with correct dependencies', () => {
        const packagePath = path.join(__dirname, '..', 'package.json');
        expect(fs.existsSync(packagePath)).toBe(true);
        
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        
        // Check required dependencies
        expect(pkg.dependencies).toHaveProperty('@aws-sdk/client-dynamodb');
        expect(pkg.dependencies).toHaveProperty('@aws-sdk/lib-dynamodb');
        expect(pkg.dependencies).toHaveProperty('axios');
        expect(pkg.dependencies).toHaveProperty('uuid');
        
        // Check dev dependencies
        expect(pkg.devDependencies).toHaveProperty('jest');
        expect(pkg.devDependencies).toHaveProperty('fast-check');
    });

    test('should have test fixtures', () => {
        const fixturesPath = path.join(__dirname, 'fixtures');
        expect(fs.existsSync(fixturesPath)).toBe(true);
        
        const sampleEventsPath = path.join(fixturesPath, 'sample-events.json');
        expect(fs.existsSync(sampleEventsPath)).toBe(true);
        
        const mockResponsesPath = path.join(fixturesPath, 'mock-responses.json');
        expect(fs.existsSync(mockResponsesPath)).toBe(true);
    });

    test('should have type definitions', () => {
        const interfacesPath = path.join(__dirname, '..', 'types', 'interfaces.js');
        expect(fs.existsSync(interfacesPath)).toBe(true);
    });

    test('should load sample events correctly', () => {
        const sampleEventsPath = path.join(__dirname, 'fixtures', 'sample-events.json');
        const sampleEvents = JSON.parse(fs.readFileSync(sampleEventsPath, 'utf8'));
        
        expect(sampleEvents).toHaveProperty('getChatRecommendations');
        expect(sampleEvents).toHaveProperty('getChatRecommendationsOffTopic');
        expect(sampleEvents).toHaveProperty('getChatRecommendationsHappy');
        
        // Verify structure of sample event
        const event = sampleEvents.getChatRecommendations;
        expect(event).toHaveProperty('info');
        expect(event).toHaveProperty('arguments');
        expect(event).toHaveProperty('identity');
        expect(event.info).toHaveProperty('fieldName');
        expect(event.arguments).toHaveProperty('text');
        expect(event.identity).toHaveProperty('sub');
    });

    test('should load mock responses correctly', () => {
        const mockResponsesPath = path.join(__dirname, 'fixtures', 'mock-responses.json');
        const mockResponses = JSON.parse(fs.readFileSync(mockResponsesPath, 'utf8'));
        
        expect(mockResponses).toHaveProperty('validLLMResponse');
        expect(mockResponses).toHaveProperty('offTopicLLMResponse');
        expect(mockResponses).toHaveProperty('malformedJSONResponse');
        expect(mockResponses).toHaveProperty('tmdbMovieResult');
        
        // Verify structure of valid LLM response
        const validResponse = mockResponses.validLLMResponse;
        expect(validResponse).toHaveProperty('intent');
        expect(validResponse).toHaveProperty('titles');
        expect(['cinema', 'other']).toContain(validResponse.intent);
    });
});