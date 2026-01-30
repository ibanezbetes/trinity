"""
Test enhanced movie recommendation scoring and ranking functionality.

This module tests the enhanced scoring algorithms, fallback mechanisms,
and ranking consistency implemented for task 4.3.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from typing import List, Dict, Any

from utils.movie_search_service import MovieSearchService
from models.extracted_filters import ExtractedFilters, YearRange, RatingRange
from models.trini_response import MovieRecommendation


class TestEnhancedScoringAndRanking:
    """Test enhanced scoring and ranking functionality."""
    
    @pytest.fixture
    def movie_service(self):
        """Create a MovieSearchService instance for testing."""
        return MovieSearchService(region='eu-west-1')
    
    @pytest.fixture
    def sample_filters(self):
        """Create sample filters for testing."""
        return ExtractedFilters(
            genres=['28', '878'],  # Action, Sci-Fi
            year_range=YearRange(min_year=1990, max_year=2010),
            keywords=['matrix', 'future'],
            confidence=0.8
        )
    
    @pytest.fixture
    def sample_movies(self):
        """Create sample movie data for testing."""
        return [
            {
                'id': '603', 'title': 'Matrix', 
                'overview': 'A computer programmer discovers reality is a simulation.',
                'vote_average': 8.7, 'release_date': '1999-03-30',
                'poster_path': '/test.jpg',
                'genres': [{'id': 28, 'name': 'Action'}, {'id': 878, 'name': 'Science Fiction'}]
            },
            {
                'id': '155', 'title': 'The Dark Knight',
                'overview': 'Batman faces the Joker in Gotham City.',
                'vote_average': 9.0, 'release_date': '2008-07-16',
                'poster_path': '/test2.jpg',
                'genres': [{'id': 28, 'name': 'Action'}, {'id': 80, 'name': 'Crime'}]
            },
            {
                'id': '13', 'title': 'Forrest Gump',
                'overview': 'The extraordinary life of a simple man.',
                'vote_average': 8.8, 'release_date': '1994-06-23',
                'poster_path': '/test3.jpg',
                'genres': [{'id': 18, 'name': 'Drama'}]
            }
        ]
    
    def test_relevance_score_calculation(self, movie_service, sample_filters, sample_movies):
        """Test that relevance scores are calculated correctly."""
        for movie in sample_movies:
            score = movie_service._calculate_relevance_score(movie, sample_filters)
            
            # Verify score is within valid range
            assert 0.0 <= score <= 1.0, f"Score {score} should be between 0.0 and 1.0"
            
            # Matrix should have highest score due to perfect genre and keyword match
            if movie['title'] == 'Matrix':
                assert score > 0.7, f"Matrix should have high relevance score, got {score}"
    
    def test_enhanced_reasoning_generation(self, movie_service, sample_filters, sample_movies):
        """Test that enhanced reasoning is generated correctly."""
        for movie in sample_movies:
            reasoning = movie_service._generate_reasoning(movie, sample_filters)
            
            # Verify reasoning is not empty
            assert reasoning, "Reasoning should not be empty"
            assert len(reasoning) > 20, "Reasoning should be descriptive"
            
            # Verify reasoning contains movie title
            assert movie['title'] in reasoning, "Reasoning should mention movie title"
            
            # Verify reasoning is in Spanish (as per requirements)
            spanish_indicators = ['Te recomiendo', 'porque', 'es', 'tiene', 'está']
            assert any(indicator in reasoning for indicator in spanish_indicators), \
                "Reasoning should be in Spanish"
    
    def test_movie_data_validation_and_normalization(self, movie_service, sample_movies):
        """Test that movie data is properly validated and normalized."""
        for movie in sample_movies:
            normalized = movie_service._validate_and_normalize_movie_data(movie)
            
            # Verify all required fields are present
            required_fields = ['id', 'title', 'overview', 'poster_path', 'vote_average', 'release_date']
            for field in required_fields:
                assert field in normalized, f"Field {field} should be present"
                assert normalized[field] is not None, f"Field {field} should not be None"
            
            # Verify poster URL is valid
            poster = normalized['poster_path']
            assert isinstance(poster, str), "Poster path should be string"
            assert len(poster) > 0, "Poster path should not be empty"
            
            # Verify rating is numeric and in valid range
            rating = normalized['vote_average']
            assert isinstance(rating, (int, float)), "Rating should be numeric"
            assert 0 <= rating <= 10, "Rating should be between 0 and 10"
    
    def test_recommendations_sorting_by_relevance(self, movie_service, sample_filters, sample_movies):
        """Test that recommendations are properly sorted by relevance score."""
        recommendations = movie_service._transform_movies_to_recommendations(sample_movies, sample_filters)
        
        # Verify recommendations are sorted by relevance score (descending)
        for i in range(len(recommendations) - 1):
            current_score = recommendations[i].relevance_score
            next_score = recommendations[i + 1].relevance_score
            assert current_score >= next_score, \
                f"Recommendations should be sorted by relevance score: {current_score} >= {next_score}"
    
    @pytest.mark.asyncio
    async def test_cache_key_strategy_generation(self, movie_service, sample_filters):
        """Test intelligent cache key strategy generation."""
        cache_keys = movie_service._build_cache_key_strategy(sample_filters)
        
        # Verify cache keys are generated
        assert len(cache_keys) > 0, "Should generate cache keys"
        
        # Verify genre-specific keys are prioritized for action/sci-fi
        assert any('action' in key.lower() for key in cache_keys[:5]), \
            "Should prioritize action cache keys"
        assert any('scifi' in key.lower() or 'sci' in key.lower() for key in cache_keys[:10]), \
            "Should include sci-fi cache keys"
        
        # Verify general fallback keys are included
        assert 'movies_all_popular' in cache_keys, "Should include general popular movies"
    
    def test_movie_deduplication(self, movie_service):
        """Test movie deduplication functionality."""
        # Create movies with duplicates
        movies_with_duplicates = [
            {'id': '1', 'title': 'Movie A', 'vote_average': 8.0},
            {'id': '2', 'title': 'Movie B', 'vote_average': 7.5},
            {'id': '1', 'title': 'Movie A', 'vote_average': 8.2, 'overview': 'Better data'},  # Duplicate with more data
            {'id': '3', 'title': 'Movie C', 'vote_average': 9.0},
        ]
        
        unique_movies = movie_service._deduplicate_movies(movies_with_duplicates)
        
        # Verify deduplication worked
        assert len(unique_movies) == 3, "Should have 3 unique movies"
        
        # Verify the better version of Movie A was kept
        movie_a = next(m for m in unique_movies if m['id'] == '1')
        assert 'overview' in movie_a, "Should keep the version with more complete data"
    
    def test_enhanced_client_side_filtering(self, movie_service, sample_filters, sample_movies):
        """Test enhanced client-side filtering for cached movies."""
        filtered_movies = movie_service._apply_enhanced_client_side_filtering(sample_movies, sample_filters)
        
        # Verify filtering worked
        assert len(filtered_movies) > 0, "Should return filtered movies"
        
        # Verify movies have cache scores
        for movie in filtered_movies:
            assert '_cache_score' in movie, "Filtered movies should have cache scores"
            assert 0.0 <= movie['_cache_score'] <= 1.0, "Cache score should be valid"
        
        # Verify movies are sorted by cache score
        for i in range(len(filtered_movies) - 1):
            current_score = filtered_movies[i]['_cache_score']
            next_score = filtered_movies[i + 1]['_cache_score']
            assert current_score >= next_score, "Movies should be sorted by cache score"
    
    def test_default_movie_selection(self, movie_service, sample_filters):
        """Test intelligent default movie selection."""
        # Get the default movies from the service
        default_movies = [
            {
                'id': '603', 'title': 'Matrix', 'vote_average': 8.7, 'release_date': '1999-03-30',
                'genres': [{'id': 28, 'name': 'Action'}, {'id': 878, 'name': 'Science Fiction'}],
                'overview': 'A programmer discovers reality is a simulation.'
            },
            {
                'id': '238', 'title': 'The Godfather', 'vote_average': 9.2, 'release_date': '1972-03-14',
                'genres': [{'id': 18, 'name': 'Drama'}, {'id': 80, 'name': 'Crime'}],
                'overview': 'The story of a mafia family.'
            }
        ]
        
        selected = movie_service._select_best_default_movies(default_movies, sample_filters, 2)
        
        # Verify selection worked
        assert len(selected) > 0, "Should select movies"
        
        # Matrix should be selected due to better genre match
        selected_titles = [m['title'] for m in selected]
        assert 'Matrix' in selected_titles, "Matrix should be selected for action/sci-fi filters"
    
    @pytest.mark.asyncio
    async def test_fallback_mechanism_cascade(self, movie_service, sample_filters):
        """Test the complete fallback mechanism cascade."""
        # Mock Lambda client to simulate failures
        with patch.object(movie_service, 'lambda_client') as mock_lambda:
            # Simulate Lambda failure
            mock_lambda.invoke.side_effect = Exception("Lambda unavailable")
            
            # Mock DynamoDB to simulate cache failure
            with patch('boto3.resource') as mock_boto3:
                mock_boto3.side_effect = Exception("DynamoDB unavailable")
                
                # This should trigger the default recommendations fallback
                recommendations = await movie_service.search_movies_with_filters(sample_filters, limit=3)
                
                # Verify fallback worked
                assert len(recommendations) > 0, "Should return default recommendations"
                assert all(rec.source == "default_curated" for rec in recommendations), \
                    "All recommendations should be from default curated source"
                
                # Verify recommendations have proper scoring
                for rec in recommendations:
                    assert 0.0 <= rec.relevance_score <= 1.0, "Relevance score should be valid"
                    assert rec.reasoning, "Should have reasoning"
                    assert rec.movie.get('title'), "Should have movie title"
    
    def test_enhanced_default_reasoning(self, movie_service, sample_filters):
        """Test enhanced reasoning generation for default movies."""
        matrix_movie = {
            'id': '603', 'title': 'Matrix', 'vote_average': 8.7, 'release_date': '1999-03-30',
            'genres': [{'id': 28, 'name': 'Action'}, {'id': 878, 'name': 'Science Fiction'}],
            'overview': 'A programmer discovers reality is a simulation.'
        }
        
        reasoning = movie_service._generate_enhanced_default_reasoning(matrix_movie, sample_filters)
        
        # Verify enhanced reasoning quality
        assert len(reasoning) > 50, "Enhanced reasoning should be detailed"
        assert 'Matrix' in reasoning, "Should mention movie title"
        assert 'curada' in reasoning, "Should mention curated source"
        assert any(word in reasoning.lower() for word in ['acción', 'ciencia ficción']), \
            "Should mention relevant genres"
    
    def test_quality_filtering_for_recommendations(self, movie_service, sample_filters):
        """Test quality filtering removes very low-scored recommendations."""
        # Create movies with varying quality scores
        low_quality_movies = [
            {'id': '1', 'title': 'Bad Movie', 'vote_average': 3.0, 'release_date': '2000-01-01',
             'overview': 'A bad movie', 'poster_path': '/test.jpg', 'genres': []},
            {'id': '2', 'title': 'Good Movie', 'vote_average': 8.0, 'release_date': '2000-01-01',
             'overview': 'A good movie', 'poster_path': '/test.jpg', 'genres': []},
            {'id': '3', 'title': 'Great Movie', 'vote_average': 9.0, 'release_date': '2000-01-01',
             'overview': 'A great movie', 'poster_path': '/test.jpg', 'genres': []},
        ]
        
        recommendations = movie_service._transform_movies_to_recommendations(low_quality_movies, sample_filters)
        
        # Verify quality filtering
        if len(recommendations) > 1:
            # Higher rated movies should have higher scores
            good_movie_rec = next((r for r in recommendations if r.movie['title'] == 'Good Movie'), None)
            bad_movie_rec = next((r for r in recommendations if r.movie['title'] == 'Bad Movie'), None)
            
            if good_movie_rec and bad_movie_rec:
                assert good_movie_rec.relevance_score > bad_movie_rec.relevance_score, \
                    "Higher rated movies should have higher relevance scores"
    
    @pytest.mark.asyncio
    async def test_emergency_fallback_mechanism(self, movie_service, sample_filters):
        """Test emergency fallback when all other mechanisms fail."""
        # Mock all methods to fail
        with patch.object(movie_service, '_invoke_movie_lambda_with_retry', side_effect=Exception("Lambda failed")):
            with patch.object(movie_service, '_get_cached_movies_with_filtering', return_value=[]):
                with patch.object(movie_service, '_get_default_recommendations_with_scoring', return_value=[]):
                    
                    recommendations = await movie_service.search_movies_with_filters(sample_filters, limit=3)
                    
                    # Verify emergency fallback worked
                    assert len(recommendations) == 1, "Should return emergency fallback recommendation"
                    assert recommendations[0].source == "emergency_fallback", "Should be emergency fallback"
                    assert recommendations[0].relevance_score == 0.0, "Emergency fallback should have 0 score"
                    assert "temporalmente no disponible" in recommendations[0].reasoning.lower(), \
                        "Should explain service unavailability"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])