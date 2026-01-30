"""
Validation utilities for Trini Lambda function inputs.
"""

import re
from typing import Optional, Dict, Any, List
from .constants import ERROR_MESSAGES


def validate_query(query: str) -> tuple[bool, Optional[str]]:
    """
    Validate a natural language movie query.
    
    Args:
        query: The user's movie query
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not query:
        return False, ERROR_MESSAGES['INVALID_QUERY']
    
    if not isinstance(query, str):
        return False, ERROR_MESSAGES['INVALID_QUERY']
    
    # Check minimum length
    if len(query.strip()) < 3:
        return False, "La consulta debe tener al menos 3 caracteres."
    
    # Check maximum length
    if len(query) > 500:
        return False, "La consulta es demasiado larga. Máximo 500 caracteres."
    
    # Check for potentially harmful content (basic sanitization)
    harmful_patterns = [
        r'<script',
        r'javascript:',
        r'on\w+\s*=',
        r'eval\s*\(',
        r'document\.',
        r'window\.'
    ]
    
    query_lower = query.lower()
    for pattern in harmful_patterns:
        if re.search(pattern, query_lower):
            return False, "La consulta contiene contenido no permitido."
    
    return True, None


def validate_user_id(user_id: str) -> tuple[bool, Optional[str]]:
    """
    Validate a user ID.
    
    Args:
        user_id: The user identifier
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not user_id:
        return False, ERROR_MESSAGES['INVALID_USER']
    
    if not isinstance(user_id, str):
        return False, ERROR_MESSAGES['INVALID_USER']
    
    # Check format (UUID-like or Cognito format)
    if not re.match(r'^[a-zA-Z0-9\-_]{8,128}$', user_id):
        return False, "Formato de usuario no válido."
    
    return True, None


def validate_session_id(session_id: str) -> tuple[bool, Optional[str]]:
    """
    Validate a session ID.
    
    Args:
        session_id: The session identifier
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not session_id:
        return False, "ID de sesión requerido."
    
    if not isinstance(session_id, str):
        return False, "Formato de sesión no válido."
    
    # Check UUID format
    if not re.match(r'^[a-f0-9\-]{36}$', session_id):
        return False, "Formato de sesión no válido."
    
    return True, None


def validate_room_id(room_id: str) -> tuple[bool, Optional[str]]:
    """
    Validate a room ID.
    
    Args:
        room_id: The room identifier
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not room_id:
        return False, "ID de sala requerido."
    
    if not isinstance(room_id, str):
        return False, "Formato de sala no válido."
    
    # Check format (UUID-like)
    if not re.match(r'^[a-zA-Z0-9\-_]{8,64}$', room_id):
        return False, "Formato de sala no válido."
    
    return True, None


