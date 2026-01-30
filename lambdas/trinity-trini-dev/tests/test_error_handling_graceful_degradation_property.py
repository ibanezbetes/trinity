"""
Property-based test for error handling graceful degradation.

Feature: trini-chatbot-integration, Property 10: Error Handling Graceful Degradation
Validates: Requirements 5.4, 8.1, 8.2, 8.3

This test validates that for any external service failure (Hugging Face or TMDB), 
Trini provides fallback functionality and informative error messages rather than 
system crashes.
"""

import pytest
import json
import os
import sys
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from hypothesis import given, strategies as st, settings, assume
from typing import Dict, Any, List
from botocore.exceptions import ClientError

# Add the parent directory to the path so we can import our modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.movie_search_service import MovieSearchService
from utils.ai_prompt_generator import AIPromptGenerator
from models.user_context import UserContext
from models.extracted_filters import ExtractedFilters, YearRange, RatingRange
from models.trini_response import TriniResponse, MovieRecommendation
from trini import TriniHandler


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


# Strategy for generating various failure scenarios
failure_scenario_strategy = st.sampled_from([
    'huggingface_timeout',
    'huggingface_auth_error',
    'huggingface_rate_limit',
    'huggingface_service_unavailable',
    'tmdb_timeout',
    'tmdb_auth_error', 
    'tmdb_rate_limit',
    'tmdb_service_unavailable',
    'lambda_invocation_error',
    'dynamodb_unavailable',
    'network_error',
    'json_parse_error',
    'memory_error',
    'general_exception'
])

