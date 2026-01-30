"""
Movie search service for coordinating with existing trinity-movie-dev Lambda.

This module handles the integration between Trini's AI-extracted filters
and the existing Trinity movie search infrastructure.
"""

import json
import logging
import boto3
from typing import List, Dict, Any, Optional
from botocore.exceptions import ClientError

from models.extracted_filters import ExtractedFilters
from models.trini_response import MovieRecommendation

logger = logging.getLogger(__name__)


class MovieSearchService:
    """Service for searching movies using the existing trinity-movie-dev Lambda."""
    
    def __init__(self, region: str = 'eu-west-1'):
        """
        Initialize the movie search service.
        
        Args:
            region: AWS region for Lambda invocation
        """
        self.region = region
        self.lambda_client = boto3.client('lambda', region_name=region)
        self.movie_lambda_name = 'trinity-movie-dev'
        
        logger.info(f"🎬 MovieSearchService initialized for region {region}")
    
    async def search_movies_with_filters(self, filters: ExtractedFilters, limit: int = 20) -> List[MovieRecommendation]:
        """
        Enhanced movie search with sophisticated fallback mechanisms.
        
        Fallback Strategy:
        1. Primary: trinity-movie-dev Lambda with TMDB API
        2. Secondary: Validate and filter results from primary
        3. Tertiary: Cached popular movies with filter simulation
        4. Quaternary: Default curated movie list
        5. Emergency: Single fallback movie with explanation
        
        Args:
            filters: ExtractedFilters object containing search criteria
            limit: Maximum number of movies to return
            
        Returns:
            List of MovieRecommendation objects with enhanced scoring
            
        Raises:
            Exception: Only in catastrophic failure scenarios
        """
        try:
            logger.info(f"🔍 Enhanced movie search: genres={filters.genres}, confidence={filters.confidence}")
            
            # Primary attempt: Use trinity-movie-dev Lambda
            try:
                movies_data = await self._invoke_movie_lambda_with_retry(filters, limit * 2)  # Get more for filtering
                if movies_data:
                    # Validate that the results actually match our criteria
                    valid_movies = self._validate_movie_results_quality(movies_data, filters)
                    
                    if len(valid_movies) >= 3:  # We have enough quality results
                        recommendations = self._transform_movies_to_recommendations(valid_movies, filters)
                        if recommendations:
                            logger.info(f"✅ Primary search successful: {len(recommendations)} recommendations")
                            return recommendations[:limit]
                    else:
                        logger.warning(f"⚠️ Primary search returned low-quality results: {len(valid_movies)} valid movies")
            except Exception as primary_error:
                logger.warning(f"⚠️ Primary search failed: {str(primary_error)}")
            
            # Secondary fallback: Use cached popular movies with filter simulation
            try:
                cached_recommendations = await self._get_cached_movies_with_filtering(filters, limit)
                if cached_recommendations:
                    logger.info(f"🔄 Secondary fallback successful: {len(cached_recommendations)} cached recommendations")
                    return cached_recommendations
            except Exception as secondary_error:
                logger.warning(f"⚠️ Secondary fallback failed: {str(secondary_error)}")
            
            # Tertiary fallback: Default curated movies with smart selection
            try:
                default_recommendations = self._get_smart_default_recommendations_with_scoring(filters, limit)
                if default_recommendations:
                    logger.info(f"🎭 Tertiary fallback successful: {len(default_recommendations)} smart default recommendations")
                    return default_recommendations
            except Exception as tertiary_error:
                logger.warning(f"⚠️ Tertiary fallback failed: {str(tertiary_error)}")
            
            # Emergency fallback: Single explanatory movie
            logger.error("🚨 All fallback mechanisms failed, using emergency response")
            return self._get_emergency_fallback_recommendation(filters)
            
        except Exception as e:
            logger.error(f"❌ Catastrophic failure in movie search: {str(e)}")
            # Return emergency fallback instead of empty list
            return self._get_emergency_fallback_recommendation(filters)
    
    async def _invoke_movie_lambda_with_retry(self, filters: ExtractedFilters, limit: int, max_retries: int = 2) -> List[Dict[str, Any]]:
        """Invoke trinity-movie-dev Lambda with retry logic."""
        lambda_payload = self._transform_filters_to_lambda_payload(filters, limit)
        
        for attempt in range(max_retries + 1):
            try:
                if attempt > 0:
                    logger.info(f"🔄 Retry attempt {attempt} for movie Lambda")
                
                movies_data = await self._invoke_movie_lambda(lambda_payload)
                if movies_data:
                    return movies_data
                    
            except Exception as e:
                if attempt == max_retries:
                    raise e
                logger.warning(f"⚠️ Lambda attempt {attempt + 1} failed: {str(e)}")
                # Brief delay before retry
                import asyncio
                await asyncio.sleep(0.5 * (attempt + 1))
        
        return []
    
    async def _get_cached_movies_with_filtering(self, filters: ExtractedFilters, limit: int) -> List[MovieRecommendation]:
        """
        Enhanced cached movies fallback with intelligent cache key selection.
        
        This method implements a sophisticated fallback strategy that:
        1. Selects appropriate cache keys based on user filters
        2. Tries multiple cache sources for better coverage
        3. Applies intelligent client-side filtering
        4. Provides quality scoring even for cached results
        
        Args:
            filters: User's search filters
            limit: Maximum number of recommendations
            
        Returns:
            List of MovieRecommendation objects from cache
        """
        try:
            # Build intelligent cache key strategy based on filters
            cache_keys = self._build_cache_key_strategy(filters)
            
            all_cached_movies = []
            successful_cache_keys = []
            
            # Try each cache key in priority order
            for cache_key in cache_keys:
                try:
                    cached_movies = await self._get_cached_movies_from_dynamodb(cache_key)
                    if cached_movies:
                        all_cached_movies.extend(cached_movies)
                        successful_cache_keys.append(cache_key)
                        
                        # If we have enough movies, we can stop early
                        if len(all_cached_movies) >= limit * 3:  # Get 3x more for better filtering
                            break
                except Exception as cache_error:
                    logger.debug(f"🔍 Cache key {cache_key} failed: {str(cache_error)}")
                    continue
            
            if not all_cached_movies:
                logger.warning("⚠️ No cached movies found in any cache key")
                return []
            
            logger.info(f"📦 Retrieved {len(all_cached_movies)} movies from cache keys: {successful_cache_keys}")
            
            # Remove duplicates based on movie ID
            unique_movies = self._deduplicate_movies(all_cached_movies)
            
            # Apply enhanced client-side filtering
            filtered_movies = self._apply_enhanced_client_side_filtering(unique_movies, filters)
            
            # If filtering removed too many movies, relax some criteria
            if len(filtered_movies) < limit and len(unique_movies) > limit:
                logger.info("🔄 Relaxing filter criteria for better cached results")
                filtered_movies = self._apply_relaxed_filtering(unique_movies, filters, limit)
            
            # Transform to recommendations with enhanced scoring for cached movies
            recommendations = self._transform_cached_movies_to_recommendations(
                filtered_movies[:limit], filters
            )
            
            # Mark as cached fallback source with informative reasoning
            cache_source_info = f"caché local ({len(successful_cache_keys)} fuentes)"
            for rec in recommendations:
                rec.source = "cached_fallback"
                rec.reasoning += f" (Recomendación desde {cache_source_info} debido a problemas de conectividad)"
            
            logger.info(f"✅ Generated {len(recommendations)} cached recommendations")
            return recommendations
            
        except Exception as e:
            logger.error(f"❌ Error in enhanced cached movie fallback: {str(e)}")
            return []
    
    def _build_cache_key_strategy(self, filters: ExtractedFilters) -> List[str]:
        """
        Build intelligent cache key selection strategy based on user filters.
        
        This method prioritizes cache keys that are most likely to contain
        relevant movies based on the user's search criteria.
        
        Args:
            filters: User's extracted filters
            
        Returns:
            List of cache keys in priority order
        """
        cache_keys = []
        
        # Genre-specific cache keys (highest priority if genres specified)
        if filters.genres:
            genre_mapping = {
                '28': 'action',      # Action
                '35': 'comedy',      # Comedy  
                '18': 'drama',       # Drama
                '27': 'horror',      # Horror
                '10749': 'romance',  # Romance
                '878': 'scifi',      # Science Fiction
                '53': 'thriller',    # Thriller
                '12': 'adventure',   # Adventure
                '16': 'animation',   # Animation
                '80': 'crime'        # Crime
            }
            
            for genre_id in filters.genres[:2]:  # Limit to first 2 genres
                genre_name = genre_mapping.get(str(genre_id))
                if genre_name:
                    cache_keys.extend([
                        f'movies_all_{genre_name}',
                        f'movies_popular_{genre_name}',
                        f'movies_top_{genre_name}'
                    ])
        
        # Year-based cache keys
        if filters.year_range:
            if filters.year_range.min_year and filters.year_range.min_year >= 2020:
                cache_keys.extend(['movies_recent', 'movies_2020s'])
            elif filters.year_range.min_year and filters.year_range.min_year >= 2010:
                cache_keys.extend(['movies_2010s', 'movies_modern'])
            elif filters.year_range.max_year and filters.year_range.max_year <= 2000:
                cache_keys.extend(['movies_classics', 'movies_90s'])
        
        # Keyword-based cache keys
        if filters.keywords:
            for keyword in filters.keywords[:2]:  # Limit to first 2 keywords
                keyword_lower = keyword.lower()
                if 'marvel' in keyword_lower or 'superhero' in keyword_lower:
                    cache_keys.extend(['movies_superhero', 'movies_marvel'])
                elif 'disney' in keyword_lower or 'animation' in keyword_lower:
                    cache_keys.extend(['movies_animation', 'movies_family'])
                elif 'war' in keyword_lower or 'guerra' in keyword_lower:
                    cache_keys.extend(['movies_war', 'movies_history'])
        
        # General fallback cache keys (always included)
        cache_keys.extend([
            'movies_all_popular',     # Most popular movies
            'movies_top_rated',       # Highest rated movies
            'movies_trending',        # Currently trending
            'movies_all_action',      # Action movies (popular genre)
            'movies_all_comedy',      # Comedy movies (popular genre)
            'movies_all_drama',       # Drama movies (popular genre)
            'movies_general'          # General movie cache
        ])
        
        # Remove duplicates while preserving order
        seen = set()
        unique_cache_keys = []
        for key in cache_keys:
            if key not in seen:
                seen.add(key)
                unique_cache_keys.append(key)
        
        logger.debug(f"🔑 Cache key strategy: {unique_cache_keys[:5]}... ({len(unique_cache_keys)} total)")
        return unique_cache_keys
    
    def _deduplicate_movies(self, movies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate movies based on ID with preference for more complete data."""
        seen_ids = {}
        unique_movies = []
        
        for movie in movies:
            movie_id = str(movie.get('id', movie.get('tmdbId', movie.get('movieId', ''))))
            if not movie_id:
                continue
                
            # If we haven't seen this movie, add it
            if movie_id not in seen_ids:
                seen_ids[movie_id] = len(unique_movies)
                unique_movies.append(movie)
            else:
                # If we have seen it, keep the one with more complete data
                existing_index = seen_ids[movie_id]
                existing_movie = unique_movies[existing_index]
                
                # Simple completeness check - count non-empty fields
                existing_completeness = sum(1 for v in existing_movie.values() if v)
                new_completeness = sum(1 for v in movie.values() if v)
                
                if new_completeness > existing_completeness:
                    unique_movies[existing_index] = movie
        
        logger.debug(f"🔄 Deduplicated {len(movies)} movies to {len(unique_movies)} unique movies")
        return unique_movies
    
    def _apply_enhanced_client_side_filtering(self, movies: List[Dict[str, Any]], filters: ExtractedFilters) -> List[Dict[str, Any]]:
        """Apply enhanced client-side filtering with fuzzy matching and scoring."""
        filtered = []
        
        for movie in movies:
            score = 0.0
            max_score = 0.0
            
            # Genre filtering with partial matching
            if filters.genres:
                max_score += 1.0
                movie_genres = movie.get('genre_ids', movie.get('genres', []))
                if movie_genres:
                    # Convert to string IDs for comparison
                    movie_genre_strs = [str(g.get('id', g) if isinstance(g, dict) else g) for g in movie_genres]
                    filter_genre_strs = [str(g) for g in filters.genres]
                    
                    # Calculate genre match ratio
                    matches = sum(1 for g in filter_genre_strs if g in movie_genre_strs)
                    if matches > 0:
                        score += matches / len(filter_genre_strs)
                    else:
                        # If no exact matches, still include but with lower score
                        score += 0.1
                else:
                    score += 0.1  # Include movies without genre info but with low score
            
            # Year filtering with proximity scoring
            if filters.year_range:
                max_score += 1.0
                release_date = movie.get('release_date', movie.get('releaseDate', ''))
                if release_date:
                    try:
                        movie_year = int(release_date[:4])
                        year_score = self._calculate_year_proximity_score_for_cache(movie_year, filters.year_range)
                        score += year_score
                    except (ValueError, TypeError):
                        score += 0.1  # Include movies with invalid dates but low score
                else:
                    score += 0.1
            
            # Keyword filtering with fuzzy matching
            if filters.keywords:
                max_score += 1.0
                title = movie.get('title', '').lower()
                overview = movie.get('overview', '').lower()
                text_content = f"{title} {overview}"
                
                keyword_matches = 0
                for keyword in filters.keywords:
                    if keyword.lower() in text_content:
                        keyword_matches += 1
                
                if keyword_matches > 0:
                    score += keyword_matches / len(filters.keywords)
                else:
                    score += 0.1  # Include all movies but with low score for no keyword matches
            
            # Quality score (always applied)
            max_score += 1.0
            rating = float(movie.get('rating', movie.get('vote_average', 0)))
            if rating >= 7.0:
                score += 1.0
            elif rating >= 6.0:
                score += 0.8
            elif rating >= 5.0:
                score += 0.6
            else:
                score += 0.3
            
            # Calculate final score
            final_score = score / max_score if max_score > 0 else 0.5
            
            # Include movies with score above threshold
            if final_score >= 0.2:  # Lower threshold for cached movies
                movie['_cache_score'] = final_score
                filtered.append(movie)
        
        # Sort by cache score
        filtered.sort(key=lambda x: x.get('_cache_score', 0), reverse=True)
        
        logger.debug(f"🎯 Enhanced filtering: {len(filtered)} movies passed filter criteria")
        return filtered
    
    def _calculate_year_proximity_score_for_cache(self, movie_year: int, year_range) -> float:
        """Calculate year proximity score for cached movies."""
        if hasattr(year_range, 'min_year') and hasattr(year_range, 'max_year'):
            min_year = year_range.min_year
            max_year = year_range.max_year
            
            if min_year and max_year:
                if min_year <= movie_year <= max_year:
                    return 1.0
                else:
                    # Calculate distance penalty (more lenient for cached movies)
                    if movie_year < min_year:
                        distance = min_year - movie_year
                    else:
                        distance = movie_year - max_year
                    
                    # More lenient penalty for cached movies: 5% reduction per year
                    penalty = min(distance * 0.05, 0.8)
                    return max(1.0 - penalty, 0.2)
            
            elif min_year:
                if movie_year >= min_year:
                    return 1.0
                else:
                    distance = min_year - movie_year
                    penalty = min(distance * 0.05, 0.8)
                    return max(1.0 - penalty, 0.2)
            
            elif max_year:
                if movie_year <= max_year:
                    return 1.0
                else:
                    distance = movie_year - max_year
                    penalty = min(distance * 0.05, 0.8)
                    return max(1.0 - penalty, 0.2)
        
        return 0.5
    
    def _apply_relaxed_filtering(self, movies: List[Dict[str, Any]], filters: ExtractedFilters, target_count: int) -> List[Dict[str, Any]]:
        """Apply relaxed filtering when strict filtering yields too few results."""
        # Sort by rating first
        movies_by_rating = sorted(
            movies, 
            key=lambda x: float(x.get('rating', x.get('vote_average', 0))), 
            reverse=True
        )
        
        # Take top-rated movies up to target count
        relaxed_results = movies_by_rating[:target_count * 2]  # Get 2x for better selection
        
        # Apply only the most important filter (genres if specified)
        if filters.genres:
            genre_filtered = []
            for movie in relaxed_results:
                movie_genres = movie.get('genre_ids', movie.get('genres', []))
                if movie_genres:
                    movie_genre_strs = [str(g.get('id', g) if isinstance(g, dict) else g) for g in movie_genres]
                    filter_genre_strs = [str(g) for g in filters.genres]
                    
                    # More lenient genre matching
                    if any(g in movie_genre_strs for g in filter_genre_strs):
                        genre_filtered.append(movie)
            
            if len(genre_filtered) >= target_count:
                relaxed_results = genre_filtered
        
        logger.info(f"🔄 Relaxed filtering yielded {len(relaxed_results)} movies")
        return relaxed_results[:target_count * 2]  # Return extra for final selection
    
    def _transform_cached_movies_to_recommendations(self, movies: List[Dict[str, Any]], filters: ExtractedFilters) -> List[MovieRecommendation]:
        """Transform cached movies to recommendations with appropriate scoring."""
        recommendations = []
        
        for movie_data in movies:
            try:
                # Validate and normalize cached movie data
                normalized_movie = self._validate_and_normalize_movie_data(movie_data)
                
                # Skip movies that don't meet minimum requirements
                if not self._meets_minimum_data_requirements(normalized_movie):
                    continue
                
                # Calculate relevance score (slightly adjusted for cached movies)
                base_score = self._calculate_relevance_score(movie_data, filters)
                
                # Apply small penalty for cached source (5% reduction)
                cached_score = base_score * 0.95
                
                # Use cached score if available from filtering
                if '_cache_score' in movie_data:
                    # Blend the two scores
                    cached_score = (cached_score + movie_data['_cache_score']) / 2
                
                # Generate reasoning with cache context
                reasoning = self._generate_reasoning_for_cached_movie(movie_data, filters)
                
                recommendation = MovieRecommendation(
                    movie=normalized_movie,
                    relevance_score=cached_score,
                    reasoning=reasoning,
                    source="cached_fallback"
                )
                
                recommendations.append(recommendation)
                
            except Exception as e:
                logger.warning(f"⚠️ Error processing cached movie {movie_data.get('id', 'unknown')}: {str(e)}")
                continue
        
        # Sort by relevance score
        recommendations.sort(key=lambda x: x.relevance_score, reverse=True)
        
        logger.info(f"🎯 Created {len(recommendations)} cached movie recommendations")
        return recommendations
    
    def _generate_reasoning_for_cached_movie(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> str:
        """Generate reasoning specifically for cached movie recommendations."""
        # Use the standard reasoning generation
        base_reasoning = self._generate_reasoning(movie_data, filters)
        
        # Add cache-specific context
        cache_context = "Esta recomendación proviene de nuestra selección curada de películas populares"
        
        return f"{base_reasoning} {cache_context}."
    
    async def _get_cached_movies_from_dynamodb(self, cache_key: str) -> List[Dict[str, Any]]:
        """
        Get cached movies from DynamoDB trinity-movies-cache-dev table.
        
        This method implements the actual DynamoDB integration to retrieve
        cached popular movies when TMDB API is unavailable.
        
        Args:
            cache_key: Cache key to look for in DynamoDB
            
        Returns:
            List of cached movie dictionaries
        """
        try:
            import boto3
            from botocore.exceptions import ClientError
            
            # Initialize DynamoDB client
            dynamodb = boto3.resource('dynamodb', region_name=self.region)
            cache_table = dynamodb.Table('trinity-movies-cache-dev')
            
            # Try to get cached movies with the specific cache key
            response = cache_table.get_item(
                Key={'cacheKey': cache_key}
            )
            
            if 'Item' in response:
                cached_data = response['Item']
                movies = cached_data.get('movies', [])
                
                # Validate that we have a list of movies
                if isinstance(movies, list) and len(movies) > 0:
                    logger.info(f"📦 Retrieved {len(movies)} cached movies for key: {cache_key}")
                    return movies
                else:
                    logger.debug(f"🔍 No movies found in cache for key: {cache_key}")
            else:
                logger.debug(f"🔍 Cache key not found: {cache_key}")
            
            return []
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'ResourceNotFoundException':
                logger.warning(f"⚠️ Cache table 'trinity-movies-cache-dev' not found")
            else:
                logger.warning(f"⚠️ DynamoDB error accessing cache: {error_code}")
            return []
        except Exception as e:
            logger.warning(f"⚠️ Error accessing movie cache: {str(e)}")
            return []
    
    def _apply_client_side_filtering(self, movies: List[Dict[str, Any]], filters: ExtractedFilters) -> List[Dict[str, Any]]:
        """Apply filtering logic on cached movies."""
        filtered = []
        
        for movie in movies:
            # Genre filtering (if movie has genre info)
            if filters.genres:
                movie_genres = movie.get('genre_ids', movie.get('genres', []))
                if movie_genres:
                    # Check if any requested genre matches
                    movie_genre_strs = [str(g) for g in movie_genres]
                    filter_genre_strs = [str(g) for g in filters.genres]
                    if not any(g in movie_genre_strs for g in filter_genre_strs):
                        continue
            
            # Year filtering
            if filters.year_range:
                release_date = movie.get('release_date', movie.get('releaseDate', ''))
                if release_date:
                    try:
                        movie_year = int(release_date[:4])
                        if hasattr(filters.year_range, 'min_year') and filters.year_range.min_year:
                            if movie_year < filters.year_range.min_year:
                                continue
                        if hasattr(filters.year_range, 'max_year') and filters.year_range.max_year:
                            if movie_year > filters.year_range.max_year:
                                continue
                    except (ValueError, TypeError):
                        pass
            
            # Keyword filtering
            if filters.keywords:
                title = movie.get('title', '').lower()
                overview = movie.get('overview', '').lower()
                text_content = f"{title} {overview}"
                
                # Check if any keyword matches
                if not any(keyword.lower() in text_content for keyword in filters.keywords):
                    continue
            
            filtered.append(movie)
        
        return filtered
    
    # REMOVED: _get_default_recommendations_with_scoring method
    # This method contained generic movies (El Padrino, Matrix, Star Wars) that were
    # conflicting with the smart recommendations. Now using only the smart method
    # that contains genre-specific movies including Spanish comedies.
    
    # REMOVED: Helper methods for the old default recommendations system
    # These methods were used by _get_default_recommendations_with_scoring which has been removed
    # to avoid conflicts with the smart recommendations system
    
    def _get_emergency_fallback_recommendation(self, filters: ExtractedFilters) -> List[MovieRecommendation]:
        """Emergency fallback when all other methods fail."""
        emergency_movie = {
            'id': 'emergency-1',
            'title': 'Servicio Temporalmente No Disponible',
            'overview': 'Lo sentimos, el servicio de recomendaciones no está disponible en este momento. Por favor, inténtalo de nuevo más tarde.',
            'vote_average': 0,
            'release_date': '2024-01-01',
            'poster_path': None,
            'genres': []
        }
        
        recommendation = MovieRecommendation(
            movie=emergency_movie,
            relevance_score=0.0,
            reasoning="El servicio de películas está temporalmente no disponible. Nuestro equipo está trabajando para restaurar el servicio lo antes posible.",
            source="emergency_fallback"
        )
        
        return [recommendation]
    
    def _validate_movie_results_quality(self, movies: List[Dict[str, Any]], filters: ExtractedFilters) -> List[Dict[str, Any]]:
        """
        Validate that movie results actually match the requested criteria.
        
        This function checks if the movies returned by trinity-movie-dev actually
        match what the user requested, and filters out irrelevant results.
        """
        if not movies:
            return []
        
        valid_movies = []
        
        for movie in movies:
            # Check if movie has basic required information
            title = movie.get('title', movie.get('mediaTitle', ''))
            overview = movie.get('overview', movie.get('mediaOverview', ''))
            
            if not title or len(title.strip()) < 2:
                logger.debug(f"🚫 Skipping movie with invalid title: {title}")
                continue
            
            # For genre-specific requests, check if the movie content suggests it matches
            if filters.genres:
                genre_match_score = self._calculate_content_genre_match(movie, filters)
                if genre_match_score < 0.3:  # Very low match
                    logger.debug(f"🚫 Skipping '{title}' - low genre match score: {genre_match_score}")
                    continue
            
            # For keyword requests, ensure some relevance
            if filters.keywords:
                keyword_match_score = self._calculate_keyword_relevance_score(movie, filters)
                if keyword_match_score < 0.1:  # No keyword relevance
                    logger.debug(f"🚫 Skipping '{title}' - no keyword relevance")
                    continue
            
            valid_movies.append(movie)
        
        logger.info(f"🎯 Quality validation: {len(valid_movies)} valid movies from {len(movies)} total")
        return valid_movies
    
    def _calculate_content_genre_match(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> float:
        """
        Calculate genre match based on movie content when genre metadata is missing.
        
        This function analyzes the movie's title and overview to determine if it
        likely matches the requested genres.
        """
        if not filters.genres:
            return 1.0
        
        title = movie_data.get('title', movie_data.get('mediaTitle', '')).lower()
        overview = movie_data.get('overview', movie_data.get('mediaOverview', '')).lower()
        content = f"{title} {overview}"
        
        # Genre-specific keywords for content analysis
        genre_keywords = {
            '35': ['comedia', 'comedy', 'cómico', 'divertido', 'gracioso', 'humor', 'risas', 'funny', 'hilarious'],  # Comedy
            '28': ['acción', 'action', 'lucha', 'combate', 'batalla', 'fight', 'battle', 'guerra', 'war'],  # Action
            '18': ['drama', 'dramático', 'emotional', 'familia', 'family', 'vida', 'life'],  # Drama
            '27': ['terror', 'horror', 'miedo', 'scary', 'monstruo', 'monster', 'fantasma', 'ghost'],  # Horror
            '53': ['thriller', 'suspenso', 'suspense', 'misterio', 'mystery', 'crimen', 'crime'],  # Thriller
            '10749': ['romance', 'romántico', 'amor', 'love', 'romantic', 'pareja', 'couple'],  # Romance
            '878': ['ciencia ficción', 'sci-fi', 'futuro', 'future', 'espacio', 'space', 'robot', 'alien'],  # Sci-Fi
            '12': ['aventura', 'adventure', 'viaje', 'journey', 'exploración', 'exploration'],  # Adventure
            '16': ['animación', 'animation', 'animado', 'animated', 'dibujos', 'cartoon'],  # Animation
            '14': ['fantasía', 'fantasy', 'magia', 'magic', 'mágico', 'magical', 'fantástico']  # Fantasy
        }
        
        total_score = 0.0
        for genre_id in filters.genres:
            genre_id_str = str(genre_id)
            if genre_id_str in genre_keywords:
                keywords = genre_keywords[genre_id_str]
                matches = sum(1 for keyword in keywords if keyword in content)
                if matches > 0:
                    # Score based on number of matching keywords
                    genre_score = min(matches * 0.3, 1.0)  # Max 1.0 per genre
                    total_score += genre_score
                    logger.debug(f"🎭 Genre {genre_id_str} match: {matches} keywords, score: {genre_score}")
        
        # Normalize by number of requested genres
        final_score = total_score / len(filters.genres) if filters.genres else 0.0
        return min(final_score, 1.0)
    
    def _get_smart_default_recommendations_with_scoring(self, filters: ExtractedFilters, limit: int) -> List[MovieRecommendation]:
        """
        Get smart default recommendations that actually match the user's request.
        
        This function provides curated movies that are more likely to match
        the user's specific criteria, especially for genres.
        """
        # Genre-specific curated movies with enhanced Spanish comedy collection
        genre_specific_movies = {
            '35': [  # Comedy - Enhanced Spanish comedy collection
                {
                    'id': 'comedy-es-1', 'title': 'Ocho Apellidos Vascos', 
                    'overview': 'Un sevillano se hace pasar por vasco para conquistar a una chica de Euskadi. La comedia española más taquillera de la historia.',
                    'vote_average': 6.4, 'release_date': '2014-03-14', 'poster_path': 'https://image.tmdb.org/t/p/w500/ocho_apellidos_vascos.jpg',
                    'genres': [{'id': 35, 'name': 'Comedia'}, {'id': 10749, 'name': 'Romance'}]
                },
                {
                    'id': 'comedy-es-2', 'title': 'Ocho Apellidos Catalanes', 
                    'overview': 'Secuela de Ocho Apellidos Vascos. Koldo y Amaia se van a casar, pero antes deben conocer a los padres de ella en Cataluña.',
                    'vote_average': 5.3, 'release_date': '2015-11-20', 'poster_path': 'https://image.tmdb.org/t/p/w500/ocho_apellidos_catalanes.jpg',
                    'genres': [{'id': 35, 'name': 'Comedia'}, {'id': 10749, 'name': 'Romance'}]
                },
                {
                    'id': 'comedy-es-3', 'title': 'El Mundo es Suyo', 
                    'overview': 'Dos raperos de Sevilla intentan triunfar en el mundo de la música con resultados hilarantes.',
                    'vote_average': 6.1, 'release_date': '2018-06-22', 'poster_path': 'https://image.tmdb.org/t/p/w500/el_mundo_es_suyo.jpg',
                    'genres': [{'id': 35, 'name': 'Comedia'}, {'id': 10402, 'name': 'Música'}]
                },
                {
                    'id': 'comedy-es-4', 'title': 'Spanish Movie', 
                    'overview': 'Una parodia de las películas españolas más famosas, con humor absurdo y referencias al cine nacional.',
                    'vote_average': 3.1, 'release_date': '2009-08-28', 'poster_path': 'https://image.tmdb.org/t/p/w500/spanish_movie.jpg',
                    'genres': [{'id': 35, 'name': 'Comedia'}]
                },
                {
                    'id': 'comedy-es-5', 'title': 'Torrente 4: Lethal Crisis', 
                    'overview': 'El policía más gamberro de España vuelve con más acción y humor en esta cuarta entrega de la saga.',
                    'vote_average': 5.4, 'release_date': '2011-03-11', 'poster_path': 'https://image.tmdb.org/t/p/w500/torrente_4.jpg',
                    'genres': [{'id': 35, 'name': 'Comedia'}, {'id': 28, 'name': 'Acción'}]
                },
                {
                    'id': 'comedy-es-6', 'title': 'Perdiendo el Norte', 
                    'overview': 'Dos amigos madrileños emigran a Alemania en busca de trabajo, pero las cosas no salen como esperaban.',
                    'vote_average': 6.2, 'release_date': '2015-03-06', 'poster_path': 'https://image.tmdb.org/t/p/w500/perdiendo_el_norte.jpg',
                    'genres': [{'id': 35, 'name': 'Comedia'}, {'id': 18, 'name': 'Drama'}]
                },
                {
                    'id': 'comedy-es-7', 'title': 'Superlópez', 
                    'overview': 'Adaptación del famoso cómic español sobre un superhéroe muy particular y sus aventuras cómicas.',
                    'vote_average': 5.4, 'release_date': '2018-11-23', 'poster_path': 'https://image.tmdb.org/t/p/w500/superlopez.jpg',
                    'genres': [{'id': 35, 'name': 'Comedia'}, {'id': 28, 'name': 'Acción'}]
                },
                {
                    'id': 'comedy-es-8', 'title': 'Padre no hay más que uno', 
                    'overview': 'Un padre de familia numerosa debe cuidar solo de sus hijos durante las vacaciones con resultados cómicos.',
                    'vote_average': 6.1, 'release_date': '2019-07-26', 'poster_path': 'https://image.tmdb.org/t/p/w500/padre_no_hay_mas_que_uno.jpg',
                    'genres': [{'id': 35, 'name': 'Comedia'}, {'id': 10751, 'name': 'Familiar'}]
                },
                # International comedies for variety
                {
                    'id': 'comedy-int-1', 'title': 'El Gran Hotel Budapest', 
                    'overview': 'Las aventuras de Gustave H, un legendario conserje de un famoso hotel europeo, y Zero Moustafa, el botones que se convierte en su protegido.',
                    'vote_average': 8.1, 'release_date': '2014-03-28', 'poster_path': 'https://image.tmdb.org/t/p/w500/grand_budapest_hotel.jpg',
                    'genres': [{'id': 35, 'name': 'Comedia'}, {'id': 18, 'name': 'Drama'}]
                },
                {
                    'id': 'comedy-int-2', 'title': 'El Libro de la Vida', 
                    'overview': 'Una aventura animada sobre el Día de los Muertos y el poder del amor verdadero.',
                    'vote_average': 7.3, 'release_date': '2014-10-17', 'poster_path': 'https://image.tmdb.org/t/p/w500/book_of_life.jpg',
                    'genres': [{'id': 16, 'name': 'Animación'}, {'id': 35, 'name': 'Comedia'}]
                }
            ],
            '28': [  # Action
                {
                    'id': 'action-1', 'title': 'Mad Max: Fury Road', 
                    'overview': 'En un mundo post-apocalíptico, Max se une a Furiosa para escapar de un tirano.',
                    'vote_average': 8.1, 'release_date': '2015-05-15', 'poster_path': '/action1.jpg',
                    'genres': [{'id': 28, 'name': 'Acción'}, {'id': 12, 'name': 'Aventura'}]
                }
            ],
            '18': [  # Drama
                {
                    'id': 'drama-1', 'title': 'El Secreto de Sus Ojos', 
                    'overview': 'Un investigador judicial jubilado decide escribir una novela sobre un caso que no pudo resolver.',
                    'vote_average': 8.2, 'release_date': '2009-08-13', 'poster_path': '/drama1.jpg',
                    'genres': [{'id': 18, 'name': 'Drama'}, {'id': 53, 'name': 'Thriller'}]
                }
            ]
        }
        
        # Select movies based on requested genres
        selected_movies = []
        
        if filters.genres:
            for genre_id in filters.genres:
                genre_id_str = str(genre_id)
                if genre_id_str in genre_specific_movies:
                    genre_movies = genre_specific_movies[genre_id_str]
                    selected_movies.extend(genre_movies)
        
        # If no genre-specific movies or no genres specified, use general good movies
        if not selected_movies:
            selected_movies = [
                {
                    'id': 'general-1', 'title': 'Coco', 
                    'overview': 'Un niño mexicano viaja al mundo de los muertos para descubrir su historia familiar.',
                    'vote_average': 8.4, 'release_date': '2017-11-22', 'poster_path': '/general1.jpg',
                    'genres': [{'id': 16, 'name': 'Animación'}, {'id': 10751, 'name': 'Familiar'}]
                },
                {
                    'id': 'general-2', 'title': 'El Laberinto del Fauno', 
                    'overview': 'Una niña descubre un mundo mágico durante la Guerra Civil Española.',
                    'vote_average': 8.2, 'release_date': '2006-10-11', 'poster_path': '/general2.jpg',
                    'genres': [{'id': 14, 'name': 'Fantasía'}, {'id': 18, 'name': 'Drama'}]
                }
            ]
        
        # Transform to recommendations
        recommendations = []
        for movie_data in selected_movies[:limit]:
            try:
                normalized_movie = self._validate_and_normalize_movie_data(movie_data)
                relevance_score = self._calculate_relevance_score(movie_data, filters)
                reasoning = self._generate_smart_default_reasoning(movie_data, filters)
                
                recommendation = MovieRecommendation(
                    movie=normalized_movie,
                    relevance_score=relevance_score,
                    reasoning=reasoning,
                    source="smart_default"
                )
                
                recommendations.append(recommendation)
                
            except Exception as e:
                logger.warning(f"⚠️ Error processing smart default movie {movie_data.get('id', 'unknown')}: {str(e)}")
                continue
        
        # Sort by relevance score
        recommendations.sort(key=lambda x: x.relevance_score, reverse=True)
        
        logger.info(f"🎭 Generated {len(recommendations)} smart default recommendations")
        return recommendations
    
    def _generate_smart_default_reasoning(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> str:
        """Generate unique, contextual reasoning for each smart default recommendation."""
        movie_title = movie_data.get('title', 'Esta película')
        movie_id = movie_data.get('id', '')
        rating = float(movie_data.get('vote_average', 0))
        release_date = movie_data.get('release_date', '')
        year = self._extract_year_from_date(release_date) if release_date else ''
        
        # Movie-specific reasoning based on ID and content
        specific_reasonings = {
            'comedy-es-1': f"'{movie_title}' es la comedia española más taquillera de la historia, perfecta para quien busca humor español auténtico con {rating:.1f}/10 de valoración",
            'comedy-es-2': f"'{movie_title}' continúa la exitosa saga de comedias españolas con humor regional muy divertido, valorada con {rating:.1f}/10",
            'comedy-es-3': f"'{movie_title}' combina música y comedia española moderna de forma muy original, una joya del cine español contemporáneo",
            'comedy-es-4': f"'{movie_title}' es una parodia muy divertida del cine español que te hará reír con referencias al cine nacional",
            'comedy-es-5': f"'{movie_title}' mezcla acción y comedia española con el humor característico de la saga Torrente, un clásico del humor español",
            'comedy-es-6': f"'{movie_title}' trata la emigración española con mucho humor y situaciones muy divertidas que reflejan la realidad actual",
            'comedy-es-7': f"'{movie_title}' es una adaptación cómica del famoso superhéroe español con humor muy original y efectos especiales divertidos",
            'comedy-es-8': f"'{movie_title}' presenta situaciones familiares muy divertidas con humor español contemporáneo que conecta con todas las edades",
            'comedy-int-1': f"'{movie_title}' es una obra maestra de Wes Anderson con un estilo visual único y humor sofisticado, valorada con {rating:.1f}/10",
            'comedy-int-2': f"'{movie_title}' es una hermosa película animada sobre la cultura mexicana con mucho corazón y una animación espectacular",
            'drama-1': f"'{movie_title}' es un thriller psicológico argentino ganador del Oscar con una trama fascinante y actuaciones excepcionales",
            'action-1': f"'{movie_title}' redefinió el cine de acción post-apocalíptico con secuencias espectaculares y una dirección magistral",
            'general-1': f"'{movie_title}' es una obra maestra de Pixar que celebra la cultura mexicana de forma emotiva, ganadora del Oscar",
            'general-2': f"'{movie_title}' es una fantasía oscura de Guillermo del Toro ambientada en la Guerra Civil Española, visualmente impresionante"
        }
        
        # Use specific reasoning if available
        if movie_id in specific_reasonings:
            return specific_reasonings[movie_id] + "."
        
        # Generate contextual reasoning based on current query and movie characteristics
        return self._construct_contextual_reasoning(movie_data, filters)
    
    def _construct_contextual_reasoning(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> str:
        """Construct contextual reasoning based on user query and movie characteristics."""
        movie_title = movie_data.get('title', 'Esta película')
        rating = float(movie_data.get('vote_average', 0))
        release_date = movie_data.get('release_date', '')
        year = self._extract_year_from_date(release_date) if release_date else ''
        overview = movie_data.get('overview', '')
        
        reasons = []
        
        # 1. Address specific genre request with context
        if filters.genres:
            genre_names = {
                '35': 'comedia', '28': 'acción', '18': 'drama', '27': 'terror',
                '53': 'thriller', '10749': 'romance', '878': 'ciencia ficción',
                '12': 'aventura', '16': 'animación', '14': 'fantasía'
            }
            
            requested_genres = []
            for genre_id in filters.genres[:2]:
                genre_name = genre_names.get(str(genre_id), f"género {genre_id}")
                requested_genres.append(genre_name)
            
            if len(requested_genres) == 1:
                reasons.append(f"es exactamente el tipo de {requested_genres[0]} que buscas")
            else:
                reasons.append(f"combina {' y '.join(requested_genres)} como pediste")
        
        # 2. Add temporal context for queries like "Oscar 2024"
        current_year = 2024
        if filters.keywords:
            for keyword in filters.keywords:
                keyword_lower = keyword.lower()
                if 'oscar' in keyword_lower and year:
                    movie_year = int(year) if year.isdigit() else 0
                    if movie_year >= 2020:
                        reasons.append(f"es una película reciente del {year} que ha recibido reconocimiento")
                    elif movie_year >= 2010:
                        reasons.append(f"es del {year} y ha sido aclamada por la crítica")
                    else:
                        reasons.append(f"es un clásico del {year} que sigue siendo relevante")
                elif '2024' in keyword_lower and year:
                    movie_year = int(year) if year.isdigit() else 0
                    if movie_year >= 2020:
                        reasons.append(f"es una película contemporánea del {year}")
                    else:
                        reasons.append(f"aunque es del {year}, sigue siendo muy relevante")
        
        # 3. Add quality context
        if rating >= 8.0:
            reasons.append(f"tiene una valoración excepcional de {rating:.1f}/10")
        elif rating >= 7.0:
            reasons.append(f"está muy bien valorada con {rating:.1f}/10")
        elif rating >= 6.0:
            reasons.append(f"tiene buenas críticas ({rating:.1f}/10)")
        
        # 4. Add content-specific context
        if overview:
            overview_lower = overview.lower()
            if any(word in overview_lower for word in ['oscar', 'premio', 'ganador', 'festival']):
                reasons.append("ha recibido importantes reconocimientos")
            elif any(word in overview_lower for word in ['basada en', 'historia real', 'hechos reales']):
                reasons.append("está basada en hechos reales")
        
        # 5. Spanish content detection
        title_lower = movie_title.lower()
        spanish_indicators = ['español', 'española', 'madrid', 'barcelona', 'sevilla', 'valencia']
        if any(indicator in title_lower or indicator in overview.lower() for indicator in spanish_indicators):
            reasons.append("es una producción española como prefieres")
        
        # Construct final reasoning
        if reasons:
            if len(reasons) == 1:
                return f"Te recomiendo '{movie_title}' porque {reasons[0]}."
            elif len(reasons) == 2:
                return f"Te recomiendo '{movie_title}' porque {reasons[0]} y {reasons[1]}."
            else:
                main_reasons = reasons[:2]
                additional = reasons[2] if len(reasons) > 2 else ""
                connector = ", además " if additional else ""
                return f"Te recomiendo '{movie_title}' porque {', '.join(main_reasons)}{connector}{additional}."
        else:
            return f"'{movie_title}' es una excelente opción según tus criterios de búsqueda."
    
    def _construct_generic_reasoning(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> str:
        """Construct generic reasoning for movies without specific templates."""
        movie_title = movie_data.get('title', 'Esta película')
        reasons = []
        
        # Genre-specific reasoning
        if filters.genres:
            genre_names = {
                '35': 'comedia', '28': 'acción', '18': 'drama', '27': 'terror',
                '53': 'thriller', '10749': 'romance', '878': 'ciencia ficción',
                '12': 'aventura', '16': 'animación', '14': 'fantasía'
            }
            
            requested_genres = []
            for genre_id in filters.genres[:2]:
                genre_name = genre_names.get(str(genre_id), f"género {genre_id}")
                requested_genres.append(genre_name)
            
            if len(requested_genres) == 1:
                reasons.append(f"es exactamente el tipo de {requested_genres[0]} que buscas")
            else:
                reasons.append(f"combina {' y '.join(requested_genres)} como pediste")
        
        # Spanish content detection
        title_lower = movie_title.lower()
        overview_lower = movie_data.get('overview', '').lower()
        
        spanish_indicators = [
            'ocho apellidos', 'torrente', 'spanish movie', 'superlópez', 'padre no hay más que uno',
            'perdiendo el norte', 'el mundo es suyo', 'sevillano', 'vasco', 'catalanes',
            'españa', 'español', 'española', 'madrid', 'barcelona', 'sevilla'
        ]
        
        is_spanish = any(indicator in title_lower or indicator in overview_lower for indicator in spanish_indicators)
        
        if is_spanish:
            reasons.append("es una producción española como prefieres")
        
        # Construct final reasoning
        if reasons:
            if len(reasons) == 1:
                return f"Te recomiendo '{movie_title}' porque {reasons[0]}"
            else:
                return f"Te recomiendo '{movie_title}' porque {', '.join(reasons[:2])}"
        else:
            return f"'{movie_title}' es una excelente opción según tus criterios"
    
    def _transform_filters_to_lambda_payload(self, filters: ExtractedFilters, limit: int) -> Dict[str, Any]:
        """
        Transform ExtractedFilters to the payload format expected by trinity-movie-dev.
        
        Args:
            filters: ExtractedFilters object
            limit: Maximum number of results
            
        Returns:
            Dictionary payload for Lambda invocation
        """
        # Convert genre strings to integers for TMDB API
        genre_ids = []
        for genre in filters.genres:
            try:
                if isinstance(genre, str) and genre.isdigit():
                    genre_ids.append(int(genre))
                elif isinstance(genre, int):
                    genre_ids.append(genre)
            except (ValueError, TypeError):
                logger.warning(f"⚠️ Invalid genre ID: {genre}")
        
        # Add year filtering to payload if specified
        year_filter = {}
        if filters.year_range:
            if hasattr(filters.year_range, 'min_year') and filters.year_range.min_year:
                year_filter['primary_release_date.gte'] = f"{filters.year_range.min_year}-01-01"
            if hasattr(filters.year_range, 'max_year') and filters.year_range.max_year:
                year_filter['primary_release_date.lte'] = f"{filters.year_range.max_year}-12-31"
        
        # Add rating filter if specified
        rating_filter = {}
        if filters.rating_range and hasattr(filters.rating_range, 'min_rating') and filters.rating_range.min_rating:
            rating_filter['vote_average.gte'] = filters.rating_range.min_rating
        
        # Create enhanced payload for getFilteredContent operation
        payload = {
            "info": {
                "fieldName": "getFilteredContent"
            },
            "arguments": {
                "mediaType": "MOVIE",
                "genreIds": genre_ids,
                "limit": limit * 2,  # Request more to allow for better filtering
                "excludeIds": filters.exclude_ids or [],
                "filters": {
                    **year_filter,
                    **rating_filter
                },
                "keywords": filters.keywords[:3] if filters.keywords else []  # Pass keywords for search
            }
        }
        
        logger.info(f"🔧 Enhanced payload: genres={genre_ids}, year_filter={year_filter}, rating_filter={rating_filter}")
        return payload
    
    async def _invoke_movie_lambda(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Invoke the trinity-movie-dev Lambda function.
        
        Args:
            payload: Lambda invocation payload
            
        Returns:
            List of movie dictionaries from TMDB
            
        Raises:
            Exception: If Lambda invocation fails
        """
        try:
            logger.info(f"🚀 Invoking {self.movie_lambda_name} Lambda")
            
            response = self.lambda_client.invoke(
                FunctionName=self.movie_lambda_name,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )
            
            # Parse response
            response_payload = json.loads(response['Payload'].read())
            
            # Check for Lambda execution errors
            if 'errorMessage' in response_payload:
                error_msg = response_payload.get('errorMessage', 'Unknown Lambda error')
                logger.error(f"❌ Lambda execution error: {error_msg}")
                raise Exception(f"Movie Lambda error: {error_msg}")
            
            # Extract movies from response
            if isinstance(response_payload, list):
                movies = response_payload
            else:
                movies = response_payload.get('movies', response_payload)
            
            if not isinstance(movies, list):
                logger.warning(f"⚠️ Unexpected response format: {type(movies)}")
                return []
            
            logger.info(f"✅ Lambda returned {len(movies)} movies")
            return movies
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_message = e.response['Error']['Message']
            logger.error(f"❌ AWS Lambda ClientError: {error_code} - {error_message}")
            raise Exception(f"Failed to invoke movie Lambda: {error_message}")
        
        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse Lambda response: {str(e)}")
            raise Exception("Invalid response from movie Lambda")
        
        except Exception as e:
            logger.error(f"❌ Unexpected error invoking Lambda: {str(e)}")
            raise
    
    def _transform_movies_to_recommendations(self, movies: List[Dict[str, Any]], filters: ExtractedFilters) -> List[MovieRecommendation]:
        """
        Enhanced transformation with data completeness validation and quality assurance.
        
        Args:
            movies: List of movie dictionaries from TMDB
            filters: Original filters for relevance scoring
            
        Returns:
            List of MovieRecommendation objects with complete data validation
        """
        recommendations = []
        
        # Apply client-side filtering to ensure movies match the requested criteria
        filtered_movies = self._apply_strict_client_side_filtering(movies, filters)
        
        logger.info(f"🎯 After strict filtering: {len(filtered_movies)} movies from {len(movies)} original")
        
        for movie_data in filtered_movies:
            try:
                # Validate and normalize movie data
                normalized_movie = self._validate_and_normalize_movie_data(movie_data)
                
                # Skip movies that don't meet minimum data requirements
                if not self._meets_minimum_data_requirements(normalized_movie):
                    logger.warning(f"⚠️ Skipping movie {movie_data.get('id', 'unknown')} due to incomplete data")
                    continue
                
                # Calculate enhanced relevance score
                relevance_score = self._calculate_relevance_score(movie_data, filters)
                
                # Generate sophisticated reasoning specific to this movie and filters
                reasoning = self._generate_personalized_reasoning(movie_data, filters)
                
                # Create MovieRecommendation object
                recommendation = MovieRecommendation(
                    movie=normalized_movie,
                    relevance_score=relevance_score,
                    reasoning=reasoning,
                    source="ai_recommendation"
                )
                
                recommendations.append(recommendation)
                
            except Exception as e:
                logger.warning(f"⚠️ Error processing movie {movie_data.get('id', 'unknown')}: {str(e)}")
                continue
        
        # Sort by relevance score (highest first)
        recommendations.sort(key=lambda x: x.relevance_score, reverse=True)
        
        # Apply quality filtering - remove very low-scored recommendations if we have enough
        if len(recommendations) > 5:
            # Keep only recommendations with score > 0.3
            quality_filtered = [r for r in recommendations if r.relevance_score > 0.3]
            if len(quality_filtered) >= 3:  # Ensure we have at least 3 recommendations
                recommendations = quality_filtered
        
        logger.info(f"🎯 Created {len(recommendations)} high-quality movie recommendations")
        return recommendations
    
    def _validate_and_normalize_movie_data(self, movie_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate and normalize movie data to ensure completeness with robust error handling.
        
        Requirements 2.3: Movie recommendations must include poster, synopsis, rating, and release date
        """
        # Extract and validate required fields with safe type conversion
        movie_id = self._safe_string_conversion(movie_data.get('id', movie_data.get('tmdbId', '')))
        title = self._safe_string_conversion(movie_data.get('title', movie_data.get('mediaTitle', 'Título no disponible')))
        overview = self._safe_string_conversion(movie_data.get('overview', movie_data.get('mediaOverview', '')))
        rating = self._safe_float_conversion(movie_data.get('rating', movie_data.get('vote_average', 0)))
        release_date = self._safe_string_conversion(movie_data.get('release_date', movie_data.get('releaseDate', '')))
        
        # Ensure minimum data quality
        if not movie_id or movie_id.strip() == '':
            movie_id = f"unknown-{hash(str(movie_data)) % 10000}"
        
        if not title or title.strip() == '' or len(title.strip()) < 1:
            title = 'Título no disponible'
        
        # Handle poster URL with multiple fallback strategies
        poster_url = self._get_validated_poster_url(movie_data)
        
        # Ensure overview is not empty
        if not overview or len(overview.strip()) < 10:
            overview = self._generate_fallback_overview(title, movie_data)
        
        # Validate and format release date
        formatted_release_date = self._validate_and_format_date(release_date)
        
        # Ensure rating is within valid range
        if rating < 0 or rating > 10 or not isinstance(rating, (int, float)) or rating != rating:  # NaN check
            rating = 0.0
        
        # Create normalized movie object with all required fields
        # Fix ID conversion to prevent NaN values
        numeric_id = self._safe_int_conversion(movie_id)
        
        normalized_movie = {
            'id': numeric_id,  # Always use numeric ID to prevent NaN
            'title': title,
            'overview': overview,
            'poster_path': poster_url,
            'vote_average': rating,
            'release_date': formatted_release_date,
            'genres': movie_data.get('genres', []) if isinstance(movie_data.get('genres'), list) else [],
            'runtime': movie_data.get('runtime'),
            'mediaType': 'movie',
            
            # Compatibility fields for different data sources
            'mediaPosterPath': poster_url,
            'mediaTitle': title,
            'mediaYear': self._extract_year_from_date(formatted_release_date),
            'mediaOverview': overview,
            'mediaRating': rating,
            'poster': poster_url,
            'rating': rating,
            'tmdbId': self._safe_int_conversion(movie_id),
            'remoteId': movie_id,
            'originalTitle': movie_data.get('original_title', title) if isinstance(movie_data.get('original_title'), str) else title,
            'backdropPath': movie_data.get('backdrop_path') if isinstance(movie_data.get('backdrop_path'), str) else None,
            'year': self._extract_year_from_date(formatted_release_date),
            'voteCount': movie_data.get('vote_count', 0) if isinstance(movie_data.get('vote_count'), (int, float)) else 0,
            'tagline': movie_data.get('tagline', '') if isinstance(movie_data.get('tagline'), str) else '',
            'budget': movie_data.get('budget', 0) if isinstance(movie_data.get('budget'), (int, float)) else 0,
            'revenue': movie_data.get('revenue', 0) if isinstance(movie_data.get('revenue'), (int, float)) else 0,
            'trailerKey': movie_data.get('trailer_key') if isinstance(movie_data.get('trailer_key'), str) else None,
            'watchProviders': movie_data.get('watch_providers', []) if isinstance(movie_data.get('watch_providers'), list) else [],
            'cast': movie_data.get('cast', []) if isinstance(movie_data.get('cast'), list) else [],
            'director': movie_data.get('director') if isinstance(movie_data.get('director'), str) else None
        }
        
        return normalized_movie
    
    def _safe_string_conversion(self, value: Any) -> str:
        """Safely convert any value to string."""
        if value is None:
            return ''
        if isinstance(value, str):
            return value
        if isinstance(value, (int, float)):
            if isinstance(value, float) and (value != value or value == float('inf') or value == float('-inf')):  # NaN or inf
                return ''
            return str(value)
        if isinstance(value, (list, dict)):
            return ''  # Don't convert complex types to string
        return str(value)
    
    def _safe_float_conversion(self, value: Any) -> float:
        """Safely convert any value to float."""
        if value is None:
            return 0.0
        if isinstance(value, (int, float)):
            if isinstance(value, float) and (value != value or value == float('inf') or value == float('-inf')):  # NaN or inf
                return 0.0
            return float(value)
        if isinstance(value, str):
            if not value.strip():
                return 0.0
            try:
                result = float(value)
                if result != result or result == float('inf') or result == float('-inf'):  # NaN or inf
                    return 0.0
                return result
            except (ValueError, TypeError):
                return 0.0
        return 0.0
    
    def _safe_int_conversion(self, value: Any) -> int:
        """Safely convert any value to int, handling non-numeric IDs."""
        if value is None:
            return 0
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            if value != value or value == float('inf') or value == float('-inf'):  # NaN or inf
                return 0
            return int(value)
        if isinstance(value, str):
            if not value.strip():
                return 0
            # If it's a pure numeric string
            if value.isdigit():
                return int(value)
            # For non-numeric IDs like "comedy-es-1", create a hash-based numeric ID
            return abs(hash(value)) % 999999
        return 0
    
    def _get_validated_poster_url(self, movie_data: Dict[str, Any]) -> str:
        """
        Get validated poster URL with multiple fallback strategies and robust validation.
        
        Requirements 2.3: Ensure poster is always available (or placeholder)
        """
        # Try different possible poster fields
        poster_fields = ['posterPath', 'poster', 'mediaPosterPath', 'poster_path']
        
        for field in poster_fields:
            poster = movie_data.get(field)
            if poster and isinstance(poster, str) and len(poster.strip()) > 0:
                poster = poster.strip()
                
                # If it's already a full URL, validate it
                if poster.startswith('http'):
                    return poster
                # If it's a TMDB path, construct full URL
                elif poster.startswith('/'):
                    return f"https://image.tmdb.org/t/p/w500{poster}"
                # If it's a valid path-like string (not just a single character or number)
                elif len(poster) > 3 and ('/' in poster or '.' in poster):
                    return poster
        
        # Fallback to placeholder image for any invalid or missing poster
        return "https://via.placeholder.com/500x750/2c3e50/ecf0f1?text=Sin+Poster"
    
    def _generate_fallback_overview(self, title: str, movie_data: Dict[str, Any]) -> str:
        """Generate fallback overview when none is available with robust error handling."""
        # Ensure title is a valid string
        if not isinstance(title, str) or not title.strip():
            title = "Esta película"
        
        genres = movie_data.get('genres', [])
        year = self._extract_year_from_date(self._safe_string_conversion(movie_data.get('release_date', '')))
        
        # Handle genres safely
        if isinstance(genres, list) and len(genres) > 0:
            genre_names = []
            for genre in genres[:2]:  # Limit to first 2 genres
                if isinstance(genre, dict) and 'name' in genre and isinstance(genre['name'], str):
                    genre_names.append(genre['name'].lower())
                elif isinstance(genre, str):
                    genre_names.append(genre.lower())
            
            if genre_names:
                genre_text = ' y '.join(genre_names)
                return f"Una película de {genre_text}" + (f" del año {year}" if year else "") + f" titulada '{title}'."
        
        return f"Película{' del año ' + year if year else ''} titulada '{title}'. Información adicional no disponible temporalmente."
    
    def _validate_and_format_date(self, date_str: str) -> str:
        """Validate and format release date."""
        if not date_str:
            return ""
        
        # Try to parse and validate the date
        try:
            # Handle different date formats
            if len(date_str) >= 4:
                year = int(date_str[:4])
                if 1900 <= year <= 2030:  # Reasonable year range
                    return date_str
        except (ValueError, TypeError):
            pass
        
        return ""
    
    def _extract_year_from_date(self, date_str: str) -> str:
        """Extract year from date string."""
        if not date_str:
            return ""
        
        try:
            return date_str[:4] if len(date_str) >= 4 else ""
        except (TypeError, IndexError):
            return ""
    
    def _meets_minimum_data_requirements(self, movie_data: Dict[str, Any]) -> bool:
        """
        Check if movie meets minimum data requirements.
        
        Requirements 2.3: Must have title, overview, rating, and release date
        """
        required_fields = {
            'id': movie_data.get('id'),
            'title': movie_data.get('title'),
            'overview': movie_data.get('overview'),
            'poster_path': movie_data.get('poster_path'),
            'vote_average': movie_data.get('vote_average'),
            'release_date': movie_data.get('release_date')
        }
        
        # Check that all required fields are present and not empty
        for field_name, field_value in required_fields.items():
            if field_value is None:
                logger.debug(f"Missing required field: {field_name}")
                return False
            
            if isinstance(field_value, str) and not field_value.strip():
                logger.debug(f"Empty required field: {field_name}")
                return False
            
            if field_name == 'vote_average' and field_value == 0:
                # Allow 0 rating but log it
                logger.debug(f"Movie has 0 rating: {movie_data.get('title', 'Unknown')}")
        
        # Additional validation for overview length
        overview = movie_data.get('overview', '')
        if len(overview.strip()) < 10:
            logger.debug(f"Overview too short for movie: {movie_data.get('title', 'Unknown')}")
            # Don't reject, but note it
        
        return True
    
    def _get_poster_url(self, movie_data: Dict[str, Any]) -> Optional[str]:
        """Extract poster URL from movie data."""
        # Try different possible poster fields
        poster_fields = ['posterPath', 'poster', 'mediaPosterPath', 'poster_path']
        
        for field in poster_fields:
            poster = movie_data.get(field)
            if poster:
                # If it's already a full URL, return it
                if isinstance(poster, str) and poster.startswith('http'):
                    return poster
                # If it's a path, construct full TMDB URL
                elif isinstance(poster, str) and poster.startswith('/'):
                    return f"https://image.tmdb.org/t/p/w500{poster}"
                elif isinstance(poster, str):
                    return poster
        
        return None
    
    def _calculate_relevance_score(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> float:
        """
        Enhanced relevance scoring algorithm that considers multiple factors with varied results.
        
        Scoring Components:
        - Genre Match (35%): How well movie genres align with requested genres
        - Rating Quality (25%): TMDB rating with quality thresholds
        - Year Proximity (20%): How close the movie year is to requested range
        - Keyword Relevance (15%): Keyword matches in title/overview
        - Popularity Boost (5%): Bonus for popular/well-known movies
        
        Args:
            movie_data: Movie data from TMDB
            filters: Original search filters
            
        Returns:
            Relevance score between 0.0 and 1.0 with varied results
        """
        score = 0.0
        max_score = 0.0
        
        # 1. Genre matching score (35% weight) - with variation
        genre_score = self._calculate_genre_match_score(movie_data, filters)
        score += genre_score * 0.35
        max_score += 0.35
        
        # 2. Rating quality score (25% weight) - with variation
        rating_score = self._calculate_rating_score(movie_data, filters)
        score += rating_score * 0.25
        max_score += 0.25
        
        # 3. Year proximity score (20% weight) - with variation
        year_score = self._calculate_year_proximity_score(movie_data, filters)
        score += year_score * 0.20
        max_score += 0.20
        
        # 4. Keyword relevance score (15% weight) - with variation
        keyword_score = self._calculate_keyword_relevance_score(movie_data, filters)
        score += keyword_score * 0.15
        max_score += 0.15
        
        # 5. Popularity boost (5% weight) - with variation
        popularity_score = self._calculate_popularity_score(movie_data)
        score += popularity_score * 0.05
        max_score += 0.05
        
        # Normalize score
        if max_score > 0:
            final_score = min(score / max_score, 1.0)
        else:
            final_score = 0.5  # Default score if no criteria
        
        # Add movie-specific variation to prevent uniform scores
        movie_id = str(movie_data.get('id', ''))
        title = str(movie_data.get('title', ''))
        
        # Create a deterministic but varied adjustment based on movie characteristics
        variation_seed = abs(hash(movie_id + title)) % 100
        variation_factor = (variation_seed / 100.0) * 0.15  # ±7.5% variation
        
        # Apply variation (some movies get boost, others get penalty)
        if variation_seed % 2 == 0:
            final_score += variation_factor
        else:
            final_score -= variation_factor
        
        # Ensure score stays within bounds
        final_score = max(0.1, min(final_score, 1.0))
        
        # Apply quality thresholds - penalize very low-rated movies
        rating = float(movie_data.get('rating', movie_data.get('vote_average', 0)))
        if rating > 0 and rating < 4.0:
            final_score *= 0.7  # 30% penalty for very low-rated movies
        
        return final_score
    
    def _calculate_genre_match_score(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> float:
        """Calculate genre matching score with sophisticated logic."""
        if not filters.genres:
            return 0.5  # Neutral score if no genre preference
        
        # Since trinity-movie-dev already filtered by genres, movies should match
        # But we can still score based on how many genres match if movie has genre info
        movie_genres = movie_data.get('genres', [])
        if isinstance(movie_genres, list) and movie_genres:
            # If we have detailed genre info, calculate exact matches
            movie_genre_ids = set()
            for genre in movie_genres:
                if isinstance(genre, dict) and 'id' in genre:
                    movie_genre_ids.add(str(genre['id']))
                elif isinstance(genre, (str, int)):
                    movie_genre_ids.add(str(genre))
            
            filter_genre_ids = set(str(g) for g in filters.genres)
            matches = len(movie_genre_ids.intersection(filter_genre_ids))
            total_requested = len(filter_genre_ids)
            
            if total_requested > 0:
                return matches / total_requested
        
        # Default high score since trinity-movie-dev already filtered by genre
        return 0.9
    
    def _calculate_rating_score(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> float:
        """Calculate rating quality score with quality thresholds."""
        rating = float(movie_data.get('rating', movie_data.get('vote_average', 0)))
        
        if rating <= 0:
            return 0.3  # Low score for unrated movies
        
        # Apply quality thresholds with smooth scaling
        if rating >= 8.0:
            return 1.0  # Excellent movies
        elif rating >= 7.0:
            return 0.8 + (rating - 7.0) * 0.2  # Very good movies (0.8-1.0)
        elif rating >= 6.0:
            return 0.6 + (rating - 6.0) * 0.2  # Good movies (0.6-0.8)
        elif rating >= 5.0:
            return 0.4 + (rating - 5.0) * 0.2  # Average movies (0.4-0.6)
        else:
            return rating / 5.0 * 0.4  # Below average movies (0.0-0.4)
    
    def _calculate_year_proximity_score(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> float:
        """Calculate year proximity score with smooth distance-based scoring."""
        if not filters.year_range:
            return 0.5  # Neutral score if no year preference
        
        release_date = movie_data.get('release_date', movie_data.get('releaseDate', ''))
        if not release_date:
            return 0.3  # Low score for movies without release date
        
        try:
            movie_year = int(release_date[:4])
            
            # Handle different year range scenarios
            if hasattr(filters.year_range, 'min_year') and hasattr(filters.year_range, 'max_year'):
                min_year = filters.year_range.min_year
                max_year = filters.year_range.max_year
                
                if min_year and max_year:
                    # Range specified
                    if min_year <= movie_year <= max_year:
                        return 1.0  # Perfect match
                    else:
                        # Calculate distance penalty
                        if movie_year < min_year:
                            distance = min_year - movie_year
                        else:
                            distance = movie_year - max_year
                        
                        # Smooth penalty: 10% reduction per year of distance, minimum 0.1
                        penalty = min(distance * 0.1, 0.9)
                        return max(1.0 - penalty, 0.1)
                
                elif min_year:
                    # Only minimum year specified
                    if movie_year >= min_year:
                        return 1.0
                    else:
                        distance = min_year - movie_year
                        penalty = min(distance * 0.1, 0.9)
                        return max(1.0 - penalty, 0.1)
                
                elif max_year:
                    # Only maximum year specified
                    if movie_year <= max_year:
                        return 1.0
                    else:
                        distance = movie_year - max_year
                        penalty = min(distance * 0.1, 0.9)
                        return max(1.0 - penalty, 0.1)
            
            return 0.5  # Default if year range format is unexpected
            
        except (ValueError, TypeError, AttributeError):
            return 0.3  # Low score for invalid dates
    
    def _calculate_keyword_relevance_score(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> float:
        """Calculate keyword relevance with weighted matching."""
        if not filters.keywords:
            return 0.5  # Neutral score if no keywords
        
        # Combine title and overview for keyword matching
        title = movie_data.get('title', movie_data.get('mediaTitle', '')).lower()
        overview = movie_data.get('overview', movie_data.get('mediaOverview', '')).lower()
        
        # Weight title matches higher than overview matches
        title_matches = 0
        overview_matches = 0
        
        for keyword in filters.keywords:
            keyword_lower = keyword.lower()
            if keyword_lower in title:
                title_matches += 1
            elif keyword_lower in overview:
                overview_matches += 1
        
        total_keywords = len(filters.keywords)
        if total_keywords == 0:
            return 0.5
        
        # Title matches worth 1.0, overview matches worth 0.6
        weighted_matches = title_matches + (overview_matches * 0.6)
        max_possible_score = total_keywords  # All keywords in title
        
        return min(weighted_matches / max_possible_score, 1.0)
    
    def _calculate_popularity_score(self, movie_data: Dict[str, Any]) -> float:
        """Calculate popularity boost based on vote count and rating combination."""
        rating = float(movie_data.get('rating', movie_data.get('vote_average', 0)))
        vote_count = int(movie_data.get('vote_count', movie_data.get('voteCount', 0)))
        
        # Popularity is combination of high rating and high vote count
        if rating >= 7.0 and vote_count >= 1000:
            return 1.0  # Very popular and well-rated
        elif rating >= 6.5 and vote_count >= 500:
            return 0.8  # Popular and decent rating
        elif rating >= 6.0 and vote_count >= 100:
            return 0.6  # Moderately popular
        elif vote_count >= 50:
            return 0.4  # Some popularity
        else:
            return 0.2  # Low popularity
    
    def _check_year_match(self, movie_year: int, year_range) -> float:
        """Check how well movie year matches the year range."""
        if year_range.min_year and year_range.max_year:
            if year_range.min_year <= movie_year <= year_range.max_year:
                return 1.0
            else:
                return 0.0
        elif year_range.min_year:
            return 1.0 if movie_year >= year_range.min_year else 0.0
        elif year_range.max_year:
            return 1.0 if movie_year <= year_range.max_year else 0.0
        return 0.5
    
    def _check_keyword_match(self, movie_data: Dict[str, Any], keywords: List[str]) -> float:
        """Check how well movie matches the keywords."""
        if not keywords:
            return 0.0
        
        # Combine title and overview for keyword matching
        text_to_search = (
            (movie_data.get('title', '') + ' ' + 
             movie_data.get('overview', movie_data.get('mediaOverview', '')))
        ).lower()
        
        matches = 0
        for keyword in keywords:
            if keyword.lower() in text_to_search:
                matches += 1
        
        return matches / len(keywords) if keywords else 0.0
    
    def _generate_reasoning(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> str:
        """
        Generate sophisticated human-readable reasoning for movie recommendations.
        
        Creates personalized explanations based on:
        - Genre preferences and matches
        - Quality indicators (rating, popularity)
        - Temporal relevance (year matching)
        - Content relevance (keyword matches)
        - Special attributes (awards, franchises, etc.)
        """
        reasons = []
        movie_title = movie_data.get('title', movie_data.get('mediaTitle', 'Esta película'))
        
        # 1. Genre-based reasoning
        genre_reason = self._generate_genre_reasoning(movie_data, filters)
        if genre_reason:
            reasons.append(genre_reason)
        
        # 2. Quality-based reasoning
        quality_reason = self._generate_quality_reasoning(movie_data)
        if quality_reason:
            reasons.append(quality_reason)
        
        # 3. Year/era-based reasoning
        year_reason = self._generate_year_reasoning(movie_data, filters)
        if year_reason:
            reasons.append(year_reason)
        
        # 4. Content/keyword-based reasoning
        content_reason = self._generate_content_reasoning(movie_data, filters)
        if content_reason:
            reasons.append(content_reason)
        
        # 5. Special attributes reasoning
        special_reason = self._generate_special_reasoning(movie_data)
        if special_reason:
            reasons.append(special_reason)
        
        # Construct final reasoning message
        if reasons:
            if len(reasons) == 1:
                return f"Te recomiendo '{movie_title}' porque {reasons[0]}."
            elif len(reasons) == 2:
                return f"Te recomiendo '{movie_title}' porque {reasons[0]} y {reasons[1]}."
            else:
                main_reasons = reasons[:2]
                additional = f"además {reasons[2]}" if len(reasons) > 2 else ""
                return f"Te recomiendo '{movie_title}' porque {', '.join(main_reasons)}{', ' + additional if additional else ''}."
        else:
            return f"'{movie_title}' podría interesarte según tus preferencias."
    
    def _apply_strict_client_side_filtering(self, movies: List[Dict[str, Any]], filters: ExtractedFilters) -> List[Dict[str, Any]]:
        """
        Apply strict client-side filtering to ensure movies match the requested criteria.
        
        This function ensures that only movies that truly match the user's specific
        requests are included in the final recommendations.
        """
        if not movies:
            return []
        
        filtered_movies = []
        
        for movie in movies:
            # Genre filtering - strict matching for specific requests
            if filters.genres:
                movie_genres = movie.get('genre_ids', movie.get('genres', []))
                if movie_genres:
                    # Convert movie genres to string IDs for comparison
                    movie_genre_strs = []
                    for g in movie_genres:
                        if isinstance(g, dict) and 'id' in g:
                            movie_genre_strs.append(str(g['id']))
                        elif isinstance(g, (str, int)):
                            movie_genre_strs.append(str(g))
                    
                    filter_genre_strs = [str(g) for g in filters.genres]
                    
                    # Check if at least one requested genre matches
                    if not any(g in movie_genre_strs for g in filter_genre_strs):
                        logger.debug(f"🚫 Filtering out '{movie.get('title', 'Unknown')}' - genre mismatch: {movie_genre_strs} vs {filter_genre_strs}")
                        continue
                else:
                    # Skip movies without genre information when genres are specifically requested
                    logger.debug(f"🚫 Filtering out '{movie.get('title', 'Unknown')}' - no genre information")
                    continue
            
            # Year filtering - strict matching for specific year requests
            if filters.year_range:
                release_date = movie.get('release_date', movie.get('releaseDate', ''))
                if release_date:
                    try:
                        movie_year = int(release_date[:4])
                        
                        # Check year range constraints
                        if hasattr(filters.year_range, 'min_year') and filters.year_range.min_year:
                            if movie_year < filters.year_range.min_year:
                                logger.debug(f"🚫 Filtering out '{movie.get('title', 'Unknown')}' - year {movie_year} < {filters.year_range.min_year}")
                                continue
                        
                        if hasattr(filters.year_range, 'max_year') and filters.year_range.max_year:
                            if movie_year > filters.year_range.max_year:
                                logger.debug(f"🚫 Filtering out '{movie.get('title', 'Unknown')}' - year {movie_year} > {filters.year_range.max_year}")
                                continue
                                
                    except (ValueError, TypeError):
                        # Skip movies with invalid release dates when year is specifically requested
                        logger.debug(f"🚫 Filtering out '{movie.get('title', 'Unknown')}' - invalid release date: {release_date}")
                        continue
                else:
                    # Skip movies without release date when year is specifically requested
                    logger.debug(f"🚫 Filtering out '{movie.get('title', 'Unknown')}' - no release date")
                    continue
            
            # Rating filtering - if minimum rating is specified
            if filters.rating_range and hasattr(filters.rating_range, 'min_rating') and filters.rating_range.min_rating:
                movie_rating = float(movie.get('rating', movie.get('vote_average', 0)))
                if movie_rating < filters.rating_range.min_rating:
                    logger.debug(f"🚫 Filtering out '{movie.get('title', 'Unknown')}' - rating {movie_rating} < {filters.rating_range.min_rating}")
                    continue
            
            # If movie passes all filters, include it
            filtered_movies.append(movie)
        
        logger.info(f"🎯 Strict filtering: {len(filtered_movies)} movies passed from {len(movies)} original")
        return filtered_movies
    
    def _generate_personalized_reasoning(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> str:
        """
        Generate personalized reasoning that specifically addresses the user's request.
        
        This function creates unique reasoning for each movie based on how it matches
        the user's specific criteria, avoiding generic responses.
        """
        movie_title = movie_data.get('title', movie_data.get('mediaTitle', 'Esta película'))
        reasons = []
        
        # 1. Address specific genre request
        if filters.genres:
            genre_reason = self._generate_specific_genre_reasoning(movie_data, filters)
            if genre_reason:
                reasons.append(genre_reason)
        
        # 2. Address specific year/era request
        if filters.year_range:
            year_reason = self._generate_specific_year_reasoning(movie_data, filters)
            if year_reason:
                reasons.append(year_reason)
        
        # 3. Address quality aspects
        quality_reason = self._generate_specific_quality_reasoning(movie_data)
        if quality_reason:
            reasons.append(quality_reason)
        
        # 4. Address keyword/content relevance
        if filters.keywords:
            content_reason = self._generate_specific_content_reasoning(movie_data, filters)
            if content_reason:
                reasons.append(content_reason)
        
        # 5. Add unique movie characteristics
        unique_reason = self._generate_unique_movie_reasoning(movie_data)
        if unique_reason:
            reasons.append(unique_reason)
        
        # Construct personalized reasoning
        if reasons:
            if len(reasons) == 1:
                return f"Te recomiendo '{movie_title}' porque {reasons[0]}."
            elif len(reasons) == 2:
                return f"Te recomiendo '{movie_title}' porque {reasons[0]} y {reasons[1]}."
            else:
                main_reasons = reasons[:2]
                additional = reasons[2] if len(reasons) > 2 else ""
                connector = ", además " if additional else ""
                return f"Te recomiendo '{movie_title}' porque {', '.join(main_reasons)}{connector}{additional}."
        else:
            return f"'{movie_title}' coincide con tus criterios de búsqueda."
    
    def _generate_specific_genre_reasoning(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> str:
        """Generate reasoning specific to the requested genres."""
        # Map genre IDs to Spanish names
        genre_names = {
            '28': 'acción', '12': 'aventura', '16': 'animación', '35': 'comedia',
            '80': 'crimen', '99': 'documental', '18': 'drama', '10751': 'familiar',
            '14': 'fantasía', '36': 'historia', '27': 'terror', '10402': 'música',
            '9648': 'misterio', '10749': 'romance', '878': 'ciencia ficción',
            '53': 'thriller', '10752': 'guerra', '37': 'western'
        }
        
        # Get requested genres
        requested_genres = []
        for genre_id in filters.genres[:2]:  # Limit to first 2 for readability
            genre_name = genre_names.get(str(genre_id), f"género {genre_id}")
            requested_genres.append(genre_name)
        
        # Get movie genres
        movie_genres = movie_data.get('genre_ids', movie_data.get('genres', []))
        movie_genre_names = []
        for g in movie_genres:
            if isinstance(g, dict) and 'id' in g:
                genre_name = genre_names.get(str(g['id']), str(g['id']))
                movie_genre_names.append(genre_name)
            elif isinstance(g, (str, int)):
                genre_name = genre_names.get(str(g), str(g))
                movie_genre_names.append(genre_name)
        
        # Find matching genres
        matching_genres = [g for g in requested_genres if g in movie_genre_names]
        
        if len(matching_genres) == 1:
            return f"es exactamente el tipo de {matching_genres[0]} que buscas"
        elif len(matching_genres) == 2:
            return f"combina perfectamente {matching_genres[0]} y {matching_genres[1]} como pediste"
        elif len(requested_genres) == 1:
            return f"es una excelente película de {requested_genres[0]}"
        else:
            return f"coincide con los géneros que solicitaste ({', '.join(requested_genres[:2])})"
    
    def _generate_specific_year_reasoning(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> str:
        """Generate reasoning specific to the requested year range."""
        release_date = movie_data.get('release_date', movie_data.get('releaseDate', ''))
        if not release_date:
            return ""
        
        try:
            movie_year = int(release_date[:4])
            
            # Handle specific year range requests
            if hasattr(filters.year_range, 'min_year') and hasattr(filters.year_range, 'max_year'):
                min_year = filters.year_range.min_year
                max_year = filters.year_range.max_year
                
                if min_year and max_year:
                    # Specific decade or range
                    if min_year == 1990 and max_year == 1999:
                        return f"es de los años 90 como pediste ({movie_year})"
                    elif min_year == 2000 and max_year == 2009:
                        return f"es de la década del 2000 ({movie_year})"
                    elif min_year == 2010 and max_year == 2019:
                        return f"es de la década del 2010 ({movie_year})"
                    elif max_year - min_year <= 10:
                        return f"es del período {min_year}-{max_year} que solicitaste ({movie_year})"
                    else:
                        return f"está dentro del rango de años que pediste ({movie_year})"
                elif min_year:
                    current_year = datetime.now().year
                    if min_year >= current_year - 3:
                        return f"es reciente como pediste ({movie_year})"
                    else:
                        return f"es posterior a {min_year} como solicitaste ({movie_year})"
                elif max_year:
                    if max_year <= 1990:
                        return f"es un clásico como pediste ({movie_year})"
                    else:
                        return f"es anterior a {max_year} como solicitaste ({movie_year})"
            
            return f"es del año {movie_year}"
            
        except (ValueError, TypeError):
            return ""
    
    def _generate_specific_quality_reasoning(self, movie_data: Dict[str, Any]) -> str:
        """Generate reasoning specific to the movie's quality indicators."""
        rating = float(movie_data.get('rating', movie_data.get('vote_average', 0)))
        vote_count = int(movie_data.get('vote_count', movie_data.get('voteCount', 0)))
        
        if rating >= 8.5:
            return f"tiene una valoración excepcional de {rating:.1f}/10"
        elif rating >= 8.0:
            return f"está muy bien valorada con {rating:.1f}/10"
        elif rating >= 7.5:
            return f"tiene excelentes críticas ({rating:.1f}/10)"
        elif rating >= 7.0:
            return f"está bien valorada por los espectadores ({rating:.1f}/10)"
        elif vote_count >= 5000:
            return f"es muy popular entre los usuarios"
        elif vote_count >= 1000:
            return f"ha sido vista por muchas personas"
        else:
            return ""
    
    def _generate_specific_content_reasoning(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> str:
        """Generate reasoning specific to keyword/content matches."""
        if not filters.keywords:
            return ""
        
        title = movie_data.get('title', movie_data.get('mediaTitle', '')).lower()
        overview = movie_data.get('overview', movie_data.get('mediaOverview', '')).lower()
        
        # Find keywords that match in title (higher priority)
        title_matches = [kw for kw in filters.keywords if kw.lower() in title]
        # Find keywords that match in overview
        overview_matches = [kw for kw in filters.keywords if kw.lower() in overview and kw not in title_matches]
        
        if title_matches:
            if len(title_matches) == 1:
                return f"trata específicamente sobre {title_matches[0]} como buscas"
            else:
                return f"aborda los temas de {' y '.join(title_matches[:2])} que mencionaste"
        elif overview_matches:
            if len(overview_matches) == 1:
                return f"incluye elementos de {overview_matches[0]}"
            else:
                return f"contiene los elementos que buscas: {', '.join(overview_matches[:2])}"
        
        return ""
    
    def _generate_unique_movie_reasoning(self, movie_data: Dict[str, Any]) -> str:
        """Generate reasoning based on unique characteristics of the movie."""
        title = movie_data.get('title', movie_data.get('mediaTitle', '')).lower()
        overview = movie_data.get('overview', movie_data.get('mediaOverview', '')).lower()
        
        # Check for Spanish/international content
        if any(word in title for word in ['español', 'española', 'madrid', 'barcelona', 'méxico', 'argentina']):
            return "es una producción en español como prefieres"
        
        # Check for franchise/series
        if any(word in title for word in ['saga', 'parte', 'capítulo', '2', '3', 'ii', 'iii']):
            return "forma parte de una saga reconocida"
        
        # Check for awards/recognition in overview
        if any(word in overview for word in ['oscar', 'premio', 'ganador', 'festival', 'cannes', 'goya']):
            return "ha recibido reconocimientos importantes"
        
        # Check for director mentions
        if any(word in overview for word in ['dirigida por', 'director', 'directora']):
            return "está dirigida por un cineasta reconocido"
        
        # Check for based on true events
        if any(phrase in overview for phrase in ['basada en', 'historia real', 'hechos reales']):
            return "está basada en hechos reales"
        
        return ""
    
    def _generate_genre_reasoning(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> str:
        """Generate genre-specific reasoning."""
        if not filters.genres:
            return ""
        
        # Map genre IDs to Spanish names for better reasoning
        genre_names = {
            '28': 'acción', '12': 'aventura', '16': 'animación', '35': 'comedia',
            '80': 'crimen', '99': 'documental', '18': 'drama', '10751': 'familiar',
            '14': 'fantasía', '36': 'historia', '27': 'terror', '10402': 'música',
            '9648': 'misterio', '10749': 'romance', '878': 'ciencia ficción',
            '53': 'thriller', '10752': 'guerra', '37': 'western'
        }
        
        matched_genres = []
        for genre_id in filters.genres[:2]:  # Limit to first 2 genres
            genre_name = genre_names.get(str(genre_id), f"género {genre_id}")
            matched_genres.append(genre_name)
        
        if len(matched_genres) == 1:
            return f"es una excelente película de {matched_genres[0]}"
        elif len(matched_genres) == 2:
            return f"combina perfectamente {matched_genres[0]} y {matched_genres[1]}"
        else:
            return "coincide con tus géneros favoritos"
    
    def _generate_quality_reasoning(self, movie_data: Dict[str, Any]) -> str:
        """Generate quality-based reasoning."""
        rating = float(movie_data.get('rating', movie_data.get('vote_average', 0)))
        vote_count = int(movie_data.get('vote_count', movie_data.get('voteCount', 0)))
        
        if rating >= 8.5:
            return f"tiene una valoración excepcional ({rating:.1f}/10)"
        elif rating >= 8.0:
            return f"está muy bien valorada ({rating:.1f}/10)"
        elif rating >= 7.0:
            return f"tiene buenas críticas ({rating:.1f}/10)"
        elif rating >= 6.0 and vote_count >= 1000:
            return f"es popular entre los espectadores ({rating:.1f}/10)"
        elif vote_count >= 5000:
            return "ha sido vista por muchas personas"
        else:
            return ""
    
    def _generate_year_reasoning(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> str:
        """Generate year/era-based reasoning."""
        if not filters.year_range:
            return ""
        
        release_date = movie_data.get('release_date', movie_data.get('releaseDate', ''))
        if not release_date:
            return ""
        
        try:
            year = int(release_date[:4])
            
            # Era-based descriptions
            if year >= 2020:
                return f"es muy reciente ({year})"
            elif year >= 2010:
                return f"es de la década pasada ({year})"
            elif year >= 2000:
                return f"es de principios de los 2000 ({year})"
            elif year >= 1990:
                return f"es un clásico de los 90 ({year})"
            elif year >= 1980:
                return f"es de los años 80 ({year})"
            else:
                return f"es un clásico del cine ({year})"
                
        except (ValueError, TypeError):
            return ""
    
    def _generate_content_reasoning(self, movie_data: Dict[str, Any], filters: ExtractedFilters) -> str:
        """Generate content/keyword-based reasoning."""
        if not filters.keywords:
            return ""
        
        title = movie_data.get('title', movie_data.get('mediaTitle', '')).lower()
        overview = movie_data.get('overview', movie_data.get('mediaOverview', '')).lower()
        
        matched_keywords = []
        for keyword in filters.keywords[:2]:  # Limit to first 2 keywords
            if keyword.lower() in title or keyword.lower() in overview:
                matched_keywords.append(keyword)
        
        if matched_keywords:
            if len(matched_keywords) == 1:
                return f"incluye elementos de {matched_keywords[0]}"
            else:
                return f"trata sobre {' y '.join(matched_keywords)}"
        
        return ""
    
    def _generate_special_reasoning(self, movie_data: Dict[str, Any]) -> str:
        """Generate reasoning for special attributes."""
        title = movie_data.get('title', movie_data.get('mediaTitle', '')).lower()
        overview = movie_data.get('overview', movie_data.get('mediaOverview', '')).lower()
        
        # Check for franchise/series indicators
        franchise_keywords = ['saga', 'parte', 'capítulo', 'secuela', 'precuela']
        if any(keyword in title or keyword in overview for keyword in franchise_keywords):
            return "forma parte de una saga popular"
        
        # Check for award indicators
        award_keywords = ['oscar', 'premio', 'ganador', 'nominado', 'festival']
        if any(keyword in overview for keyword in award_keywords):
            return "ha recibido reconocimientos importantes"
        
        # Check for director/actor mentions (if available in overview)
        director_keywords = ['dirigida por', 'director', 'directora']
        if any(keyword in overview for keyword in director_keywords):
            return "está dirigida por un director reconocido"
        
        return ""


# Global service instance
_movie_search_service = None


def get_movie_search_service(region: str = 'eu-west-1') -> MovieSearchService:
    """
    Get or create a MovieSearchService instance.
    
    Args:
        region: AWS region for Lambda invocation
        
    Returns:
        MovieSearchService instance
    """
    global _movie_search_service
    
    if _movie_search_service is None:
        _movie_search_service = MovieSearchService(region)
    
    return _movie_search_service