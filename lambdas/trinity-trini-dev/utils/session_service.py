"""
Session management service for Trini chat sessions.

This service handles persistence and retrieval of chat sessions from DynamoDB,
implementing requirements 6.2, 6.3, and 6.5 for session management.
"""

import boto3
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from botocore.exceptions import ClientError

from models.chat_session import ChatSession, ChatMessage
from models.user_context import UserContext
from utils.room_service import get_room_service


logger = logging.getLogger(__name__)


class SessionService:
    """Service for managing chat sessions in DynamoDB."""
    
    def __init__(self, table_name: str, region: str = 'eu-west-1'):
        """
        Initialize the session service.
        
        Args:
            table_name: Name of the DynamoDB table for chat sessions
            region: AWS region for DynamoDB client
        """
        self.table_name = table_name
        self.region = region
        self.dynamodb = boto3.resource('dynamodb', region_name=region)
        self.table = self.dynamodb.Table(table_name)
        
        logger.info(f"🗄️ SessionService initialized for table: {table_name}")
    
    async def save_chat_session(self, session: ChatSession) -> bool:
        """
        Save a chat session to DynamoDB.
        
        This function implements requirement 6.1: Store chat session in DynamoDB
        and requirement 6.4: Maintain only last 10 interactions per session.
        
        Args:
            session: ChatSession object to save
            
        Returns:
            bool: True if save was successful, False otherwise
            
        Requirements: 6.1, 6.4
        """
        try:
            # Ensure session has updated timestamp
            session.updated_at = datetime.utcnow()
            
            # Enforce 10-message limit as per requirement 6.4
            if len(session.messages) > 10:
                session.messages = session.messages[-10:]
                logger.info(f"📝 Trimmed session {session.session_id} to last 10 messages")
            
            # Convert session to DynamoDB format
            item = session.to_dict()
            
            # Add message count for efficient querying
            item['messageCount'] = len(session.messages)
            item['sessionStatus'] = 'active'
            
            # Save to DynamoDB
            response = self.table.put_item(Item=item)
            
            logger.info(f"✅ Saved chat session {session.session_id} for user {session.user_id}")
            logger.debug(f"DynamoDB response: {response.get('ResponseMetadata', {}).get('HTTPStatusCode')}")
            
            return True
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_message = e.response['Error']['Message']
            logger.error(f"❌ DynamoDB error saving session {session.session_id}: {error_code} - {error_message}")
            return False
            
        except Exception as e:
            logger.error(f"❌ Unexpected error saving session {session.session_id}: {str(e)}")
            return False
    
    async def get_user_context(self, user_id: str, limit: int = 10) -> UserContext:
        """
        Retrieve user context from chat history and infer preferences.
        
        This function implements requirement 6.2: Recover context from previous sessions
        and requirement 6.5: Associate each Chat_Session with userId for personalization.
        
        Enhanced with room context detection for requirement 7.1: Room context detection
        and requirement 7.3: Movie deduplication against room's voted movies.
        
        Args:
            user_id: Cognito user ID to retrieve context for
            limit: Maximum number of recent sessions to analyze (default: 10)
            
        Returns:
            UserContext: User context with inferred preferences from chat history and room context
            
        Requirements: 6.2, 6.5, 7.1, 7.3
        """
        try:
            logger.info(f"🔍 Retrieving user context for user: {user_id}")
            
            # Query user's recent sessions using GSI
            response = self.table.query(
                IndexName='userId-index',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('userId').eq(user_id),
                ScanIndexForward=False,  # Most recent first
                Limit=limit
            )
            
            sessions = []
            for item in response.get('Items', []):
                try:
                    session = ChatSession.from_dict(item)
                    sessions.append(session)
                except Exception as e:
                    logger.warning(f"⚠️ Error parsing session {item.get('sessionId', 'unknown')}: {str(e)}")
                    continue
            
            logger.info(f"📚 Retrieved {len(sessions)} sessions for user {user_id}")
            
            # Create user context and infer preferences
            user_context = UserContext(user_id=user_id)
            
            if sessions:
                # Update context from most recent session
                most_recent_session = sessions[0]
                user_context.update_from_chat_session(most_recent_session)
                
                # Infer additional preferences from all sessions
                self._infer_user_preferences(user_context, sessions)
                
                logger.info(f"🧠 Inferred preferences for user {user_id}: "
                          f"{len(user_context.preferred_genres)} genres, "
                          f"{len(user_context.recent_movies)} recent movies")
            else:
                logger.info(f"📝 No previous sessions found for user {user_id}, using default context")
            
            # NEW: Integrate room context detection (Requirements 7.1, 7.3)
            try:
                room_service = get_room_service(self.region)
                user_context = await room_service.update_user_context_with_room(user_context, user_id)
                
                if user_context.has_room_context():
                    logger.info(f"🏠 Room context detected: Room {user_context.current_room_id} with {len(user_context.room_voted_movies)} voted movies to exclude")
                
            except Exception as room_error:
                logger.warning(f"⚠️ Error detecting room context for user {user_id}: {str(room_error)}")
                # Continue without room context if detection fails
            
            return user_context
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_message = e.response['Error']['Message']
            logger.error(f"❌ DynamoDB error retrieving context for user {user_id}: {error_code} - {error_message}")
            # Return empty context on error
            return UserContext(user_id=user_id)
            
        except Exception as e:
            logger.error(f"❌ Unexpected error retrieving context for user {user_id}: {str(e)}")
            # Return empty context on error
            return UserContext(user_id=user_id)
    
    async def get_chat_session(self, session_id: str) -> Optional[ChatSession]:
        """
        Retrieve a specific chat session by ID.
        
        Args:
            session_id: Session ID to retrieve
            
        Returns:
            ChatSession object if found, None otherwise
        """
        try:
            response = self.table.get_item(Key={'sessionId': session_id})
            
            if 'Item' in response:
                session = ChatSession.from_dict(response['Item'])
                logger.info(f"📖 Retrieved session {session_id} with {len(session.messages)} messages")
                return session
            else:
                logger.info(f"📭 Session {session_id} not found")
                return None
                
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_message = e.response['Error']['Message']
            logger.error(f"❌ DynamoDB error retrieving session {session_id}: {error_code} - {error_message}")
            return None
            
        except Exception as e:
            logger.error(f"❌ Unexpected error retrieving session {session_id}: {str(e)}")
            return None
    
    async def create_new_session(self, user_id: str) -> ChatSession:
        """
        Create a new chat session for a user.
        
        Args:
            user_id: Cognito user ID
            
        Returns:
            New ChatSession object
        """
        session = ChatSession(user_id=user_id)
        logger.info(f"🆕 Created new session {session.session_id} for user {user_id}")
        return session
    
    async def add_message_to_session(self, session_id: str, message: ChatMessage) -> bool:
        """
        Add a message to an existing session.
        
        Args:
            session_id: Session to add message to
            message: ChatMessage to add
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Get existing session
            session = await self.get_chat_session(session_id)
            if not session:
                logger.error(f"❌ Cannot add message to non-existent session {session_id}")
                return False
            
            # Add message and save
            session.add_message(message)
            return await self.save_chat_session(session)
            
        except Exception as e:
            logger.error(f"❌ Error adding message to session {session_id}: {str(e)}")
            return False
    
    def _infer_user_preferences(self, user_context: UserContext, sessions: List[ChatSession]) -> None:
        """
        Infer user preferences from chat session history.
        
        This implements requirement 6.3: Include inferred preferences in Chat_Session.
        
        Args:
            user_context: UserContext to update with inferred preferences
            sessions: List of ChatSession objects to analyze
            
        Requirements: 6.3
        """
        try:
            # Collect all genres mentioned across sessions
            all_genres = []
            all_ratings = []
            decade_mentions = []
            
            for session in sessions:
                for message in session.messages:
                    if message.extracted_filters:
                        filters = message.extracted_filters
                        
                        # Collect genres
                        if 'genres' in filters and filters['genres']:
                            all_genres.extend(filters['genres'])
                        
                        # Collect rating preferences
                        if 'rating_min' in filters and filters['rating_min']:
                            all_ratings.append(filters['rating_min'])
                        
                        # Collect year preferences to infer decade preferences
                        if 'year_range' in filters and filters['year_range']:
                            year_range = filters['year_range']
                            if isinstance(year_range, dict):
                                min_year = year_range.get('min')
                                max_year = year_range.get('max')
                                if min_year:
                                    decade = f"{(min_year // 10) * 10}s"
                                    decade_mentions.append(decade)
                                if max_year and max_year != min_year:
                                    decade = f"{(max_year // 10) * 10}s"
                                    decade_mentions.append(decade)
            
            # Update user context with inferred preferences
            if all_genres:
                # Count genre frequency and keep most mentioned
                genre_counts = {}
                for genre in all_genres:
                    genre_counts[genre] = genre_counts.get(genre, 0) + 1
                
                # Sort by frequency and take top 5
                sorted_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)
                user_context.preferred_genres = [genre for genre, count in sorted_genres[:5]]
                
                logger.debug(f"🎭 Inferred preferred genres: {user_context.preferred_genres}")
            
            if all_ratings:
                # Use average of mentioned ratings as preference
                avg_rating = sum(all_ratings) / len(all_ratings)
                user_context.rating_preference = round(avg_rating, 1)
                
                logger.debug(f"⭐ Inferred rating preference: {user_context.rating_preference}")
            
            if decade_mentions:
                # Count decade frequency
                decade_counts = {}
                for decade in decade_mentions:
                    decade_counts[decade] = decade_counts.get(decade, 0) + 1
                
                # Sort by frequency and take top 3
                sorted_decades = sorted(decade_counts.items(), key=lambda x: x[1], reverse=True)
                user_context.preferred_decades = [decade for decade, count in sorted_decades[:3]]
                
                logger.debug(f"📅 Inferred preferred decades: {user_context.preferred_decades}")
            
            logger.info(f"🧠 Preference inference complete for user {user_context.user_id}")
            
        except Exception as e:
            logger.error(f"❌ Error inferring preferences for user {user_context.user_id}: {str(e)}")
            # Continue with existing context on error
    
    async def cleanup_old_sessions(self, days_old: int = 30) -> int:
        """
        Clean up sessions older than specified days (beyond TTL as backup).
        
        Args:
            days_old: Number of days old to consider for cleanup
            
        Returns:
            int: Number of sessions cleaned up
        """
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days_old)
            cutoff_timestamp = cutoff_date.isoformat()
            
            # Scan for old sessions (this is expensive, should be used sparingly)
            response = self.table.scan(
                FilterExpression=boto3.dynamodb.conditions.Attr('createdAt').lt(cutoff_timestamp),
                ProjectionExpression='sessionId'
            )
            
            old_sessions = response.get('Items', [])
            cleanup_count = 0
            
            # Delete old sessions in batches
            with self.table.batch_writer() as batch:
                for session in old_sessions:
                    batch.delete_item(Key={'sessionId': session['sessionId']})
                    cleanup_count += 1
            
            if cleanup_count > 0:
                logger.info(f"🧹 Cleaned up {cleanup_count} old sessions")
            
            return cleanup_count
            
        except Exception as e:
            logger.error(f"❌ Error during session cleanup: {str(e)}")
            return 0


# Global session service instance (will be initialized by handler)
_session_service: Optional[SessionService] = None


def get_session_service(table_name: str, region: str = 'eu-west-1') -> SessionService:
    """
    Get or create the global session service instance.
    
    Args:
        table_name: DynamoDB table name
        region: AWS region
        
    Returns:
        SessionService instance
    """
    global _session_service
    
    if _session_service is None:
        _session_service = SessionService(table_name, region)
    
    return _session_service