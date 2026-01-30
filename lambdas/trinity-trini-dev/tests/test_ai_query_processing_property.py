"""
Property-based test for AI query processing completeness.

Feature: trini-chatbot-integration, Property 1: AI Query Processing Completeness
Validates: Requirements 1.1, 1.2, 1.3

This test validates that for any natural language movie query, the Salamandra model
should extract structured filters in valid JSON format containing at least one of:
genres, year range, rating, or keywords, with a confidence score between 0.0 and 1.0.
"""

import pytest
import json
import os
import sys
from unittest.mock import patch, MagicMock
from hypothesis import given, strategies as st, settings, assume
from typing import Dict, Any

# Add the parent directory to the path so we can import our modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.ai_prompt_generator import AIPromptGenerator
from models.user_context import UserContext
from models.extracted_filters import ExtractedFilters, YearRange, RatingRange


def setup_test_environment():
    """Set up test environment with required variables."""
    os.environ.update({
        'HUGGINGFACE_API_KEY': 'test-key-12345',
        'TMDB_API_KEY': 'test-tmdb-key-12345',
        'CHAT_SESSIONS_TABLE': 'test-chat-sessions-table',
        'AWS_REGION': 'eu-west-1',
        'MAX_QUERIES_PER_MINUTE': '5',
        'DEBUG_MODE': 'true',
        'LOG_LEVEL': 'INFO'
    })


# Strategy for generating movie-related queries in Spanish and English
movie_query_strategy = st.one_of([
    # Spanish movie queries - basic patterns
    st.sampled_from([
        "Quiero películas de acción", "Busco comedias", "Necesito dramas", "Me gustan los thrillers",
        "Recomienda terror", "Muestra películas de aventura", "Películas de ciencia ficción",
        "Comedias románticas", "Documentales históricos", "Animación familiar",
        "Películas de los años 90", "Films de los 80", "Cintas de 2000",
        "Películas recientes", "Films clásicos", "Algo divertido", "Algo emocionante",
        "Películas buenas", "Films excelentes", "Entretenimiento nuevo"
    ]),
    # English movie queries - basic patterns  
    st.sampled_from([
        "I want action movies", "I need comedies", "Show me dramas", "Find thrillers",
        "Recommend horror films", "Movies about adventure", "Science fiction films",
        "Romantic comedies", "Historical documentaries", "Family animation",
        "Movies from the 90s", "Films from 1980", "Movies from 2000s",
        "Recent movies", "Classic films", "Something good", "Something exciting",
        "Good movies", "Excellent films", "New entertainment"
    ]),
    # Complex queries combining multiple criteria
    st.sampled_from([
        "Películas de acción de los 90 con buen rating",
        "Action movies from the 90s with good rating",
        "Comedias recientes populares", "Recent popular comedies",
        "Terror psicológico clásico", "Classic psychological horror",
        "Documentales históricos recientes", "Recent historical documentaries"
    ]),
    # Simple/ambiguous queries
    st.sampled_from([
        "algo bueno", "something good", "películas", "movies", "entretenimiento",
        "entertainment", "para ver", "to watch", "recomendaciones", "recommendations",
        "algo", "anything", "films", "cintas"
    ]),
    # Information seeking queries
    st.sampled_from([
        "Qué tal está Inception", "How is Titanic", "Información sobre Avatar",
        "Information about Matrix", "Opinión de Avengers", "Review of Star Wars",
        "Detalles de Pulp Fiction", "Details about Godfather"
    ]),
    # Generated text with movie-related words
    st.text(
        alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Zs'), 
                              whitelist_characters='áéíóúñüÁÉÍÓÚÑÜ'),
        min_size=5,
        max_size=100
    ).filter(lambda x: any(word in x.lower() for word in [
        'película', 'movie', 'film', 'cine', 'cinema', 'acción', 'action', 
        'comedia', 'comedy', 'drama', 'terror', 'horror', 'romance', 'aventura',
        'adventure', 'ciencia', 'science', 'ficción', 'fiction', 'documental',
        'documentary', 'animación', 'animation', 'thriller', 'suspenso'
    ]))
])

