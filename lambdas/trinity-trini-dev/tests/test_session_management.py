"""
Test session management functionality for Trini chatbot.

Tests the save_chat_session() and get_user_context() functions
as required by task 5.2.
"""

import pytest
import asyncio
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, AsyncMock
import boto3
from moto import mock_aws

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.session_service import SessionService
from models.chat_session import ChatSession, ChatMessage
from models.user_context import UserContext
from models.extracted_filters import ExtractedFilters


class TestSessionManagement:
    """Test session persistence and retrieval functionality."""
    
    @pytest.fixture
    def mock_table_name(self):
        """Mock table name for testing."""
        return 'test-trinity-chat-sessions-dev'
    
    @pytest.fixture
    def mock_region(self):
        """Mock AWS region for testing."""
        return 'eu-west-1'
    
    @pytest.fixture
    def sample_user_id(self):
        """Sample user ID for testing."""
        return 'test-user-123'
    
    @pytest.fixture
    def sample_chat_session(self, sample_user_id):
        """Create a sample chat session for testing."""
        session = ChatSession(user_id=sample_user_id)
        
        # Add some sample messages
        user_message = ChatMessage(
            type='user_query',
            content='Quiero películas de acción de los 90',
            extracted_filters={
                'genres': ['28'],  # Action
                'year_range': {'min': 1990, 'max': 1999},
                'confidence': 0.8
            },
            confidence=0.8
        )
        
        trini_message = ChatMessage(
            type='trini_response',
            content='Te recomiendo estas películas de acción de los 90',
            recommendations=['123', '456', '789'],
            confidence=0.8
        )
        
        session.add_message(user_message)
        session.add_message(trini_message)
        
        return session
    
    @mock_aws
    def test_save_chat_session_success(self, mock_table_name, mock_region, sample_chat_session):
        """Test successful chat session saving."""
        # Create mock DynamoDB table
        dynamodb = boto3.resource('dynamodb', region_name=mock_region)
        table = dynamodb.create_table(
            TableName=mock_table_name,
            KeySchema=[
                {'AttributeName': 'sessionId', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'sessionId', 'AttributeType': 'S'},
                {'AttributeName': 'userId', 'AttributeType': 'S'},
                {'AttributeName': 'createdAt', 'AttributeType': 'S'}
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'userId-index',
                    'KeySchema': [
                        {'AttributeName': 'userId', 'KeyType': 'HASH'},
                        {'AttributeName': 'createdAt', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                }
            ],
            BillingMode='PROVISIONED',
            ProvisionedThroughput={'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
        )
        
        # Initialize session service
        session_service = SessionService(mock_table_name, mock_region)
        
        # Test saving session
        async def run_test():
            result = await session_service.save_chat_session(sample_chat_session)
            assert result is True
            
            # Verify session was saved
            response = table.get_item(Key={'sessionId': sample_chat_session.session_id})
            assert 'Item' in response
            
            saved_item = response['Item']
            assert saved_item['userId'] == sample_chat_session.user_id
            assert saved_item['messageCount'] == len(sample_chat_session.messages)
            assert len(saved_item['messages']) == 2
        
        asyncio.run(run_test())
    
    @mock_aws
    def test_get_user_context_with_history(self, mock_table_name, mock_region, sample_user_id):
        """Test user context retrieval with existing chat history."""
        # Create mock DynamoDB table
        dynamodb = boto3.resource('dynamodb', region_name=mock_region)
        table = dynamodb.create_table(
            TableName=mock_table_name,
            KeySchema=[
                {'AttributeName': 'sessionId', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'sessionId', 'AttributeType': 'S'},
                {'AttributeName': 'userId', 'AttributeType': 'S'},
                {'AttributeName': 'createdAt', 'AttributeType': 'S'}
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'userId-index',
                    'KeySchema': [
                        {'AttributeName': 'userId', 'KeyType': 'HASH'},
                        {'AttributeName': 'createdAt', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                }
            ],
            BillingMode='PROVISIONED',
            ProvisionedThroughput={'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
        )
        
        # Create and save multiple sessions with different preferences
        session_service = SessionService(mock_table_name, mock_region)
        
        async def run_test():
            # Create sessions with different genre preferences
            for i, genres in enumerate([['28'], ['35'], ['28', '12']]):  # Action, Comedy, Action+Adventure
                session = ChatSession(user_id=sample_user_id)
                
                message = ChatMessage(
                    type='user_query',
                    content=f'Test query {i}',
                    extracted_filters={
                        'genres': genres,
                        'rating_min': 7.0 + i * 0.5,
                        'confidence': 0.8
                    },
                    confidence=0.8
                )
                
                session.add_message(message)
                await session_service.save_chat_session(session)
            
            # Test user context retrieval
            user_context = await session_service.get_user_context(sample_user_id)
            
            # Verify context was inferred correctly
            assert user_context.user_id == sample_user_id
            assert len(user_context.preferred_genres) > 0
            assert '28' in user_context.preferred_genres  # Action should be most frequent
            assert user_context.rating_preference is not None
            assert user_context.rating_preference >= 7.0
        
        asyncio.run(run_test())
    
    @mock_aws
    def test_get_user_context_no_history(self, mock_table_name, mock_region, sample_user_id):
        """Test user context retrieval with no existing history."""
        # Create mock DynamoDB table
        dynamodb = boto3.resource('dynamodb', region_name=mock_region)
        table = dynamodb.create_table(
            TableName=mock_table_name,
            KeySchema=[
                {'AttributeName': 'sessionId', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'sessionId', 'AttributeType': 'S'},
                {'AttributeName': 'userId', 'AttributeType': 'S'},
                {'AttributeName': 'createdAt', 'AttributeType': 'S'}
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'userId-index',
                    'KeySchema': [
                        {'AttributeName': 'userId', 'KeyType': 'HASH'},
                        {'AttributeName': 'createdAt', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                }
            ],
            BillingMode='PROVISIONED',
            ProvisionedThroughput={'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
        )
        
        session_service = SessionService(mock_table_name, mock_region)
        
        async def run_test():
            # Test user context retrieval for new user
            user_context = await session_service.get_user_context(sample_user_id)
            
            # Verify empty context
            assert user_context.user_id == sample_user_id
            assert len(user_context.preferred_genres) == 0
            assert len(user_context.recent_movies) == 0
            assert user_context.rating_preference is None
        
        asyncio.run(run_test())
    
    @mock_aws
    def test_session_history_limit(self, mock_table_name, mock_region, sample_user_id):
        """Test that sessions maintain only last 10 messages."""
        # Create mock DynamoDB table
        dynamodb = boto3.resource('dynamodb', region_name=mock_region)
        table = dynamodb.create_table(
            TableName=mock_table_name,
            KeySchema=[
                {'AttributeName': 'sessionId', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'sessionId', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        
        session_service = SessionService(mock_table_name, mock_region)
        
        async def run_test():
            # Create session with more than 10 messages
            session = ChatSession(user_id=sample_user_id)
            
            # Add 15 messages
            for i in range(15):
                message = ChatMessage(
                    type='user_query' if i % 2 == 0 else 'trini_response',
                    content=f'Message {i}',
                    confidence=0.8
                )
                session.add_message(message)
            
            # Verify session automatically trims to 10 messages
            assert len(session.messages) == 10
            
            # Save session
            result = await session_service.save_chat_session(session)
            assert result is True
            
            # Retrieve and verify
            retrieved_session = await session_service.get_chat_session(session.session_id)
            assert retrieved_session is not None
            assert len(retrieved_session.messages) == 10
            
            # Verify it kept the last 10 messages
            assert retrieved_session.messages[0].content == 'Message 5'  # Should start from message 5
            assert retrieved_session.messages[-1].content == 'Message 14'  # Should end with message 14
        
        asyncio.run(run_test())
    
    def test_user_preference_inference(self, sample_user_id):
        """Test user preference inference from chat history."""
        # Create session service (no DynamoDB needed for this test)
        session_service = SessionService('test-table', 'eu-west-1')
        
        # Create mock sessions with different preferences
        sessions = []
        
        # Session 1: Action movies, high rating
        session1 = ChatSession(user_id=sample_user_id)
        message1 = ChatMessage(
            type='user_query',
            content='Action movies',
            extracted_filters={
                'genres': ['28'],  # Action
                'rating_min': 8.0,
                'year_range': {'min': 2000, 'max': 2010}
            }
        )
        session1.add_message(message1)
        sessions.append(session1)
        
        # Session 2: Comedy movies, medium rating
        session2 = ChatSession(user_id=sample_user_id)
        message2 = ChatMessage(
            type='user_query',
            content='Comedy movies',
            extracted_filters={
                'genres': ['35'],  # Comedy
                'rating_min': 7.0,
                'year_range': {'min': 1990, 'max': 2000}
            }
        )
        session2.add_message(message2)
        sessions.append(session2)
        
        # Session 3: Action again (should increase preference)
        session3 = ChatSession(user_id=sample_user_id)
        message3 = ChatMessage(
            type='user_query',
            content='More action',
            extracted_filters={
                'genres': ['28'],  # Action again
                'rating_min': 7.5
            }
        )
        session3.add_message(message3)
        sessions.append(session3)
        
        # Test preference inference
        user_context = UserContext(user_id=sample_user_id)
        session_service._infer_user_preferences(user_context, sessions)
        
        # Verify inferred preferences
        assert '28' in user_context.preferred_genres  # Action should be preferred (appears twice)
        assert '35' in user_context.preferred_genres  # Comedy should also be preferred
        assert user_context.preferred_genres[0] == '28'  # Action should be first (most frequent)
        
        assert user_context.rating_preference is not None
        assert 7.0 <= user_context.rating_preference <= 8.0  # Should be average of ratings
        
        assert len(user_context.preferred_decades) > 0
        assert '2000s' in user_context.preferred_decades or '1990s' in user_context.preferred_decades


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])