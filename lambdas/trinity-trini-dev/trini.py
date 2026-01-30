"""
Trinity Trini Lambda Handler

Main handler for the Trini chatbot Lambda function. Processes natural language
movie queries using Salamandra-2b AI model and provides intelligent recommendations.
"""

import json
import os
import time
import logging
from typing import Dict, Any, Optional, List
import asyncio
import traceback
from datetime import datetime
import boto3

# Import core models
from models import (
    ChatSession, ChatMessage, ExtractedFilters, TriniResponse, 
    MovieRecommendation, UserContext
)

# Import utilities
from utils.rate_limiter import get_rate_limiter
from utils.ai_prompt_generator import AIPromptGenerator
from utils.ai_service import get_ai_service
from utils.movie_search_service import get_movie_search_service
from utils.session_service import get_session_service
from utils.metrics_service import get_metrics_service

# Configure logging
log_level = os.environ.get('LOG_LEVEL', 'INFO').upper()
logging.basicConfig(
    level=getattr(logging, log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Environment variables
HUGGINGFACE_API_KEY = os.environ.get('HUGGINGFACE_API_KEY')
SALAMANDRA_MODEL = os.environ.get('SALAMANDRA_MODEL', 'BSC-LT/salamandra-2b-instruct')
DEBUG_MODE = os.environ.get('DEBUG_MODE', 'false').lower() == 'true'
MAX_QUERIES_PER_MINUTE = int(os.environ.get('MAX_QUERIES_PER_MINUTE', '5'))
CHAT_SESSIONS_TABLE = os.environ.get('CHAT_SESSIONS_TABLE', 'trinity-chat-sessions-dev')
AWS_REGION = os.environ.get('AWS_REGION', 'eu-west-1')


class TriniHandler:
    """Main handler class for Trini chatbot operations."""
    
    def __init__(self):
        """Initialize the Trini handler with required services."""
        self.start_time = time.time()
        
        # Initialize services (will be implemented in subsequent tasks)
        self.ai_service = get_ai_service()
        self.movie_service = get_movie_search_service(AWS_REGION)
        self.session_service = get_session_service(CHAT_SESSIONS_TABLE, AWS_REGION)
        self.metrics_service = get_metrics_service(AWS_REGION)
        
        # Initialize AI prompt generator
        self.ai_prompt_generator = AIPromptGenerator()
        
        # Initialize rate limiter with configuration from environment (read dynamically)
        max_queries = int(os.environ.get('MAX_QUERIES_PER_MINUTE', '5'))
        self.rate_limiter = get_rate_limiter(
            max_requests=max_queries,
            window_seconds=60,
            force_new=True  # Always create new instance for each handler
        )
        
        self.metrics_service.log_structured('INFO', 'Trini Handler initialized', 
                                          max_queries_per_minute=max_queries)
    
    async def process_query(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a natural language movie query.
        
        Args:
            event: Lambda event containing query and user information
            
        Returns:
            TriniResponse dictionary with recommendations and metadata
        """
        start_time = time.time()
        
        try:
            # Extract query parameters
            field_name = event.get('info', {}).get('fieldName', '')
            arguments = event.get('arguments', {})
            user_id = event.get('identity', {}).get('userId', 'anonymous')
            
            self.metrics_service.log_structured('INFO', 'Processing Trini query', 
                                              field_name=field_name, user_id=user_id)
            
            if DEBUG_MODE:
                logger.debug(f"Event: {json.dumps(event, indent=2)}")
            
            # Route to appropriate handler
            result = None
            if field_name == 'askTrini':
                result = await self._handle_ask_trini(arguments)
            elif field_name == 'getChatHistory':
                result = await self._handle_get_chat_history(arguments, user_id)
            elif field_name == 'addTriniRecommendationToRoom':
                result = await self._handle_add_to_room(arguments, event)
            else:
                raise ValueError(f"Unknown field name: {field_name}")
            
            # Record successful processing metrics
            processing_time = time.time() - start_time
            self.metrics_service.record_query_processed(
                field_name, True, processing_time, user_id
            )
            
            return result
                
        except Exception as e:
            processing_time = time.time() - start_time
            
            # Record error metrics
            self.metrics_service.record_query_processed(
                field_name, False, processing_time, user_id
            )
            self.metrics_service.record_error(
                error_type=type(e).__name__,
                error_message=str(e),
                context={'field_name': field_name, 'user_id': user_id}
            )
            
            logger.error(f"❌ Error processing query: {str(e)}")
            if DEBUG_MODE:
                logger.error(f"Traceback: {traceback.format_exc()}")
            
            return self._create_error_response(
                str(e), 
                processing_time_ms=int(processing_time * 1000)
            )
    
    async def _handle_ask_trini(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Handle askTrini mutation."""
        query_input = arguments.get('input', {})
        user_query = query_input.get('query', '')
        user_id = query_input.get('userId', '')
        session_id = query_input.get('sessionId')
        
        if not user_query or not user_id:
            raise ValueError("Query and userId are required")
        
        # Check rate limiting
        if self.rate_limiter.is_rate_limited(user_id):
            # Record rate limit hit
            current_count = self.rate_limiter.get_current_count(user_id)
            self.metrics_service.record_rate_limit_hit(user_id, current_count, MAX_QUERIES_PER_MINUTE)
            
            logger.warning(f"🚫 Rate limit exceeded for user {user_id}")
            return self.rate_limiter.get_rate_limit_error_response(user_id)
        
        # Load user context from chat history (implements requirement 6.2)
        user_context = await self.session_service.get_user_context(user_id)
        logger.info(f"👤 Loaded user context for {user_id}: {len(user_context.preferred_genres)} preferred genres")
        
        # Get or create chat session
        if session_id:
            chat_session = await self.session_service.get_chat_session(session_id)
            if not chat_session:
                logger.warning(f"⚠️ Session {session_id} not found, creating new session")
                chat_session = await self.session_service.create_new_session(user_id)
        else:
            chat_session = await self.session_service.create_new_session(user_id)
        
        # Create user query message
        user_message = ChatMessage(
            type='user_query',
            content=user_query,
            timestamp=datetime.utcnow()
        )
        
        # Process query with AI service
        try:
            # Generate AI prompt with user context
            ai_prompt = self.ai_prompt_generator.create_ai_prompt(user_query, user_context)
            logger.info(f"🧠 Generated AI prompt for query: '{user_query[:50]}...'")
            
            # Call Hugging Face API with real AI service
            ai_response = await self.ai_service.extract_movie_filters(user_query, ai_prompt)
            
            if ai_response:
                logger.info(f"🤖 Received AI response: {len(ai_response)} characters")
                logger.debug(f"🔍 AI response preview: {ai_response[:200]}...")
            else:
                logger.warning("⚠️ AI service returned no response, using fallback")
                ai_response = ""
            
            # Process AI response (now with real AI response or fallback)
            extracted_filters = self.ai_prompt_generator.process_ai_response(ai_response, user_query, user_context)
            logger.info(f"🔍 Extracted filters: genres={extracted_filters.genres}, confidence={extracted_filters.confidence}")
            
            # Log whether we used AI or fallback
            if ai_response and extracted_filters.confidence > 0.4:
                logger.info("✅ Using AI-extracted filters")
            else:
                logger.info("🔄 Using pattern-matching fallback")
            
            # Update user message with extracted filters
            user_message.extracted_filters = extracted_filters.to_dict()
            user_message.confidence = extracted_filters.confidence
            
            # Check if query is ambiguous and needs clarification
            if self.ai_prompt_generator.detect_ambiguous_query(extracted_filters, user_query):
                clarification_message = self.ai_prompt_generator.create_clarification_message(extracted_filters, user_query)
                
                # Create Trini response message
                trini_message = ChatMessage(
                    type='trini_response',
                    content=clarification_message,
                    confidence=extracted_filters.confidence,
                    timestamp=datetime.utcnow()
                )
                
                response = TriniResponse(
                    session_id=chat_session.session_id,
                    message=clarification_message,
                    recommendations=[],
                    confidence=extracted_filters.confidence,
                    intent='clarification',
                    processing_time_ms=int((time.time() - self.start_time) * 1000),
                    extracted_filters=extracted_filters.to_dict()
                )
            else:
                # Search for movies using extracted filters
                try:
                    recommendations = await self.search_movies_with_filters(extracted_filters)
                    
                    if recommendations:
                        message = f"¡Perfecto! He encontrado {len(recommendations)} películas que podrían gustarte basándome en tu consulta '{user_query}'. Aquí tienes mis recomendaciones:"
                        movie_ids = [rec.movie.get('id') for rec in recommendations if rec.movie.get('id')]
                    else:
                        message = f"He analizado tu consulta '{user_query}' pero no he encontrado películas que coincidan exactamente. Intenta ser más específico o prueba con otros géneros."
                        movie_ids = []
                    
                    # Create Trini response message
                    trini_message = ChatMessage(
                        type='trini_response',
                        content=message,
                        recommendations=movie_ids,
                        confidence=extracted_filters.confidence,
                        timestamp=datetime.utcnow()
                    )
                    
                    response = TriniResponse(
                        session_id=chat_session.session_id,
                        message=message,
                        recommendations=recommendations,
                        confidence=extracted_filters.confidence,
                        intent=extracted_filters.intent,
                        processing_time_ms=int((time.time() - self.start_time) * 1000),
                        extracted_filters=extracted_filters.to_dict()
                    )
                    
                except Exception as search_error:
                    logger.error(f"❌ Error searching movies: {str(search_error)}")
                    # Fallback response when movie search fails
                    message = f"He analizado tu consulta '{user_query}' y entiendo que buscas películas con estos criterios: géneros {extracted_filters.genres}. Temporalmente no puedo acceder al catálogo de películas, pero pronto podré darte recomendaciones específicas."
                    
                    # Create Trini response message
                    trini_message = ChatMessage(
                        type='trini_response',
                        content=message,
                        confidence=extracted_filters.confidence,
                        timestamp=datetime.utcnow()
                    )
                    
                    response = TriniResponse(
                        session_id=chat_session.session_id,
                        message=message,
                        recommendations=[],
                        confidence=extracted_filters.confidence,
                        intent=extracted_filters.intent,
                        processing_time_ms=int((time.time() - self.start_time) * 1000),
                        extracted_filters=extracted_filters.to_dict(),
                        error="Movie search temporarily unavailable",
                        fallback_used=True
                    )
            
            # Add messages to session and save (implements requirement 6.1, 6.3)
            chat_session.add_message(user_message)
            chat_session.add_message(trini_message)
            
            # Save session with conversation history
            save_success = await self.session_service.save_chat_session(chat_session)
            if not save_success:
                logger.warning(f"⚠️ Failed to save chat session {chat_session.session_id}")
            else:
                logger.info(f"💾 Saved chat session {chat_session.session_id} with {len(chat_session.messages)} messages")
            
        except Exception as e:
            logger.error(f"❌ Error in AI processing: {str(e)}")
            # Fallback response
            message = "¡Hola! Soy Trini, tu asistente de películas. Estoy en desarrollo y pronto podré ayudarte con recomendaciones personalizadas."
            
            # Create basic response message
            trini_message = ChatMessage(
                type='trini_response',
                content=message,
                confidence=1.0,
                timestamp=datetime.utcnow()
            )
            
            # Add messages to session
            chat_session.add_message(user_message)
            chat_session.add_message(trini_message)
            
            # Try to save session even on error
            await self.session_service.save_chat_session(chat_session)
            
            response = TriniResponse(
                session_id=chat_session.session_id,
                message=message,
                recommendations=[],
                confidence=1.0,
                intent="information",
                processing_time_ms=int((time.time() - self.start_time) * 1000)
            )
        
        return response.to_dict()
    
    async def search_movies_with_filters(self, filters: ExtractedFilters, limit: int = 20) -> List[MovieRecommendation]:
        """
        Search movies using AI-extracted filters by coordinating with trinity-movie-dev.
        
        This function implements the core movie search coordination required by task 4.1:
        - Transforms AI-extracted filters to trinity-movie-dev format
        - Invokes trinity-movie-dev Lambda for TMDB queries
        - Handles filter transformation and response processing
        
        Args:
            filters: ExtractedFilters object containing search criteria from AI processing
            limit: Maximum number of movies to return (default: 20)
            
        Returns:
            List of MovieRecommendation objects with relevance scoring
            
        Requirements: 2.1, 2.2, 2.5
        """
        try:
            logger.info(f"🎬 Searching movies with AI filters: genres={filters.genres}, confidence={filters.confidence}")
            
            # Use the movie search service to coordinate with trinity-movie-dev
            recommendations = await self.movie_service.search_movies_with_filters(filters, limit)
            
            # Log search results
            if recommendations:
                logger.info(f"✅ Movie search successful: {len(recommendations)} recommendations found")
                # Log top recommendation for debugging
                top_rec = recommendations[0]
                logger.debug(f"🏆 Top recommendation: {top_rec.movie.get('title')} (score: {top_rec.relevance_score:.2f})")
            else:
                logger.warning("⚠️ No movie recommendations found for the given filters")
            
            return recommendations
            
        except Exception as e:
            logger.error(f"❌ Error in search_movies_with_filters: {str(e)}")
            # Return empty list to allow graceful degradation
            return []
    
    async def _handle_get_chat_history(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Handle getChatHistory query."""
        user_id = arguments.get('userId', '')
        limit = arguments.get('limit', 10)
        
        if not user_id:
            raise ValueError("userId is required")
        
        # Check rate limiting for chat history requests too
        if self.rate_limiter.is_rate_limited(user_id):
            # Record rate limit hit
            current_count = self.rate_limiter.get_current_count(user_id)
            self.metrics_service.record_rate_limit_hit(user_id, current_count, MAX_QUERIES_PER_MINUTE)
            
            logger.warning(f"🚫 Rate limit exceeded for user {user_id} on getChatHistory")
            return self.rate_limiter.get_rate_limit_error_response(user_id)
        
        try:
            # Get user's chat sessions
            user_context = await self.session_service.get_user_context(user_id, limit)
            
            # Query recent sessions directly for detailed history
            response = await self.session_service.table.query(
                IndexName='userId-index',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('userId').eq(user_id),
                ScanIndexForward=False,  # Most recent first
                Limit=limit
            )
            
            sessions = []
            for item in response.get('Items', []):
                try:
                    session = ChatSession.from_dict(item)
                    sessions.append({
                        'sessionId': session.session_id,
                        'userId': session.user_id,
                        'messageCount': len(session.messages),
                        'createdAt': session.created_at.isoformat(),
                        'updatedAt': session.updated_at.isoformat(),
                        'lastMessage': session.messages[-1].content if session.messages else "",
                        'messages': [msg.to_dict() for msg in session.messages]
                    })
                except Exception as e:
                    logger.warning(f"⚠️ Error parsing session {item.get('sessionId', 'unknown')}: {str(e)}")
                    continue
            
            logger.info(f"📚 Retrieved {len(sessions)} chat sessions for user {user_id}")
            
            return {
                'sessions': sessions,
                'totalCount': len(sessions),
                'userPreferences': user_context.to_dict()
            }
            
        except Exception as e:
            logger.error(f"❌ Error retrieving chat history for user {user_id}: {str(e)}")
            return {
                'sessions': [],
                'totalCount': 0,
                'error': str(e)
            }
    
    async def _handle_add_to_room(self, arguments: Dict[str, Any], event: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Handle addTriniRecommendationToRoom mutation.
        
        This function implements requirement 7.2: Add movie to room's voting pool
        and requirement 7.5: Mark recommendations as "Suggested by Trini".
        
        Args:
            arguments: GraphQL mutation arguments containing roomId and movieId
            event: Full GraphQL event containing user identity
            
        Returns:
            AddToRoomResponse dictionary with operation result
            
        Requirements: 7.2, 7.5
        """
        room_id = arguments.get('roomId', '')
        movie_id = arguments.get('movieId', '')
        
        if not room_id or not movie_id:
            raise ValueError("roomId and movieId are required")
        
        # Extract user ID from GraphQL context (Cognito JWT)
        user_id = None
        if event and event.get('identity'):
            user_id = event['identity'].get('sub')
        
        if not user_id:
            # Fallback for testing or when identity is not available
            user_id = 'trini-system'
            logger.warning(f"⚠️ No user identity found, using fallback user ID: {user_id}")
        
        try:
            logger.info(f"🎬 Processing addTriniRecommendationToRoom: room {room_id}, movie {movie_id}, user {user_id}")
            
            # Use room service to add recommendation
            from utils.room_service import get_room_service
            room_service = get_room_service(AWS_REGION)
            
            result = await room_service.add_recommendation_to_room(room_id, movie_id, user_id)
            
            logger.info(f"✅ Add to room result: {result['success']} - {result['message']}")
            
            return {
                'success': result['success'],
                'message': result['message'],
                'roomId': result['room_id'],
                'movieId': result['movie_id']
            }
            
        except Exception as e:
            logger.error(f"❌ Error in _handle_add_to_room: {str(e)}")
            return {
                'success': False,
                'message': f'Error interno: {str(e)}',
                'roomId': room_id,
                'movieId': movie_id
            }
    
    def _create_error_response(self, error_message: str, processing_time_ms: int = 0) -> Dict[str, Any]:
        """Create standardized error response."""
        response = TriniResponse(
            message="Lo siento, ha ocurrido un error. Por favor, intenta de nuevo.",
            error=error_message,
            fallback_used=True,
            processing_time_ms=processing_time_ms
        )
        return response.to_dict()
    
    def _validate_environment(self) -> None:
        """Validate required environment variables."""
        required_vars = [
            'HUGGINGFACE_API_KEY',
            'TMDB_API_KEY',
            'CHAT_SESSIONS_TABLE',
            'AWS_REGION'
        ]
        
        missing_vars = [var for var in required_vars if not os.environ.get(var)]
        if missing_vars:
            raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
        
        logger.info("✅ Environment validation passed")


# Global handler instance
trini_handler = TriniHandler()


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler function.
    
    Args:
        event: Lambda event containing GraphQL query information
        context: Lambda context object
        
    Returns:
        Dictionary response for GraphQL
    """
    logger.info("🚀 Trini Lambda handler invoked")
    
    try:
        # Validate environment on cold start
        trini_handler._validate_environment()
        
        # Process the query asynchronously
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(trini_handler.process_query(event))
            return result
        finally:
            loop.close()
            
    except Exception as e:
        logger.error(f"💥 Fatal error in handler: {str(e)}")
        if DEBUG_MODE:
            logger.error(f"Traceback: {traceback.format_exc()}")
        
        # Return error response that won't break GraphQL
        return {
            'sessionId': 'error-session',
            'message': 'Lo siento, el servicio no está disponible en este momento.',
            'recommendations': [],
            'confidence': 0.0,
            'error': str(e),
            'fallbackUsed': True,
            'processingTimeMs': 0
        }


# For local testing
if __name__ == "__main__":
    # Test event
    test_event = {
        'info': {'fieldName': 'askTrini'},
        'arguments': {
            'input': {
                'query': 'Quiero películas de acción de los 90',
                'userId': 'test-user-123'
            }
        }
    }
    
    result = handler(test_event, None)
    print(json.dumps(result, indent=2, ensure_ascii=False))