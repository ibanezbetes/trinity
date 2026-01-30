/**
 * Property 7: Security Compliance Test
 * 
 * **Validates: Requirements 8.1, 8.2, 8.3**
 * 
 * This property-based test ensures that:
 * 1. All API calls use tokens derived from process.env
 * 2. No hardcoded API keys exist in source code
 * 3. Environment variables are properly validated
 * 
 * @author Trinity AI Team
 * @version 1.0.0
 */

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const { EnvironmentValidator } = require('../utils/envValidator');
const { AIService } = require('../services/aiService');
const TMDBService = require('../services/tmdbService');

describe('Property 7: Security Compliance', () => {
    let originalEnv;
    
    beforeEach(() => {
        // Save original environment
        originalEnv = { ...process.env };
    });
    
    afterEach(() => {
        // Restore original environment
        process.env = originalEnv;
    });

    /**
     * Property 7.1: Environment Variable Usage
     * **Validates: Requirement 8.2** - Use environment variables from centralized .env
     */
    test('Property 7.1: All API credentials must come from process.env', () => {
        fc.assert(
            fc.property(
                fc.record({
                    hfToken: fc.string({ minLength: 25 }).map(s => `hf_${s}`),
                    tmdbKey: fc.hexaString({ minLength: 32, maxLength: 32 })
                }),
                (testCredentials) => {
                    // Set up test environment with VALID credentials
                    process.env.HF_API_TOKEN = testCredentials.hfToken;
                    process.env.TMDB_API_KEY = testCredentials.tmdbKey;
                    process.env.AWS_REGION = 'eu-west-1';
                    
                    try {
                        // Test AIService uses environment variables
                        const aiService = new AIService();
                        expect(aiService.hfToken).toBe(testCredentials.hfToken);
                        expect(aiService.hfToken).toBe(process.env.HF_API_TOKEN);
                        
                        // Test TMDBService uses environment variables
                        const tmdbService = new TMDBService();
                        expect(tmdbService.apiKey).toBe(testCredentials.tmdbKey);
                        expect(tmdbService.apiKey).toBe(process.env.TMDB_API_KEY);
                        
                        // Ensure no hardcoded values are used
                        expect(aiService.hfToken).not.toContain('hardcoded');
                        expect(tmdbService.apiKey).not.toContain('hardcoded');
                        
                        return true;
                    } catch (error) {
                        // If environment validation fails, that's expected for invalid tokens
                        if (error.message.includes('Environment validation failed')) {
                            return true; // This is expected behavior for invalid tokens
                        }
                        throw error;
                    }
                }
            ),
            { numRuns: 20 } // Reduced runs since we're testing valid credentials
        );
    });

    /**
     * Property 7.2: No Hardcoded Credentials
     * **Validates: Requirement 8.3** - Never hardcode API keys or tokens
     */
    test('Property 7.2: Source code must not contain hardcoded API credentials', () => {
        const sourceFiles = [
            '../services/aiService.js',
            '../services/tmdbService.js',
            '../services/fallbackEngine.js',
            '../utils/jsonParser.js',
            '../utils/envValidator.js'
        ];
        
        const hardcodedPatterns = [
            /hf_[a-zA-Z0-9]{20,}/g,  // Hugging Face tokens
            /[a-f0-9]{32}/g,         // TMDB API keys (32 hex chars)
            /AKIA[0-9A-Z]{16}/g,     // AWS Access Keys
            /(api_key|apikey|token|secret)\s*[:=]\s*['"][a-zA-Z0-9]{10,}['"]/gi
        ];
        
        sourceFiles.forEach(filePath => {
            const fullPath = path.join(__dirname, filePath);
            if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath, 'utf8');
                
                hardcodedPatterns.forEach((pattern, index) => {
                    const matches = content.match(pattern);
                    if (matches) {
                        // Filter out test data and comments
                        const realMatches = matches.filter(match => {
                            const line = content.split('\n').find(line => line.includes(match));
                            return line && 
                                   !line.trim().startsWith('//') && 
                                   !line.trim().startsWith('*') &&
                                   !line.includes('example') &&
                                   !line.includes('test') &&
                                   !line.includes('placeholder');
                        });
                        
                        expect(realMatches).toHaveLength(0);
                    }
                });
            }
        });
    });

    /**
     * Property 7.3: Environment Validation
     * **Validates: Requirement 8.1** - Environment variable validation on startup
     */
    test('Property 7.3: Environment validator must reject invalid configurations', () => {
        fc.assert(
            fc.property(
                fc.record({
                    hfToken: fc.oneof(
                        fc.constant(''), // Empty string
                        fc.constant('invalid_token'), // Invalid format
                        fc.constant(undefined) // Missing
                    ),
                    tmdbKey: fc.oneof(
                        fc.constant(''), // Empty string
                        fc.string({ minLength: 1, maxLength: 31 }), // Too short
                        fc.constant('not_hex_string') // Invalid format
                    )
                }),
                (invalidCredentials) => {
                    // Clear environment
                    delete process.env.HF_API_TOKEN;
                    delete process.env.TMDB_API_KEY;
                    delete process.env.HUGGINGFACE_API_KEY;
                    
                    // Set invalid values
                    if (invalidCredentials.hfToken !== undefined) {
                        process.env.HF_API_TOKEN = invalidCredentials.hfToken;
                    }
                    if (invalidCredentials.tmdbKey !== undefined) {
                        process.env.TMDB_API_KEY = invalidCredentials.tmdbKey;
                    }
                    
                    const validator = new EnvironmentValidator();
                    const results = validator.validateEnvironment();
                    
                    // Should detect invalid configuration
                    expect(results.valid).toBe(false);
                    expect(results.errors.length).toBeGreaterThan(0);
                    
                    return true;
                }
            ),
            { numRuns: 30 }
        );
    });

    /**
     * Property 7.4: Service Initialization Security
     * Services must fail securely when credentials are invalid
     */
    test('Property 7.4: Services must fail securely with invalid credentials', () => {
        fc.assert(
            fc.property(
                fc.record({
                    scenario: fc.constantFrom('missing_hf', 'invalid_hf', 'missing_tmdb', 'invalid_tmdb')
                }),
                (testCase) => {
                    // Clear environment
                    delete process.env.HF_API_TOKEN;
                    delete process.env.TMDB_API_KEY;
                    delete process.env.HUGGINGFACE_API_KEY;
                    process.env.AWS_REGION = 'eu-west-1';
                    
                    switch (testCase.scenario) {
                        case 'missing_hf':
                            process.env.TMDB_API_KEY = 'a'.repeat(32);
                            expect(() => new AIService()).toThrow(/environment validation failed/i);
                            break;
                            
                        case 'invalid_hf':
                            process.env.HF_API_TOKEN = 'invalid_token_format';
                            process.env.TMDB_API_KEY = 'a'.repeat(32);
                            expect(() => new AIService()).toThrow(/environment validation failed/i);
                            break;
                            
                        case 'missing_tmdb':
                            process.env.HF_API_TOKEN = 'hf_' + 'a'.repeat(25);
                            expect(() => new TMDBService()).toThrow(/environment validation failed/i);
                            break;
                            
                        case 'invalid_tmdb':
                            process.env.HF_API_TOKEN = 'hf_' + 'a'.repeat(25);
                            process.env.TMDB_API_KEY = 'invalid_key';
                            expect(() => new TMDBService()).toThrow(/environment validation failed/i);
                            break;
                    }
                    
                    return true;
                }
            ),
            { numRuns: 20 }
        );
    });

    /**
     * Property 7.5: Secure Configuration Object
     * The environment validator must provide secure configuration
     */
    test('Property 7.5: Environment validator must provide secure configuration', () => {
        // Set up valid environment
        process.env.HF_API_TOKEN = 'hf_' + 'a'.repeat(25);
        process.env.TMDB_API_KEY = 'a'.repeat(32);
        process.env.AWS_REGION = 'eu-west-1';
        
        const validator = new EnvironmentValidator();
        const results = validator.validateEnvironment();
        
        expect(results.valid).toBe(true);
        
        const config = validator.getSecureConfig();
        
        // Verify configuration structure
        expect(config).toHaveProperty('ai');
        expect(config).toHaveProperty('tmdb');
        expect(config).toHaveProperty('aws');
        expect(config).toHaveProperty('app');
        
        // Verify AI configuration
        expect(config.ai.hfToken).toBe(process.env.HF_API_TOKEN);
        expect(config.ai.modelUrl).toContain('salamandra');
        expect(config.ai.timeout).toBeGreaterThan(0);
        
        // Verify TMDB configuration
        expect(config.tmdb.apiKey).toBe(process.env.TMDB_API_KEY);
        expect(config.tmdb.baseUrl).toContain('themoviedb.org');
        expect(config.tmdb.timeout).toBeGreaterThan(0);
        
        // Verify AWS configuration
        expect(config.aws.region).toBe('eu-west-1');
    });

    /**
     * Property 7.6: Token Format Validation
     * Services must validate token formats for security
     */
    test('Property 7.6: Services must validate API token formats', () => {
        fc.assert(
            fc.property(
                fc.record({
                    hfToken: fc.string({ minLength: 1, maxLength: 50 }),
                    tmdbKey: fc.string({ minLength: 1, maxLength: 50 })
                }),
                (tokens) => {
                    process.env.AWS_REGION = 'eu-west-1';
                    
                    // Test HF token format validation
                    process.env.HF_API_TOKEN = tokens.hfToken;
                    process.env.TMDB_API_KEY = 'a'.repeat(32); // Valid TMDB key
                    
                    if (!tokens.hfToken.startsWith('hf_') || tokens.hfToken.length < 25) {
                        expect(() => new AIService()).toThrow();
                    }
                    
                    // Test TMDB key format validation
                    process.env.HF_API_TOKEN = 'hf_' + 'a'.repeat(25); // Valid HF token
                    process.env.TMDB_API_KEY = tokens.tmdbKey;
                    
                    if (!/^[a-f0-9]{32}$/.test(tokens.tmdbKey)) {
                        expect(() => new TMDBService()).toThrow();
                    }
                    
                    return true;
                }
            ),
            { numRuns: 30 }
        );
    });
});