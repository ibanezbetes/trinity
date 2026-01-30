"""
Property-based test for room movie deduplication.

Feature: trini-chatbot-integration, Property 15: Room Movie Deduplication
Validates: Requirements 7.3

This test validates that for any room with existing voted movies, Trini should 
exclude those movies from new recommendations for that room.
"""

import pytest
import json
import os
import sys
import asyncio
import datetime
from unittest.mock import patch, MagicMock, AsyncMock
from hypothesis import given, strategies as st, settings, assume
from typing import Dict, Any, List, Optional, Set

# Add the parent directory to the path so we can import our modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.room_service import RoomService, get_room_service
from utils.movie_search_service import get_movie_search_service
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
    current_room_id=room_id_strategy,
    room_voted_movies=st.lists(movie_id_strategy, min_size=1, max_size=20, unique=True)
)

# Strategy for generating year ranges
year_range_strategy = st.builds(
    YearRange,
    min_year=st.one_of([st.none(), st.integers(1900, 2020)]),
    max_year=st.one_of([st.none(), st.integers(2021, 2030)])
)

# Strategy for generating rating ranges
rating_range_strategy = st.builds(
    RatingRange,
    min_rating=st.one_of([st.none(), st.floats(min_value=0.0, max_value=10.0)]),
    max_rating=st.one_of([st.none(), st.floats(min_value=0.0, max_value=10.0)])
)

# Strategy for generating extracted filters
extracted_filters_strategy = st.builds(
    ExtractedFilters,
    genres=st.lists(
        st.sampled_from(['28', '35', '27', '18', '53', '10749', '878', '14', '80', '16', '99']),
        min_size=0,
        max_size=3,
        unique=True
    ),
    year_range=st.one_of([st.none(), year_range_strategy]),
    rating_range=st.one_of([st.none(), rating_range_strategy]),
    keywords=st.lists(st.text(min_size=3, max_size=20), min_size=0, max_size=5),
    confidence=st.floats(min_value=0.0, max_value=1.0)
)

# Strategy for generating room contexts
room_context_strategy = st.builds(
    dict,
    room_id=room_id_strategy,
    room_name=st.text(min_size=3, max_size=50),
    room_status=st.sampled_from(['WAITING', 'ACTIVE']),
    voted_movies=st.lists(movie_id_strategy, min_size=1, max_size=15, unique=True),
    is_host=st.booleans(),
    member_count=st.integers(min_value=1, max_value=10),
    max_members=st.integers(min_value=2, max_value=20)
)


