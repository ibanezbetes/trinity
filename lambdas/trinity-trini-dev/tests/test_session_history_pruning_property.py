"""
Property-based test for session history pruning functionality.

Tests Property 13: Session History Pruning
Validates: Requirements 6.4

This test validates that for any user with more than 10 chat interactions, 
only the most recent 10 should be retained in active context while older 
interactions are archived.
"""

import pytest
import asyncio
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from hypothesis import given, strategies as st, settings, assume, HealthCheck
from hypothesis.strategies import text, integers, lists, dictionaries, floats, booleans

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.chat_session import ChatSession, ChatMessage
from models.user_context import UserContext
from models.extracted_filters import ExtractedFilters
from utils.session_service import SessionService


class TestSessionHistoryPruningProperty:
    """Property-based tests for session history pruning functionality."""
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        num_messages=integers(min_value=11, max_value=50),
        message_types=lists(
            st.sampled_from(['user_query', 'trini_response']),
            min_size=11, max_size=50
        ),
        message_contents=lists(
            text(min_size=1, max_size=100),
            min_size=11, max_size=50
        ),
        confidences=lists(
            floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
            min_size=11, max_size=50
        )
    )
    @settings(max_examples=100, deadline=5000)
    def test_session_history_pruning_completeness(self, user_id, num_messages, message_types, 
                                                 message_contents, confidences):
        """
        Feature: trini-chatbot-integration, Property 13: Session History Pruning
        
        For any user with more than 10 chat interactions, only the most recent 10 
        should be retained in active context while older interactions are archived.
        
        **Validates: Requirements 6.4**
        """
        # Ensure we have enough data for the number of messages
        assume(len(message_types) >= num_messages)
        assume(len(message_contents) >= num_messages)
        assume(len(confidences) >= num_messages)
        assume(num_messages > 10)  # Focus on pruning scenarios
        
        # Create a chat session
        session = ChatSession(user_id=user_id)
        
        # Track all messages we add for verification
        all_messages = []
        
        # Add messages sequentially
        for i in range(num_messages):
            message = ChatMessage(
                type=message_types[i],
                content=f"{message_contents[i % len(message_contents)]} - Message {i}",
                confidence=confidences[i % len(confidences)],
                timestamp=datetime.utcnow() + timedelta(seconds=i)  # Ensure chronological order
            )
            all_messages.append(message)
            session.add_message(message)
            
            # After each addition, verify pruning behavior
            if i < 10:
                # Should have all messages when under limit
                assert len(session.messages) == i + 1
            else:
                # Should never exceed 10 messages
                assert len(session.messages) == 10
                
                # Should contain the most recent 10 messages
                expected_start_index = i - 9  # Most recent 10 messages
                for j, session_msg in enumerate(session.messages):
                    expected_msg = all_messages[expected_start_index + j]
                    assert session_msg.content == expected_msg.content
                    assert session_msg.type == expected_msg.type
                    assert session_msg.confidence == expected_msg.confidence
        
        # Final verification: session should have exactly 10 messages
        assert len(session.messages) == 10
        
        # Verify the 10 messages are the most recent ones
        expected_messages = all_messages[-10:]
        for i, (session_msg, expected_msg) in enumerate(zip(session.messages, expected_messages)):
            assert session_msg.content == expected_msg.content, f"Message {i} content mismatch"
            assert session_msg.type == expected_msg.type, f"Message {i} type mismatch"
            assert session_msg.confidence == expected_msg.confidence, f"Message {i} confidence mismatch"
        
        # Verify message order is preserved (chronological)
        for i in range(1, len(session.messages)):
            assert session.messages[i].timestamp >= session.messages[i-1].timestamp, \
                "Messages should be in chronological order"
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        batch_sizes=lists(integers(min_value=3, max_value=8), min_size=2, max_size=3),
        genres_per_batch=lists(
            lists(text(min_size=1, max_size=10, alphabet='abcdefghijklmnopqrstuvwxyz'), 
                  min_size=1, max_size=3),
            min_size=2, max_size=3
        ),
        movie_ids_per_batch=lists(
            lists(text(min_size=1, max_size=20, alphabet='abcdefghijklmnopqrstuvwxyz0123456789'), 
                  min_size=0, max_size=5),
            min_size=2, max_size=3
        )
    )
    @settings(max_examples=30, deadline=8000, suppress_health_check=[HealthCheck.filter_too_much])
    def test_session_history_pruning_with_complex_data(self, user_id, batch_sizes, 
                                                      genres_per_batch, movie_ids_per_batch):
        """
        Test session history pruning with complex message data including filters and recommendations.
        
        Validates that pruning preserves message integrity and data completeness.
        """
        # Ensure we have enough data
        assume(len(batch_sizes) == len(genres_per_batch) == len(movie_ids_per_batch))
        # Ensure we trigger pruning by having at least 11 messages total
        total_messages = sum(batch_sizes)
        assume(total_messages >= 11)
        
        session = ChatSession(user_id=user_id)
        all_added_messages = []
        
        # Add messages in batches with different characteristics
        message_counter = 0
        for batch_idx, (batch_size, genres, movie_ids) in enumerate(zip(batch_sizes, genres_per_batch, movie_ids_per_batch)):
            for msg_idx in range(batch_size):
                # Alternate between user queries and Trini responses
                if message_counter % 2 == 0:
                    # User query with extracted filters
                    message = ChatMessage(
                        type='user_query',
                        content=f'Batch {batch_idx} Query {msg_idx}: Looking for movies',
                        extracted_filters={
                            'genres': genres,
                            'confidence': 0.7 + (batch_idx * 0.05),
                            'year_range': {'min': 1990 + batch_idx, 'max': 2020 + batch_idx}
                        },
                        confidence=0.7 + (batch_idx * 0.05),
                        timestamp=datetime.utcnow() + timedelta(seconds=message_counter)
                    )
                else:
                    # Trini response with recommendations
                    message = ChatMessage(
                        type='trini_response',
                        content=f'Batch {batch_idx} Response {msg_idx}: Here are recommendations',
                        recommendations=movie_ids,
                        confidence=0.8,
                        timestamp=datetime.utcnow() + timedelta(seconds=message_counter)
                    )
                
                all_added_messages.append(message)
                session.add_message(message)
                message_counter += 1
                
                # Verify pruning behavior at each step
                if message_counter <= 10:
                    assert len(session.messages) == message_counter
                else:
                    assert len(session.messages) == 10
        
        # Final verification
        assert len(session.messages) == 10
        
        # Verify the retained messages are the most recent 10
        expected_recent_messages = all_added_messages[-10:]
        
        for i, (session_msg, expected_msg) in enumerate(zip(session.messages, expected_recent_messages)):
            # Verify basic properties
            assert session_msg.content == expected_msg.content
            assert session_msg.type == expected_msg.type
            assert session_msg.confidence == expected_msg.confidence
            
            # Verify complex data is preserved
            if expected_msg.extracted_filters:
                assert session_msg.extracted_filters is not None
                assert session_msg.extracted_filters['genres'] == expected_msg.extracted_filters['genres']
                assert session_msg.extracted_filters['confidence'] == expected_msg.extracted_filters['confidence']
            
            if expected_msg.recommendations:
                assert session_msg.recommendations == expected_msg.recommendations
        
        # Verify that pruning maintains data integrity for session methods
        recent_genres = session.get_recent_genres(limit=5)
        recent_movies = session.get_recent_movies(limit=10)
        
        # These should only come from the retained messages
        all_retained_genres = []
        all_retained_movies = []
        
        for msg in session.messages:
            if msg.extracted_filters and 'genres' in msg.extracted_filters:
                all_retained_genres.extend(msg.extracted_filters['genres'])
            if msg.recommendations:
                all_retained_movies.extend(msg.recommendations)
        
        # Verify recent genres come from retained messages
        for genre in recent_genres:
            assert genre in all_retained_genres
        
        # Verify recent movies come from retained messages
        for movie_id in recent_movies:
            assert movie_id in all_retained_movies
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        num_messages=integers(min_value=15, max_value=30)
    )
    @settings(max_examples=50, deadline=6000)
    def test_session_history_pruning_with_persistence(self, user_id, num_messages):
        """
        Test that session history pruning works correctly with DynamoDB persistence.
        
        Validates that pruning occurs both in memory and when saving to database.
        """
        assume(num_messages > 10)
        
        # Mock DynamoDB for testing persistence
        with patch('boto3.resource') as mock_boto3_resource:
            # Mock DynamoDB table
            mock_table = Mock()
            mock_resource = Mock()
            mock_resource.Table.return_value = mock_table
            mock_boto3_resource.return_value = mock_resource
            
            # Mock successful put_item response
            mock_table.put_item.return_value = {
                'ResponseMetadata': {'HTTPStatusCode': 200}
            }
            
            # Create session service
            session_service = SessionService('test-table', 'eu-west-1')
            
            # Create session and add many messages
            session = ChatSession(user_id=user_id)
            
            for i in range(num_messages):
                message = ChatMessage(
                    type='user_query' if i % 2 == 0 else 'trini_response',
                    content=f'Message {i}',
                    confidence=0.5 + (i * 0.01),
                    timestamp=datetime.utcnow() + timedelta(seconds=i)
                )
                session.add_message(message)
            
            # Verify in-memory pruning
            assert len(session.messages) == 10
            
            # Test persistence with pruning
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                success = loop.run_until_complete(session_service.save_chat_session(session))
                assert success == True
            finally:
                loop.close()
            
            # Verify that put_item was called
            mock_table.put_item.assert_called_once()
            
            # Verify the saved data has exactly 10 messages
            saved_data = mock_table.put_item.call_args[1]['Item']
            assert len(saved_data['messages']) == 10
            assert saved_data['messageCount'] == 10
            
            # Verify the saved messages are the most recent ones
            expected_start_index = num_messages - 10
            for i, saved_msg in enumerate(saved_data['messages']):
                expected_content = f'Message {expected_start_index + i}'
                assert saved_msg['content'] == expected_content
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        message_intervals=lists(integers(min_value=1, max_value=60), min_size=15, max_size=25)
    )
    @settings(max_examples=30, deadline=7000)
    def test_session_history_pruning_temporal_ordering(self, user_id, message_intervals):
        """
        Test that session history pruning maintains correct temporal ordering.
        
        Validates that the most recent messages by timestamp are retained.
        """
        assume(len(message_intervals) > 10)
        
        session = ChatSession(user_id=user_id)
        base_time = datetime.utcnow()
        
        # Add messages with specific timestamps
        all_messages_with_times = []
        cumulative_seconds = 0
        
        for i, interval in enumerate(message_intervals):
            cumulative_seconds += interval
            timestamp = base_time + timedelta(seconds=cumulative_seconds)
            
            message = ChatMessage(
                type='user_query' if i % 2 == 0 else 'trini_response',
                content=f'Message {i} at {cumulative_seconds}s',
                confidence=0.5,
                timestamp=timestamp
            )
            
            all_messages_with_times.append((message, timestamp))
            session.add_message(message)
        
        # Verify pruning maintains temporal order
        assert len(session.messages) == 10
        
        # Sort all messages by timestamp to find the actual 10 most recent
        all_messages_sorted = sorted(all_messages_with_times, key=lambda x: x[1])
        expected_recent_messages = [msg for msg, _ in all_messages_sorted[-10:]]
        
        # Verify session contains the 10 most recent messages in chronological order
        for i, (session_msg, expected_msg) in enumerate(zip(session.messages, expected_recent_messages)):
            assert session_msg.content == expected_msg.content, f"Message {i} content mismatch"
            assert session_msg.timestamp == expected_msg.timestamp, f"Message {i} timestamp mismatch"
        
        # Verify messages are in chronological order within the session
        for i in range(1, len(session.messages)):
            assert session.messages[i].timestamp >= session.messages[i-1].timestamp, \
                f"Messages {i-1} and {i} are not in chronological order"
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        num_sessions=integers(min_value=2, max_value=3),
        messages_per_session=lists(integers(min_value=11, max_value=13), min_size=2, max_size=3)
    )
    @settings(max_examples=20, deadline=8000, suppress_health_check=[HealthCheck.filter_too_much])
    def test_session_history_pruning_across_multiple_sessions(self, user_id, num_sessions, messages_per_session):
        """
        Test session history pruning behavior across multiple chat sessions.
        
        Validates that each session independently maintains the 10-message limit.
        """
        assume(len(messages_per_session) >= num_sessions)
        # All sessions should have more than 10 messages to test pruning
        messages_to_use = messages_per_session[:num_sessions]
        
        sessions = []
        
        # Create multiple sessions for the same user
        for session_idx in range(num_sessions):
            session = ChatSession(user_id=user_id)
            num_messages = messages_to_use[session_idx]
            
            # Add messages to this session
            for msg_idx in range(num_messages):
                message = ChatMessage(
                    type='user_query' if msg_idx % 2 == 0 else 'trini_response',
                    content=f'Session {session_idx} Message {msg_idx}',
                    confidence=0.6 + (session_idx * 0.1),
                    timestamp=datetime.utcnow() + timedelta(
                        hours=session_idx,  # Different sessions at different times
                        seconds=msg_idx
                    )
                )
                session.add_message(message)
            
            sessions.append(session)
        
        # Verify each session independently maintains 10-message limit
        for session_idx, session in enumerate(sessions):
            assert len(session.messages) == 10, f"Session {session_idx} should have exactly 10 messages"
            
            # Verify each session contains its own most recent messages
            expected_start_idx = messages_to_use[session_idx] - 10
            for msg_idx, message in enumerate(session.messages):
                expected_content = f'Session {session_idx} Message {expected_start_idx + msg_idx}'
                assert message.content == expected_content, \
                    f"Session {session_idx} message {msg_idx} content mismatch"
        
        # Verify sessions are independent (no cross-contamination)
        for i, session_a in enumerate(sessions):
            for j, session_b in enumerate(sessions):
                if i != j:
                    # Messages from different sessions should not appear in each other
                    session_a_contents = {msg.content for msg in session_a.messages}
                    session_b_contents = {msg.content for msg in session_b.messages}
                    
                    # No overlap in message contents between different sessions
                    assert len(session_a_contents.intersection(session_b_contents)) == 0, \
                        f"Sessions {i} and {j} should not share messages"
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        num_messages=integers(min_value=12, max_value=20),
        message_sizes=lists(integers(min_value=1, max_value=1000), min_size=12, max_size=20)
    )
    @settings(max_examples=40, deadline=6000)
    def test_session_history_pruning_preserves_message_integrity(self, user_id, num_messages, message_sizes):
        """
        Test that session history pruning preserves complete message integrity.
        
        Validates that all message fields are correctly preserved during pruning.
        """
        assume(len(message_sizes) >= num_messages)
        assume(num_messages > 10)
        
        session = ChatSession(user_id=user_id)
        all_messages = []
        
        # Create messages with varying complexity
        for i in range(num_messages):
            # Create complex extracted filters
            extracted_filters = {
                'genres': [f'genre_{i}_{j}' for j in range(min(3, message_sizes[i] % 5 + 1))],
                'confidence': 0.5 + (i * 0.02),
                'year_range': {'min': 1990 + i, 'max': 2020 + i},
                'rating_min': 5.0 + (i % 5),
                'keywords': [f'keyword_{i}_{k}' for k in range(message_sizes[i] % 3 + 1)]
            }
            
            # Create recommendations
            recommendations = [f'movie_{i}_{r}' for r in range(message_sizes[i] % 4 + 1)]
            
            message = ChatMessage(
                type='user_query' if i % 2 == 0 else 'trini_response',
                content=f'Complex message {i} with {message_sizes[i]} size indicator',
                extracted_filters=extracted_filters if i % 2 == 0 else None,
                recommendations=recommendations if i % 2 == 1 else None,
                confidence=0.6 + (i * 0.01),
                timestamp=datetime.utcnow() + timedelta(seconds=i)
            )
            
            all_messages.append(message)
            session.add_message(message)
        
        # Verify pruning occurred
        assert len(session.messages) == 10
        
        # Verify complete message integrity for retained messages
        expected_messages = all_messages[-10:]
        
        for i, (session_msg, expected_msg) in enumerate(zip(session.messages, expected_messages)):
            # Basic fields
            assert session_msg.message_id == expected_msg.message_id
            assert session_msg.type == expected_msg.type
            assert session_msg.content == expected_msg.content
            assert session_msg.confidence == expected_msg.confidence
            assert session_msg.timestamp == expected_msg.timestamp
            
            # Complex fields
            if expected_msg.extracted_filters:
                assert session_msg.extracted_filters is not None
                assert session_msg.extracted_filters['genres'] == expected_msg.extracted_filters['genres']
                assert session_msg.extracted_filters['confidence'] == expected_msg.extracted_filters['confidence']
                assert session_msg.extracted_filters['year_range'] == expected_msg.extracted_filters['year_range']
                assert session_msg.extracted_filters['rating_min'] == expected_msg.extracted_filters['rating_min']
                assert session_msg.extracted_filters['keywords'] == expected_msg.extracted_filters['keywords']
            else:
                assert session_msg.extracted_filters is None
            
            if expected_msg.recommendations:
                assert session_msg.recommendations == expected_msg.recommendations
            else:
                assert session_msg.recommendations == [] or session_msg.recommendations is None
        
        # Verify session-level methods work correctly with pruned data
        recent_genres = session.get_recent_genres(limit=5)
        recent_movies = session.get_recent_movies(limit=10)
        
        # These should only reflect the retained messages
        expected_genres = []
        expected_movies = []
        
        for msg in session.messages:
            if msg.extracted_filters and 'genres' in msg.extracted_filters:
                expected_genres.extend(msg.extracted_filters['genres'])
            if msg.recommendations:
                expected_movies.extend(msg.recommendations)
        
        # The session methods apply their own deduplication and limiting
        # So we just verify that returned items come from the retained messages
        for genre in recent_genres:
            assert genre in expected_genres, f"Genre {genre} not found in retained messages"
        
        for movie_id in recent_movies:
            assert movie_id in expected_movies, f"Movie {movie_id} not found in retained messages"
    
    @given(
        user_id=text(min_size=1, max_size=50, alphabet='abcdefghijklmnopqrstuvwxyz0123456789-'),
        num_messages_under_limit=integers(min_value=1, max_value=10),
        num_messages_over_limit=integers(min_value=11, max_value=25)
    )
    @settings(max_examples=50, deadline=5000)
    def test_session_history_pruning_boundary_conditions(self, user_id, num_messages_under_limit, num_messages_over_limit):
        """
        Test session history pruning at boundary conditions.
        
        Validates correct behavior at exactly 10 messages and around the limit.
        """
        # Test 1: Messages under the limit should all be preserved
        session_under = ChatSession(user_id=user_id)
        
        for i in range(num_messages_under_limit):
            message = ChatMessage(
                type='user_query' if i % 2 == 0 else 'trini_response',
                content=f'Under limit message {i}',
                confidence=0.5
            )
            session_under.add_message(message)
        
        # All messages should be preserved when under limit
        assert len(session_under.messages) == num_messages_under_limit
        
        for i, message in enumerate(session_under.messages):
            assert message.content == f'Under limit message {i}'
        
        # Test 2: Messages over the limit should be pruned to 10
        session_over = ChatSession(user_id=user_id)
        
        for i in range(num_messages_over_limit):
            message = ChatMessage(
                type='user_query' if i % 2 == 0 else 'trini_response',
                content=f'Over limit message {i}',
                confidence=0.5
            )
            session_over.add_message(message)
        
        # Should be pruned to exactly 10 messages
        assert len(session_over.messages) == 10
        
        # Should contain the last 10 messages
        expected_start = num_messages_over_limit - 10
        for i, message in enumerate(session_over.messages):
            expected_content = f'Over limit message {expected_start + i}'
            assert message.content == expected_content
        
        # Test 3: Exactly 10 messages should all be preserved
        session_exact = ChatSession(user_id=user_id)
        
        for i in range(10):
            message = ChatMessage(
                type='user_query' if i % 2 == 0 else 'trini_response',
                content=f'Exact limit message {i}',
                confidence=0.5
            )
            session_exact.add_message(message)
        
        # All 10 messages should be preserved
        assert len(session_exact.messages) == 10
        
        for i, message in enumerate(session_exact.messages):
            assert message.content == f'Exact limit message {i}'
        
        # Test 4: Adding one more message to the exact limit should trigger pruning
        additional_message = ChatMessage(
            type='trini_response',
            content='Additional message',
            confidence=0.5
        )
        session_exact.add_message(additional_message)
        
        # Should still have exactly 10 messages
        assert len(session_exact.messages) == 10
        
        # First message should now be "Exact limit message 1" (original message 0 was pruned)
        assert session_exact.messages[0].content == 'Exact limit message 1'
        
        # Last message should be the additional message
        assert session_exact.messages[-1].content == 'Additional message'


if __name__ == "__main__":
    # Run property tests
    pytest.main([__file__, "-v", "--tb=short"])