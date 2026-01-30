"""
Property-based test for movie data completeness validation.

Feature: trini-chatbot-integration, Property 5: Movie Data Completeness
**Validates: Requirements 2.3, 4.2**
"""

import pytest
from hypothesis import given, strategies as st, assume, settings
from typing import Dict, Any, List
import sys
import os

# Add the parent directory to the path to import modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.movie_search_service import MovieSearchService
from models.extracted_filters import ExtractedFilters
from models.trini_response import MovieRecommendation


class TestMovieDataCompletenessProperty:
    """Property-based tests for movie data completeness validation."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.movie_service = MovieSearchService()
    
    @given(
        movie_data=st.dictionaries(
            keys=st.sampled_from(['id', 'title', 'overview', 'poster_path', 'vote_average', 'release_date', 'genres']),
            values=st.one_of(
                st.text(min_size=1, max_size=200),
                st.integers(min_value=0, max_value=100000),
                st.floats(min_value=0.0, max_value=10.0),
                st.lists(st.dictionaries(
                    keys=st.just('name'),
                    values=st.text(min_size=1, max_size=50)
                ), max_size=5)
            ),
            min_size=1,
            max_size=10
        )
    )
    @settings(max_examples=100, deadline=5000)
    def test_movie_data_completeness_validation(self, movie_data: Dict[str, Any]):
        """
        Property: For any movie data returned by Trini, the movie object should contain 
        non-null values for title, poster (or placeholder), overview, rating, and release date.
        
        **Validates: Requirements 2.3, 4.2**
        """
        # Create a basic filter for testing
        filters = ExtractedFilters(
            genres=['28'],  # Action
            confidence=0.8
        )
        
        try:
            # Test the validation and normalization process
            normalized_movie = self.movie_service._validate_and_normalize_movie_data(movie_data)
            
            # Property 1: All required fields must be present
            required_fields = ['id', 'title', 'overview', 'poster_path', 'vote_average', 'release_date']
            for field in required_fields:
                assert field in normalized_movie, f"Required field '{field}' missing from normalized movie"
                assert normalized_movie[field] is not None, f"Required field '{field}' is None"
            
            # Property 2: Title must be non-empty string
            assert isinstance(normalized_movie['title'], str), "Title must be a string"
            assert len(normalized_movie['title'].strip()) > 0, "Title must not be empty"
            
            # Property 3: Overview must be non-empty string (or fallback generated)
            assert isinstance(normalized_movie['overview'], str), "Overview must be a string"
            assert len(normalized_movie['overview'].strip()) > 0, "Overview must not be empty"
            
            # Property 4: Poster path must be valid URL or placeholder
            assert isinstance(normalized_movie['poster_path'], str), "Poster path must be a string"
            poster_path = normalized_movie['poster_path']
            assert (
                poster_path.startswith('http') or 
                poster_path.startswith('/') or
                'placeholder' in poster_path.lower() or
                ('/' in poster_path and len(poster_path) > 3)  # Accept paths with slashes
            ), f"Poster path must be valid URL or placeholder, got: {poster_path}"
            
            # Property 5: Rating must be numeric and within valid range
            rating = normalized_movie['vote_average']
            assert isinstance(rating, (int, float)), "Rating must be numeric"
            assert 0 <= rating <= 10, "Rating must be between 0 and 10"
            
            # Property 6: Release date must be string (can be empty)
            assert isinstance(normalized_movie['release_date'], str), "Release date must be a string"
            
            # Property 7: ID must be non-empty string
            assert isinstance(normalized_movie['id'], str), "ID must be a string"
            assert len(normalized_movie['id'].strip()) > 0, "ID must not be empty"
            
        except Exception as e:
            # The validation process should handle any input gracefully
            # If it fails, it should be due to truly invalid data, not missing fields
            pytest.fail(f"Movie data validation failed unexpectedly: {str(e)}")
    
    @given(
        movies_list=st.lists(
            st.dictionaries(
                keys=st.sampled_from(['id', 'title', 'overview', 'vote_average', 'release_date']),
                values=st.one_of(
                    st.text(min_size=0, max_size=100),
                    st.integers(min_value=0, max_value=1000),
                    st.floats(min_value=0.0, max_value=10.0),
                    st.none()
                ),
                min_size=0,
                max_size=8
            ),
            min_size=0,
            max_size=20
        )
    )
    @settings(max_examples=50, deadline=10000)
    def test_recommendations_completeness_property(self, movies_list: List[Dict[str, Any]]):
        """
        Property: For any list of movie recommendations, each recommendation should have 
        complete movie data that meets minimum requirements.
        
        **Validates: Requirements 2.3, 4.2**
        """
        filters = ExtractedFilters(
            genres=['35'],  # Comedy
            confidence=0.7
        )
        
        try:
            # Transform movies to recommendations
            recommendations = self.movie_service._transform_movies_to_recommendations(movies_list, filters)
            
            # Property 1: All recommendations should be valid MovieRecommendation objects
            for rec in recommendations:
                assert isinstance(rec, MovieRecommendation), "Each recommendation must be MovieRecommendation object"
                
                # Property 2: Each recommendation must have a movie with complete data
                movie = rec.movie
                assert isinstance(movie, dict), "Movie must be a dictionary"
                
                # Property 3: Required fields must be present and valid
                assert 'id' in movie and movie['id'], "Movie must have non-empty ID"
                assert 'title' in movie and movie['title'], "Movie must have non-empty title"
                assert 'overview' in movie and movie['overview'], "Movie must have non-empty overview"
                assert 'poster_path' in movie and movie['poster_path'], "Movie must have poster path"
                assert 'vote_average' in movie and isinstance(movie['vote_average'], (int, float)), "Movie must have numeric rating"
                assert 'release_date' in movie and isinstance(movie['release_date'], str), "Movie must have release date string"
                
                # Property 4: Relevance score must be valid
                assert isinstance(rec.relevance_score, (int, float)), "Relevance score must be numeric"
                assert 0.0 <= rec.relevance_score <= 1.0, "Relevance score must be between 0.0 and 1.0"
                
                # Property 5: Reasoning must be non-empty string
                assert isinstance(rec.reasoning, str), "Reasoning must be a string"
                assert len(rec.reasoning.strip()) > 0, "Reasoning must not be empty"
                
                # Property 6: Source must be specified
                assert isinstance(rec.source, str), "Source must be a string"
                assert len(rec.source.strip()) > 0, "Source must not be empty"
            
            # Property 7: Recommendations should be sorted by relevance score (descending)
            if len(recommendations) > 1:
                for i in range(len(recommendations) - 1):
                    assert (
                        recommendations[i].relevance_score >= recommendations[i + 1].relevance_score
                    ), "Recommendations must be sorted by relevance score in descending order"
                    
        except Exception as e:
            # The transformation should handle any input gracefully
            pytest.fail(f"Recommendation transformation failed unexpectedly: {str(e)}")
    
    @given(
        incomplete_movie=st.dictionaries(
            keys=st.sampled_from(['id', 'title', 'overview', 'poster_path', 'vote_average', 'release_date']),
            values=st.one_of(
                st.none(),
                st.just(""),
                st.text(min_size=1, max_size=5),  # Very short text
                st.floats(min_value=-10.0, max_value=-1.0)  # Invalid ratings
            ),
            min_size=1,
            max_size=3  # Intentionally incomplete
        )
    )
    @settings(max_examples=50, deadline=5000)
    def test_incomplete_data_handling_property(self, incomplete_movie: Dict[str, Any]):
        """
        Property: For any incomplete movie data, the system should either normalize it 
        to complete data or exclude it from recommendations gracefully.
        
        **Validates: Requirements 2.3, 4.2**
        """
        filters = ExtractedFilters(
            genres=['18'],  # Drama
            confidence=0.6
        )
        
        try:
            # Test minimum requirements check
            normalized_movie = self.movie_service._validate_and_normalize_movie_data(incomplete_movie)
            meets_requirements = self.movie_service._meets_minimum_data_requirements(normalized_movie)
            
            if meets_requirements:
                # If it meets requirements after normalization, all fields should be valid
                assert normalized_movie['id'], "Normalized movie must have valid ID"
                assert normalized_movie['title'], "Normalized movie must have valid title"
                assert normalized_movie['overview'], "Normalized movie must have valid overview"
                assert normalized_movie['poster_path'], "Normalized movie must have valid poster path"
                assert isinstance(normalized_movie['vote_average'], (int, float)), "Normalized movie must have numeric rating"
                assert isinstance(normalized_movie['release_date'], str), "Normalized movie must have string release date"
            
            # Test that transformation handles incomplete data gracefully
            recommendations = self.movie_service._transform_movies_to_recommendations([incomplete_movie], filters)
            
            # Property: Either we get valid recommendations or empty list (no crashes)
            assert isinstance(recommendations, list), "Must return a list"
            
            # If we get recommendations, they must be complete
            for rec in recommendations:
                assert rec.movie['id'], "Recommended movie must have valid ID"
                assert rec.movie['title'], "Recommended movie must have valid title"
                assert rec.movie['overview'], "Recommended movie must have valid overview"
                assert rec.movie['poster_path'], "Recommended movie must have valid poster path"
                
        except Exception as e:
            # Should not crash on any input
            pytest.fail(f"System crashed on incomplete data: {str(e)}")
    
    def test_poster_url_validation_property(self):
        """
        Property: Poster URLs should always be valid (either real URLs or placeholders).
        
        **Validates: Requirements 2.3, 4.2**
        """
        test_cases = [
            {'poster_path': '/abc123.jpg'},  # TMDB path
            {'posterPath': 'https://image.tmdb.org/t/p/w500/abc.jpg'},  # Full URL
            {'poster': None},  # No poster
            {},  # No poster field
            {'poster_path': ''},  # Empty poster
            {'mediaPosterPath': '/def456.jpg'}  # Alternative field
        ]
        
        for movie_data in test_cases:
            poster_url = self.movie_service._get_validated_poster_url(movie_data)
            
            # Property: Must always return a valid URL string
            assert isinstance(poster_url, str), "Poster URL must be a string"
            assert len(poster_url) > 0, "Poster URL must not be empty"
            assert (
                poster_url.startswith('http') or 
                'placeholder' in poster_url.lower()
            ), f"Poster URL must be valid: {poster_url}"


if __name__ == "__main__":
    # Run the tests
    pytest.main([__file__, "-v"])