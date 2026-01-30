"""
Unit tests for AI response parsing and validation functionality.

This module tests the process_ai_response() function and related validation
methods to ensure proper JSON parsing, fallback mechanisms, and confidence scoring.
"""

import pytest
import json
import os
import sys
from unittest.mock import patch, MagicMock

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


class TestAIResponseParsing:
    """Test suite for AI response parsing and validation."""
    
    def setup_method(self):
        """Set up test environment before each test."""
        setup_test_environment()
        self.ai_prompt_generator = AIPromptGenerator()
    
    def test_process_ai_response_valid_json(self):
        """Test processing of valid JSON AI response."""
        valid_ai_response = json.dumps({
            "genres": ["28", "35"],
            "year_range": {"min": 1990, "max": 1999},
            "rating_min": 7.0,
            "keywords": ["acción", "comedia"],
            "intent": "recommendation",
            "confidence": 0.8
        })
        
        result = self.ai_prompt_generator.process_ai_response(valid_ai_response, "películas de acción")
        
        assert isinstance(result, ExtractedFilters)
        assert result.genres == ["28", "35"]
        assert result.year_range is not None
        assert result.year_range.min_year == 1990
        assert result.year_range.max_year == 1999
        assert result.rating_range is not None
        assert result.rating_range.min_rating == 7.0
        assert result.keywords == ["acción", "comedia"]
        assert result.intent == "recommendation"
        assert abs(result.confidence - 0.8) < 0.1  # Allow for confidence adjustments
    
    def test_process_ai_response_invalid_json_fallback(self):
        """Test fallback to pattern matching when JSON is invalid."""
        invalid_ai_response = "This is not JSON at all, but mentions acción movies"
        
        result = self.ai_prompt_generator.process_ai_response(invalid_ai_response, "películas de acción")
        
        assert isinstance(result, ExtractedFilters)
        # Should fall back to pattern matching
        assert "28" in result.genres  # Action genre should be detected
        assert result.confidence <= 0.4  # Fallback confidence should be capped
    
    def test_process_ai_response_mixed_content_extraction(self):
        """Test extraction of JSON from mixed content."""
        mixed_content = '''
        Aquí está mi análisis de tu consulta:
        
        {"genres": ["27"], "year_range": null, "rating_min": null, "keywords": ["terror"], "intent": "recommendation", "confidence": 0.9}
        
        Espero que esto te ayude.
        '''
        
        result = self.ai_prompt_generator.process_ai_response(mixed_content, "películas de terror")
        
        assert isinstance(result, ExtractedFilters)
        assert result.genres == ["27"]
        assert result.keywords == ["terror"]
        assert result.intent == "recommendation"
        assert result.confidence == 0.9
    
    def test_json_structure_validation(self):
        """Test JSON structure validation."""
        # Valid structure
        valid_json = {
            "genres": ["28"],
            "intent": "recommendation",
            "confidence": 0.8
        }
        assert self.ai_prompt_generator._validate_json_structure(valid_json) is True
        
        # Missing required field
        invalid_json = {
            "genres": ["28"],
            "intent": "recommendation"
            # Missing confidence
        }
        assert self.ai_prompt_generator._validate_json_structure(invalid_json) is False
        
        # Wrong data type
        invalid_json = {
            "genres": "not_a_list",
            "intent": "recommendation",
            "confidence": 0.8
        }
        assert self.ai_prompt_generator._validate_json_structure(invalid_json) is False
        
        # Invalid intent
        invalid_json = {
            "genres": ["28"],
            "intent": "invalid_intent",
            "confidence": 0.8
        }
        assert self.ai_prompt_generator._validate_json_structure(invalid_json) is False
        
        # Invalid confidence range
        invalid_json = {
            "genres": ["28"],
            "intent": "recommendation",
            "confidence": 1.5
        }
        assert self.ai_prompt_generator._validate_json_structure(invalid_json) is False
    
    def test_genre_extraction_and_validation(self):
        """Test genre extraction and validation."""
        # Valid string genre IDs
        genres = self.ai_prompt_generator._extract_and_validate_genres(["28", "35", "27"])
        assert genres == ["28", "35", "27"]
        
        # Integer genre IDs (should be converted to strings)
        genres = self.ai_prompt_generator._extract_and_validate_genres([28, 35])
        assert genres == ["28", "35"]
        
        # Genre names (should be mapped to IDs)
        genres = self.ai_prompt_generator._extract_and_validate_genres(["acción", "comedia"])
        assert "28" in genres  # Action should be mapped
        
        # Invalid genres (should be filtered out)
        genres = self.ai_prompt_generator._extract_and_validate_genres(["invalid", "999999", -1])
        assert len(genres) == 0
    
    def test_year_range_extraction_and_validation(self):
        """Test year range extraction and validation."""
        # Valid year range
        year_data = {"min": 1990, "max": 1999}
        year_range = self.ai_prompt_generator._extract_and_validate_year_range(year_data)
        assert year_range is not None
        assert year_range.min_year == 1990
        assert year_range.max_year == 1999
        
        # Invalid years (should be filtered)
        year_data = {"min": 1800, "max": 2050}  # Outside reasonable range
        year_range = self.ai_prompt_generator._extract_and_validate_year_range(year_data)
        assert year_range is None
        
        # Reversed range (should be corrected)
        year_data = {"min": 1999, "max": 1990}
        year_range = self.ai_prompt_generator._extract_and_validate_year_range(year_data)
        assert year_range is not None
        assert year_range.min_year == 1990
        assert year_range.max_year == 1999
        
        # Partial range
        year_data = {"min": 1990}
        year_range = self.ai_prompt_generator._extract_and_validate_year_range(year_data)
        assert year_range is not None
        assert year_range.min_year == 1990
        assert year_range.max_year is None
    
    def test_rating_range_extraction_and_validation(self):
        """Test rating range extraction and validation."""
        # Valid rating
        parsed_data = {"rating_min": 7.5}
        rating_range = self.ai_prompt_generator._extract_and_validate_rating_range(parsed_data)
        assert rating_range is not None
        assert rating_range.min_rating == 7.5
        
        # Invalid rating (outside 0-10 range)
        parsed_data = {"rating_min": 15.0}
        rating_range = self.ai_prompt_generator._extract_and_validate_rating_range(parsed_data)
        assert rating_range is None
        
        # Both min and max ratings
        parsed_data = {"rating_min": 6.0, "rating_max": 9.0}
        rating_range = self.ai_prompt_generator._extract_and_validate_rating_range(parsed_data)
        assert rating_range is not None
        assert rating_range.min_rating == 6.0
        assert rating_range.max_rating == 9.0
        
        # Reversed range (should be corrected)
        parsed_data = {"rating_min": 9.0, "rating_max": 6.0}
        rating_range = self.ai_prompt_generator._extract_and_validate_rating_range(parsed_data)
        assert rating_range is not None
        assert rating_range.min_rating == 6.0
        assert rating_range.max_rating == 9.0
    
    def test_keywords_extraction_and_validation(self):
        """Test keywords extraction and validation."""
        # Valid keywords
        keywords = self.ai_prompt_generator._extract_and_validate_keywords(["acción", "superhéroes", "Marvel"])
        assert keywords == ["acción", "superhéroes", "Marvel"]
        
        # Keywords with whitespace (should be trimmed)
        keywords = self.ai_prompt_generator._extract_and_validate_keywords([" acción ", "  comedia  "])
        assert keywords == ["acción", "comedia"]
        
        # Too many keywords (should be limited to 10)
        many_keywords = [f"keyword{i}" for i in range(15)]
        keywords = self.ai_prompt_generator._extract_and_validate_keywords(many_keywords)
        assert len(keywords) == 10
        
        # Invalid keywords (too short, too long, non-string)
        invalid_keywords = ["", "a", "x" * 51, 123, None]
        keywords = self.ai_prompt_generator._extract_and_validate_keywords(invalid_keywords)
        assert len(keywords) == 0
    
    def test_intent_validation(self):
        """Test intent validation and normalization."""
        # Valid intents
        assert self.ai_prompt_generator._validate_intent("recommendation") == "recommendation"
        assert self.ai_prompt_generator._validate_intent("information") == "information"
        assert self.ai_prompt_generator._validate_intent("clarification") == "clarification"
        
        # Case insensitive
        assert self.ai_prompt_generator._validate_intent("RECOMMENDATION") == "recommendation"
        
        # Invalid intent (should default to recommendation)
        assert self.ai_prompt_generator._validate_intent("invalid") == "recommendation"
        assert self.ai_prompt_generator._validate_intent(123) == "recommendation"
    
    def test_confidence_validation(self):
        """Test confidence score validation and normalization."""
        # Valid confidence scores
        assert self.ai_prompt_generator._validate_confidence(0.8) == 0.8
        assert self.ai_prompt_generator._validate_confidence(0.0) == 0.0
        assert self.ai_prompt_generator._validate_confidence(1.0) == 1.0
        
        # Out of range (should be clamped)
        assert self.ai_prompt_generator._validate_confidence(1.5) == 1.0
        assert self.ai_prompt_generator._validate_confidence(-0.5) == 0.0
        
        # Invalid type (should default to 0.1)
        assert self.ai_prompt_generator._validate_confidence("invalid") == 0.1
        assert self.ai_prompt_generator._validate_confidence(None) == 0.1
    
    def test_ambiguity_detection(self):
        """Test ambiguity detection logic."""
        # High confidence, specific filters - not ambiguous
        filters = ExtractedFilters(
            genres=["28", "35"],
            year_range=YearRange(1990, 1999),
            confidence=0.8,
            intent="recommendation"
        )
        filters = self.ai_prompt_generator._apply_ambiguity_detection(filters)
        assert not filters.is_ambiguous()
        assert filters.intent == "recommendation"
        
        # Low confidence - should be ambiguous
        filters = ExtractedFilters(
            genres=[],
            confidence=0.3,
            intent="recommendation"
        )
        filters = self.ai_prompt_generator._apply_ambiguity_detection(filters)
        assert filters.is_ambiguous()
        assert filters.intent == "clarification"
        
        # No filters extracted - should be ambiguous
        filters = ExtractedFilters(
            genres=[],
            confidence=0.6,
            intent="recommendation"
        )
        filters = self.ai_prompt_generator._apply_ambiguity_detection(filters)
        assert filters.confidence <= 0.2
        assert filters.intent == "clarification"
    
    def test_detect_ambiguous_query(self):
        """Test comprehensive ambiguity detection."""
        # Clear, specific query
        filters = ExtractedFilters(
            genres=["28"],
            year_range=YearRange(1990, 1999),
            confidence=0.8
        )
        assert not self.ai_prompt_generator.detect_ambiguous_query(filters, "películas de acción de los 90")
        
        # Low confidence query
        filters = ExtractedFilters(confidence=0.3)
        assert self.ai_prompt_generator.detect_ambiguous_query(filters, "algo bueno")
        
        # Very short query
        filters = ExtractedFilters(confidence=0.6)
        assert self.ai_prompt_generator.detect_ambiguous_query(filters, "películas")
        
        # Query with many vague terms
        filters = ExtractedFilters(confidence=0.6)
        assert self.ai_prompt_generator.detect_ambiguous_query(filters, "algo bueno para ver")
    
    def test_create_clarification_message(self):
        """Test clarification message generation."""
        # Low confidence query
        filters = ExtractedFilters(confidence=0.1)
        message = self.ai_prompt_generator.create_clarification_message(filters, "algo")
        assert "Trini" in message
        assert "específico" in message or "información" in message
        
        # Missing genres
        filters = ExtractedFilters(confidence=0.4, genres=[])
        message = self.ai_prompt_generator.create_clarification_message(filters, "películas")
        assert "género" in message
        
        # Missing year range
        filters = ExtractedFilters(confidence=0.4, genres=["28"])
        message = self.ai_prompt_generator.create_clarification_message(filters, "acción")
        assert "época" in message or "año" in message
    
    def test_json_extraction_from_mixed_content(self):
        """Test JSON extraction from various mixed content formats."""
        # JSON in code blocks
        content = "```json\n{\"genres\": [\"28\"], \"intent\": \"recommendation\", \"confidence\": 0.8}\n```"
        extracted = self.ai_prompt_generator._extract_json_from_mixed_content(content)
        assert extracted is not None
        assert json.loads(extracted)["genres"] == ["28"]
        
        # JSON with explanatory text
        content = "Here's the analysis: {\"genres\": [\"35\"], \"intent\": \"recommendation\", \"confidence\": 0.7} Hope this helps!"
        extracted = self.ai_prompt_generator._extract_json_from_mixed_content(content)
        assert extracted is not None
        assert json.loads(extracted)["genres"] == ["35"]
        
        # No JSON in content
        content = "This is just plain text without any JSON structure."
        extracted = self.ai_prompt_generator._extract_json_from_mixed_content(content)
        assert extracted is None
    
    def test_comprehensive_ai_response_scenarios(self):
        """Test comprehensive AI response processing scenarios."""
        # Scenario 1: Perfect AI response
        perfect_response = json.dumps({
            "genres": ["28", "12"],
            "year_range": {"min": 1990, "max": 1999},
            "rating_min": 7.0,
            "keywords": ["acción", "aventura"],
            "intent": "recommendation",
            "confidence": 0.9
        })
        
        result = self.ai_prompt_generator.process_ai_response(perfect_response, "películas de acción de los 90")
        assert abs(result.confidence - 0.9) < 0.1  # Allow for confidence adjustments
        assert result.genres == ["28", "12"]
        assert not result.is_ambiguous()
        
        # Scenario 2: Malformed JSON with fallback
        malformed_response = "I think you want action movies from the 90s but this isn't JSON"
        result = self.ai_prompt_generator.process_ai_response(malformed_response, "películas de acción de los 90")
        assert result.confidence <= 0.4  # Fallback confidence
        assert "28" in result.genres  # Should detect action from query
        
        # Scenario 3: Partial JSON with missing fields
        partial_response = json.dumps({
            "genres": ["35"],
            "intent": "recommendation",
            "confidence": 0.6
            # Missing other optional fields
        })
        result = self.ai_prompt_generator.process_ai_response(partial_response, "comedias")
        assert result.genres == ["35"]
        assert result.confidence == 0.6
        assert result.intent == "recommendation"
        
        # Scenario 4: Empty response with fallback
        empty_response = ""
        result = self.ai_prompt_generator.process_ai_response(empty_response, "terror psicológico")
        assert "27" in result.genres  # Should detect horror from query
        assert result.confidence <= 0.4


if __name__ == "__main__":
    pytest.main([__file__, "-v"])