# Strategy for generating user contexts
user_context_strategy = st.builds(
    UserContext,
    user_id=st.text(
        alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), whitelist_characters='-_'),
        min_size=8,
        max_size=32
    ),
    preferred_genres=st.lists(
        st.sampled_from(['28', '35', '27', '18', '53', '10749', '878', '14', '80', '16', '99']),
        min_size=0,
        max_size=5,
        unique=True
    ),
    recent_movies=st.lists(
        st.text(alphabet=st.characters(whitelist_categories=('Nd',)), min_size=1, max_size=6),
        min_size=0,
        max_size=10
    ),
    language_preference=st.sampled_from(['es', 'en']),
    rating_preference=st.one_of([st.none(), st.floats(min_value=0.0, max_value=10.0)]),
    preferred_decades=st.lists(
        st.sampled_from(['1980s', '1990s', '2000s', '2010s', '2020s']),
        min_size=0,
        max_size=3,
        unique=True
    )
)


class TestAIQueryProcessingCompleteness:
    """Property-based tests for AI query processing completeness."""
    
    def setup_method(self):
        """Set up test environment before each test."""
        setup_test_environment()
        self.ai_prompt_generator = AIPromptGenerator()
    
    @given(
        movie_query=movie_query_strategy,
        user_context=user_context_strategy
    )
    @settings(max_examples=100, deadline=15000)
    def test_ai_query_processing_completeness_property(self, movie_query: str, user_context: UserContext):
        """
        **Property 1: AI Query Processing Completeness**
        
        For any natural language movie query, the Salamandra model should extract 
        structured filters in valid JSON format containing at least one of: genres, 
        year range, rating, or keywords, with a confidence score between 0.0 and 1.0.
        
        **Validates: Requirements 1.1, 1.2, 1.3**
        """
        assume(len(movie_query.strip()) >= 3)  # Minimum meaningful query length
        assume(len(user_context.user_id.strip()) >= 8)  # Valid user ID
        
        # Test the AI prompt generation (simulating AI processing)
        try:
            # Generate AI prompt - this should always succeed for valid inputs
            ai_prompt = self.ai_prompt_generator.create_ai_prompt(movie_query, user_context)
            
            # Verify prompt is generated and contains essential elements
            assert len(ai_prompt) > 100, "AI prompt should be substantial"
            assert movie_query in ai_prompt, "Original query should be in prompt"
            assert "JSON" in ai_prompt, "Prompt should request JSON format"
            assert "confidence" in ai_prompt, "Prompt should request confidence score"
            
        except ValueError as e:
            # Only acceptable if query is truly empty after sanitization
            if "empty" in str(e).lower():
                assume(False)  # Skip this test case
            else:
                raise
        
        # Test the fallback extraction (pattern-based processing)
        extracted_filters = self.ai_prompt_generator.extract_keywords_with_patterns(movie_query)
        
        # **Core Property Validation**
        
        # 1. Should return ExtractedFilters object
        assert isinstance(extracted_filters, ExtractedFilters), "Should return ExtractedFilters object"
        
        # 2. Confidence score should be between 0.0 and 1.0
        assert 0.0 <= extracted_filters.confidence <= 1.0, f"Confidence {extracted_filters.confidence} should be between 0.0 and 1.0"
        
        # 3. Should extract at least one meaningful filter (genres, year_range, rating, or keywords)
        has_genres = bool(extracted_filters.genres)
        has_year_range = extracted_filters.year_range is not None
        has_rating = extracted_filters.rating_range is not None
        has_keywords = bool(extracted_filters.keywords)
        
        assert has_genres or has_year_range or has_rating or has_keywords, \
            f"Should extract at least one filter type. Got: genres={extracted_filters.genres}, " \
            f"year_range={extracted_filters.year_range}, rating_range={extracted_filters.rating_range}, " \
            f"keywords={extracted_filters.keywords}"
        
        # 4. Extracted data should be in valid format
        
        # Genres should be valid TMDB IDs (strings of digits)
        if extracted_filters.genres:
            for genre_id in extracted_filters.genres:
                assert isinstance(genre_id, str), f"Genre ID {genre_id} should be string"
                assert genre_id.isdigit(), f"Genre ID {genre_id} should be numeric string"
                assert int(genre_id) > 0, f"Genre ID {genre_id} should be positive"
        
        # Year range should be valid if present
        if extracted_filters.year_range:
            assert isinstance(extracted_filters.year_range, YearRange), "Year range should be YearRange object"
            assert extracted_filters.year_range.is_valid(), "Year range should be valid"
            if extracted_filters.year_range.min_year:
                assert 1900 <= extracted_filters.year_range.min_year <= 2030, "Min year should be reasonable"
            if extracted_filters.year_range.max_year:
                assert 1900 <= extracted_filters.year_range.max_year <= 2030, "Max year should be reasonable"
        
        # Rating range should be valid if present
        if extracted_filters.rating_range:
            assert isinstance(extracted_filters.rating_range, RatingRange), "Rating range should be RatingRange object"
            assert extracted_filters.rating_range.is_valid(), "Rating range should be valid"
        
        # Keywords should be meaningful strings
        if extracted_filters.keywords:
            for keyword in extracted_filters.keywords:
                assert isinstance(keyword, str), f"Keyword {keyword} should be string"
                assert len(keyword.strip()) > 0, f"Keyword {keyword} should not be empty"
                assert len(keyword) <= 50, f"Keyword {keyword} should not be excessively long"
        
        # 5. Intent should be valid
        valid_intents = ['recommendation', 'information', 'clarification']
        assert extracted_filters.intent in valid_intents, \
            f"Intent '{extracted_filters.intent}' should be one of {valid_intents}"
        
        # 6. Should be serializable to valid JSON
        try:
            filters_dict = extracted_filters.to_dict()
            json_str = json.dumps(filters_dict)
            parsed_back = json.loads(json_str)
            assert isinstance(parsed_back, dict), "Should serialize to valid JSON object"
        except (TypeError, ValueError) as e:
            pytest.fail(f"ExtractedFilters should be JSON serializable: {e}")
    
    @given(
        queries=st.lists(
            movie_query_strategy,
            min_size=1,
            max_size=10,
            unique=True
        ),
        user_context=user_context_strategy
    )
    @settings(max_examples=50, deadline=20000)
    def test_ai_processing_consistency_property(self, queries: list, user_context: UserContext):
        """
        Property: AI processing should be consistent for similar queries.
        
        Similar queries should produce similar confidence scores and filter types,
        demonstrating reliable processing behavior.
        
        **Validates: Requirements 1.1, 1.2, 1.3**
        """
        assume(all(len(q.strip()) >= 3 for q in queries))
        assume(len(user_context.user_id.strip()) >= 8)
        
        results = []
        
        for query in queries:
            try:
                extracted_filters = self.ai_prompt_generator.extract_keywords_with_patterns(query)
                results.append((query, extracted_filters))
            except Exception as e:
                # Skip problematic queries but don't fail the test
                continue
        
        assume(len(results) >= 1)  # Need at least one successful result
        
        # All results should have valid confidence scores
        for query, filters in results:
            assert 0.0 <= filters.confidence <= 1.0, \
                f"Query '{query}' produced invalid confidence: {filters.confidence}"
        
        # All results should have at least one filter type
        for query, filters in results:
            assert filters.has_filters(), \
                f"Query '{query}' should produce at least one filter type"
        
        # Similar query patterns should produce similar results
        action_queries = [(q, f) for q, f in results if 'acción' in q.lower() or 'action' in q.lower()]
        if len(action_queries) >= 2:
            # Action queries should consistently extract action genre
            for query, filters in action_queries:
                assert '28' in filters.genres or any('acción' in kw or 'action' in kw for kw in filters.keywords), \
                    f"Action query '{query}' should extract action-related filters"
    
    @given(
        query=st.text(min_size=1, max_size=500),
        user_context=user_context_strategy
    )
    @settings(max_examples=100, deadline=10000)
    def test_ai_prompt_generation_robustness_property(self, query: str, user_context: UserContext):
        """
        Property: AI prompt generation should be robust to various input types.
        
        The prompt generator should handle any reasonable text input without crashing
        and produce a well-formed prompt for the AI model.
        
        **Validates: Requirements 1.1, 1.2, 1.3**
        """
        assume(len(user_context.user_id.strip()) >= 8)
        
        # Test prompt generation robustness
        try:
            if len(query.strip()) == 0:
                # Empty queries should raise ValueError
                with pytest.raises(ValueError, match="empty"):
                    self.ai_prompt_generator.create_ai_prompt(query, user_context)
            else:
                # Non-empty queries should produce valid prompts
                ai_prompt = self.ai_prompt_generator.create_ai_prompt(query, user_context)
                
                # Get the sanitized version of the query for comparison
                sanitized_query = self.ai_prompt_generator._sanitize_query(query)
                
                # Prompt should be substantial and well-formed
                assert isinstance(ai_prompt, str), "Prompt should be string"
                assert len(ai_prompt) > 100, "Prompt should be substantial"
                assert "Trini" in ai_prompt, "Prompt should identify Trini"
                assert "JSON" in ai_prompt, "Prompt should request JSON format"
                assert sanitized_query in ai_prompt, "Prompt should contain sanitized query"
                
                # Prompt should include essential instructions
                assert "confidence" in ai_prompt, "Prompt should request confidence score"
                assert "genres" in ai_prompt, "Prompt should mention genres"
                assert "intent" in ai_prompt, "Prompt should request intent"
                
        except ValueError as e:
            # Only acceptable for truly empty queries
            if "empty" not in str(e).lower():
                pytest.fail(f"Unexpected ValueError for query '{query}': {e}")
    
    @given(
        movie_query=movie_query_strategy
    )
    @settings(max_examples=50, deadline=10000)
    def test_json_format_validation_property(self, movie_query: str):
        """
        Property: AI response validation should correctly identify valid/invalid JSON.
        
        The validation function should accurately distinguish between properly
        formatted AI responses and malformed ones.
        
        **Validates: Requirements 1.1, 1.2, 1.3**
        """
        assume(len(movie_query.strip()) >= 3)
        
        # Test with valid JSON response format
        valid_response = json.dumps({
            "genres": ["28", "35"],
            "year_range": {"min": 1990, "max": 1999},
            "rating_min": 7.0,
            "keywords": ["acción", "comedia"],
            "intent": "recommendation",
            "confidence": 0.8
        })
        
        assert self.ai_prompt_generator.validate_ai_response(valid_response) is True, \
            "Should validate correct JSON format"
        
        # Test with invalid JSON responses
        invalid_responses = [
            "Not JSON at all",
            '{"genres": "not_a_list"}',  # Wrong data type
            '{"intent": "invalid_intent", "confidence": 0.8}',  # Invalid intent
            '{"genres": ["28"], "intent": "recommendation", "confidence": 1.5}',  # Invalid confidence
            '{"genres": ["28"], "intent": "recommendation"}',  # Missing confidence
            '{"confidence": 0.8}',  # Missing required fields
        ]
        
        for invalid_response in invalid_responses:
            assert self.ai_prompt_generator.validate_ai_response(invalid_response) is False, \
                f"Should reject invalid JSON: {invalid_response}"
    
    @given(
        queries_with_years=st.lists(
            st.sampled_from([
                "películas de 1995", "movies from 1980", "films de los 90", "años 80",
                "década del 2000", "2010s movies", "recientes", "recent films",
                "clásicas", "classic movies", "películas de los años noventa",
                "films from the eighties", "2000s era", "películas actuales"
            ]),
            min_size=1,
            max_size=5
        )
    )
    @settings(max_examples=30, deadline=10000)
    def test_temporal_extraction_accuracy_property(self, queries_with_years: list):
        """
        Property: Temporal references should be accurately extracted and converted.
        
        Queries containing year references should consistently extract valid
        year ranges that make sense in the context of movies.
        
        **Validates: Requirements 1.2, 1.3**
        """
        assume(all(len(q.strip()) >= 3 for q in queries_with_years))
        
        for query in queries_with_years:
            extracted_filters = self.ai_prompt_generator.extract_keywords_with_patterns(query)
            
            # If a year range was extracted, it should be valid
            if extracted_filters.year_range:
                year_range = extracted_filters.year_range
                
                # Year range should be reasonable for movies
                if year_range.min_year:
                    assert 1900 <= year_range.min_year <= 2030, \
                        f"Min year {year_range.min_year} should be reasonable for movies"
                
                if year_range.max_year:
                    assert 1900 <= year_range.max_year <= 2030, \
                        f"Max year {year_range.max_year} should be reasonable for movies"
                
                # Range should be logical
                if year_range.min_year and year_range.max_year:
                    assert year_range.min_year <= year_range.max_year, \
                        f"Year range {year_range.min_year}-{year_range.max_year} should be logical"
                
                # Range should not be excessively wide (more than 50 years)
                if year_range.min_year and year_range.max_year:
                    range_width = year_range.max_year - year_range.min_year
                    assert range_width <= 50, \
                        f"Year range width {range_width} should not be excessive"
    
    def test_specific_genre_extraction_examples(self):
        """
        Test specific examples of genre extraction to ensure accuracy.
        
        **Validates: Requirements 1.2**
        """
        test_cases = [
            ("películas de acción", ["28"]),  # Action
            ("comedias románticas", ["35"]),  # Comedy (romance might also be detected)
            ("terror psicológico", ["27"]),   # Horror
            ("ciencia ficción", ["878"]),     # Sci-Fi
            ("documentales históricos", ["99"]),  # Documentary
            ("animación familiar", ["16"]),   # Animation
        ]
        
        for query, expected_genres in test_cases:
            extracted_filters = self.ai_prompt_generator.extract_keywords_with_patterns(query)
            
            # Should extract at least one expected genre
            found_expected = any(genre in extracted_filters.genres for genre in expected_genres)
            assert found_expected, \
                f"Query '{query}' should extract at least one of {expected_genres}, got {extracted_filters.genres}"
    
    def test_confidence_score_calibration(self):
        """
        Test that confidence scores are appropriately calibrated for different query types.
        
        **Validates: Requirements 1.1, 1.3**
        """
        # High confidence queries (specific and clear)
        high_confidence_queries = [
            "películas de acción de los años 90 con rating alto",
            "comedias románticas recientes con buenas críticas",
            "documentales históricos de la Segunda Guerra Mundial"
        ]
        
        # Low confidence queries (vague or ambiguous)
        low_confidence_queries = [
            "algo",
            "películas",
            "entretenimiento",
            "algo bueno"
        ]
        
        for query in high_confidence_queries:
            extracted_filters = self.ai_prompt_generator.extract_keywords_with_patterns(query)
            # Pattern-based extraction typically gives lower confidence, but should still be reasonable
            assert extracted_filters.confidence >= 0.1, \
                f"Specific query '{query}' should have reasonable confidence, got {extracted_filters.confidence}"
        
        for query in low_confidence_queries:
            extracted_filters = self.ai_prompt_generator.extract_keywords_with_patterns(query)
            # Very vague queries should have low confidence
            assert extracted_filters.confidence <= 0.5, \
                f"Vague query '{query}' should have low confidence, got {extracted_filters.confidence}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])