def validate_movie_id(movie_id: str) -> tuple[bool, Optional[str]]:
    """
    Validate a movie ID.
    
    Args:
        movie_id: The movie identifier
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not movie_id:
        return False, "ID de película requerido."
    
    if not isinstance(movie_id, str):
        return False, "Formato de película no válido."
    
    # Check format (numeric TMDB ID)
    if not re.match(r'^\d{1,10}$', movie_id):
        return False, "Formato de película no válido."
    
    return True, None


def validate_graphql_input(field_name: str, arguments: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate GraphQL input based on field name.
    
    Args:
        field_name: The GraphQL field being called
        arguments: The arguments provided
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if field_name == 'askTrini':
        input_data = arguments.get('input', {})
        
        # Validate query
        query = input_data.get('query', '')
        is_valid, error = validate_query(query)
        if not is_valid:
            return False, error
        
        # Validate user ID
        user_id = input_data.get('userId', '')
        is_valid, error = validate_user_id(user_id)
        if not is_valid:
            return False, error
        
        # Validate optional session ID
        session_id = input_data.get('sessionId')
        if session_id:
            is_valid, error = validate_session_id(session_id)
            if not is_valid:
                return False, error
    
    elif field_name == 'getChatHistory':
        # Validate user ID
        user_id = arguments.get('userId', '')
        is_valid, error = validate_user_id(user_id)
        if not is_valid:
            return False, error
        
        # Validate limit
        limit = arguments.get('limit', 10)
        if not isinstance(limit, int) or limit < 1 or limit > 50:
            return False, "Límite debe ser entre 1 y 50."
    
    elif field_name == 'addTriniRecommendationToRoom':
        # Validate room ID
        room_id = arguments.get('roomId', '')
        is_valid, error = validate_room_id(room_id)
        if not is_valid:
            return False, error
        
        # Validate movie ID
        movie_id = arguments.get('movieId', '')
        is_valid, error = validate_movie_id(movie_id)
        if not is_valid:
            return False, error
    
    else:
        return False, f"Campo GraphQL no reconocido: {field_name}"
    
    return True, None


def sanitize_query(query: str) -> str:
    """
    Sanitize a user query for safe processing.
    
    Args:
        query: Raw user query
        
    Returns:
        Sanitized query string
    """
    if not query:
        return ""
    
    # Remove potentially harmful content
    sanitized = re.sub(r'<[^>]*>', '', query)  # Remove HTML tags
    sanitized = re.sub(r'javascript:', '', sanitized, flags=re.IGNORECASE)  # Remove javascript:
    sanitized = re.sub(r'on\w+\s*=', '', sanitized, flags=re.IGNORECASE)  # Remove event handlers
    
    # Normalize whitespace
    sanitized = re.sub(r'\s+', ' ', sanitized).strip()
    
    # Limit length
    if len(sanitized) > 500:
        sanitized = sanitized[:500]
    
    return sanitized


def extract_year_from_query(query: str) -> Optional[tuple[int, int]]:
    """
    Extract year or year range from query text.
    
    Args:
        query: User query text
        
    Returns:
        Tuple of (min_year, max_year) or None if no years found
    """
    # Pattern for specific years
    year_patterns = [
        r'\b(19|20)\d{2}\b',  # 4-digit years
        r'\b\d{2}s?\b',  # 2-digit years like "90s"
        r'\baños?\s+(19|20)\d{2}\b',  # "año 1995"
        r'\bdel?\s+(19|20)\d{2}\b',  # "del 1995"
    ]
    
    years = []
    for pattern in year_patterns:
        matches = re.findall(pattern, query)
        for match in matches:
            if isinstance(match, tuple):
                year_str = ''.join(match)
            else:
                year_str = match
            
            # Convert 2-digit to 4-digit years
            if len(year_str) == 2:
                year_num = int(year_str)
                if year_num >= 20:
                    year_num += 1900
                else:
                    year_num += 2000
            else:
                year_num = int(year_str)
            
            # Validate year range
            if 1900 <= year_num <= 2030:
                years.append(year_num)
    
    if not years:
        return None
    
    return min(years), max(years)


def is_ambiguous_query(query: str, confidence: float) -> bool:
    """
    Determine if a query is ambiguous and needs clarification.
    
    Args:
        query: User query text
        confidence: AI confidence score
        
    Returns:
        True if query is ambiguous
    """
    # Low confidence from AI
    if confidence < 0.5:
        return True
    
    # Very short queries
    if len(query.strip().split()) < 2:
        return True
    
    # Vague terms that need clarification
    vague_terms = [
        'buena', 'buenas', 'good', 'nice',
        'algo', 'cualquier', 'any', 'something',
        'reciente', 'nueva', 'recent', 'new',
        'popular', 'famosa', 'famous',
        'interesante', 'interesting'
    ]
    
    query_words = query.lower().split()
    vague_count = sum(1 for word in query_words if word in vague_terms)
    
    # If more than half the words are vague
    if len(query_words) > 0 and vague_count / len(query_words) > 0.5:
        return True
    
    return False