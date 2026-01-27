@echo off
echo Testing TMDB API with curl...
echo.

echo Test 1: Animation + Comedy for TV (AND logic)
curl -s "https://api.themoviedb.org/3/discover/tv?api_key=dc4dbcd2404c1ca852f8eb964add267d&language=es-ES&with_genres=16,35&sort_by=vote_average.desc&include_adult=false" | jq ".results | length"

echo.
echo Test 2: Just Animation for TV
curl -s "https://api.themoviedb.org/3/discover/tv?api_key=dc4dbcd2404c1ca852f8eb964add267d&language=es-ES&with_genres=16&sort_by=vote_average.desc&include_adult=false" | jq ".results | length"

echo.
echo Test 3: Just Comedy for TV  
curl -s "https://api.themoviedb.org/3/discover/tv?api_key=dc4dbcd2404c1ca852f8eb964add267d&language=es-ES&with_genres=35&sort_by=vote_average.desc&include_adult=false" | jq ".results | length"