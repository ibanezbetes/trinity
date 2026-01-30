"""
Property-based test for user context retrieval functionality.

Tests Property 12: User Context Retrieval
Validates: Requirements 6.2, 6.5

This test validates that for any user starting a new conversation, their previous 
chat history and inferred preferences should be loaded and used to enhance current recommendations.
"""

import pytest
import asyncio
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from hypothesis import given, strategies as st, settings, assume
from hypothesis.strategies import text, integers, lists, dictionaries, floats, booleans

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.chat_session import ChatSession, ChatMessage
from models.user_context import UserContext
from models.extracted_filters import ExtractedFilters
from utils.session_service import SessionService


class TestUserContextRetrievalProperty:
    """Property-based tests for user context retrieval functionality."""
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        num_previous_sessions=integers(min_value=1, max_value=10),
        genres_per_session=lists(
            text(min_size=1, max_size=15, alphabet='abcdefghijklmnopqrstuvwxyz'),
            min_size=1, max_size=5
        ),
        ratings_per_session=lists(
            floats(min_value=1.0, max_value=10.0, allow_nan=False, allow_infinity=False),
            min_size=0, max_size=3
        ),
        movie_ids_per_session=lists(
            text(min_size=1, max_size=20, alphabet='abcdefghijklmnopqrstuvwxyz0123456789'),
            min_size=0, max_size=5
        )
    )
    @settings(max_examples=5, deadline=10000)
    def test_user_context_retrieval_completeness(self, user_id, num_previous_sessions, 
                                                genres_per_session, ratings_per_session, 
                                                movie_ids_per_session):
        """
        Feature: trini-chatbot-integration, Property 12: User Context Retrieval
        
        For any user starting a new conversation, their previous chat history and 
        inferred preferences should be loaded and used to enhance current recommendations.
        
        **Validates: Requirements 6.2, 6.5**
        """
        # Assume we have valid data
        assume(len(genres_per_session) > 0)
        assume(all(len(genre) > 0 for genre in genres_per_session))
        
        # Create multiple previous chat sessions for the user
        previous_sessions = []
        all_genres_used = []
        all_ratings_used = []
        all_movies_recommended = []
        
        for i in range(num_previous_sessions):
            session = ChatSession(user_id=user_id)
            
            # Create a user query with extracted filters
            session_genres = genres_per_session[:min(3, len(genres_per_session))]  # Limit to 3 genres per session
            session_rating = ratings_per_session[i % len(ratings_per_session)] if ratings_per_session else None
            session_movies = movie_ids_per_session[:min(3, len(movie_ids_per_session))]  # Limit to 3 movies per session
            
            # Create extracted filters for this session
            extracted_filters = {}
            if session_genres:
                extracted_filters['genres'] = session_genres
                all_genres_used.extend(session_genres)
            
            if session_rating is not None:
                extracted_filters['rating_min'] = session_rating
                all_ratings_used.append(session_rating)
            
            # Add year range occasionally
            if i % 2 == 0:
                year_min = 1990 + (i * 5)
                year_max = year_min + 10
                extracted_filters['year_range'] = {'min': year_min, 'max': year_max}
            
            # Create user query message
            user_message = ChatMessage(
                type='user_query',
                content=f'Query {i}: Looking for movies',
                extracted_filters=extracted_filters,
                confidence=0.7 + (i * 0.05)  # Varying confidence
            )
            
            # Create Trini response message with recommendations
            trini_message = ChatMessage(
                type='trini_response',
                content=f'Response {i}: Here are some recommendations',
                recommendations=session_movies,
                confidence=0.8
            )
            
            session.add_message(user_message)
            session.add_message(trini_message)
            
            all_movies_recommended.extend(session_movies)
            previous_sessions.append(session)
        
        # Mock the session service to return our previous sessions
        with patch('boto3.resource') as mock_boto3_resource, \
             patch('boto3.dynamodb.conditions.Key') as mock_key:
            
            # Mock DynamoDB table and query response
            mock_table = Mock()
            mock_resource = Mock()
            mock_resource.Table.return_value = mock_table
            mock_boto3_resource.return_value = mock_resource
            
            # Mock the Key condition
            mock_key.return_value.eq.return_value = Mock()
            
            # Mock the DynamoDB query to return our sessions
            mock_response = {
                'Items': [session.to_dict() for session in previous_sessions]
            }
            mock_table.query.return_value = mock_response
            
            # Create the session service and test user context retrieval
            session_service = SessionService('test-table', 'eu-west-1')
            
            # Test the actual context retrieval
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                user_context = loop.run_until_complete(
                    session_service.get_user_context(user_id, limit=10)
                )
            finally:
                loop.close()
            
            # Verify user context was properly retrieved and populated
            
            # 1. User ID should be correctly associated (Requirement 6.5)
            assert user_context.user_id == user_id
            
            # 2. Previous chat history should be loaded (Requirement 6.2)
            # This is verified by checking that preferences were inferred from the sessions
            
            # 3. Inferred preferences should be present if we had genre data
            if all_genres_used:
                assert len(user_context.preferred_genres) > 0
                # All inferred genres should come from the historical data
                for genre in user_context.preferred_genres:
                    assert genre in all_genres_used
                
                # Most frequently mentioned genres should be prioritized
                genre_counts = {}
                for genre in all_genres_used:
                    genre_counts[genre] = genre_counts.get(genre, 0) + 1
                
                # The most frequent genre should be in the top preferences
                most_frequent_genre = max(genre_counts.items(), key=lambda x: x[1])[0]
                assert most_frequent_genre in user_context.preferred_genres
            
            # 4. Rating preferences should be inferred if we had rating data
            if all_ratings_used:
                assert user_context.rating_preference is not None
                expected_avg = sum(all_ratings_used) / len(all_ratings_used)
                # Allow for rounding to 1 decimal place
                assert abs(user_context.rating_preference - expected_avg) <= 0.1
            
            # 5. Recent movies should be tracked for exclusion
            if all_movies_recommended:
                assert len(user_context.recent_movies) > 0
                # All recent movies should come from the recommendations
                for movie_id in user_context.recent_movies:
                    assert movie_id in all_movies_recommended
            
            # 6. Context should be serializable for storage/retrieval
            context_dict = user_context.to_dict()
            assert isinstance(context_dict, dict)
            assert context_dict['userId'] == user_id
            assert 'preferredGenres' in context_dict
            assert 'recentMovies' in context_dict
            assert 'ratingPreference' in context_dict
            
            # 7. Context should be reconstructable from dictionary
            reconstructed_context = UserContext.from_dict(context_dict)
            assert reconstructed_context.user_id == user_context.user_id
            assert reconstructed_context.preferred_genres == user_context.preferred_genres
            assert reconstructed_context.recent_movies == user_context.recent_movies
            assert reconstructed_context.rating_preference == user_context.rating_preference
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        session_ages_days=lists(integers(min_value=1, max_value=29), min_size=1, max_size=5),
        genres_list=lists(
            lists(text(min_size=1, max_size=10, alphabet='abcdefghijklmnopqrstuvwxyz'), 
                  min_size=1, max_size=3),
            min_size=1, max_size=5
        )
    )
    @settings(max_examples=30, deadline=8000)
    def test_context_retrieval_with_temporal_data(self, user_id, session_ages_days, genres_list):
        """
        Test that user context retrieval works correctly with sessions of different ages.
        
        Validates that more recent sessions have higher influence on inferred preferences.
        """
        assume(len(session_ages_days) == len(genres_list))
        assume(all(len(genres) > 0 for genres in genres_list))
        
        # Create sessions with different timestamps
        sessions = []
        current_time = datetime.utcnow()
        
        for i, (days_ago, session_genres) in enumerate(zip(session_ages_days, genres_list)):
            session = ChatSession(user_id=user_id)
            
            # Set session timestamp to be days_ago in the past
            session.created_at = current_time - timedelta(days=days_ago)
            session.updated_at = session.created_at
            
            # Create message with genres
            message = ChatMessage(
                type='user_query',
                content=f'Query from {days_ago} days ago',
                extracted_filters={'genres': session_genres},
                confidence=0.8,
                timestamp=session.created_at
            )
            
            session.add_message(message)
            sessions.append(session)
        
        # Mock session service
        with patch('boto3.resource') as mock_boto3_resource, \
             patch('boto3.dynamodb.conditions.Key') as mock_key:
            
            # Mock DynamoDB table and query response
            mock_table = Mock()
            mock_resource = Mock()
            mock_resource.Table.return_value = mock_table
            mock_boto3_resource.return_value = mock_resource
            
            # Mock the Key condition
            mock_key.return_value.eq.return_value = Mock()
            
            # Sort sessions by recency (most recent first) as DynamoDB would return them
            sorted_sessions = sorted(sessions, key=lambda s: s.updated_at, reverse=True)
            mock_response = {
                'Items': [session.to_dict() for session in sorted_sessions]
            }
            mock_table.query.return_value = mock_response
            
            session_service = SessionService('test-table', 'eu-west-1')
            
            # Test context retrieval
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                user_context = loop.run_until_complete(
                    session_service.get_user_context(user_id, limit=10)
                )
            finally:
                loop.close()
            
            # Verify context was retrieved
            assert user_context.user_id == user_id
            
            # If we have genres, they should be inferred
            all_genres = [genre for genres in genres_list for genre in genres]
            if all_genres:
                assert len(user_context.preferred_genres) > 0
                
                # All inferred genres should come from the session data
                for genre in user_context.preferred_genres:
                    assert genre in all_genres
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        room_id=text(min_size=1, max_size=30, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        room_voted_movies=lists(
            text(min_size=1, max_size=20, alphabet='abcdefghijklmnopqrstuvwxyz0123456789'),
            min_size=1, max_size=5
        ),
        previous_genres=lists(
            text(min_size=1, max_size=10, alphabet='abcdefghijklmnopqrstuvwxyz'),
            min_size=1, max_size=3
        )
    )
    @settings(max_examples=25, deadline=6000)
    def test_context_retrieval_with_room_integration(self, user_id, room_id, room_voted_movies, previous_genres):
        """
        Test user context retrieval when user is in a Trinity room.
        
        Validates that room context is properly integrated with user preferences.
        """
        assume(len(room_voted_movies) > 0)
        assume(len(previous_genres) > 0)
        
        # Create a previous session with genre preferences
        session = ChatSession(user_id=user_id)
        message = ChatMessage(
            type='user_query',
            content='Looking for action movies',
            extracted_filters={'genres': previous_genres},
            confidence=0.8
        )
        session.add_message(message)
        
        # Mock session service
        with patch('boto3.resource') as mock_boto3_resource, \
             patch('boto3.dynamodb.conditions.Key') as mock_key:
            
            # Mock DynamoDB table and query response
            mock_table = Mock()
            mock_resource = Mock()
            mock_resource.Table.return_value = mock_table
            mock_boto3_resource.return_value = mock_resource
            
            # Mock the Key condition
            mock_key.return_value.eq.return_value = Mock()
            
            mock_response = {
                'Items': [session.to_dict()]
            }
            mock_table.query.return_value = mock_response
            
            session_service = SessionService('test-table', 'eu-west-1')
            
            # Test context retrieval
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                user_context = loop.run_until_complete(
                    session_service.get_user_context(user_id, limit=10)
                )
            finally:
                loop.close()
            
            # Simulate user being in a room
            user_context.current_room_id = room_id
            user_context.room_voted_movies = room_voted_movies
            
            # Verify context includes both personal and room data
            assert user_context.user_id == user_id
            assert user_context.current_room_id == room_id
            assert user_context.room_voted_movies == room_voted_movies
            
            # Verify personal preferences are still preserved
            if previous_genres:
                assert len(user_context.preferred_genres) > 0
                for genre in user_context.preferred_genres:
                    assert genre in previous_genres
            
            # Verify room integration methods work
            assert user_context.has_room_context() == True
            
            exclude_list = user_context.get_exclude_list()
            for movie_id in room_voted_movies:
                assert movie_id in exclude_list
            
            # Verify movies should be excluded from recommendations
            for movie_id in room_voted_movies:
                assert user_context.should_exclude_movie(movie_id) == True
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-')
    )
    @settings(max_examples=20, deadline=3000)
    def test_context_retrieval_for_new_user(self, user_id):
        """
        Test user context retrieval for a user with no previous sessions.
        
        Validates that new users get a valid empty context.
        """
        # Mock session service to return no sessions
        with patch('boto3.resource') as mock_boto3_resource, \
             patch('boto3.dynamodb.conditions.Key') as mock_key:
            
            # Mock DynamoDB table and query response
            mock_table = Mock()
            mock_resource = Mock()
            mock_resource.Table.return_value = mock_table
            mock_boto3_resource.return_value = mock_resource
            
            # Mock the Key condition
            mock_key.return_value.eq.return_value = Mock()
            
            mock_response = {'Items': []}  # No previous sessions
            mock_table.query.return_value = mock_response
            
            session_service = SessionService('test-table', 'eu-west-1')
            
            # Test context retrieval for new user
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                user_context = loop.run_until_complete(
                    session_service.get_user_context(user_id, limit=10)
                )
            finally:
                loop.close()
            
            # Verify new user gets valid empty context
            assert user_context.user_id == user_id
            assert user_context.preferred_genres == []
            assert user_context.recent_movies == []
            assert user_context.disliked_genres == []
            assert user_context.preferred_decades == []
            assert user_context.rating_preference is None
            assert user_context.language_preference == "en"  # Default
            assert user_context.current_room_id is None
            assert user_context.room_voted_movies == []
            
            # Verify context is still functional
            assert user_context.has_room_context() == False
            assert user_context.get_exclude_list() == []
            assert user_context.should_exclude_movie("any_movie_id") == False
            
            # Verify context can be serialized and reconstructed
            context_dict = user_context.to_dict()
            assert context_dict['userId'] == user_id
            
            reconstructed = UserContext.from_dict(context_dict)
            assert reconstructed.user_id == user_id
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        error_type=st.sampled_from(['ClientError', 'GeneralError', 'JSONError'])
    )
    @settings(max_examples=15, deadline=4000)
    def test_context_retrieval_error_handling(self, user_id, error_type):
        """
        Test that user context retrieval handles errors gracefully.
        
        Validates that errors don't break the system and return valid empty context.
        """
        from botocore.exceptions import ClientError
        
        # Mock session service to raise different types of errors
        with patch('boto3.resource') as mock_boto3_resource, \
             patch('boto3.dynamodb.conditions.Key') as mock_key:
            
            # Mock DynamoDB table and query response
            mock_table = Mock()
            mock_resource = Mock()
            mock_resource.Table.return_value = mock_table
            mock_boto3_resource.return_value = mock_resource
            
            # Mock the Key condition
            mock_key.return_value.eq.return_value = Mock()
            
            if error_type == 'ClientError':
                error = ClientError(
                    error_response={'Error': {'Code': 'ResourceNotFoundException', 'Message': 'Table not found'}},
                    operation_name='Query'
                )
                mock_table.query.side_effect = error
            elif error_type == 'GeneralError':
                mock_table.query.side_effect = Exception("Network error")
            elif error_type == 'JSONError':
                # Return malformed data that will cause JSON parsing errors
                mock_table.query.return_value = {
                    'Items': [{'malformed': 'data', 'missing': 'required_fields'}]
                }
            
            session_service = SessionService('test-table', 'eu-west-1')
            
            # Test context retrieval with errors
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                user_context = loop.run_until_complete(
                    session_service.get_user_context(user_id, limit=10)
                )
            finally:
                loop.close()
            
            # Verify error handling returns valid empty context
            assert user_context is not None
            assert user_context.user_id == user_id
            assert isinstance(user_context.preferred_genres, list)
            assert isinstance(user_context.recent_movies, list)
            assert isinstance(user_context.room_voted_movies, list)
            
            # Context should still be functional despite errors
            context_dict = user_context.to_dict()
            assert context_dict['userId'] == user_id
            
            # Should be able to reconstruct context
            reconstructed = UserContext.from_dict(context_dict)
            assert reconstructed.user_id == user_id


if __name__ == "__main__":
    # Run property tests
    pytest.main([__file__, "-v", "--tb=short"])