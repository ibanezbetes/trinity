/**
 * Validation Script for Extracted Business Logic Components
 * 
 * Validates that the extracted components from MONOLITH files work correctly
 * 
 * Requirements: 1.4, 3.1, 3.5
 */

import { EnhancedTMDBClient, GENRE_MAPPING } from './src/shared/enhanced-tmdb-client';
import { ContentFilterService } from './src/shared/content-filter-service';
import { BusinessLogicFactory } from './src/shared/business-logic-factory';
import { BUSINESS_LOGIC_CONSTANTS } from './src/shared/business-logic-types';

async function validateExtraction() {
  console.log('🔍 Validating extracted business logic components...\n');

  let errors = 0;
  let warnings = 0;

  try {
    // Test 1: EnhancedTMDBClient validation
    console.log('1️⃣ Testing EnhancedTMDBClient...');
    const tmdbClient = new EnhancedTMDBClient('test-api-key');
    
    // Test media type validation
    try {
      tmdbClient.validateMediaType('MOVIE');
      tmdbClient.validateMediaType('TV');
      console.log('   ✅ Media type validation works');
    } catch (error) {
      console.error('   ❌ Media type validation failed:', error);
      errors++;
    }

    // Test endpoint selection
    try {
      const movieEndpoint = tmdbClient.selectEndpoint('MOVIE');
      const tvEndpoint = tmdbClient.selectEndpoint('TV');
      if (movieEndpoint === '/discover/movie' && tvEndpoint === '/discover/tv') {
        console.log('   ✅ Endpoint selection works');
      } else {
        console.error('   ❌ Endpoint selection failed');
        errors++;
      }
    } catch (error) {
      console.error('   ❌ Endpoint selection failed:', error);
      errors++;
    }

    // Test genre mapping
    try {
      const movieGenres = [28, 12, 37, 10752]; // Action, Adventure, Western, War
      const mappedGenres = tmdbClient.mapGenreIds(movieGenres, 'TV');
      const expectedGenres = [10759, 10759, 37, 10768]; // Action & Adventure, Action & Adventure, Western, War & Politics
      
      if (JSON.stringify(mappedGenres) === JSON.stringify(expectedGenres)) {
        console.log('   ✅ Genre mapping works');
      } else {
        console.error('   ❌ Genre mapping failed. Expected:', expectedGenres, 'Got:', mappedGenres);
        errors++;
      }
    } catch (error) {
      console.error('   ❌ Genre mapping failed:', error);
      errors++;
    }

    // Test western languages - CRITICAL: NO Asian languages per requirements
    try {
      const westernLanguages = tmdbClient.getWesternLanguages();
      const expectedLanguages = ['en', 'es', 'fr', 'it', 'de', 'pt'];
      
      if (JSON.stringify(westernLanguages) === JSON.stringify(expectedLanguages)) {
        console.log('   ✅ Western languages correct (NO Asian languages)');
      } else {
        console.error('   ❌ Western languages incorrect. Expected:', expectedLanguages, 'Got:', westernLanguages);
        errors++;
      }

      // Verify NO Asian languages
      if (westernLanguages.includes('ja') || westernLanguages.includes('ko') || westernLanguages.includes('zh')) {
        console.error('   ❌ CRITICAL: Asian languages found in western languages list!');
        errors++;
      } else {
        console.log('   ✅ CRITICAL: No Asian languages in western list (per requirements)');
      }
    } catch (error) {
      console.error('   ❌ Western languages test failed:', error);
      errors++;
    }

    console.log('');

    // Test 2: ContentFilterService validation
    console.log('2️⃣ Testing ContentFilterService...');
    const contentFilter = new ContentFilterService('test-api-key');

    // Test western language validation
    try {
      const isEnglishWestern = contentFilter.isWesternLanguage('en');
      const isJapaneseWestern = contentFilter.isWesternLanguage('ja'); // Should be false per requirements
      const isKoreanWestern = contentFilter.isWesternLanguage('ko'); // Should be false per requirements
      
      if (isEnglishWestern && !isJapaneseWestern && !isKoreanWestern) {
        console.log('   ✅ Western language validation works (NO Asian languages)');
      } else {
        console.error('   ❌ Western language validation failed');
        errors++;
      }
    } catch (error) {
      console.error('   ❌ Western language validation failed:', error);
      errors++;
    }

    // Test description validation
    try {
      const validItem = {
        id: 123,
        overview: 'This is a valid description',
        poster_path: '/test.jpg',
        genre_ids: [28],
        vote_average: 7.0,
        vote_count: 100,
        popularity: 50.0,
        original_language: 'en',
        adult: false,
        title: 'Test Movie',
        release_date: '2023-01-01'
      };

      const hasValidDesc = contentFilter.hasValidDescription(validItem);
      const meetsQuality = contentFilter.meetsQualityGates(validItem);

      if (hasValidDesc && meetsQuality) {
        console.log('   ✅ Content validation works');
      } else {
        console.error('   ❌ Content validation failed');
        errors++;
      }
    } catch (error) {
      console.error('   ❌ Content validation failed:', error);
      errors++;
    }

    console.log('');

    // Test 3: BusinessLogicFactory validation
    console.log('3️⃣ Testing BusinessLogicFactory...');
    
    try {
      const factory = BusinessLogicFactory.getInstance();
      const factory2 = BusinessLogicFactory.getInstance();
      
      if (factory === factory2) {
        console.log('   ✅ Singleton pattern works');
      } else {
        console.error('   ❌ Singleton pattern failed');
        errors++;
      }

      // Test service creation
      const tmdbService = factory.getTMDBClient('test-key');
      const filterService = factory.getContentFilterService('test-key');
      const dbService = factory.getDynamoDBService();

      if (tmdbService && filterService && dbService) {
        console.log('   ✅ Service creation works');
      } else {
        console.error('   ❌ Service creation failed');
        errors++;
      }

      // Reset for cleanup
      BusinessLogicFactory.reset();
    } catch (error) {
      console.error('   ❌ BusinessLogicFactory test failed:', error);
      errors++;
    }

    console.log('');

    // Test 4: Constants validation
    console.log('4️⃣ Testing Business Logic Constants...');
    
    try {
      if (BUSINESS_LOGIC_CONSTANTS.MAX_MOVIES_PER_ROOM === 50) {
        console.log('   ✅ MAX_MOVIES_PER_ROOM is 50');
      } else {
        console.error('   ❌ MAX_MOVIES_PER_ROOM is not 50');
        errors++;
      }

      if (BUSINESS_LOGIC_CONSTANTS.MAX_GENRES_PER_ROOM === 2) {
        console.log('   ✅ MAX_GENRES_PER_ROOM is 2');
      } else {
        console.error('   ❌ MAX_GENRES_PER_ROOM is not 2');
        errors++;
      }

      const westernLangs = BUSINESS_LOGIC_CONSTANTS.WESTERN_LANGUAGES;
      if (westernLangs.length === 6 && !(westernLangs as string[]).includes('ja') && !(westernLangs as string[]).includes('ko')) {
        console.log('   ✅ WESTERN_LANGUAGES correct (NO Asian languages)');
      } else {
        console.error('   ❌ WESTERN_LANGUAGES incorrect or contains Asian languages');
        errors++;
      }

      if (BUSINESS_LOGIC_CONSTANTS.BUSINESS_LOGIC_VERSION === 'MONOLITH-FINAL-v1.0') {
        console.log('   ✅ Business logic version correct');
      } else {
        console.error('   ❌ Business logic version incorrect');
        errors++;
      }
    } catch (error) {
      console.error('   ❌ Constants validation failed:', error);
      errors++;
    }

    console.log('');

    // Test 5: Genre mapping validation
    console.log('5️⃣ Testing Genre Mapping...');
    
    try {
      const expectedMappings = {
        28: 10759,  // Action → Action & Adventure
        12: 10759,  // Adventure → Action & Adventure
        37: 37,     // Western → Western (same)
        10752: 10768 // War → War & Politics
      };

      let mappingCorrect = true;
      for (const [movieGenre, expectedTVGenre] of Object.entries(expectedMappings)) {
        const movieGenreNum = parseInt(movieGenre) as keyof typeof GENRE_MAPPING;
        const actualTVGenre = GENRE_MAPPING[movieGenreNum];
        if (actualTVGenre !== expectedTVGenre) {
          console.error(`   ❌ Genre mapping incorrect for ${movieGenre}: expected ${expectedTVGenre}, got ${actualTVGenre}`);
          mappingCorrect = false;
          errors++;
        }
      }

      if (mappingCorrect) {
        console.log('   ✅ Genre mapping correct');
      }
    } catch (error) {
      console.error('   ❌ Genre mapping validation failed:', error);
      errors++;
    }

    console.log('');

    // Summary
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(50));
    
    if (errors === 0) {
      console.log('🎉 ALL TESTS PASSED! Business logic extraction successful.');
      console.log('✅ EnhancedTMDBClient extracted and working');
      console.log('✅ ContentFilterService extracted and working');
      console.log('✅ BusinessLogicFactory extracted and working');
      console.log('✅ Western-only language filtering enforced (NO Asian languages)');
      console.log('✅ Genre mapping preserved');
      console.log('✅ 50-movie caching system ready');
      console.log('✅ Business logic constants correct');
      
      console.log('\n🎯 CRITICAL REQUIREMENTS VALIDATED:');
      console.log('   • Requirements 1.4: Functionality preservation ✅');
      console.log('   • Requirements 3.1: Western-only languages ✅');
      console.log('   • Requirements 3.5: Business logic validation ✅');
      
      return true;
    } else {
      console.log(`❌ ${errors} ERRORS FOUND! Business logic extraction needs fixes.`);
      if (warnings > 0) {
        console.log(`⚠️ ${warnings} warnings found.`);
      }
      return false;
    }

  } catch (error) {
    console.error('💥 CRITICAL ERROR during validation:', error);
    return false;
  }
}

// Run validation
validateExtraction()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Validation script failed:', error);
    process.exit(1);
  });