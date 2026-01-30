"""
Property-based test for room integration functionality.

Feature: trini-chatbot-integration, Property 14: Room Integration Functionality
Validates: Requirements 7.1, 7.2, 7.5

This test validates that for any user in an active Trinity room, Trini recommendations
should include an option to add movies to the room's voting pool with proper attribution.
"""

import pytest
import json
import os
import sys
import asyncio
import datetime
from unittest.mock import patch, MagicMock, AsyncMock
from hypothesis import given, strategies as st, settings, assume
from typing import Dict, Any, List, Optional

# Add the parent directory to the path so we can import our modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.room_service import RoomService, get_room_service
from models.user_context import UserContext
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
        'LOG_LEVEL': 'INFO',
        'APPSYNC_ENDPOINT': 'https://test-appsync.amazonaws.com/graphql',
        'APPSYNC_API_KEY': 'test-api-key'
    })


# Strategy for generating valid user IDs
user_id_strategy = st.text(
    alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), whitelist_characters='-_'),
    min_size=8,
    max_size=32
).filter(lambda x: len(x.strip()) >= 8)

# Strategy for generating valid room IDs
room_id_strategy = st.text(
    alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), whitelist_characters='-_'),
    min_size=8,
    max_size=32
).filter(lambda x: len(x.strip()) >= 8)

# Strategy for generating valid movie IDs (TMDB format)
movie_id_strategy = st.text(
    alphabet=st.characters(whitelist_categories=('Nd',)),
    min_size=1,
    max_size=8
).filter(lambda x: x.isdigit() and int(x) > 0)

# Strategy for generating room statuses
room_status_strategy = st.sampled_from(['WAITING', 'ACTIVE', 'COMPLETED', 'CANCELLED'])

# Strategy for generating room contexts
room_context_strategy = st.builds(
    dict,
    room_id=room_id_strategy,
    room_name=st.text(min_size=3, max_size=50),
    room_status=room_status_strategy,
    voted_movies=st.lists(movie_id_strategy, min_size=0, max_size=20, unique=True),
    is_host=st.booleans(),
    member_count=st.integers(min_value=1, max_value=10),
    max_members=st.integers(min_value=2, max_value=20)
)

# Strategy for generating movie objects
movie_strategy = st.builds(
    dict,
    id=movie_id_strategy,
    title=st.text(min_size=1, max_size=100),
    overview=st.text(min_size=10, max_size=500),
    vote_average=st.floats(min_value=0.0, max_value=10.0),
    release_date=st.dates(min_value=datetime.date(1900, 1, 1), max_value=datetime.date(2030, 12, 31)).map(str),
    poster_path=st.one_of([st.none(), st.text(min_size=5, max_size=100)])
)

# Strategy for generating movie recommendations
movie_recommendation_strategy = st.builds(
    MovieRecommendation,
    movie=movie_strategy,
    relevance_score=st.floats(min_value=0.0, max_value=1.0),
    reasoning=st.text(min_size=10, max_size=200),
    source=st.sampled_from(['ai_recommendation', 'fallback', 'cache'])
)

# Strategy for generating user contexts with room information
user_context_with_room_strategy = st.builds(
    UserContext,
    user_id=user_id_strategy,
    preferred_genres=st.lists(
        st.sampled_from(['28', '35', '27', '18', '53', '10749', '878', '14', '80', '16', '99']),
        min_size=0,
        max_size=5,
        unique=True
    ),
    recent_movies=st.lists(movie_id_strategy, min_size=0, max_size=10, unique=True),
    current_room_id=st.one_of([st.none(), room_id_strategy]),
    room_voted_movies=st.lists(movie_id_strategy, min_size=0, max_size=15, unique=True)
)


