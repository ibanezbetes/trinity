"""
Property-based test for Lambda configuration validation - Rate Limiting Enforcement.

Feature: trini-chatbot-integration, Property 16: Rate Limiting Enforcement
Validates: Requirements 10.2

This test validates that the Lambda function properly enforces rate limiting
configuration as specified in the requirements.
"""

import pytest
import time
import os
import sys
from unittest.mock import patch, MagicMock
from hypothesis import given, strategies as st, settings, assume

# Add the parent directory to the path so we can import our modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from trini import handler, TriniHandler
from utils.rate_limiter import RateLimiter, reset_rate_limiter


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


class TestLambdaConfigurationValidation:
    """Property-based tests for Lambda configuration validation - Rate Limiting."""
    
    def setup_method(self):
        """Reset rate limiter and set up environment before each test."""
        setup_test_environment()
        reset_rate_limiter()
        # Also reset the global handler instance
        import trini
        trini.trini_handler = trini.TriniHandler()
    
    def teardown_method(self):
        """Clean up after each test."""
        reset_rate_limiter()
    
    @given(
        user_id=st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), whitelist_characters='-_'),
            min_size=8,
            max_size=32
        ),
        query=st.text(min_size=5, max_size=100)
    )
    @settings(max_examples=50, deadline=10000)
    def test_rate_limiting_enforcement_property(self, user_id: str, query: str):
        """
        Property 16: Rate Limiting Enforcement
        
        For any user making requests to Trini, the system should enforce 
        a maximum of 5 queries per minute and reject additional requests 
        with appropriate error messages.
        
        **Validates: Requirements 10.2**
        """
        assume(len(user_id.strip()) >= 8)  # Valid user ID
        assume(len(query.strip()) >= 5)    # Valid query
        
        # Reset rate limiter for this test
        reset_rate_limiter()
        
        # Create askTrini events for the same user
        events = []
        for i in range(7):  # Try 7 requests (more than the 5 limit)
            event = {
                'info': {'fieldName': 'askTrini'},
                'arguments': {
                    'input': {
                        'query': f"{query} {i}",
                        'userId': user_id
                    }
                }
            }
            events.append(event)
        
        successful_requests = 0
        rate_limited_requests = 0
        
        # Make requests rapidly (within the same minute)
        for event in events:
            result = handler(event, None)
            
            # Check if this is a rate limit response
            if ('error' in result and 'Rate limit exceeded' in str(result.get('error', ''))) or \
               ('rateLimitInfo' in result):
                rate_limited_requests += 1
                
                # Verify rate limit error message format
                assert 'límite' in result['message'].lower() or 'rate limit' in result['message'].lower()
                assert result['fallbackUsed'] is True
                assert result['confidence'] == 0.0
                
                # Verify rate limit info is present
                if 'rateLimitInfo' in result:
                    rate_info = result['rateLimitInfo']
                    assert rate_info['maxRequests'] == 5
                    assert rate_info['windowSeconds'] == 60
                    assert rate_info['currentCount'] >= 5
                    assert isinstance(rate_info['timeUntilReset'], int)
            else:
                successful_requests += 1
        
        # Property: Maximum 5 successful requests per user per minute
        assert successful_requests <= 5, f"User {user_id} made {successful_requests} successful requests, should be max 5"
        
        # Property: Requests beyond limit should be rate limited
        if len(events) > 5:
            assert rate_limited_requests > 0, f"User {user_id} should have been rate limited after 5 requests"
        
        # Property: Total requests should equal successful + rate limited
        assert successful_requests + rate_limited_requests == len(events)
    
    @given(
        user_ids=st.lists(
            st.text(
                alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), whitelist_characters='-_'),
                min_size=8,
                max_size=32
            ),
            min_size=2,
            max_size=5,
            unique=True
        )
    )
    @settings(max_examples=20, deadline=15000)
    def test_rate_limiting_per_user_isolation_property(self, user_ids: list):
        """
        Property: Rate limiting should be enforced per user independently.
        
        Each user should have their own rate limit counter, and one user's
        requests should not affect another user's rate limit.
        
        **Validates: Requirements 10.2**
        """
        assume(len(user_ids) >= 2)
        assume(all(len(uid.strip()) >= 8 for uid in user_ids))
        
        # Reset rate limiter for this test and create fresh handler
        reset_rate_limiter()
        import trini
        trini.trini_handler = trini.TriniHandler()
        
        # Each user makes exactly 5 requests (at the limit)
        for user_id in user_ids:
            successful_requests = 0
            
            for i in range(5):
                event = {
                    'info': {'fieldName': 'askTrini'},
                    'arguments': {
                        'input': {
                            'query': f'test query {i}',
                            'userId': user_id
                        }
                    }
                }
                
                result = handler(event, None)
                
                # All 5 requests should succeed for each user
                if not (('error' in result and 'Rate limit exceeded' in str(result.get('error', ''))) or 
                       ('rateLimitInfo' in result)):
                    successful_requests += 1
            
            # Property: Each user should be able to make 5 requests independently
            assert successful_requests == 5, f"User {user_id} should have made 5 successful requests, got {successful_requests}"
    
    def test_lambda_configuration_validation(self):
        """
        Test that Lambda configuration for rate limiting is properly validated.
        
        **Validates: Requirements 10.2**
        """
        # Reset rate limiter for this test
        reset_rate_limiter()
        
        # Test with valid configuration from environment
        assert os.environ.get('MAX_QUERIES_PER_MINUTE') == '5'
        
        event = {
            'info': {'fieldName': 'askTrini'},
            'arguments': {
                'input': {
                    'query': 'test query',
                    'userId': 'test-user-config-123'
                }
            }
        }
        
        # Should work with valid config
        result = handler(event, None)
        assert 'sessionId' in result
        assert 'error' not in result or result['error'] is None
        
        # Test configuration validation by creating a new handler
        trini_handler = TriniHandler()
        assert trini_handler.rate_limiter is not None
        assert trini_handler.rate_limiter.max_requests == 5
        assert trini_handler.rate_limiter.window_seconds == 60
        assert trini_handler.rate_limiter.validate_configuration() is True
    
    def test_rate_limiting_error_message_format_property(self):
        """
        Test that rate limiting error messages are properly formatted according to configuration.
        
        **Validates: Requirements 10.2**
        """
        # Reset rate limiter for this test
        reset_rate_limiter()
        
        user_id = 'test-user-error-format-123'
        
        # Make 6 requests to trigger rate limiting
        for i in range(6):
            event = {
                'info': {'fieldName': 'askTrini'},
                'arguments': {
                    'input': {
                        'query': f'test query {i}',
                        'userId': user_id
                    }
                }
            }
            
            result = handler(event, None)
            
            if i >= 5:  # 6th request should be rate limited
                # Verify error structure
                assert 'error' in result
                assert 'Rate limit exceeded' in str(result.get('error', ''))
                assert 'límite' in result['message'].lower()
                assert result['fallbackUsed'] is True
                assert result['confidence'] == 0.0
                assert isinstance(result['processingTimeMs'], int)
                
                # Verify rate limit info structure
                if 'rateLimitInfo' in result:
                    rate_info = result['rateLimitInfo']
                    assert rate_info['maxRequests'] == 5
                    assert rate_info['windowSeconds'] == 60
                    assert rate_info['currentCount'] >= 5
                    assert rate_info['timeUntilReset'] >= 0
    
    def test_rate_limiting_across_different_operations_property(self):
        """
        Test that rate limiting applies consistently across all Trini operations.
        
        **Validates: Requirements 10.2**
        """
        # Reset rate limiter for this test
        reset_rate_limiter()
        
        user_id = 'test-user-multi-ops-123'
        
        # Mix different field names
        operations = [
            ('askTrini', {
                'input': {
                    'query': 'test query',
                    'userId': user_id
                }
            }),
            ('getChatHistory', {
                'userId': user_id,
                'limit': 5
            })
        ]
        
        request_count = 0
        rate_limited_count = 0
        
        # Make requests alternating between operations
        for i in range(8):  # More than the 5 limit
            field_name, arguments = operations[i % len(operations)]
            
            event = {
                'info': {'fieldName': field_name},
                'arguments': arguments
            }
            
            result = handler(event, None)
            request_count += 1
            
            # Check if rate limited
            if ('error' in result and 'Rate limit exceeded' in str(result.get('error', ''))) or \
               ('rateLimitInfo' in result):
                rate_limited_count += 1
                
                # Verify rate limiting works across different operations
                assert result['fallbackUsed'] is True
                assert 'límite' in result['message'].lower()
        
        # Property: Rate limiting should apply across all operations
        assert rate_limited_count > 0, "Rate limiting should have been triggered across different operations"
        assert request_count == 8, "All requests should have been processed"
    
    @given(
        max_queries=st.integers(min_value=1, max_value=20)
    )
    @settings(max_examples=10, deadline=10000)
    def test_configurable_rate_limit_property(self, max_queries: int):
        """
        Property: Rate limiting should respect the configured MAX_QUERIES_PER_MINUTE value.
        
        **Validates: Requirements 10.2**
        """
        # Reset rate limiter for this test
        reset_rate_limiter()
        
        # Set custom rate limit
        os.environ['MAX_QUERIES_PER_MINUTE'] = str(max_queries)
        
        # Create new handler with updated config
        trini_handler = TriniHandler()
        
        # Verify configuration is applied
        assert trini_handler.rate_limiter.max_requests == max_queries
        
        user_id = f'test-user-config-{max_queries}'
        
        # Make requests up to the limit + 1
        successful_requests = 0
        rate_limited_requests = 0
        
        for i in range(max_queries + 2):
            event = {
                'info': {'fieldName': 'askTrini'},
                'arguments': {
                    'input': {
                        'query': f'test query {i}',
                        'userId': user_id
                    }
                }
            }
            
            # Use the new handler instance
            result = trini_handler.process_query(event)
            
            # Handle async result
            if hasattr(result, '__await__'):
                import asyncio
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    result = loop.run_until_complete(result)
                finally:
                    loop.close()
            
            if ('error' in result and 'Rate limit exceeded' in str(result.get('error', ''))) or \
               ('rateLimitInfo' in result):
                rate_limited_requests += 1
            else:
                successful_requests += 1
        
        # Property: Should allow exactly max_queries successful requests
        assert successful_requests <= max_queries, f"Should allow max {max_queries} requests, got {successful_requests}"
        
        # Property: Should rate limit requests beyond the configured limit
        if max_queries + 2 > max_queries:
            assert rate_limited_requests > 0, f"Should rate limit requests beyond {max_queries}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])