"""
Property-based test for chat session persistence.

Tests Property 11: Chat Session Persistence
Validates: Requirements 6.1, 6.3
"""

import pytest
import asyncio
import os
import sys
from datetime import datetime
from unittest.mock import Mock, patch, AsyncMock
from hypothesis import given, strategies as st, settings
from hypothesis.strategies import text, integers, lists, dictionaries

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.chat_session import ChatSession, ChatMessage
from models.user_context import UserContext
from models.extracted_filters import ExtractedFilters
from utils.session_service import SessionService


class TestSessionPersistenceProperty:
    """Property-based tests for session persistence functionality."""
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        query_content=text(min_size=1, max_size=200),
        response_content=text(min_size=1, max_size=500),
        confidence=st.floats(min_value=0.0, max_value=1.0),
        genres=lists(text(min_size=1, max_size=10), min_size=0, max_size=5),
        movie_ids=lists(text(min_size=1, max_size=20), min_size=0, max_size=10)
    )
    @settings(max_examples=50, deadline=5000)
    def test_chat_session_persistence_completeness(self, user_id, query_content, response_content, 
                                                  confidence, genres, movie_ids):
        """
        Feature: trini-chatbot-integration, Property 11: Chat Session Persistence
        
        For any user interaction with Trini, the complete conversation (query, extracted filters, 
        recommendations, timestamp) should be stored and retrievable.
        
        **Validates: Requirements 6.1, 6.3**
        """
        # Create a chat session
        session = ChatSession(user_id=user_id)
        
        # Create user query message
        user_message = ChatMessage(
            type='user_query',
            content=query_content,
            extracted_filters={
                'genres': genres,
                'confidence': confidence
            } if genres else None,
            confidence=confidence
        )
        
        # Create Trini response message
        trini_message = ChatMessage(
            type='trini_response',
            content=response_content,
            recommendations=movie_ids,
            confidence=confidence
        )
        
        # Add messages to session
        session.add_message(user_message)
        session.add_message(trini_message)
        
        # Test persistence completeness - session should contain all data
        session_dict = session.to_dict()
        
        # Verify all required fields are present
        assert 'sessionId' in session_dict
        assert 'userId' in session_dict
        assert 'messages' in session_dict
        assert 'createdAt' in session_dict
        assert 'updatedAt' in session_dict
        assert 'ttl' in session_dict
        
        # Verify user ID is preserved
        assert session_dict['userId'] == user_id
        
        # Verify messages are complete
        assert len(session_dict['messages']) == 2
        
        # Verify user message completeness
        user_msg_dict = session_dict['messages'][0]
        assert user_msg_dict['type'] == 'user_query'
        assert user_msg_dict['content'] == query_content
        # Convert Decimal back to float for comparison
        assert float(user_msg_dict['confidence']) == confidence
        if genres:
            assert user_msg_dict['extractedFilters'] is not None
            assert user_msg_dict['extractedFilters']['genres'] == genres
        
        # Verify Trini response completeness
        trini_msg_dict = session_dict['messages'][1]
        assert trini_msg_dict['type'] == 'trini_response'
        assert trini_msg_dict['content'] == response_content
        assert trini_msg_dict['recommendations'] == movie_ids
        # Convert Decimal back to float for comparison
        assert float(trini_msg_dict['confidence']) == confidence
        
        # Verify timestamps are present and valid
        assert 'timestamp' in user_msg_dict
        assert 'timestamp' in trini_msg_dict
        
        # Test retrievability - session should be reconstructable
        restored_session = ChatSession.from_dict(session_dict)
        
        # Verify restored session matches original
        assert restored_session.session_id == session.session_id
        assert restored_session.user_id == session.user_id
        assert len(restored_session.messages) == len(session.messages)
        
        # Verify restored messages match original
        for original_msg, restored_msg in zip(session.messages, restored_session.messages):
            assert restored_msg.type == original_msg.type
            assert restored_msg.content == original_msg.content
            assert restored_msg.confidence == original_msg.confidence
            assert restored_msg.recommendations == original_msg.recommendations
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        num_messages=integers(min_value=1, max_value=20)
    )
    @settings(max_examples=30, deadline=3000)
    def test_session_history_pruning_property(self, user_id, num_messages):
        """
        Feature: trini-chatbot-integration, Property 13: Session History Pruning
        
        For any user with more than 10 chat interactions, only the most recent 10 
        should be retained in active context.
        
        **Validates: Requirements 6.4**
        """
        # Create a chat session
        session = ChatSession(user_id=user_id)
        
        # Add messages up to the specified number
        for i in range(num_messages):
            message = ChatMessage(
                type='user_query' if i % 2 == 0 else 'trini_response',
                content=f'Message {i}',
                confidence=0.5
            )
            session.add_message(message)
        
        # Verify session never exceeds 10 messages
        assert len(session.messages) <= 10
        
        if num_messages > 10:
            # If we added more than 10 messages, verify we kept the last 10
            assert len(session.messages) == 10
            
            # Verify the messages are the most recent ones
            # The first message should be from index (num_messages - 10)
            expected_first_content = f'Message {num_messages - 10}'
            assert session.messages[0].content == expected_first_content
            
            # The last message should be from index (num_messages - 1)
            expected_last_content = f'Message {num_messages - 1}'
            assert session.messages[-1].content == expected_last_content
        else:
            # If we added 10 or fewer messages, all should be preserved
            assert len(session.messages) == num_messages
            
            # Verify all messages are present in order
            for i, message in enumerate(session.messages):
                expected_content = f'Message {i}'
                assert message.content == expected_content
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        sessions_data=lists(
            st.one_of(
                # Genre filter
                st.fixed_dictionaries({
                    'genres': lists(text(min_size=1, max_size=10), min_size=1, max_size=3)
                }),
                # Rating filter
                st.fixed_dictionaries({
                    'rating_min': st.floats(min_value=1.0, max_value=10.0)
                }),
                # Year range filter
                st.fixed_dictionaries({
                    'year_range': dictionaries(
                        keys=st.sampled_from(['min', 'max']),
                        values=integers(min_value=1900, max_value=2030),
                        min_size=1, max_size=2
                    )
                })
            ),
            min_size=1, max_size=5
        )
    )
    @settings(max_examples=30, deadline=5000)
    def test_user_context_retrieval_property(self, user_id, sessions_data):
        """
        Feature: trini-chatbot-integration, Property 12: User Context Retrieval
        
        For any user starting a new conversation, their previous chat history and 
        inferred preferences should be loaded and used to enhance current recommendations.
        
        **Validates: Requirements 6.2, 6.5**
        """
        # Create multiple sessions with different preferences
        sessions = []
        all_genres = []
        all_ratings = []
        
        for session_data in sessions_data:
            session = ChatSession(user_id=user_id)
            
            # Create message with extracted filters
            message = ChatMessage(
                type='user_query',
                content='Test query',
                extracted_filters=session_data,
                confidence=0.8
            )
            
            session.add_message(message)
            sessions.append(session)
            
            # Collect data for verification
            if 'genres' in session_data:
                all_genres.extend(session_data['genres'])
            if 'rating_min' in session_data:
                all_ratings.append(session_data['rating_min'])
        
        # Test user context inference
        user_context = UserContext(user_id=user_id)
        
        # Mock the session service's preference inference method
        session_service = SessionService('test-table', 'eu-west-1')
        session_service._infer_user_preferences(user_context, sessions)
        
        # Verify user context was properly updated
        assert user_context.user_id == user_id
        
        # If we had genres in the sessions, they should be inferred
        if all_genres:
            assert len(user_context.preferred_genres) > 0
            # All inferred genres should come from the original data
            for genre in user_context.preferred_genres:
                assert genre in all_genres
        
        # If we had ratings in the sessions, rating preference should be inferred
        if all_ratings:
            assert user_context.rating_preference is not None
            # Rating preference should be close to the average of provided ratings (allowing for rounding)
            expected_avg = sum(all_ratings) / len(all_ratings)
            # Allow for rounding to 1 decimal place
            assert abs(user_context.rating_preference - expected_avg) <= 0.05
        
        # Context should be associable with userId (requirement 6.5)
        context_dict = user_context.to_dict()
        assert context_dict['userId'] == user_id
        
        # Context should contain inferred preferences (requirement 6.2)
        assert 'preferredGenres' in context_dict
        assert 'ratingPreference' in context_dict
        assert 'recentMovies' in context_dict


if __name__ == "__main__":
    # Run property tests
    pytest.main([__file__, "-v", "--tb=short"])