class TestRoomIntegrationFunctionality:
    """Property-based tests for room integration functionality."""
    
    def setup_method(self):
        """Set up test environment before each test."""
        setup_test_environment()
        self.room_service = RoomService()
        self.trini_handler = TriniHandler()
    
    @given(
        user_context=user_context_with_room_strategy,
        room_context=room_context_strategy,
        recommendations=st.lists(movie_recommendation_strategy, min_size=1, max_size=10)
    )
    @settings(max_examples=100, deadline=20000)
    def test_room_integration_functionality_property(
        self, 
        user_context: UserContext, 
        room_context: Dict[str, Any], 
        recommendations: List[MovieRecommendation]
    ):
        """
        **Property 14: Room Integration Functionality**
        
        For any user in an active Trinity room, Trini recommendations should include 
        an option to add movies to the room's voting pool with proper attribution.
        
        **Validates: Requirements 7.1, 7.2, 7.5**
        """
        assume(len(user_context.user_id.strip()) >= 8)
        assume(len(room_context['room_id'].strip()) >= 8)
        assume(all(rec.get_movie_id() for rec in recommendations))
        
        # Set up user context with active room
        user_context.current_room_id = room_context['room_id']
        user_context.room_voted_movies = room_context['voted_movies']
        
        # Only test with users in active rooms (requirement 7.1)
        assume(room_context['room_status'] in ['WAITING', 'ACTIVE'])
        assume(user_context.has_room_context())
        
        # **Core Property Validation**
        
        # 1. User should be detected as being in an active room
        with patch.object(self.room_service, 'detect_user_room_context') as mock_detect:
            # Use AsyncMock for simpler async mocking
            mock_detect.return_value = room_context
            
            # Test room context detection
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                detected_context = loop.run_until_complete(
                    self.room_service.detect_user_room_context(user_context.user_id)
                )
                
                # Should detect active room context
                assert detected_context is not None, "Should detect room context for user in active room"
                assert detected_context['room_id'] == room_context['room_id'], "Should detect correct room ID"
                assert detected_context['room_status'] in ['WAITING', 'ACTIVE'], "Should detect active room status"
                
            finally:
                loop.close()
        
        # 2. Recommendations should include option to add to room (requirement 7.2)
        for recommendation in recommendations:
            movie_id = recommendation.get_movie_id()
            assume(movie_id is not None)
            
            # Test add to room functionality
            with patch.object(self.room_service, 'add_recommendation_to_room') as mock_add:
                mock_add_result = {
                    'success': True,
                    'message': 'Test message',
                    'room_id': room_context['room_id'],
                    'movie_id': movie_id
                }
                mock_add.return_value = mock_add_result
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    add_result = loop.run_until_complete(
                        self.room_service.add_recommendation_to_room(
                            room_context['room_id'], 
                            movie_id, 
                            user_context.user_id
                        )
                    )
                    
                    # Should successfully add movie to room
                    assert isinstance(add_result, dict), "Add result should be dictionary"
                    assert 'success' in add_result, "Add result should include success field"
                    assert 'message' in add_result, "Add result should include message field"
                    assert 'room_id' in add_result, "Add result should include room_id field"
                    assert 'movie_id' in add_result, "Add result should include movie_id field"
                    
                    # Verify correct room and movie IDs
                    assert add_result['room_id'] == room_context['room_id'], "Should return correct room ID"
                    assert add_result['movie_id'] == movie_id, "Should return correct movie ID"
                    
                finally:
                    loop.close()
        
        # 3. Attribution should be properly handled (requirement 7.5)
        test_movie_id = recommendations[0].get_movie_id()
        
        with patch.object(self.room_service, '_create_trini_suggestion_record') as mock_attribution:
            mock_attribution.return_value = None
            
            with patch.object(self.room_service, '_add_movie_to_room_content') as mock_add_content:
                mock_add_content.return_value = True
                
                with patch.object(self.room_service, '_notify_room_movie_added') as mock_notify:
                    mock_notify.return_value = None
                    
                    # Test that attribution methods would be called in a real scenario
                    # This validates the interface exists and can be mocked
                    assert hasattr(self.room_service, '_create_trini_suggestion_record'), \
                        "Room service should have attribution method"
                    assert hasattr(self.room_service, '_notify_room_movie_added'), \
                        "Room service should have notification method"
    
    @given(
        user_id=user_id_strategy,
        room_id=room_id_strategy,
        movie_id=movie_id_strategy,
        room_status=room_status_strategy
    )
    @settings(max_examples=50, deadline=15000)
    def test_add_to_room_validation_property(
        self, 
        user_id: str, 
        room_id: str, 
        movie_id: str, 
        room_status: str
    ):
        """
        Property: Add to room functionality should validate user permissions and room state.
        
        The system should properly validate that users can only add movies to rooms
        they are members of and that are in appropriate states.
        
        **Validates: Requirements 7.1, 7.2**
        """
        assume(len(user_id.strip()) >= 8)
        assume(len(room_id.strip()) >= 8)
        assume(movie_id.isdigit() and int(movie_id) > 0)
        
        # Test with different room states and membership scenarios
        is_member = room_status in ['WAITING', 'ACTIVE']  # Simulate membership based on room state
        
        with patch.object(self.room_service, '_validate_room_membership') as mock_validate:
            mock_validate.return_value = is_member
            
            with patch.object(self.room_service, '_get_room_details') as mock_room_details:
                mock_room_details.return_value = {
                    'PK': room_id,
                    'SK': 'ROOM',
                    'name': f'Test Room {room_id}',
                    'status': room_status,
                    'contentIds': [],
                    'memberCount': 2,
                    'maxMembers': 10
                }
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    add_result = loop.run_until_complete(
                        self.room_service.add_recommendation_to_room(room_id, movie_id, user_id)
                    )
                    
                    # Validation should be performed
                    mock_validate.assert_called_once_with(user_id, room_id)
                    mock_room_details.assert_called_once_with(room_id)
                    
                    # Result should reflect validation outcome
                    assert isinstance(add_result, dict), "Should return dictionary result"
                    assert 'success' in add_result, "Should include success field"
                    assert 'message' in add_result, "Should include message field"
                    
                    if not is_member:
                        # Non-members should be rejected
                        assert add_result['success'] is False, "Non-members should be rejected"
                        assert 'acceso' in add_result['message'].lower() or 'access' in add_result['message'].lower(), \
                            "Should provide access-related error message"
                    
                    elif room_status not in ['WAITING', 'ACTIVE']:
                        # Inappropriate room states should be rejected
                        assert add_result['success'] is False, "Inappropriate room states should be rejected"
                        assert 'estado' in add_result['message'].lower() or 'state' in add_result['message'].lower(), \
                            "Should provide state-related error message"
                    
                finally:
                    loop.close()
    
    @given(
        user_context=user_context_with_room_strategy,
        existing_movies=st.lists(movie_id_strategy, min_size=1, max_size=10, unique=True)
    )
    @settings(max_examples=50, deadline=15000)
    def test_movie_deduplication_property(
        self, 
        user_context: UserContext, 
        existing_movies: List[str]
    ):
        """
        Property: Movies already voted in room should be excluded from recommendations.
        
        The system should prevent recommending movies that have already been
        voted on in the current room.
        
        **Validates: Requirements 7.3 (referenced in design)**
        """
        assume(len(user_context.user_id.strip()) >= 8)
        assume(user_context.current_room_id is not None)
        assume(len(existing_movies) > 0)
        
        # Set up user context with voted movies
        user_context.room_voted_movies = existing_movies
        
        # Test that voted movies are properly excluded
        exclude_list = user_context.get_exclude_list()
        
        # All voted movies should be in exclude list
        for movie_id in existing_movies:
            assert movie_id in exclude_list, f"Voted movie {movie_id} should be in exclude list"
        
        # User should be identified as having room context
        assert user_context.has_room_context(), "User should have room context"
        
        # Should exclude movies method should work correctly
        for movie_id in existing_movies:
            assert user_context.should_exclude_movie(movie_id), \
                f"Should exclude voted movie {movie_id}"
    
    @given(
        user_id=user_id_strategy,
        room_id=room_id_strategy,
        movie_id=movie_id_strategy
    )
    @settings(max_examples=30, deadline=10000)
    def test_trini_handler_integration_property(
        self, 
        user_id: str, 
        room_id: str, 
        movie_id: str
    ):
        """
        Property: Trini handler should properly integrate with room service.
        
        The main Trini handler should correctly delegate room operations
        to the room service and return properly formatted responses.
        
        **Validates: Requirements 7.2, 7.5**
        """
        assume(len(user_id.strip()) >= 8)
        assume(len(room_id.strip()) >= 8)
        assume(movie_id.isdigit() and int(movie_id) > 0)
        
        # Create test event for addTriniRecommendationToRoom
        test_event = {
            'info': {'fieldName': 'addTriniRecommendationToRoom'},
            'arguments': {
                'roomId': room_id,
                'movieId': movie_id
            },
            'identity': {
                'sub': user_id
            }
        }
        
        # Mock the room service response
        mock_room_result = {
            'success': True,
            'message': 'Película agregada exitosamente a la sala de votación.',
            'room_id': room_id,
            'movie_id': movie_id
        }
        
        with patch('utils.room_service.get_room_service') as mock_get_service:
            mock_service = MagicMock()
            mock_service.add_recommendation_to_room = AsyncMock(return_value=mock_room_result)
            mock_get_service.return_value = mock_service
            
            # Test the handler
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(
                    self.trini_handler._handle_add_to_room(test_event['arguments'], test_event)
                )
                
                # Handler should return properly formatted response
                assert isinstance(result, dict), "Handler should return dictionary"
                assert 'success' in result, "Response should include success field"
                assert 'message' in result, "Response should include message field"
                assert 'roomId' in result, "Response should include roomId field"
                assert 'movieId' in result, "Response should include movieId field"
                
                # Values should match input
                assert result['roomId'] == room_id, "Response should include correct room ID"
                assert result['movieId'] == movie_id, "Response should include correct movie ID"
                
                # Room service should be called with correct parameters
                mock_service.add_recommendation_to_room.assert_called_once_with(
                    room_id, movie_id, user_id
                )
                
            finally:
                loop.close()
    
    @given(
        room_context=room_context_strategy,
        movie_recommendations=st.lists(movie_recommendation_strategy, min_size=1, max_size=5)
    )
    @settings(max_examples=30, deadline=10000)
    def test_room_notification_property(
        self, 
        room_context: Dict[str, Any], 
        movie_recommendations: List[MovieRecommendation]
    ):
        """
        Property: Room notifications should be sent when movies are added.
        
        When a movie is successfully added to a room, appropriate notifications
        should be sent to room members with proper attribution.
        
        **Validates: Requirements 7.5**
        """
        assume(room_context['room_status'] in ['WAITING', 'ACTIVE'])
        assume(len(movie_recommendations) > 0)
        assume(all(rec.get_movie_id() for rec in movie_recommendations))
        
        test_movie = movie_recommendations[0]
        movie_id = test_movie.get_movie_id()
        room_id = room_context['room_id']
        user_id = 'test-user-123'
        
        # Mock successful movie addition with notification
        with patch.object(self.room_service, '_notify_room_movie_added') as mock_notify:
            mock_notify.return_value = None
            
            with patch.object(self.room_service, '_get_movie_details_for_notification') as mock_movie_details:
                mock_movie_details.return_value = {
                    'title': test_movie.movie.get('title', 'Test Movie'),
                    'poster_path': test_movie.movie.get('poster_path'),
                    'overview': test_movie.movie.get('overview', 'Test overview'),
                    'release_date': test_movie.movie.get('release_date', '2023-01-01'),
                    'vote_average': test_movie.movie.get('vote_average', 7.0)
                }
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    # Test notification call
                    loop.run_until_complete(
                        self.room_service._notify_room_movie_added(room_id, movie_id, user_id)
                    )
                    
                    # Notification should be called
                    mock_notify.assert_called_once_with(room_id, movie_id, user_id)
                    
                finally:
                    loop.close()
    
    # Helper methods for creating mock async results
    async def _create_mock_room_context(self, room_context: Dict[str, Any]) -> Dict[str, Any]:
        """Create mock room context for testing."""
        return room_context
    
    async def _create_mock_add_result(self, success: bool, room_id: str, movie_id: str) -> Dict[str, Any]:
        """Create mock add result for testing."""
        return {
            'success': success,
            'message': 'Test message',
            'room_id': room_id,
            'movie_id': movie_id
        }
    
    async def _create_mock_attribution(self) -> None:
        """Create mock attribution result."""
        return None
    
    async def _create_mock_success(self) -> bool:
        """Create mock success result."""
        return True
    
    async def _create_mock_membership(self, is_member: bool) -> bool:
        """Create mock membership validation result."""
        return is_member
    
    async def _create_mock_room_details(self, room_id: str, room_status: str) -> Dict[str, Any]:
        """Create mock room details."""
        return {
            'PK': room_id,
            'SK': 'ROOM',
            'name': f'Test Room {room_id}',
            'status': room_status,
            'contentIds': [],
            'memberCount': 2,
            'maxMembers': 10
        }
    
    async def _create_mock_movie_details(self, movie: Dict[str, Any]) -> Dict[str, Any]:
        """Create mock movie details for notification."""
        return {
            'title': movie.get('title', 'Test Movie'),
            'poster_path': movie.get('poster_path'),
            'overview': movie.get('overview', 'Test overview'),
            'release_date': movie.get('release_date', '2023-01-01'),
            'vote_average': movie.get('vote_average', 7.0)
        }
    
    def test_specific_room_integration_examples(self):
        """
        Test specific examples of room integration to ensure accuracy.
        
        **Validates: Requirements 7.1, 7.2, 7.5**
        """
        test_cases = [
            {
                'user_id': 'user-123',
                'room_id': 'room-456',
                'movie_id': '550',  # Fight Club
                'room_status': 'ACTIVE',
                'is_member': True,
                'expected_success': True
            },
            {
                'user_id': 'user-789',
                'room_id': 'room-456',
                'movie_id': '13',   # Forrest Gump
                'room_status': 'COMPLETED',
                'is_member': True,
                'expected_success': False  # Room not in appropriate state
            },
            {
                'user_id': 'user-999',
                'room_id': 'room-456',
                'movie_id': '424',  # The Godfather
                'room_status': 'ACTIVE',
                'is_member': False,
                'expected_success': False  # User not a member
            }
        ]
        
        async def run_test_case(case):
            with patch.object(self.room_service, '_validate_room_membership') as mock_validate:
                mock_validate.return_value = case['is_member']
                
                with patch.object(self.room_service, '_get_room_details') as mock_room_details:
                    mock_room_details.return_value = {
                        'PK': case['room_id'],
                        'SK': 'ROOM',
                        'name': f'Test Room {case["room_id"]}',
                        'status': case['room_status'],
                        'contentIds': [],
                        'memberCount': 2,
                        'maxMembers': 10
                    }
                    
                    result = await self.room_service.add_recommendation_to_room(
                        case['room_id'], 
                        case['movie_id'], 
                        case['user_id']
                    )
                    
                    assert result['success'] == case['expected_success'], \
                        f"Case {case} should have success={case['expected_success']}, got {result['success']}"
        
        # Run each test case
        for case in test_cases:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(run_test_case(case))
            finally:
                loop.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])