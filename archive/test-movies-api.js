#!/usr/bin/env node

/**
 * Script para probar la API de películas directamente
 */

const https = require('https');

const TMDB_API_KEY = 'dc4dbcd2404c1ca852f8eb964add267d';

console.log('🎬 Probando API de TMDB...\n');

const url = `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=es-ES&page=1`;

https.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (response.results && response.results.length > 0) {
        console.log('✅ API de TMDB funciona correctamente!\n');
        console.log(`📊 Total de películas: ${response.results.length}\n`);
        console.log('🎬 Primeras 5 películas:\n');
        
        response.results.slice(0, 5).forEach((movie, index) => {
          console.log(`${index + 1}. ${movie.title} (${movie.release_date?.split('-')[0] || 'N/A'})`);
          console.log(`   Rating: ${movie.vote_average}/10`);
          console.log(`   ID: ${movie.id}\n`);
        });
      } else {
        console.log('⚠️  La API respondió pero sin resultados');
        console.log('Respuesta:', JSON.stringify(response, null, 2));
      }
    } catch (error) {
      console.error('❌ Error parseando respuesta:', error.message);
      console.log('Respuesta raw:', data);
    }
  });
}).on('error', (error) => {
  console.error('❌ Error llamando a TMDB API:', error.message);
});
