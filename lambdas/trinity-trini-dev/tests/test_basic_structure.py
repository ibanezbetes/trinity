"""
Basic structure tests for Trini Lambda function.
"""

import pytest
import json
import os
import sys

# Add the parent directory to the path so we can import our modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import ChatSession, ExtractedFilters, TriniResponse, UserContext
from utils import GenreMapper, validate_query, validate_user_id
from trini import handler


class TestBasicStructure:
    """Test basic structure and imports."""
    
    def test_models_import(self):
        """Test that all models can be imported."""
        assert ChatSession is not None
        assert ExtractedFilters is not None
        assert TriniResponse is not None
        assert UserContext is not None
    
    def test_utils_import(self):
        """Test that utilities can be imported."""
        assert GenreMapper is not None
        assert validate_query is not None
        assert validate_user_id is not None
    
    def test_handler_import(self):
        """Test that the main handler can be imported."""
        assert handler is not None
    
    def test_chat_session_creation(self):
        """Test ChatSession model creation."""
        session = ChatSession(user_id="test-user")
        assert session.user_id == "test-user"
        assert len(session.messages) == 0
        assert session.session_id is not None
    
    def test_extracted_filters_creation(self):
        """Test ExtractedFilters model creation."""
        filters = ExtractedFilters(
            genres=["28", "35"],
            confidence=0.8
        )
        assert filters.genres == ["28", "35"]
        assert filters.confidence == 0.8
        assert filters.has_filters() is True
    
    def test_trini_response_creation(self):
        """Test TriniResponse model creation."""
        response = TriniResponse(
            message="Test response",
            confidence=0.9
        )
        assert response.message == "Test response"
        assert response.confidence == 0.9
        assert response.session_id is not None
    
    def test_user_context_creation(self):
        """Test UserContext model creation."""
        context = UserContext(
            user_id="test-user",
            preferred_genres=["28", "35"]
        )
        assert context.user_id == "test-user"
        assert context.preferred_genres == ["28", "35"]
    
    def test_genre_mapper_creation(self):
        """Test GenreMapper utility creation."""
        mapper = GenreMapper()
        assert mapper is not None
        
        # Test basic genre extraction
        genres = mapper.extract_genres_from_text("películas de acción y comedia")
        assert "28" in genres  # Action
        assert "35" in genres  # Comedy
    
    def test_validation_functions(self):
        """Test validation utility functions."""
        # Test valid query
        is_valid, error = validate_query("películas de acción")
        assert is_valid is True
        assert error is None
        
        # Test invalid query
        is_valid, error = validate_query("")
        assert is_valid is False
        assert error is not None
        
        # Test valid user ID
        is_valid, error = validate_user_id("test-user-123")
        assert is_valid is True
        assert error is None
        
        # Test invalid user ID
        is_valid, error = validate_user_id("")
        assert is_valid is False
        assert error is not None


class TestHandlerBasics:
    """Test basic handler functionality."""
    
    def test_handler_with_ask_trini(self):
        """Test handler with askTrini mutation."""
        event = {
            'info': {'fieldName': 'askTrini'},
            'arguments': {
                'input': {
                    'query': 'películas de acción',
                    'userId': 'test-user-123'
                }
            }
        }
        
        # Mock environment variables
        os.environ.update({
            'HUGGINGFACE_API_KEY': 'test-key',
            'TMDB_API_KEY': 'test-key',
            'CHAT_SESSIONS_TABLE': 'test-table',
            'AWS_REGION': 'eu-west-1'
        })
        
        result = handler(event, None)
        
        # Should return a valid response structure
        assert 'sessionId' in result
        assert 'message' in result
        assert 'recommendations' in result
        assert 'confidence' in result
        assert isinstance(result['recommendations'], list)
    
    def test_handler_with_invalid_field(self):
        """Test handler with invalid field name."""
        event = {
            'info': {'fieldName': 'invalidField'},
            'arguments': {}
        }
        
        result = handler(event, None)
        
        # Should return error response
        assert 'error' in result
        assert result['fallbackUsed'] is True
    
    def test_handler_environment_validation(self):
        """Test handler environment variable validation."""
        # Clear required environment variables
        required_vars = ['HUGGINGFACE_API_KEY', 'TMDB_API_KEY', 'CHAT_SESSIONS_TABLE', 'AWS_REGION']
        original_values = {}
        
        for var in required_vars:
            original_values[var] = os.environ.get(var)
            if var in os.environ:
                del os.environ[var]
        
        event = {
            'info': {'fieldName': 'askTrini'},
            'arguments': {
                'input': {
                    'query': 'test query',
                    'userId': 'test-user'
                }
            }
        }
        
        result = handler(event, None)
        
        # Should return error due to missing environment variables
        assert 'error' in result
        
        # Restore environment variables
        for var, value in original_values.items():
            if value is not None:
                os.environ[var] = value


if __name__ == "__main__":
    pytest.main([__file__, "-v"])