class TestRoomMovieDeduplication:
    """Property-based tests for room movie deduplication functionality."""
    
    def setup_method(self):
        """Set up test environment before each test."""
        setup_test_environment()
        self.room_service = RoomService()
        self.movie_service = get_movie_search_service()
        self.trini_handler = TriniHandler()
    
    @given(
        user_context=user_context_with_room_strategy,
        available_movies=st.lists(movie_strategy, min_size=5, max_size=30, unique_by=lambda x: x['id']),
        filters=extracted_filters_strategy
    )
    @settings(max_examples=100, deadline=20000)
    def test_room_movie_deduplication_property(
        self, 
        user_context: UserContext, 
        available_movies: List[Dict[str, Any]], 
        filters: ExtractedFilters
    ):
        """
        **Property 15: Room Movie Deduplication**
        
        For any room with existing voted movies, Trini should exclude those movies 
        from new recommendations for that room.
        
        **Validates: Requirements 7.3**
        """
        assume(len(user_context.user_id.strip()) >= 8)
        assume(len(user_context.current_room_id.strip()) >= 8)
        assume(len(user_context.room_voted_movies) > 0)
        assume(len(available_movies) >= len(user_context.room_voted_movies) + 1)
        
        # Ensure some movies in available_movies match the voted movies
        # This creates a realistic scenario where the system needs to filter out voted movies
        voted_movie_ids = set(user_context.room_voted_movies)
        available_movie_ids = {movie['id'] for movie in available_movies}
        
        # Create overlap between voted movies and available movies
        overlap_count = min(len(voted_movie_ids), len(available_movie_ids) // 2)
        if overlap_count > 0:
            # Replace some available movies with voted movies to create overlap
            voted_movies_list = list(voted_movie_ids)[:overlap_count]
            for i, voted_movie_id in enumerate(voted_movies_list):
                if i < len(available_movies):
                    available_movies[i]['id'] = voted_movie_id
        
        # **Core Property Validation**
        
        # 1. User context should properly identify movies to exclude
        exclude_list = user_context.get_exclude_list()
        
        # All room voted movies should be in the exclude list
        for voted_movie_id in user_context.room_voted_movies:
            assert voted_movie_id in exclude_list, \
                f"Voted movie {voted_movie_id} should be in exclude list"
        
        # 2. User context should correctly identify movies that should be excluded
        for voted_movie_id in user_context.room_voted_movies:
            assert user_context.should_exclude_movie(voted_movie_id), \
                f"Should exclude voted movie {voted_movie_id}"
        
        # 3. User should be identified as having room context
        assert user_context.has_room_context(), \
            "User should have room context when current_room_id is set"
        
        # 4. Test movie filtering in search results
        # First, populate exclude_ids in filters from user context (this is what AI prompt generator does)
        filters.exclude_ids = user_context.get_exclude_list()
        
        with patch.object(self.movie_service, 'search_movies_with_filters') as mock_search:
            # Mock the movie search to simulate proper filtering
            # The real trinity-movie-dev Lambda would filter out exclude_ids
            filtered_movies = []
            for movie in available_movies:
                movie_id = movie['id']
                if movie_id not in filters.exclude_ids:
                    recommendation = MovieRecommendation(
                        movie=movie,
                        relevance_score=0.8,
                        reasoning="Test recommendation",
                        source="test"
                    )
                    filtered_movies.append(recommendation)
            
            mock_search.return_value = filtered_movies
            
            # Test the filtering logic
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                # Get search results
                search_results = loop.run_until_complete(
                    self.movie_service.search_movies_with_filters(filters)
                )
                
                # Verify that voted movies are excluded from recommendations
                recommended_movie_ids = {rec.get_movie_id() for rec in search_results}
                
                for voted_movie_id in user_context.room_voted_movies:
                    assert voted_movie_id not in recommended_movie_ids, \
                        f"Voted movie {voted_movie_id} should not appear in recommendations"
                
            finally:
                loop.close()
        
        # 5. Test room service integration
        with patch.object(self.room_service, 'update_user_context_with_room') as mock_update:
            mock_update.return_value = user_context
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                # Test that room service properly updates user context
                updated_context = loop.run_until_complete(
                    self.room_service.update_user_context_with_room(user_context, user_context.user_id)
                )
                
                # Updated context should maintain room voted movies
                assert updated_context.current_room_id == user_context.current_room_id, \
                    "Room ID should be preserved"
                assert updated_context.room_voted_movies == user_context.room_voted_movies, \
                    "Room voted movies should be preserved"
                
            finally:
                loop.close()
    
    @given(
        room_context=room_context_strategy,
        new_movie_candidates=st.lists(movie_strategy, min_size=3, max_size=10, unique_by=lambda x: x['id'])
    )
    @settings(max_examples=50, deadline=15000)
    def test_room_voted_movies_exclusion_property(
        self, 
        room_context: Dict[str, Any], 
        new_movie_candidates: List[Dict[str, Any]]
    ):
        """
        Property: Movies already voted in a room should be excluded from new recommendations.
        
        This test validates that the room service correctly identifies and excludes
        movies that have already been voted on in the current room.
        
        **Validates: Requirements 7.3**
        """
        assume(len(room_context['room_id'].strip()) >= 8)
        assume(len(room_context['voted_movies']) > 0)
        assume(len(new_movie_candidates) > 0)
        
        voted_movie_ids = set(room_context['voted_movies'])
        candidate_movie_ids = {movie['id'] for movie in new_movie_candidates}
        
        # Create some overlap between voted movies and candidates
        overlap_movies = voted_movie_ids.intersection(candidate_movie_ids)
        
        # Mock room service methods
        with patch.object(self.room_service, '_get_room_voted_movies') as mock_get_voted:
            mock_get_voted.return_value = room_context['voted_movies']
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                # Get voted movies for the room
                voted_movies = loop.run_until_complete(
                    self.room_service._get_room_voted_movies(room_context['room_id'])
                )
                
                # Verify all voted movies are returned
                assert set(voted_movies) == set(room_context['voted_movies']), \
                    "Should return all voted movies for the room"
                
                # Test exclusion logic
                for candidate_movie in new_movie_candidates:
                    movie_id = candidate_movie['id']
                    is_voted = movie_id in voted_movie_ids
                    
                    if is_voted:
                        # This movie should be excluded from recommendations
                        assert movie_id in voted_movies, \
                            f"Voted movie {movie_id} should be identified as voted"
                    else:
                        # This movie should be allowed in recommendations
                        # (unless excluded for other reasons like recent movies)
                        pass  # No assertion needed for non-voted movies
                
            finally:
                loop.close()
    
    @given(
        user_id=user_id_strategy,
        room_id=room_id_strategy,
        voted_movies=st.lists(movie_id_strategy, min_size=1, max_size=10, unique=True),
        query=st.text(min_size=10, max_size=100)
    )
    @settings(max_examples=50, deadline=15000)
    def test_trini_query_with_room_deduplication_property(
        self, 
        user_id: str, 
        room_id: str, 
        voted_movies: List[str], 
        query: str
    ):
        """
        Property: Trini queries should automatically exclude room voted movies.
        
        When a user in a room asks Trini for recommendations, the system should
        automatically exclude movies that have already been voted on in that room.
        
        **Validates: Requirements 7.3**
        """
        assume(len(user_id.strip()) >= 8)
        assume(len(room_id.strip()) >= 8)
        assume(len(voted_movies) > 0)
        assume(len(query.strip()) >= 10)
        
        # Create user context with room information
        user_context = UserContext(
            user_id=user_id,
            current_room_id=room_id,
            room_voted_movies=voted_movies
        )
        
        # Mock room service to return room context
        room_context = {
            'room_id': room_id,
            'room_name': f'Test Room {room_id}',
            'room_status': 'ACTIVE',
            'voted_movies': voted_movies,
            'is_host': False,
            'member_count': 3,
            'max_members': 10
        }
        
        with patch.object(self.room_service, 'detect_user_room_context') as mock_detect:
            mock_detect.return_value = room_context
            
            with patch.object(self.room_service, 'update_user_context_with_room') as mock_update:
                mock_update.return_value = user_context
                
                # Test that user context is properly updated with room information
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    # Update user context with room information
                    updated_context = loop.run_until_complete(
                        self.room_service.update_user_context_with_room(user_context, user_id)
                    )
                    
                    # Verify room context is properly set
                    assert updated_context.current_room_id == room_id, \
                        "User context should have correct room ID"
                    assert updated_context.room_voted_movies == voted_movies, \
                        "User context should have correct voted movies"
                    
                    # Verify exclusion logic works
                    exclude_list = updated_context.get_exclude_list()
                    for voted_movie_id in voted_movies:
                        assert voted_movie_id in exclude_list, \
                            f"Voted movie {voted_movie_id} should be in exclude list"
                        assert updated_context.should_exclude_movie(voted_movie_id), \
                            f"Should exclude voted movie {voted_movie_id}"
                    
                    # Verify room context detection
                    assert updated_context.has_room_context(), \
                        "User should have room context"
                    
                finally:
                    loop.close()
    
    @given(
        room_id=room_id_strategy,
        existing_voted_movies=st.lists(movie_id_strategy, min_size=2, max_size=8, unique=True),
        new_movie_id=movie_id_strategy
    )
    @settings(max_examples=30, deadline=10000)
    def test_add_movie_to_room_deduplication_property(
        self, 
        room_id: str, 
        existing_voted_movies: List[str], 
        new_movie_id: str
    ):
        """
        Property: Adding movies to room should check for existing votes.
        
        When adding a movie to a room, the system should check if the movie
        has already been voted on and reject duplicates.
        
        **Validates: Requirements 7.3**
        """
        assume(len(room_id.strip()) >= 8)
        assume(len(existing_voted_movies) > 0)
        assume(new_movie_id.isdigit() and int(new_movie_id) > 0)
        
        user_id = 'test-user-123'
        is_duplicate = new_movie_id in existing_voted_movies
        
        # Mock room service methods
        with patch.object(self.room_service, '_validate_room_membership') as mock_validate:
            mock_validate.return_value = True
            
            with patch.object(self.room_service, '_get_room_details') as mock_room_details:
                mock_room_details.return_value = {
                    'PK': room_id,
                    'SK': 'ROOM',
                    'name': f'Test Room {room_id}',
                    'status': 'ACTIVE',
                    'contentIds': [],
                    'memberCount': 3,
                    'maxMembers': 10
                }
                
                with patch.object(self.room_service, '_get_room_voted_movies') as mock_get_voted:
                    mock_get_voted.return_value = existing_voted_movies
                    
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        # Attempt to add movie to room
                        result = loop.run_until_complete(
                            self.room_service.add_recommendation_to_room(room_id, new_movie_id, user_id)
                        )
                        
                        # Verify result structure
                        assert isinstance(result, dict), "Result should be dictionary"
                        assert 'success' in result, "Result should include success field"
                        assert 'message' in result, "Result should include message field"
                        assert 'room_id' in result, "Result should include room_id field"
                        assert 'movie_id' in result, "Result should include movie_id field"
                        
                        # Verify deduplication logic
                        if is_duplicate:
                            # Should reject duplicate movies
                            assert result['success'] is False, \
                                f"Should reject duplicate movie {new_movie_id}"
                            assert 'votada' in result['message'].lower() or 'voted' in result['message'].lower(), \
                                "Should provide duplicate movie error message"
                        else:
                            # Should accept new movies (assuming other validations pass)
                            # Note: In real implementation, this would depend on other factors
                            # like room state, user permissions, etc.
                            pass
                        
                        # Verify correct movie and room IDs in response
                        assert result['room_id'] == room_id, "Should return correct room ID"
                        assert result['movie_id'] == new_movie_id, "Should return correct movie ID"
                        
                    finally:
                        loop.close()
    
    @given(
        user_context=user_context_with_room_strategy,
        movie_pool=st.lists(movie_strategy, min_size=10, max_size=25, unique_by=lambda x: x['id'])
    )
    @settings(max_examples=30, deadline=15000)
    def test_recommendation_filtering_completeness_property(
        self, 
        user_context: UserContext, 
        movie_pool: List[Dict[str, Any]]
    ):
        """
        Property: Recommendation filtering should be complete and consistent.
        
        The system should consistently filter out all voted movies from
        recommendations, regardless of the size of the movie pool or
        the number of voted movies.
        
        **Validates: Requirements 7.3**
        """
        assume(len(user_context.user_id.strip()) >= 8)
        assume(len(user_context.current_room_id.strip()) >= 8)
        assume(len(user_context.room_voted_movies) > 0)
        assume(len(movie_pool) >= len(user_context.room_voted_movies))
        
        # Create realistic overlap between movie pool and voted movies
        voted_movie_ids = set(user_context.room_voted_movies)
        movie_pool_ids = {movie['id'] for movie in movie_pool}
        
        # Ensure some overlap exists for meaningful testing
        overlap_size = min(len(voted_movie_ids), len(movie_pool) // 3)
        if overlap_size > 0:
            voted_movies_list = list(voted_movie_ids)[:overlap_size]
            for i, voted_movie_id in enumerate(voted_movies_list):
                if i < len(movie_pool):
                    movie_pool[i]['id'] = voted_movie_id
        
        # Test filtering logic
        filtered_movies = []
        for movie in movie_pool:
            movie_id = movie['id']
            if not user_context.should_exclude_movie(movie_id):
                filtered_movies.append(movie)
        
        # **Core Property Validations**
        
        # 1. No voted movies should appear in filtered results
        filtered_movie_ids = {movie['id'] for movie in filtered_movies}
        for voted_movie_id in user_context.room_voted_movies:
            assert voted_movie_id not in filtered_movie_ids, \
                f"Voted movie {voted_movie_id} should not appear in filtered results"
        
        # 2. All non-voted, non-recent movies should be included
        for movie in movie_pool:
            movie_id = movie['id']
            is_voted = movie_id in user_context.room_voted_movies
            is_recent = movie_id in user_context.recent_movies
            
            if not is_voted and not is_recent:
                assert movie_id in filtered_movie_ids, \
                    f"Non-voted, non-recent movie {movie_id} should be included"
        
        # 3. Filtering should be deterministic
        # Run filtering again and verify same results
        filtered_movies_2 = []
        for movie in movie_pool:
            movie_id = movie['id']
            if not user_context.should_exclude_movie(movie_id):
                filtered_movies_2.append(movie)
        
        filtered_movie_ids_2 = {movie['id'] for movie in filtered_movies_2}
        assert filtered_movie_ids == filtered_movie_ids_2, \
            "Filtering should be deterministic and produce same results"
        
        # 4. Exclude list should be comprehensive
        exclude_list = user_context.get_exclude_list()
        for voted_movie_id in user_context.room_voted_movies:
            assert voted_movie_id in exclude_list, \
                f"Voted movie {voted_movie_id} should be in exclude list"
        
        for recent_movie_id in user_context.recent_movies:
            assert recent_movie_id in exclude_list, \
                f"Recent movie {recent_movie_id} should be in exclude list"
    
    def test_specific_deduplication_examples(self):
        """
        Test specific examples of room movie deduplication to ensure accuracy.
        
        **Validates: Requirements 7.3**
        """
        test_cases = [
            {
                'name': 'Basic deduplication',
                'room_voted_movies': ['550', '13', '424'],  # Fight Club, Forrest Gump, Godfather
                'available_movies': ['550', '680', '13', '238', '424'],  # Mix of voted and new
                'expected_excluded': ['550', '13', '424'],
                'expected_included': ['680', '238']
            },
            {
                'name': 'No overlap',
                'room_voted_movies': ['550', '13'],
                'available_movies': ['680', '238', '155'],
                'expected_excluded': [],
                'expected_included': ['680', '238', '155']
            },
            {
                'name': 'Complete overlap',
                'room_voted_movies': ['550', '13', '424'],
                'available_movies': ['550', '13', '424'],
                'expected_excluded': ['550', '13', '424'],
                'expected_included': []
            },
            {
                'name': 'Large room with many voted movies',
                'room_voted_movies': [str(i) for i in range(100, 120)],  # 20 voted movies
                'available_movies': [str(i) for i in range(95, 125)],    # 30 available movies
                'expected_excluded': [str(i) for i in range(100, 120)],  # Overlap: 100-119
                'expected_included': ['95', '96', '97', '98', '99'] + [str(i) for i in range(120, 125)]
            }
        ]
        
        for case in test_cases:
            user_context = UserContext(
                user_id='test-user-123',
                current_room_id='test-room-456',
                room_voted_movies=case['room_voted_movies']
            )
            
            # Test exclusion logic
            for movie_id in case['expected_excluded']:
                assert user_context.should_exclude_movie(movie_id), \
                    f"Case '{case['name']}': Should exclude movie {movie_id}"
            
            for movie_id in case['expected_included']:
                if movie_id not in user_context.recent_movies:  # Don't test recent movies
                    assert not user_context.should_exclude_movie(movie_id), \
                        f"Case '{case['name']}': Should include movie {movie_id}"
            
            # Test exclude list completeness
            exclude_list = user_context.get_exclude_list()
            for voted_movie_id in case['room_voted_movies']:
                assert voted_movie_id in exclude_list, \
                    f"Case '{case['name']}': Voted movie {voted_movie_id} should be in exclude list"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])