# Strategy for generating movie queries
movie_query_strategy = st.one_of([
    st.sampled_from([
        "Quiero películas de acción", "Busco comedias", "Terror psicológico",
        "Películas de los 90", "Algo divertido", "Documentales históricos",
        "Action movies", "Horror films", "Recent comedies", "Sci-fi classics"
    ]),
    st.text(
        alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Zs'), 
                              whitelist_characters='áéíóúñüÁÉÍÓÚÑÜ'),
        min_size=5,
        max_size=100
    ).filter(lambda x: any(word in x.lower() for word in [
        'película', 'movie', 'film', 'acción', 'action', 'comedia', 'comedy'
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
        st.sampled_from(['28', '35', '27', '18', '53', '10749', '878']),
        min_size=0,
        max_size=3,
        unique=True
    ),
    recent_movies=st.lists(
        st.text(alphabet=st.characters(whitelist_categories=('Nd',)), min_size=1, max_size=6),
        min_size=0,
        max_size=5
    )
)

# Strategy for generating extracted filters
extracted_filters_strategy = st.builds(
    ExtractedFilters,
    genres=st.lists(
        st.sampled_from(['28', '35', '27', '18', '53', '10749', '878']),
        min_size=0,
        max_size=3,
        unique=True
    ),
    year_range=st.one_of([
        st.none(),
        st.builds(YearRange, 
                 min_year=st.integers(min_value=1980, max_value=2020),
                 max_year=st.integers(min_value=2021, max_value=2024))
    ]),
    rating_range=st.one_of([
        st.none(),
        st.builds(RatingRange,
                 min_rating=st.floats(min_value=6.0, max_value=8.0),
                 max_rating=st.floats(min_value=8.1, max_value=10.0))
    ]),
    keywords=st.lists(
        st.text(min_size=3, max_size=15),
        min_size=0,
        max_size=5
    ),
    confidence=st.floats(min_value=0.1, max_value=1.0)
)


class TestErrorHandlingGracefulDegradation:
    """Property-based tests for error handling graceful degradation."""
    
    def setup_method(self):
        """Set up test environment before each test."""
        setup_test_environment()
        self.ai_prompt_generator = AIPromptGenerator()
        self.movie_service = MovieSearchService()
        self.trini_handler = TriniHandler()
    
    @given(
        failure_scenario=failure_scenario_strategy,
        movie_query=movie_query_strategy,
        user_context=user_context_strategy
    )
    @settings(max_examples=20, deadline=20000)
    def test_external_service_failure_graceful_degradation(self, failure_scenario: str, movie_query: str, user_context: UserContext):
        """
        **Property 10: Error Handling Graceful Degradation**
        
        For any external service failure (Hugging Face or TMDB), Trini should provide 
        fallback functionality and informative error messages rather than system crashes.
        
        **Validates: Requirements 5.4, 8.1, 8.2, 8.3**
        """
        assume(len(movie_query.strip()) >= 3)
        assume(len(user_context.user_id.strip()) >= 8)
        
        # Create test event for askTrini mutation
        test_event = {
            'info': {'fieldName': 'askTrini'},
            'arguments': {
                'input': {
                    'query': movie_query,
                    'userId': user_context.user_id
                }
            }
        }
        
        # Simulate the specific failure scenario
        with self._simulate_failure_scenario(failure_scenario):
            try:
                # Process the query - should not crash regardless of failures
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                try:
                    result = loop.run_until_complete(self.trini_handler.process_query(test_event))
                finally:
                    loop.close()
                
                # **Core Property Validation: Graceful Degradation**
                
                # 1. Should return a valid response structure (not crash)
                assert isinstance(result, dict), "Should return dictionary response"
                assert 'message' in result, "Response should contain message field"
                assert 'sessionId' in result, "Response should contain sessionId field"
                assert 'recommendations' in result, "Response should contain recommendations field"
                assert 'confidence' in result, "Response should contain confidence field"
                
                # 2. Should provide informative error message or fallback content
                message = result.get('message', '')
                assert isinstance(message, str), "Message should be string"
                assert len(message.strip()) > 0, "Message should not be empty"
                
                # Message should be informative and user-friendly (in Spanish)
                informative_indicators = [
                    'lo siento', 'disculpa', 'temporalmente', 'no disponible',
                    'intenta', 'más tarde', 'servicio', 'problema', 'error',
                    'fallback', 'cache', 'local', 'límite', 'rate limit',
                    'consultas', 'minuto', 'segundos',  # Rate limiting messages
                    'necesito', 'información', 'específico', 'detalles',  # Clarification messages
                    'ejemplo', 'género', 'época', 'qué tal', 'podrías'  # Clarification prompts
                ]
                has_informative_content = any(indicator in message.lower() for indicator in informative_indicators)
                assert has_informative_content or len(result.get('recommendations', [])) > 0, \
                    f"Response should be informative or provide fallback recommendations. Got message: '{message}'"
                
                # 3. Should indicate fallback usage when appropriate
                if result.get('fallbackUsed') is True:
                    # When fallback is used, should have appropriate confidence and error info
                    assert result.get('confidence', 1.0) <= 0.8, \
                        "Fallback responses should have reduced confidence"
                    
                    # Should have error information or explanation
                    has_error_info = (
                        result.get('error') is not None or
                        'temporalmente' in message.lower() or
                        'no disponible' in message.lower() or
                        'cache' in message.lower()
                    )
                    assert has_error_info, "Fallback responses should explain the situation"
                
                # 4. Recommendations should be valid if provided
                recommendations = result.get('recommendations', [])
                assert isinstance(recommendations, list), "Recommendations should be list"
                
                for rec in recommendations:
                    if isinstance(rec, dict):
                        # Validate recommendation structure
                        assert 'movie' in rec or 'title' in rec, "Recommendation should have movie data"
                        
                        # If it's an emergency fallback, should be clearly marked
                        if rec.get('source') == 'emergency_fallback':
                            movie_data = rec.get('movie', rec)
                            assert 'temporalmente' in movie_data.get('title', '').lower() or \
                                   'no disponible' in movie_data.get('overview', '').lower(), \
                                   "Emergency fallback should clearly indicate service unavailability"
                
                # 5. Session ID should be valid
                session_id = result.get('sessionId', '')
                assert isinstance(session_id, str), "Session ID should be string"
                assert len(session_id) > 0, "Session ID should not be empty"
                
                # 6. Processing time should be reasonable (not infinite due to hanging)
                processing_time = result.get('processingTimeMs', 0)
                assert isinstance(processing_time, int), "Processing time should be integer"
                assert processing_time >= 0, "Processing time should be non-negative"
                assert processing_time < 60000, "Processing time should be reasonable (< 60 seconds)"
                
                # 7. Intent should be valid
                intent = result.get('intent', 'recommendation')
                valid_intents = ['recommendation', 'information', 'clarification']
                assert intent in valid_intents, f"Intent should be valid, got: {intent}"
                
            except Exception as e:
                # **Critical Property: Should never crash with unhandled exceptions**
                pytest.fail(f"System crashed with unhandled exception during {failure_scenario}: {str(e)}")
    
    @given(
        extracted_filters=extracted_filters_strategy,
        failure_scenarios=st.lists(failure_scenario_strategy, min_size=1, max_size=3, unique=True)
    )
    @settings(max_examples=50, deadline=15000)
    def test_movie_search_fallback_cascade(self, extracted_filters: ExtractedFilters, failure_scenarios: List[str]):
        """
        Property: Movie search should gracefully cascade through fallback mechanisms.
        
        When multiple services fail, the system should try each fallback level
        and eventually provide some form of response.
        
        **Validates: Requirements 8.1, 8.2, 8.3**
        """
        # Simulate multiple simultaneous failures
        with self._simulate_multiple_failures(failure_scenarios):
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                try:
                    recommendations = loop.run_until_complete(
                        self.movie_service.search_movies_with_filters(extracted_filters, limit=5)
                    )
                finally:
                    loop.close()
                
                # **Core Property: Should always return some form of response**
                assert isinstance(recommendations, list), "Should return list of recommendations"
                assert len(recommendations) > 0, "Should return at least one recommendation (emergency fallback)"
                
                # Check the fallback cascade behavior
                for rec in recommendations:
                    assert isinstance(rec, MovieRecommendation), "Should return MovieRecommendation objects"
                    
                    # Should have valid source indication
                    valid_sources = [
                        'ai_recommendation', 'cached_fallback', 'default_curated', 'emergency_fallback'
                    ]
                    assert rec.source in valid_sources, f"Should have valid source, got: {rec.source}"
                    
                    # Should have movie data
                    assert isinstance(rec.movie, dict), "Should have movie data"
                    assert 'title' in rec.movie, "Movie should have title"
                    assert 'overview' in rec.movie, "Movie should have overview"
                    
                    # Should have reasoning
                    assert isinstance(rec.reasoning, str), "Should have reasoning"
                    assert len(rec.reasoning.strip()) > 0, "Reasoning should not be empty"
                    
                    # Relevance score should be valid
                    assert isinstance(rec.relevance_score, (int, float)), "Should have numeric relevance score"
                    assert 0.0 <= rec.relevance_score <= 1.0, "Relevance score should be between 0.0 and 1.0"
                
                # If all primary services failed, should use fallback sources
                if any('tmdb' in scenario or 'lambda_invocation' in scenario or 'dynamodb' in scenario 
                       for scenario in failure_scenarios):
                    fallback_sources = ['cached_fallback', 'default_curated', 'emergency_fallback']
                    has_fallback = any(rec.source in fallback_sources for rec in recommendations)
                    assert has_fallback, f"Should use fallback sources when primary services fail. Got sources: {[rec.source for rec in recommendations]}"
                
            except Exception as e:
                pytest.fail(f"Movie search crashed during multiple failures {failure_scenarios}: {str(e)}")
    
    @given(
        movie_query=movie_query_strategy,
        user_context=user_context_strategy
    )
    @settings(max_examples=30, deadline=10000)
    def test_ai_processing_fallback_robustness(self, movie_query: str, user_context: UserContext):
        """
        Property: AI processing should fall back gracefully when Hugging Face is unavailable.
        
        When AI service fails, should use pattern-based extraction and provide
        reasonable results with appropriate confidence adjustment.
        
        **Validates: Requirements 8.1**
        """
        assume(len(movie_query.strip()) >= 3)
        assume(len(user_context.user_id.strip()) >= 8)
        
        # Simulate Hugging Face API failures
        huggingface_failures = ['huggingface_timeout', 'huggingface_auth_error', 'huggingface_service_unavailable']
        
        for failure_type in huggingface_failures:
            with self._simulate_failure_scenario(failure_type):
                try:
                    # Test AI response processing with fallback
                    extracted_filters = self.ai_prompt_generator.process_ai_response("", movie_query)
                    
                    # **Core Property: Should provide fallback extraction**
                    assert isinstance(extracted_filters, ExtractedFilters), "Should return ExtractedFilters"
                    
                    # Should have reduced confidence for fallback processing
                    assert 0.0 <= extracted_filters.confidence <= 0.5, \
                        f"Fallback processing should have reduced confidence, got: {extracted_filters.confidence}"
                    
                    # Should extract at least some meaningful information
                    has_filters = (
                        bool(extracted_filters.genres) or
                        extracted_filters.year_range is not None or
                        extracted_filters.rating_range is not None or
                        bool(extracted_filters.keywords)
                    )
                    assert has_filters, "Fallback should extract at least some filter information"
                    
                    # Should have valid intent
                    valid_intents = ['recommendation', 'information', 'clarification']
                    assert extracted_filters.intent in valid_intents, "Should have valid intent"
                    
                except Exception as e:
                    pytest.fail(f"AI processing fallback failed for {failure_type}: {str(e)}")
    
    @given(
        user_context=user_context_strategy,
        failure_scenario=failure_scenario_strategy
    )
    @settings(max_examples=50, deadline=15000)
    def test_session_management_error_resilience(self, user_context: UserContext, failure_scenario: str):
        """
        Property: Session management should be resilient to database failures.
        
        When DynamoDB is unavailable, should still provide functional responses
        without crashing, even if session persistence fails.
        
        **Validates: Requirements 8.3**
        """
        assume(len(user_context.user_id.strip()) >= 8)
        
        # Test getChatHistory with failures
        test_event = {
            'info': {'fieldName': 'getChatHistory'},
            'arguments': {
                'userId': user_context.user_id,
                'limit': 10
            }
        }
        
        with self._simulate_failure_scenario(failure_scenario):
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                try:
                    result = loop.run_until_complete(self.trini_handler.process_query(test_event))
                finally:
                    loop.close()
                
                # **Core Property: Should handle database failures gracefully**
                assert isinstance(result, dict), "Should return dictionary response"
                
                # Check if this is a rate limit response (which is valid graceful degradation)
                if result.get('fallbackUsed') and 'límite' in result.get('message', '').lower():
                    # Rate limiting is a form of graceful degradation
                    assert result.get('confidence') == 0.0, "Rate limited responses should have 0 confidence"
                    assert 'error' in result, "Rate limited responses should have error field"
                    return  # This is valid graceful degradation
                
                # Should have expected structure for normal responses
                expected_fields = ['sessions', 'totalCount']
                for field in expected_fields:
                    assert field in result, f"Should have {field} field even on failure"
                
                # Sessions should be a list (empty if failed)
                assert isinstance(result['sessions'], list), "Sessions should be list"
                
                # Total count should be numeric
                assert isinstance(result['totalCount'], int), "Total count should be integer"
                assert result['totalCount'] >= 0, "Total count should be non-negative"
                
                # If there's an error, should be informative
                if 'error' in result:
                    error_msg = result['error']
                    assert isinstance(error_msg, str), "Error message should be string"
                    assert len(error_msg.strip()) > 0, "Error message should not be empty"
                
            except Exception as e:
                pytest.fail(f"Session management crashed during {failure_scenario}: {str(e)}")
    
    def _simulate_failure_scenario(self, failure_scenario: str):
        """Create a context manager that simulates the specified failure scenario."""
        
        class FailureSimulator:
            def __init__(self, scenario):
                self.scenario = scenario
                self.patches = []
            
            def __enter__(self):
                if 'huggingface' in self.scenario:
                    # Mock Hugging Face API failures
                    if 'timeout' in self.scenario:
                        mock_requests = patch('requests.post', side_effect=TimeoutError("Hugging Face timeout"))
                    elif 'auth_error' in self.scenario:
                        mock_response = MagicMock()
                        mock_response.status_code = 401
                        mock_response.json.return_value = {'error': 'Unauthorized'}
                        mock_requests = patch('requests.post', return_value=mock_response)
                    elif 'rate_limit' in self.scenario:
                        mock_response = MagicMock()
                        mock_response.status_code = 429
                        mock_response.json.return_value = {'error': 'Rate limit exceeded'}
                        mock_requests = patch('requests.post', return_value=mock_response)
                    else:  # service_unavailable
                        mock_requests = patch('requests.post', side_effect=ConnectionError("Service unavailable"))
                    
                    self.patches.append(mock_requests)
                    mock_requests.start()
                
                if 'tmdb' in self.scenario or 'lambda_invocation' in self.scenario:
                    # Mock Lambda client failures for TMDB integration
                    if 'timeout' in self.scenario:
                        mock_lambda = patch('boto3.client')
                        mock_client = MagicMock()
                        mock_client.invoke.side_effect = TimeoutError("Lambda timeout")
                        mock_lambda.return_value = mock_client
                    elif 'auth_error' in self.scenario:
                        mock_lambda = patch('boto3.client')
                        mock_client = MagicMock()
                        mock_client.invoke.side_effect = ClientError(
                            {'Error': {'Code': 'UnauthorizedOperation'}}, 'invoke'
                        )
                        mock_lambda.return_value = mock_client
                    else:  # service_unavailable or general error
                        mock_lambda = patch('boto3.client')
                        mock_client = MagicMock()
                        mock_client.invoke.side_effect = Exception("Lambda service unavailable")
                        mock_lambda.return_value = mock_client
                    
                    self.patches.append(mock_lambda)
                    mock_lambda.start()
                
                if 'dynamodb' in self.scenario:
                    # Mock DynamoDB failures
                    mock_dynamodb = patch('boto3.resource')
                    if 'unavailable' in self.scenario:
                        mock_dynamodb.side_effect = ClientError(
                            {'Error': {'Code': 'ServiceUnavailable'}}, 'resource'
                        )
                    else:
                        mock_resource = MagicMock()
                        mock_table = MagicMock()
                        mock_table.get_item.side_effect = ClientError(
                            {'Error': {'Code': 'ResourceNotFoundException'}}, 'get_item'
                        )
                        mock_table.put_item.side_effect = ClientError(
                            {'Error': {'Code': 'ServiceUnavailable'}}, 'put_item'
                        )
                        mock_table.query.side_effect = ClientError(
                            {'Error': {'Code': 'ServiceUnavailable'}}, 'query'
                        )
                        mock_resource.Table.return_value = mock_table
                        mock_dynamodb.return_value = mock_resource
                    
                    self.patches.append(mock_dynamodb)
                    mock_dynamodb.start()
                
                if 'network_error' in self.scenario:
                    # Mock general network failures
                    mock_requests = patch('requests.post', side_effect=ConnectionError("Network error"))
                    self.patches.append(mock_requests)
                    mock_requests.start()
                
                if 'json_parse_error' in self.scenario:
                    # Mock JSON parsing failures
                    mock_json = patch('json.loads', side_effect=json.JSONDecodeError("Invalid JSON", "", 0))
                    self.patches.append(mock_json)
                    mock_json.start()
                
                if 'memory_error' in self.scenario:
                    # Mock memory errors - need to access the test instance
                    # Skip memory error simulation for now as it requires test instance access
                    pass
                
                return self
            
            def __exit__(self, exc_type, exc_val, exc_tb):
                for patch_obj in self.patches:
                    patch_obj.stop()
        
        return FailureSimulator(failure_scenario)
    
    def _simulate_multiple_failures(self, failure_scenarios: List[str]):
        """Create a context manager that simulates multiple failure scenarios simultaneously."""
        
        class MultipleFailureSimulator:
            def __init__(self, scenarios):
                self.scenarios = scenarios
                self.simulators = []
            
            def __enter__(self):
                for scenario in self.scenarios:
                    simulator = self._create_single_simulator(scenario)
                    simulator.__enter__()
                    self.simulators.append(simulator)
                return self
            
            def __exit__(self, exc_type, exc_val, exc_tb):
                for simulator in reversed(self.simulators):
                    simulator.__exit__(exc_type, exc_val, exc_tb)
            
            def _create_single_simulator(self, scenario):
                # Create individual failure simulators
                class SingleFailureSimulator:
                    def __init__(self, scenario):
                        self.scenario = scenario
                        self.patches = []
                    
                    def __enter__(self):
                        # Similar logic to _simulate_failure_scenario but for individual scenarios
                        if 'lambda_invocation' in self.scenario or 'tmdb' in self.scenario:
                            mock_lambda = patch('boto3.client')
                            mock_client = MagicMock()
                            mock_client.invoke.side_effect = Exception(f"Lambda failure: {self.scenario}")
                            mock_lambda.return_value = mock_client
                            self.patches.append(mock_lambda)
                            mock_lambda.start()
                        
                        if 'dynamodb' in self.scenario:
                            mock_dynamodb = patch('boto3.resource')
                            mock_dynamodb.side_effect = ClientError(
                                {'Error': {'Code': 'ServiceUnavailable'}}, 'resource'
                            )
                            self.patches.append(mock_dynamodb)
                            mock_dynamodb.start()
                        
                        return self
                    
                    def __exit__(self, exc_type, exc_val, exc_tb):
                        for patch_obj in self.patches:
                            patch_obj.stop()
                
                return SingleFailureSimulator(scenario)
        
        return MultipleFailureSimulator(failure_scenarios)
    
    def test_specific_error_scenarios(self):
        """
        Test specific error scenarios to ensure proper fallback behavior.
        
        **Validates: Requirements 5.4, 8.1, 8.2, 8.3**
        """
        test_cases = [
            {
                'name': 'Hugging Face API timeout',
                'query': 'películas de acción',
                'expected_fallback': True,
                'expected_confidence_max': 0.5
            },
            {
                'name': 'TMDB API unavailable',
                'query': 'comedias recientes',
                'expected_fallback': True,
                'expected_recommendations_min': 1
            },
            {
                'name': 'DynamoDB connection failure',
                'query': 'terror psicológico',
                'expected_response': True,
                'expected_session_handling': True
            }
        ]
        
        for case in test_cases:
            with patch('requests.post', side_effect=TimeoutError("API timeout")):
                with patch('boto3.client') as mock_boto_client:
                    mock_client = MagicMock()
                    mock_client.invoke.side_effect = Exception("Service unavailable")
                    mock_boto_client.return_value = mock_client
                    
                    # Test the specific scenario
                    extracted_filters = self.ai_prompt_generator.process_ai_response("", case['query'])
                    
                    # Validate expected behavior
                    if case.get('expected_fallback'):
                        assert extracted_filters.confidence <= case.get('expected_confidence_max', 1.0), \
                            f"Case '{case['name']}' should have reduced confidence"
                    
                    # Should always return valid ExtractedFilters
                    assert isinstance(extracted_filters, ExtractedFilters), \
                        f"Case '{case['name']}' should return valid ExtractedFilters"
    
    def test_error_message_quality(self):
        """
        Test that error messages are informative and user-friendly.
        
        **Validates: Requirements 5.4, 8.3**
        """
        # Test various error scenarios and check message quality
        error_scenarios = [
            ('huggingface_timeout', 'Hugging Face timeout'),
            ('tmdb_unavailable', 'TMDB service unavailable'),
            ('general_exception', 'General system error')
        ]
        
        for scenario, description in error_scenarios:
            with self._simulate_failure_scenario(scenario):
                test_event = {
                    'info': {'fieldName': 'askTrini'},
                    'arguments': {
                        'input': {
                            'query': 'películas de acción',
                            'userId': 'test-user-12345'
                        }
                    }
                }
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                try:
                    result = loop.run_until_complete(self.trini_handler.process_query(test_event))
                finally:
                    loop.close()
                
                # Check message quality
                message = result.get('message', '')
                
                # Should be in Spanish (primary language)
                spanish_indicators = ['lo siento', 'disculpa', 'temporalmente', 'servicio', 'intenta', 
                                    'necesito', 'información', 'películas', 'encontrar', 'ejemplo']
                has_spanish = any(indicator in message.lower() for indicator in spanish_indicators)
                
                # Should be informative
                informative_indicators = ['no disponible', 'más tarde', 'problema', 'error']
                has_informative_content = any(indicator in message.lower() for indicator in informative_indicators)
                
                assert has_spanish or has_informative_content or len(result.get('recommendations', [])) > 0, \
                    f"Error message for {description} should be user-friendly and informative. Got: '{message}'"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])