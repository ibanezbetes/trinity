#!/usr/bin/env node

const fetch = require('node-fetch');

async function checkTVGenres() {
    console.log('🔍 Checking TMDB TV genres...');
    
    const TMDB_API_KEY = process.env.TMDB_API_KEY || 'your-api-key-here';
    
    try {
        // Get TV genres from TMDB
        const genresUrl = `https://api.themoviedb.org/3/genre/tv/list?api_key=${TMDB_API_KEY}&language=es-ES`;
        
        console.log('📡 Fetching TV genres from TMDB...');
        const response = await fetch(genresUrl);
        
        if (!response.ok) {
            throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        console.log('\n📺 TV Genres available:');
        data.genres.forEach(genre => {
            console.log(`${genre.id}: ${genre.name}`);
            
            // Highlight relevant genres
            if (genre.name.toLowerCase().includes('terror') || 
                genre.name.toLowerCase().includes('horror') ||
                genre.name.toLowerCase().includes('thriller') ||
                genre.name.toLowerCase().includes('suspense') ||
                genre.name.toLowerCase().includes('misterio') ||
                genre.name.toLowerCase().includes('mystery')) {
                console.log(`   ⭐ RELEVANT for horror/thriller content`);
            }
        });
        
        // Test a simple TV discovery call
        console.log('\n🧪 Testing TV discovery with popular content...');
        const discoverUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&sort_by=popularity.desc&page=1&include_adult=false`;
        
        const discoverResponse = await fetch(discoverUrl);
        const discoverData = await discoverResponse.json();
        
        console.log(`📊 Popular TV shows found: ${discoverData.results.length}`);
        console.log('Top 5 popular TV shows:');
        discoverData.results.slice(0, 5).forEach((show, index) => {
            console.log(`${index + 1}. ${show.name} (${show.first_air_date?.substring(0, 4)}) - Genres: [${show.genre_ids.join(', ')}]`);
        });
        
        // Test with specific genres
        console.log('\n🧪 Testing TV discovery with Mystery (9648) genre...');
        const mysteryUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&with_genres=9648&sort_by=popularity.desc&page=1&include_adult=false`;
        
        const mysteryResponse = await fetch(mysteryUrl);
        const mysteryData = await mysteryResponse.json();
        
        console.log(`📊 Mystery TV shows found: ${mysteryData.results.length}`);
        if (mysteryData.results.length > 0) {
            console.log('Top 3 mystery TV shows:');
            mysteryData.results.slice(0, 3).forEach((show, index) => {
                console.log(`${index + 1}. ${show.name} (${show.first_air_date?.substring(0, 4)})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Failed to check TV genres:', error.message);
        
        if (error.message.includes('your-api-key-here')) {
            console.log('\n💡 Note: You need to set TMDB_API_KEY environment variable');
            console.log('   The Lambda should have access to this key');
        }
    }
}

// Run the check
checkTVGenres().catch(console.error);
