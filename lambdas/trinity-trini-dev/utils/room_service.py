"""
Room service for Trinity room integration.

This module handles room context detection, movie deduplication,
and adding Trini recommendations to voting rooms.
"""

import json
import logging
import boto3
from typing import List, Dict, Any, Optional, Set
from botocore.exceptions import ClientError
from datetime import datetime

from models.user_context import UserContext

logger = logging.getLogger(__name__)


class RoomService:
    """Service for Trinity room integration and context management."""
    
    def __init__(self, region: str = 'eu-west-1'):
        """
        Initialize the room service.
        
        Args:
            region: AWS region for DynamoDB access
        """
        self.region = region
        self.dynamodb = boto3.resource('dynamodb', region_name=region)
        self.lambda_client = boto3.client('lambda', region_name=region)
        
        # Table references
        self.rooms_table = self.dynamodb.Table('trinity-rooms-dev-v2')
        self.room_members_table = self.dynamodb.Table('trinity-room-members-dev')
        self.votes_table = self.dynamodb.Table('trinity-votes-dev')
        self.room_matches_table = self.dynamodb.Table('trinity-room-matches-dev')
        
        logger.info(f"🏠 RoomService initialized for region {region}")
    
    async def detect_user_room_context(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Detect if a user is currently in an active Trinity room.
        
        This function implements requirement 7.1: Room context detection for logged-in users.
        It checks if the user is a member of any active rooms and returns room context.
        
        Args:
            user_id: Cognito user ID to check for room membership
            
        Returns:
            Dictionary with room context if user is in active room, None otherwise
            Format: {
                'room_id': str,
                'room_name': str,
                'room_status': str,
                'voted_movies': List[str],
                'is_host': bool
            }
            
        Requirements: 7.1
        """
        try:
            logger.info(f"🔍 Detecting room context for user: {user_id}")
            
            # Query user's room memberships using GSI
            response = await self._query_user_memberships(user_id)
            
            if not response.get('Items'):
                logger.info(f"📝 No room memberships found for user {user_id}")
                return None
            
            # Find active room memberships
            active_memberships = [
                item for item in response['Items'] 
                if item.get('isActive', False)
            ]
            
            if not active_memberships:
                logger.info(f"📝 No active room memberships for user {user_id}")
                return None
            
            # Get the most recent active room
            most_recent_membership = max(
                active_memberships,
                key=lambda x: x.get('joinedAt', '')
            )
            
            room_id = most_recent_membership['roomId']
            user_role = most_recent_membership.get('role', 'MEMBER')
            
            # Get room details
            room_details = await self._get_room_details(room_id)
            
            if not room_details:
                logger.warning(f"⚠️ Room {room_id} not found for user {user_id}")
                return None
            
            # Check if room is in a state where recommendations are relevant
            room_status = room_details.get('status', '')
            if room_status not in ['WAITING', 'ACTIVE']:
                logger.info(f"📝 Room {room_id} status '{room_status}' not suitable for recommendations")
                return None
            
            # Get voted movies in this room
            voted_movies = await self._get_room_voted_movies(room_id)
            
            room_context = {
                'room_id': room_id,
                'room_name': room_details.get('name', 'Unknown Room'),
                'room_status': room_status,
                'voted_movies': voted_movies,
                'is_host': user_role == 'HOST',
                'member_count': room_details.get('memberCount', 1),
                'max_members': room_details.get('maxMembers', 10)
            }
            
            logger.info(f"✅ Room context detected for user {user_id}: Room {room_id} ({room_status}) with {len(voted_movies)} voted movies")
            return room_context
            
        except Exception as e:
            logger.error(f"❌ Error detecting room context for user {user_id}: {str(e)}")
            return None
    
    async def update_user_context_with_room(self, user_context: UserContext, user_id: str) -> UserContext:
        """
        Update user context with current room information.
        
        This function implements requirement 7.3: Movie deduplication against room's voted movies.
        It updates the user context with current room information and voted movies to exclude.
        
        Args:
            user_context: UserContext object to update
            user_id: User ID to check for room context
            
        Returns:
            Updated UserContext with room information
            
        Requirements: 7.3
        """
        try:
            # Detect current room context
            room_context = await self.detect_user_room_context(user_id)
            
            if room_context:
                # Update user context with room information
                user_context.current_room_id = room_context['room_id']
                user_context.room_voted_movies = room_context['voted_movies']
                
                logger.info(f"🏠 Updated user context with room {room_context['room_id']}: "
                          f"{len(room_context['voted_movies'])} movies to exclude")
            else:
                # Clear room context if user is not in active room
                user_context.current_room_id = None
                user_context.room_voted_movies = []
                
                logger.info(f"📝 Cleared room context for user {user_id}")
            
            return user_context
            
        except Exception as e:
            logger.error(f"❌ Error updating user context with room info for user {user_id}: {str(e)}")
            # Return original context on error
            return user_context
    
    async def add_recommendation_to_room(self, room_id: str, movie_id: str, user_id: str) -> Dict[str, Any]:
        """
        Add a Trini recommendation to a Trinity voting room.
        
        This function implements requirement 7.2: Add movie to room's voting pool
        and requirement 7.5: Mark recommendations as "Suggested by Trini".
        
        Args:
            room_id: ID of the room to add movie to
            movie_id: TMDB ID of the movie to add
            user_id: ID of the user making the request
            
        Returns:
            Dictionary with operation result:
            {
                'success': bool,
                'message': str,
                'room_id': str,
                'movie_id': str
            }
            
        Requirements: 7.2, 7.5
        """
        try:
            logger.info(f"🎬 Adding Trini recommendation to room: movie {movie_id} to room {room_id} by user {user_id}")
            
            # Validate user is member of the room
            is_member = await self._validate_room_membership(user_id, room_id)
            if not is_member:
                return {
                    'success': False,
                    'message': 'No tienes acceso a esta sala de votación.',
                    'room_id': room_id,
                    'movie_id': movie_id
                }
            
            # Get room details to validate state
            room_details = await self._get_room_details(room_id)
            if not room_details:
                return {
                    'success': False,
                    'message': 'Sala de votación no encontrada.',
                    'room_id': room_id,
                    'movie_id': movie_id
                }
            
            # Check if room is in appropriate state for adding movies
            room_status = room_details.get('status', '')
            if room_status not in ['WAITING', 'ACTIVE']:
                return {
                    'success': False,
                    'message': f'No se pueden agregar películas a una sala en estado {room_status}.',
                    'room_id': room_id,
                    'movie_id': movie_id
                }
            
            # Check if movie is already in room's content pool
            content_ids = room_details.get('contentIds', [])
            if movie_id in content_ids:
                return {
                    'success': False,
                    'message': 'Esta película ya está en la sala de votación.',
                    'room_id': room_id,
                    'movie_id': movie_id
                }
            
            # Check if movie has already been voted on
            voted_movies = await self._get_room_voted_movies(room_id)
            if movie_id in voted_movies:
                return {
                    'success': False,
                    'message': 'Esta película ya ha sido votada en esta sala.',
                    'room_id': room_id,
                    'movie_id': movie_id
                }
            
            # Add movie to room's content pool
            success = await self._add_movie_to_room_content(room_id, movie_id, user_id)
            
            if success:
                # Notify room members via AppSync subscription (if available)
                await self._notify_room_movie_added(room_id, movie_id, user_id)
                
                return {
                    'success': True,
                    'message': 'Película agregada exitosamente a la sala de votación.',
                    'room_id': room_id,
                    'movie_id': movie_id
                }
            else:
                return {
                    'success': False,
                    'message': 'Error al agregar la película a la sala. Inténtalo de nuevo.',
                    'room_id': room_id,
                    'movie_id': movie_id
                }
            
        except Exception as e:
            logger.error(f"❌ Error adding recommendation to room {room_id}: {str(e)}")
            return {
                'success': False,
                'message': 'Error interno del sistema. Inténtalo de nuevo más tarde.',
                'room_id': room_id,
                'movie_id': movie_id
            }
    
    async def _query_user_memberships(self, user_id: str) -> Dict[str, Any]:
        """Query user's room memberships using GSI."""
        try:
            response = self.room_members_table.query(
                IndexName='UserHistoryIndex',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('userId').eq(user_id),
                ScanIndexForward=False,  # Most recent first
                Limit=10  # Limit to recent memberships
            )
            return response
        except ClientError as e:
            logger.error(f"❌ DynamoDB error querying memberships for user {user_id}: {e}")
            return {'Items': []}
    
    async def _get_room_details(self, room_id: str) -> Optional[Dict[str, Any]]:
        """Get room details from DynamoDB."""
        try:
            response = self.rooms_table.get_item(
                Key={'PK': room_id, 'SK': 'ROOM'}
            )
            return response.get('Item')
        except ClientError as e:
            logger.error(f"❌ DynamoDB error getting room {room_id}: {e}")
            return None
    
    async def _get_room_voted_movies(self, room_id: str) -> List[str]:
        """
        Get list of movies that have been voted on in the room.
        
        This includes movies from both the votes table and room matches table.
        """
        voted_movies = set()
        
        try:
            # Get votes from votes table
            votes_response = self.votes_table.query(
                IndexName='roomId-movieId-index',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('roomId').eq(room_id),
                ProjectionExpression='movieId'
            )
            
            for vote in votes_response.get('Items', []):
                movie_id = vote.get('movieId')
                if movie_id:
                    voted_movies.add(movie_id)
            
            # Get matches from room matches table
            matches_response = self.room_matches_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('roomId').eq(room_id),
                ProjectionExpression='movieId'
            )
            
            for match in matches_response.get('Items', []):
                movie_id = match.get('movieId')
                if movie_id:
                    voted_movies.add(movie_id)
            
            logger.debug(f"🗳️ Found {len(voted_movies)} voted movies in room {room_id}")
            return list(voted_movies)
            
        except ClientError as e:
            logger.error(f"❌ Error getting voted movies for room {room_id}: {e}")
            return []
    
    async def _validate_room_membership(self, user_id: str, room_id: str) -> bool:
        """Validate that user is an active member of the room."""
        try:
            response = self.room_members_table.get_item(
                Key={'roomId': room_id, 'userId': user_id}
            )
            
            member_data = response.get('Item')
            if not member_data:
                return False
            
            return member_data.get('isActive', False)
            
        except ClientError as e:
            logger.error(f"❌ Error validating membership for user {user_id} in room {room_id}: {e}")
            return False
    
    async def _add_movie_to_room_content(self, room_id: str, movie_id: str, suggested_by_user_id: str) -> bool:
        """
        Add movie to room's content pool with Trini attribution.
        
        This updates the room's contentIds array and marks the movie as suggested by Trini.
        Implements requirement 7.2: Add movie to room's voting pool.
        """
        try:
            # First, check if movie is already in the room
            room_details = await self._get_room_details(room_id)
            if not room_details:
                logger.error(f"❌ Room {room_id} not found when adding movie")
                return False
            
            current_content_ids = room_details.get('contentIds', [])
            if movie_id in current_content_ids:
                logger.warning(f"⚠️ Movie {movie_id} already in room {room_id} content pool")
                return False
            
            # Update room's contentIds array with the new movie
            response = self.rooms_table.update_item(
                Key={'PK': room_id, 'SK': 'ROOM'},
                UpdateExpression='SET contentIds = list_append(if_not_exists(contentIds, :empty_list), :movie_list), updatedAt = :updated_at',
                ExpressionAttributeValues={
                    ':movie_list': [movie_id],
                    ':empty_list': [],
                    ':updated_at': datetime.utcnow().isoformat()
                },
                ConditionExpression='attribute_exists(PK)',
                ReturnValues='UPDATED_NEW'
            )
            
            # Create a record in room matches table to track Trini suggestions with proper attribution
            await self._create_trini_suggestion_record(room_id, movie_id, suggested_by_user_id)
            
            logger.info(f"✅ Successfully added movie {movie_id} to room {room_id} content pool with Trini attribution")
            return True
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                logger.error(f"❌ Room {room_id} not found when adding movie")
            else:
                logger.error(f"❌ DynamoDB error adding movie to room {room_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"❌ Unexpected error adding movie to room {room_id}: {str(e)}")
            return False
    
    async def _create_trini_suggestion_record(self, room_id: str, movie_id: str, suggested_by_user_id: str) -> None:
        """
        Create a record to track that this movie was suggested by Trini.
        
        This implements requirement 7.5: Mark recommendations as "Suggested by Trini"
        by creating a proper attribution record in the room matches table.
        """
        try:
            import uuid
            
            suggestion_record = {
                'roomId': room_id,
                'movieId': movie_id,
                'suggestionId': str(uuid.uuid4()),
                'suggestedBy': suggested_by_user_id,
                'suggestedByTrini': True,
                'suggestionType': 'TRINI_RECOMMENDATION',
                'attribution': 'Suggested by Trini',
                'displayName': 'Trini',
                'createdAt': datetime.utcnow().isoformat(),
                'votes': 0,  # Initialize vote count
                'isActive': True,
                'metadata': {
                    'source': 'trini_chatbot',
                    'recommendation_engine': 'salamandra-2b',
                    'added_via': 'addTriniRecommendationToRoom_mutation'
                }
            }
            
            self.room_matches_table.put_item(Item=suggestion_record)
            
            logger.info(f"📝 Created Trini suggestion record for movie {movie_id} in room {room_id} with attribution")
            
        except Exception as e:
            logger.warning(f"⚠️ Failed to create Trini suggestion record: {str(e)}")
            # Don't fail the main operation if this fails
    
    async def _notify_room_movie_added(self, room_id: str, movie_id: str, user_id: str) -> None:
        """
        Notify room members that a movie was added via AppSync subscription.
        
        This integrates with the existing Trinity real-time notification system
        by publishing a room event with proper Trini attribution.
        
        Requirements: 7.5 - Mark recommendations as "Suggested by Trini"
        """
        try:
            logger.info(f"📡 Publishing room event: movie {movie_id} added by Trini to room {room_id}")
            
            # Get movie details for the notification
            movie_details = await self._get_movie_details_for_notification(movie_id)
            
            # Create room event data with Trini attribution
            room_event_data = {
                'eventType': 'MOVIE_ADDED',
                'movieId': movie_id,
                'movieTitle': movie_details.get('title', f'Movie {movie_id}'),
                'moviePoster': movie_details.get('poster_path'),
                'addedBy': user_id,
                'addedByTrini': True,
                'attribution': 'Suggested by Trini',
                'timestamp': datetime.utcnow().isoformat(),
                'source': 'trini_recommendation'
            }
            
            # Publish to AppSync subscription using the existing pattern
            await self._publish_room_event(room_id, 'MOVIE_ADDED', room_event_data)
            
            logger.info(f"✅ Successfully published room event for movie {movie_id} in room {room_id}")
            
        except Exception as e:
            logger.warning(f"⚠️ Failed to notify room members: {str(e)}")
            # Don't fail the main operation if notifications fail
    
    async def _get_movie_details_for_notification(self, movie_id: str) -> Dict[str, Any]:
        """Get movie details for notification purposes."""
        try:
            # Try to get from movie cache first
            response = self.dynamodb.Table('trinity-movies-cache-dev').get_item(
                Key={'movieId': movie_id}
            )
            
            if response.get('Item'):
                movie_data = response['Item']
                return {
                    'title': movie_data.get('title', f'Movie {movie_id}'),
                    'poster_path': movie_data.get('poster_path'),
                    'overview': movie_data.get('overview'),
                    'release_date': movie_data.get('release_date'),
                    'vote_average': movie_data.get('vote_average')
                }
            
            # Fallback to basic info
            return {
                'title': f'Movie {movie_id}',
                'poster_path': None
            }
            
        except Exception as e:
            logger.warning(f"⚠️ Error getting movie details for notification: {str(e)}")
            return {
                'title': f'Movie {movie_id}',
                'poster_path': None
            }
    
    async def _publish_room_event(self, room_id: str, event_type: str, event_data: Dict[str, Any]) -> None:
        """
        Publish room event to AppSync subscription.
        
        This follows the same pattern as the existing Trinity AppSync publisher.
        """
        try:
            import json
            import os
            import aiohttp
            
            # Get AppSync configuration
            appsync_endpoint = os.environ.get('APPSYNC_ENDPOINT')
            appsync_api_key = os.environ.get('APPSYNC_API_KEY')
            
            if not appsync_endpoint:
                logger.warning("⚠️ APPSYNC_ENDPOINT not configured, cannot publish room event")
                return
            
            # Create the GraphQL mutation for publishRoomEvent
            mutation = """
            mutation PublishRoomEvent($roomId: ID!, $eventType: String!, $data: AWSJSON!) {
                publishRoomEvent(roomId: $roomId, eventType: $eventType, data: $data) {
                    id
                    timestamp
                    roomId
                    eventType
                    data
                }
            }
            """
            
            variables = {
                'roomId': room_id,
                'eventType': event_type,
                'data': json.dumps(event_data)
            }
            
            # Prepare the request
            headers = {
                'Content-Type': 'application/json'
            }
            
            if appsync_api_key:
                headers['x-api-key'] = appsync_api_key
            
            payload = {
                'query': mutation,
                'variables': variables
            }
            
            # Make the HTTP request to AppSync
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    appsync_endpoint,
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    
                    if response.status == 200:
                        result = await response.json()
                        if result.get('errors'):
                            logger.error(f"❌ AppSync mutation errors: {result['errors']}")
                        else:
                            logger.info(f"✅ Room event published successfully to AppSync")
                    else:
                        logger.error(f"❌ AppSync request failed with status {response.status}")
            
        except ImportError:
            logger.warning("⚠️ aiohttp not available, using fallback notification method")
            await self._publish_room_event_fallback(room_id, event_type, event_data)
        except Exception as e:
            logger.error(f"❌ Error publishing room event to AppSync: {str(e)}")
            # Try fallback method
            await self._publish_room_event_fallback(room_id, event_type, event_data)
    
    async def _publish_room_event_fallback(self, room_id: str, event_type: str, event_data: Dict[str, Any]) -> None:
        """
        Fallback method to publish room events when AppSync is not available.
        
        This could invoke the trinity-realtime-dev Lambda directly or use SNS.
        """
        try:
            # Log the event for CloudWatch monitoring
            logger.info(f"📡 ROOM_EVENT_FALLBACK: {event_type} in room {room_id}", extra={
                'room_id': room_id,
                'event_type': event_type,
                'event_data': event_data,
                'attribution': 'Suggested by Trini'
            })
            
            # In a production system, this could:
            # 1. Invoke trinity-realtime-dev Lambda directly
            # 2. Publish to SNS topic for room notifications
            # 3. Store in a notification queue for later processing
            
        except Exception as e:
            logger.error(f"❌ Error in fallback room event publishing: {str(e)}")


# Global service instance
_room_service_instance = None


def get_room_service(region: str = 'eu-west-1') -> RoomService:
    """
    Get or create a RoomService instance.
    
    Args:
        region: AWS region for DynamoDB access
        
    Returns:
        RoomService instance
    """
    global _room_service_instance
    
    if _room_service_instance is None:
        _room_service_instance = RoomService(region)
    
    return _room_service_instance