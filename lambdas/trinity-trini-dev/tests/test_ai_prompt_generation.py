"""
Tests for AI prompt generation functionality.

This module tests the create_ai_prompt() function and related utilities
for processing natural language movie queries in Spanish.
"""

import pytest
from unittest.mock import patch, MagicMock
import json

from utils.ai_prompt_generator import AIPromptGenerator
from models.user_context import UserContext
from models.extracted_filters import ExtractedFilters, YearRange, RatingRange


class TestAIPromptGeneration:
    """Test cases for AI prompt generation functionality."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.generator = AIPromptGenerator()
        self.basic_context = UserContext(
            user_id="test-user",
            preferred_genres=["28", "35"],  # Action, Comedy
            recent_movies=["550", "13"],
            language_preference="es"
        )
    
    def test_create_ai_prompt_basic_query(self):
        """Test AI prompt creation with basic movie query."""
        query = "Quiero películas de acción de los 90"
        
        prompt = self.generator.create_ai_prompt(query, self.basic_context)
        
        # Verify prompt structure
        assert "Eres Trini" in prompt
        assert "experto asistente de cine" in prompt
        assert query in prompt
        assert "Géneros preferidos: action, humor" in prompt  # These are the actual mapped names
        assert "RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO" in prompt
        assert "genres" in prompt
        assert "year_range" in prompt
        assert "confidence" in prompt
        
        # Verify TMDB genre mapping is included
        assert "Acción/Action: 28" in prompt
        assert "Comedia/Comedy: 35" in prompt
        
        # Verify examples are included
        assert "EJEMPLOS:" in prompt
        assert "años 90" in prompt
    
    def test_create_ai_prompt_with_user_context(self):
        """Test AI prompt includes user context properly."""
        context = UserContext(
            user_id="test-user",
            preferred_genres=["27", "53"],  # Horror, Thriller
            recent_movies=["278", "238"],
            rating_preference=7.5,
            preferred_decades=["1990s", "2000s"],
            current_room_id="room-123",
            room_voted_movies=["424", "13"]
        )
        
        query = "Algo de terror"
        prompt = self.generator.create_ai_prompt(query, context)
        
        # Verify context elements are included
        assert "Géneros preferidos: miedo, thriller" in prompt  # These are the actual mapped names
        assert "Ha visto 2 películas recientemente" in prompt
        assert "Prefiere películas con rating mínimo: 7.5" in prompt
        assert "Décadas preferidas: 1990s, 2000s" in prompt
        assert "En sala de votación (excluir 2 películas ya votadas)" in prompt
    
    def test_create_ai_prompt_empty_context(self):
        """Test AI prompt with minimal user context."""
        empty_context = UserContext(user_id="test-user")
        query = "Películas recomendadas"
        
        prompt = self.generator.create_ai_prompt(query, empty_context)
        
        assert "Sin preferencias previas registradas" in prompt
        assert query in prompt
        assert "RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO" in prompt
    
    def test_sanitize_query_basic(self):
        """Test query sanitization functionality."""
        # Test normal query
        clean = self.generator._sanitize_query("Películas de acción")
        assert clean == "Películas de acción"
        
        # Test query with excessive whitespace
        clean = self.generator._sanitize_query("  Películas    de   acción  ")
        assert clean == "Películas de acción"
        
        # Test query with harmful characters
        clean = self.generator._sanitize_query("Películas <script>alert('xss')</script>")
        assert "<script>" not in clean
        assert "alert" in clean  # Content preserved, just tags removed
        
        # Test empty query
        clean = self.generator._sanitize_query("")
        assert clean == ""
        
        # Test None query
        clean = self.generator._sanitize_query(None)
        assert clean == ""
    
    def test_sanitize_query_length_limit(self):
        """Test query length limitation."""
        long_query = "a" * 600  # Longer than 500 char limit
        clean = self.generator._sanitize_query(long_query)
        assert len(clean) == 500
    
    def test_extract_keywords_with_patterns_action(self):
        """Test pattern-based keyword extraction for action movies."""
        query = "Quiero películas de acción de los años 90"
        
        filters = self.generator.extract_keywords_with_patterns(query)
        
        assert "28" in filters.genres  # Action genre
        assert filters.year_range is not None
        assert filters.year_range.min_year == 1990
        assert filters.year_range.max_year == 1999
        assert filters.intent == "recommendation"
        assert filters.confidence > 0
        assert "quiero" in filters.keywords
        assert "películas" in filters.keywords
        assert "acción" in filters.keywords
    
    def test_extract_keywords_with_patterns_comedy(self):
        """Test pattern-based extraction for comedy movies."""
        query = "Algo divertido y gracioso para ver"
        
        filters = self.generator.extract_keywords_with_patterns(query)
        
        assert "35" in filters.genres  # Comedy genre
        assert filters.intent == "clarification"  # Short/vague query
        assert "divertido" in filters.keywords
        assert "gracioso" in filters.keywords
    
    def test_extract_keywords_with_patterns_horror(self):
        """Test pattern-based extraction for horror movies."""
        query = "Películas de terror y miedo recientes"
        
        filters = self.generator.extract_keywords_with_patterns(query)
        
        assert "27" in filters.genres  # Horror genre
        assert filters.year_range is not None
        assert filters.year_range.max_year == self.generator.current_year
        assert "terror" in filters.keywords
        assert "miedo" in filters.keywords
    
    def test_extract_keywords_with_patterns_information_intent(self):
        """Test information intent detection."""
        query = "¿Qué tal está la película Inception?"
        
        filters = self.generator.extract_keywords_with_patterns(query)
        
        assert filters.intent == "information"
        assert "inception" in filters.keywords
    
    def test_extract_year_range_patterns_specific_year(self):
        """Test year range extraction for specific years."""
        query = "Películas de 1995"
        year_range = self.generator._extract_year_range_patterns(query.lower())
        
        assert year_range is not None
        assert year_range.min_year == 1993  # ±2 years
        assert year_range.max_year == 1997
    
    def test_extract_year_range_patterns_decades(self):
        """Test year range extraction for decades."""
        test_cases = [
            ("años 90", 1990, 1999),
            ("década del 2000", 2000, 2009),
            ("películas recientes", self.generator.current_year-3, self.generator.current_year),
            ("clásicas", 1950, 1990)
        ]
        
        for query, expected_min, expected_max in test_cases:
            year_range = self.generator._extract_year_range_patterns(query)
            assert year_range is not None, f"Failed for query: {query}"
            assert year_range.min_year == expected_min, f"Min year mismatch for: {query}"
            assert year_range.max_year == expected_max, f"Max year mismatch for: {query}"
    
    def test_extract_rating_patterns(self):
        """Test rating extraction from queries."""
        test_cases = [
            ("películas con 8 estrellas", 8.0),
            ("rating de 7.5", 7.5),
            ("películas excelentes", 8.0),
            ("algo bueno", 7.0),
            ("decente", 6.0)
        ]
        
        for query, expected_rating in test_cases:
            rating = self.generator._extract_rating_patterns(query.lower())
            assert rating == expected_rating, f"Rating mismatch for: {query}"
    
    def test_extract_basic_keywords(self):
        """Test basic keyword extraction."""
        query = "Quiero ver películas de acción con superhéroes"
        keywords = self.generator._extract_basic_keywords(query)
        
        # Should include meaningful words, exclude stop words
        assert "quiero" in keywords
        assert "películas" in keywords
        assert "acción" in keywords
        assert "superhéroes" in keywords
        
        # Should exclude stop words
        assert "de" not in keywords
        assert "con" not in keywords
        
        # Should limit to 10 keywords
        assert len(keywords) <= 10
    
    def test_validate_ai_response_valid_json(self):
        """Test AI response validation with valid JSON."""
        valid_response = json.dumps({
            "genres": ["28", "35"],
            "year_range": {"min": 1990, "max": 1999},
            "rating_min": 7.0,
            "keywords": ["acción", "comedia"],
            "intent": "recommendation",
            "confidence": 0.8
        })
        
        assert self.generator.validate_ai_response(valid_response) is True
    
    def test_validate_ai_response_invalid_json(self):
        """Test AI response validation with invalid JSON."""
        invalid_responses = [
            "Not JSON at all",
            '{"genres": ["28"], "missing_required_fields": true}',
            '{"genres": "not_a_list", "intent": "recommendation", "confidence": 0.8}',
            '{"genres": ["28"], "intent": "invalid_intent", "confidence": 0.8}',
            '{"genres": ["28"], "intent": "recommendation", "confidence": 1.5}',  # Invalid confidence
            '{"genres": ["28"], "intent": "recommendation", "confidence": -0.1}'  # Invalid confidence
        ]
        
        for invalid_response in invalid_responses:
            assert self.generator.validate_ai_response(invalid_response) is False
    
    def test_create_fallback_prompt(self):
        """Test fallback prompt creation."""
        query = "Películas de acción"
        fallback_prompt = self.generator.create_fallback_prompt(query)
        
        assert query in fallback_prompt
        assert "Extrae géneros" in fallback_prompt
        assert "Responde solo con géneros" in fallback_prompt
    
    def test_genre_mapping_spanish_terms(self):
        """Test genre mapping for Spanish movie terms."""
        test_cases = [
            ("películas de acción", ["28"]),
            ("comedias románticas", ["35"]),
            ("terror psicológico", ["27"]),
            ("ciencia ficción", ["878"]),
            ("documentales históricos", ["99"]),
            ("animación familiar", ["16"])
        ]
        
        for query, expected_genres in test_cases:
            extracted_genres = self.generator.genre_mapper.extract_genres_from_text(query)
            for expected_genre in expected_genres:
                assert expected_genre in extracted_genres, f"Missing genre {expected_genre} for query: {query}"
    
    def test_prompt_includes_current_year(self):
        """Test that prompt includes current year for temporal references."""
        query = "Películas recientes"
        prompt = self.generator.create_ai_prompt(query, self.basic_context)
        
        current_year = self.generator.current_year
        assert str(current_year) in prompt
        assert f"{current_year-3}-{current_year}" in prompt  # Recent movies range
    
    def test_error_handling_empty_query(self):
        """Test error handling for empty queries."""
        with pytest.raises(ValueError, match="Query cannot be empty"):
            self.generator.create_ai_prompt("", self.basic_context)
        
        with pytest.raises(ValueError, match="Query cannot be empty"):
            self.generator.create_ai_prompt("   ", self.basic_context)  # Only whitespace
    
    def test_spanish_language_processing(self):
        """Test Spanish language processing capabilities."""
        spanish_queries = [
            "Quiero películas de acción emocionantes",
            "Comedias divertidas para toda la familia",
            "Películas de terror que den mucho miedo",
            "Dramas históricos con buenas actuaciones",
            "Ciencia ficción futurista y espacial"
        ]
        
        for query in spanish_queries:
            # Should not raise exceptions
            prompt = self.generator.create_ai_prompt(query, self.basic_context)
            filters = self.generator.extract_keywords_with_patterns(query)
            
            # Basic validation
            assert len(prompt) > 1000  # Substantial prompt
            assert filters.confidence >= 0.0
            assert filters.intent in ["recommendation", "information", "clarification"]
    
    def test_tmdb_compatibility(self):
        """Test TMDB genre ID compatibility."""
        # Test that all extracted genres are valid TMDB IDs
        test_queries = [
            "acción y aventura",
            "comedia romántica",
            "terror y suspenso",
            "ciencia ficción",
            "drama histórico"
        ]
        
        for query in test_queries:
            filters = self.generator.extract_keywords_with_patterns(query)
            
            # All genre IDs should be strings representing valid TMDB IDs
            for genre_id in filters.genres:
                assert isinstance(genre_id, str)
                assert genre_id.isdigit()
                assert int(genre_id) > 0
                
                # Should be a known TMDB genre ID
                genre_name = self.generator.genre_mapper.get_genre_name(genre_id)
                assert genre_name != genre_id  # Should have a mapped name