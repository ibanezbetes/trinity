"""
AI prompt generation utilities for Salamandra-2b model integration.

This module handles the creation of structured prompts for the Hugging Face
Salamandra-2b model to extract movie filters from natural language queries.
"""

import json
import re
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from models.user_context import UserContext
from models.extracted_filters import ExtractedFilters, RatingRange, YearRange
from .genre_mapping import GenreMapper
from .constants import TMDB_GENRE_MAP, ERROR_MESSAGES

# Configure logging
logger = logging.getLogger(__name__)


class AIPromptGenerator:
    """Generates AI prompts for movie query processing."""
    
    def __init__(self):
        """Initialize the prompt generator with genre mapping utilities."""
        self.genre_mapper = GenreMapper()
        self.current_year = datetime.now().year
    
    def create_ai_prompt(self, user_query: str, user_context: UserContext) -> str:
        """
        Create a structured prompt for Salamandra-2b to extract movie filters.
        
        This function creates a comprehensive prompt that includes:
        - Clear instructions for the AI model
        - User context for personalization
        - Expected JSON response format
        - Examples for better understanding
        
        Args:
            user_query: Natural language movie query from the user
            user_context: User context with preferences and history
            
        Returns:
            Formatted prompt string for the AI model
        """
        # Sanitize and validate input
        clean_query = self._sanitize_query(user_query)
        if not clean_query:
            raise ValueError("Query cannot be empty after sanitization")
        
        # Create context string from user preferences
        context_string = self._create_context_string(user_context)
        
        # Generate the structured prompt
        prompt = f"""Eres Trini, un experto asistente de cine que ayuda a encontrar películas perfectas. Tu tarea es extraer información estructurada de consultas en lenguaje natural sobre películas.

CONSULTA DEL USUARIO: "{clean_query}"

CONTEXTO DEL USUARIO:
{context_string}

INSTRUCCIONES:
1. Analiza la consulta y extrae filtros de búsqueda de películas
2. Mapea géneros cinematográficos a IDs de TMDB usando esta referencia:
   - Acción/Action: 28, Aventura: 12
   - Comedia/Comedy: 35, Drama: 18
   - Terror/Horror: 27, Suspenso/Thriller: 53
   - Romance: 10749, Ciencia Ficción/Sci-Fi: 878
   - Fantasía/Fantasy: 14, Crimen/Crime: 80
   - Animación: 16, Documental: 99
   - Familiar/Family: 10751, Historia: 36
   - Música/Musical: 10402, Misterio/Mystery: 9648
   - Guerra/War: 10752, Western: 37

3. Convierte referencias temporales a rangos de años:
   - "años 90" → 1990-1999
   - "recientes" → {self.current_year-3}-{self.current_year}
   - "clásicas" → 1950-1990
   - "década de 2000" → 2000-2009

4. Determina la intención:
   - "recommendation": busca recomendaciones de películas
   - "information": busca información sobre películas específicas
   - "clarification": la consulta es ambigua y necesita aclaración

5. Asigna un puntaje de confianza (0.0-1.0):
   - 0.9-1.0: Consulta muy específica y clara
   - 0.7-0.8: Consulta clara con algunos criterios
   - 0.5-0.6: Consulta moderadamente clara
   - 0.0-0.4: Consulta ambigua o incompleta

RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO EN ESTE FORMATO EXACTO:
{{
  "genres": [lista de IDs de género como strings, ej: ["28", "35"]],
  "year_range": {{"min": año_mínimo, "max": año_máximo}} o null,
  "rating_min": número_decimal o null,
  "keywords": [lista de palabras clave relevantes],
  "intent": "recommendation|information|clarification",
  "confidence": número_decimal_entre_0_y_1
}}

EJEMPLOS:
Consulta: "Quiero películas de acción de los 90"
Respuesta: {{"genres": ["28"], "year_range": {{"min": 1990, "max": 1999}}, "rating_min": null, "keywords": ["acción", "años 90"], "intent": "recommendation", "confidence": 0.9}}

Consulta: "Algo divertido para ver"
Respuesta: {{"genres": ["35"], "year_range": null, "rating_min": null, "keywords": ["divertido"], "intent": "recommendation", "confidence": 0.6}}

Consulta: "¿Qué tal está Inception?"
Respuesta: {{"genres": [], "year_range": null, "rating_min": null, "keywords": ["Inception"], "intent": "information", "confidence": 0.8}}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional."""

        return prompt
    
    def _sanitize_query(self, query: str) -> str:
        """
        Sanitize user query to prevent injection and ensure clean processing.
        
        Args:
            query: Raw user query
            
        Returns:
            Sanitized query string
        """
        if not query or not isinstance(query, str):
            return ""
        
        # Remove excessive whitespace
        clean_query = re.sub(r'\s+', ' ', query.strip())
        
        # Remove potentially harmful characters but keep Spanish accents
        clean_query = re.sub(r'[<>{}[\]\\]', '', clean_query)
        
        # Limit length to prevent abuse
        if len(clean_query) > 500:
            clean_query = clean_query[:500]
        
        return clean_query
    
    def _create_context_string(self, user_context: UserContext) -> str:
        """
        Create a context string from user preferences and history.
        
        Args:
            user_context: User context with preferences
            
        Returns:
            Formatted context string for the AI prompt
        """
        context_parts = []
        
        # Add preferred genres with names
        if user_context.preferred_genres:
            genre_names = [
                self.genre_mapper.get_genre_name(gid) 
                for gid in user_context.preferred_genres[:5]  # Limit to top 5
            ]
            context_parts.append(f"- Géneros preferidos: {', '.join(genre_names)}")
        
        # Add recent movie count (don't expose specific titles for privacy)
        if user_context.recent_movies:
            context_parts.append(f"- Ha visto {len(user_context.recent_movies)} películas recientemente")
        
        # Add rating preference
        if user_context.rating_preference:
            context_parts.append(f"- Prefiere películas con rating mínimo: {user_context.rating_preference}")
        
        # Add decade preferences
        if user_context.preferred_decades:
            context_parts.append(f"- Décadas preferidas: {', '.join(user_context.preferred_decades)}")
        
        # Add room context if applicable
        if user_context.has_room_context():
            excluded_count = len(user_context.room_voted_movies)
            context_parts.append(f"- En sala de votación (excluir {excluded_count} películas ya votadas)")
        
        # Add disliked genres
        if user_context.disliked_genres:
            disliked_names = [
                self.genre_mapper.get_genre_name(gid) 
                for gid in user_context.disliked_genres[:3]  # Limit to top 3
            ]
            context_parts.append(f"- Evitar géneros: {', '.join(disliked_names)}")
        
        # Default context if no preferences available
        if not context_parts:
            context_parts.append("- Sin preferencias previas registradas")
        
        return "\n".join(context_parts)
    
    def extract_keywords_with_patterns(self, query: str) -> ExtractedFilters:
        """
        Fallback keyword extraction using pattern matching when AI is unavailable.
        
        This method provides a backup mechanism for extracting basic filters
        from movie queries using regex patterns and predefined mappings.
        
        Args:
            query: Natural language movie query
            
        Returns:
            ExtractedFilters object with basic extracted information
        """
        query_lower = query.lower()
        
        # Extract genres using the genre mapper
        genres = self.genre_mapper.extract_genres_from_text(query)
        
        # Special handling for Spanish comedy queries
        if 'comedia' in query_lower and ('español' in query_lower or 'española' in query_lower):
            genres = [35]  # Comedy genre
            keywords = ['comedia', 'española', 'español']
            confidence = 0.8  # Higher confidence for specific Spanish comedy queries
        else:
            # Extract year ranges using patterns
            year_range = self._extract_year_range_patterns(query_lower)
            
            # Extract rating hints
            rating_min = self._extract_rating_patterns(query_lower)
            
            # Extract basic keywords
            keywords = self._extract_basic_keywords(query)
            
            # Assign confidence based on specificity
            confidence = 0.6 if genres else 0.4 if keywords else 0.2
        
        # Extract year ranges using patterns
        year_range = self._extract_year_range_patterns(query_lower)
        
        # Extract rating hints
        rating_min = self._extract_rating_patterns(query_lower)
        
        # Determine intent based on patterns
        intent = self._determine_intent_patterns(query_lower)
        
        return ExtractedFilters(
            genres=genres,
            year_range=year_range,
            rating_range=None if rating_min is None else RatingRange(min_rating=rating_min, max_rating=None),
            keywords=keywords,
            intent=intent,
            confidence=confidence
        )
    
    def _extract_year_range_patterns(self, query: str) -> Optional[YearRange]:
        """Extract year ranges using regex patterns."""
        
        # Pattern for decades (check these first before specific years)
        decade_patterns = {
            r'\b(años?\s*)?90s?\b|\baños?\s*noventa\b': YearRange(1990, 1999),
            r'\b(años?\s*)?80s?\b|\baños?\s*ochenta\b': YearRange(1980, 1989),
            r'\b(años?\s*)?2000s?\b|\bdécada\s*del?\s*2000\b': YearRange(2000, 2009),
            r'\b(años?\s*)?2010s?\b|\bdécada\s*del?\s*2010\b': YearRange(2010, 2019),
            r'\brecientes?\b|\bactual(es)?\b|\bnuevas?\b': YearRange(self.current_year-3, self.current_year),
            r'\bclásicas?\b|\bantiguos?\b|\bviejas?\b': YearRange(1950, 1990)
        }
        
        for pattern, year_range in decade_patterns.items():
            if re.search(pattern, query):
                return year_range
        
        # Pattern for specific years (e.g., "1995", "2010") - check after decades
        year_match = re.search(r'\b(19|20)\d{2}\b', query)
        if year_match:
            year = int(year_match.group())
            return YearRange(min_year=year-2, max_year=year+2)  # ±2 years range
        
        return None
    
    def _extract_rating_patterns(self, query: str) -> Optional[float]:
        """Extract rating preferences using patterns."""
        # Pattern for explicit ratings
        rating_match = re.search(r'\b(\d+(?:\.\d+)?)\s*(?:estrellas?|stars?|puntos?|rating)\b', query)
        if rating_match:
            rating = float(rating_match.group(1))
            return min(max(rating, 0.0), 10.0)  # Clamp between 0-10
        
        # Pattern for "rating de X.X" format
        rating_de_match = re.search(r'\brating\s+de\s+(\d+(?:\.\d+)?)\b', query)
        if rating_de_match:
            rating = float(rating_de_match.group(1))
            return min(max(rating, 0.0), 10.0)  # Clamp between 0-10
        
        # Pattern for quality descriptors
        quality_patterns = {
            r'\b(excelentes?|increíbles?|fantásticas?|geniales?)\b': 8.0,
            r'\b(buenas?|buenos?|recomendadas?|populares?)\b': 7.0,
            r'\b(decentes?|aceptables?)\b': 6.0
        }
        
        for pattern, rating in quality_patterns.items():
            if re.search(pattern, query):
                return rating
        
        return None
    
    def _extract_basic_keywords(self, query: str) -> List[str]:
        """Extract basic keywords from the query."""
        # Remove common stop words in Spanish and English
        stop_words = {
            'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'con', 'por', 'para',
            'que', 'se', 'me', 'te', 'le', 'nos', 'les', 'y', 'o', 'pero', 'si', 'no',
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
            'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
            'after', 'above', 'below', 'between', 'among', 'is', 'are', 'was', 'were',
            'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall'
        }
        
        # Extract words, keeping only meaningful ones
        words = re.findall(r'\b\w+\b', query.lower())
        keywords = [word for word in words if len(word) > 2 and word not in stop_words]
        
        # Limit to most relevant keywords
        return keywords[:10]
    
    def _determine_intent_patterns(self, query: str) -> str:
        """Determine user intent using pattern matching."""
        # Information seeking patterns
        info_patterns = [
            r'\b(qué tal|cómo está|opinión|review|crítica)\b',
            r'\b(cuándo|dónde|quién|por qué|cómo)\b',
            r'\b(información|detalles|datos)\b'
        ]
        
        for pattern in info_patterns:
            if re.search(pattern, query):
                return 'information'
        
        # Clarification patterns (very short or vague queries)
        if len(query.split()) <= 2 or any(word in query for word in ['algo', 'cualquier', 'no sé']):
            return 'clarification'
        
        # Default to recommendation
        return 'recommendation'
    
    def validate_ai_response(self, ai_response: str) -> bool:
        """
        Validate that AI response is properly formatted JSON.
        
        Args:
            ai_response: Raw response from AI model
            
        Returns:
            True if response is valid JSON with required fields
        """
        try:
            parsed = json.loads(ai_response)
            
            # Check required fields
            required_fields = ['genres', 'intent', 'confidence']
            for field in required_fields:
                if field not in parsed:
                    return False
            
            # Validate data types
            if not isinstance(parsed['genres'], list):
                return False
            
            if parsed['intent'] not in ['recommendation', 'information', 'clarification']:
                return False
            
            if not isinstance(parsed['confidence'], (int, float)) or not (0.0 <= parsed['confidence'] <= 1.0):
                return False
            
            return True
            
        except (json.JSONDecodeError, TypeError, KeyError):
            return False
    
    def process_ai_response(self, ai_response: str, user_query: str = "", user_context: Optional['UserContext'] = None) -> ExtractedFilters:
        """
        Process and validate AI response, with fallback to pattern matching.
        
        This function implements the core AI response parsing and validation logic:
        1. Attempts to parse JSON response from AI model
        2. Validates the structure and data types
        3. Falls back to pattern matching if AI response is invalid
        4. Implements confidence scoring and ambiguity detection
        5. Populates exclude_ids from room context for movie deduplication
        
        Args:
            ai_response: Raw response from Salamandra-2b model
            user_query: Original user query for fallback processing
            user_context: User context containing room information and exclusions
            
        Returns:
            ExtractedFilters object with validated and processed data
        """
        # First, try to parse as JSON
        try:
            parsed_response = self._parse_and_validate_json_response(ai_response)
            if parsed_response:
                # Populate exclude_ids from user context (Requirements 7.3)
                if user_context:
                    parsed_response.exclude_ids = user_context.get_exclude_list()
                return parsed_response
        except Exception as e:
            logger.warning(f"JSON parsing failed: {str(e)}")
        
        # If JSON parsing fails, try to extract JSON from mixed content
        try:
            extracted_json = self._extract_json_from_mixed_content(ai_response)
            if extracted_json:
                parsed_response = self._parse_and_validate_json_response(extracted_json)
                if parsed_response:
                    # Populate exclude_ids from user context (Requirements 7.3)
                    if user_context:
                        parsed_response.exclude_ids = user_context.get_exclude_list()
                    return parsed_response
        except Exception as e:
            logger.warning(f"JSON extraction from mixed content failed: {str(e)}")
        
        # If all JSON attempts fail, fall back to pattern matching
        logger.info("Falling back to pattern-based keyword extraction")
        fallback_filters = self.extract_keywords_with_patterns(user_query or "")
        fallback_filters.confidence = min(fallback_filters.confidence, 0.4)  # Cap confidence for fallback
        
        # Populate exclude_ids from user context (Requirements 7.3)
        if user_context:
            fallback_filters.exclude_ids = user_context.get_exclude_list()
            logger.info(f"🚫 Added {len(fallback_filters.exclude_ids)} movies to exclude list from room context")
        
        return fallback_filters
    
    def _parse_and_validate_json_response(self, json_str: str) -> Optional[ExtractedFilters]:
        """
        Parse and validate JSON response from AI model.
        
        Args:
            json_str: JSON string from AI response
            
        Returns:
            ExtractedFilters object if valid, None if invalid
        """
        try:
            # Check for empty or whitespace-only strings
            if not json_str or not json_str.strip():
                logger.debug("Empty JSON string provided, skipping JSON parsing")
                return None
                
            parsed = json.loads(json_str.strip())
            
            # Validate required fields and structure
            if not self._validate_json_structure(parsed):
                return None
            
            # Extract and validate individual components
            genres = self._extract_and_validate_genres(parsed.get('genres', []))
            year_range = self._extract_and_validate_year_range(parsed.get('year_range'))
            rating_range = self._extract_and_validate_rating_range(parsed)
            keywords = self._extract_and_validate_keywords(parsed.get('keywords', []))
            intent = self._validate_intent(parsed.get('intent', 'recommendation'))
            confidence = self._validate_confidence(parsed.get('confidence', 0.0))
            
            # Create ExtractedFilters object
            filters = ExtractedFilters(
                genres=genres,
                year_range=year_range,
                rating_range=rating_range,
                keywords=keywords,
                intent=intent,
                confidence=confidence
            )
            
            # Apply ambiguity detection and confidence adjustment
            filters = self._apply_ambiguity_detection(filters)
            
            return filters
            
        except (json.JSONDecodeError, TypeError, KeyError, ValueError) as e:
            logger.warning(f"JSON validation failed: {str(e)}")
            return None
    
    def _extract_json_from_mixed_content(self, content: str) -> Optional[str]:
        """
        Extract JSON from mixed content that may contain additional text.
        
        Sometimes AI models return JSON wrapped in explanatory text.
        This function attempts to extract the JSON portion.
        
        Args:
            content: Mixed content that may contain JSON
            
        Returns:
            Extracted JSON string if found, None otherwise
        """
        # Look for JSON object patterns
        json_patterns = [
            r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}',  # Simple nested JSON
            r'\{.*?"confidence".*?\}',  # JSON containing confidence field
            r'\{.*?"genres".*?\}',      # JSON containing genres field
        ]
        
        for pattern in json_patterns:
            matches = re.findall(pattern, content, re.DOTALL)
            for match in matches:
                try:
                    # Test if it's valid JSON
                    json.loads(match)
                    return match
                except json.JSONDecodeError:
                    continue
        
        # Try to find JSON between common delimiters
        delimiters = [
            (r'```json\s*', r'\s*```'),
            (r'```\s*', r'\s*```'),
            (r'`\s*', r'\s*`'),
            (r':\s*', r'\s*$'),
        ]
        
        for start_delim, end_delim in delimiters:
            pattern = f'{start_delim}(.*?){end_delim}'
            matches = re.findall(pattern, content, re.DOTALL | re.MULTILINE)
            for match in matches:
                try:
                    json.loads(match.strip())
                    return match.strip()
                except json.JSONDecodeError:
                    continue
        
        return None
    
    def _validate_json_structure(self, parsed: Dict[str, Any]) -> bool:
        """
        Validate the basic structure of parsed JSON response.
        
        Args:
            parsed: Parsed JSON object
            
        Returns:
            True if structure is valid, False otherwise
        """
        # Check required fields
        required_fields = ['genres', 'intent', 'confidence']
        for field in required_fields:
            if field not in parsed:
                logger.warning(f"Missing required field: {field}")
                return False
        
        # Check data types
        if not isinstance(parsed['genres'], list):
            logger.warning("Genres field must be a list")
            return False
        
        if parsed['intent'] not in ['recommendation', 'information', 'clarification']:
            logger.warning(f"Invalid intent: {parsed['intent']}")
            return False
        
        if not isinstance(parsed['confidence'], (int, float)):
            logger.warning("Confidence must be a number")
            return False
        
        if not (0.0 <= parsed['confidence'] <= 1.0):
            logger.warning(f"Confidence {parsed['confidence']} must be between 0.0 and 1.0")
            return False
        
        return True
    
    def _extract_and_validate_genres(self, genres_data: List[Any]) -> List[str]:
        """
        Extract and validate genre data from AI response.
        
        Args:
            genres_data: Raw genres data from AI response
            
        Returns:
            List of validated TMDB genre ID strings
        """
        validated_genres = []
        
        for genre in genres_data:
            if isinstance(genre, str) and genre.isdigit():
                genre_id = int(genre)
                if 1 <= genre_id <= 99999:  # Reasonable range for TMDB IDs
                    validated_genres.append(genre)
            elif isinstance(genre, int):
                if 1 <= genre <= 99999:
                    validated_genres.append(str(genre))
            elif isinstance(genre, str):
                # Try to map genre name to ID
                mapped_id = self.genre_mapper.get_genre_id_by_name(genre.lower())
                if mapped_id:
                    validated_genres.append(mapped_id)
        
        return validated_genres
    
    def _extract_and_validate_year_range(self, year_data: Optional[Dict[str, Any]]) -> Optional[YearRange]:
        """
        Extract and validate year range data from AI response.
        
        Args:
            year_data: Raw year range data from AI response
            
        Returns:
            YearRange object if valid, None otherwise
        """
        if not year_data or not isinstance(year_data, dict):
            return None
        
        min_year = year_data.get('min')
        max_year = year_data.get('max')
        
        # Validate year values
        if min_year is not None:
            if not isinstance(min_year, int) or not (1900 <= min_year <= 2030):
                min_year = None
        
        if max_year is not None:
            if not isinstance(max_year, int) or not (1900 <= max_year <= 2030):
                max_year = None
        
        # Ensure logical range
        if min_year and max_year and min_year > max_year:
            min_year, max_year = max_year, min_year
        
        if min_year or max_year:
            return YearRange(min_year=min_year, max_year=max_year)
        
        return None
    
    def _extract_and_validate_rating_range(self, parsed: Dict[str, Any]) -> Optional[RatingRange]:
        """
        Extract and validate rating range data from AI response.
        
        Args:
            parsed: Full parsed JSON response
            
        Returns:
            RatingRange object if valid, None otherwise
        """
        rating_min = parsed.get('rating_min')
        rating_max = parsed.get('rating_max')
        
        # Validate rating values
        if rating_min is not None:
            if not isinstance(rating_min, (int, float)) or not (0.0 <= rating_min <= 10.0):
                rating_min = None
        
        if rating_max is not None:
            if not isinstance(rating_max, (int, float)) or not (0.0 <= rating_max <= 10.0):
                rating_max = None
        
        # Ensure logical range
        if rating_min and rating_max and rating_min > rating_max:
            rating_min, rating_max = rating_max, rating_min
        
        if rating_min is not None or rating_max is not None:
            return RatingRange(min_rating=rating_min, max_rating=rating_max)
        
        return None
    
    def _extract_and_validate_keywords(self, keywords_data: List[Any]) -> List[str]:
        """
        Extract and validate keywords from AI response.
        
        Args:
            keywords_data: Raw keywords data from AI response
            
        Returns:
            List of validated keyword strings
        """
        validated_keywords = []
        
        for keyword in keywords_data:
            if isinstance(keyword, str):
                clean_keyword = keyword.strip()
                if 2 <= len(clean_keyword) <= 50:  # Minimum 2 characters, maximum 50
                    validated_keywords.append(clean_keyword)
        
        return validated_keywords[:10]  # Limit to 10 keywords
    
    def _validate_intent(self, intent: str) -> str:
        """
        Validate and normalize intent value.
        
        Args:
            intent: Raw intent value from AI response
            
        Returns:
            Validated intent string
        """
        valid_intents = ['recommendation', 'information', 'clarification']
        
        if isinstance(intent, str) and intent.lower() in valid_intents:
            return intent.lower()
        
        # Default to recommendation if invalid
        return 'recommendation'
    
    def _validate_confidence(self, confidence: Any) -> float:
        """
        Validate and normalize confidence score.
        
        Args:
            confidence: Raw confidence value from AI response
            
        Returns:
            Validated confidence score between 0.0 and 1.0
        """
        if isinstance(confidence, (int, float)):
            return max(0.0, min(1.0, float(confidence)))
        
        # Default to low confidence if invalid
        return 0.1
    
    def _apply_ambiguity_detection(self, filters: ExtractedFilters) -> ExtractedFilters:
        """
        Apply ambiguity detection and adjust confidence accordingly.
        
        This function implements sophisticated ambiguity detection by analyzing:
        - Number of extracted filters
        - Specificity of filters
        - Consistency of extracted data
        
        Args:
            filters: ExtractedFilters object to analyze
            
        Returns:
            ExtractedFilters with adjusted confidence and intent
        """
        original_confidence = filters.confidence
        
        # Count meaningful filters
        filter_count = 0
        if filters.genres:
            filter_count += 1
        if filters.year_range:
            filter_count += 1
        if filters.rating_range:
            filter_count += 1
        if filters.keywords:
            filter_count += len(filters.keywords) * 0.1  # Keywords count less
        
        # Adjust confidence based on filter specificity
        if filter_count == 0:
            # No meaningful filters extracted - very ambiguous
            filters.confidence = min(original_confidence, 0.2)
            filters.intent = 'clarification'
        elif filter_count < 1:
            # Very few filters - likely ambiguous
            filters.confidence = min(original_confidence, 0.4)
        elif filter_count >= 2:
            # Multiple specific filters - boost confidence slightly
            confidence_boost = min(original_confidence * 0.1, 0.1)  # Max 10% boost
            filters.confidence = min(original_confidence + confidence_boost, 1.0)
        
        # Check for conflicting or nonsensical combinations
        if filters.year_range and filters.year_range.min_year and filters.year_range.max_year:
            year_span = filters.year_range.max_year - filters.year_range.min_year
            if year_span > 30:  # Very wide year range suggests ambiguity
                filters.confidence = min(filters.confidence, 0.6)
        
        # If confidence is very low, suggest clarification
        if filters.confidence < 0.5 and filters.intent == 'recommendation':
            filters.intent = 'clarification'
        
        return filters
    
    def detect_ambiguous_query(self, extracted_filters: ExtractedFilters, user_query: str = "") -> bool:
        """
        Detect if a query is ambiguous and needs clarification.
        
        This function implements comprehensive ambiguity detection by analyzing:
        - Confidence score from AI processing
        - Number and specificity of extracted filters
        - Query length and complexity
        - Presence of vague terms
        
        Args:
            extracted_filters: Processed filters from AI or pattern matching
            user_query: Original user query for additional analysis
            
        Returns:
            True if query is ambiguous and needs clarification, False otherwise
        """
        # Check if we have specific filters - if so, don't consider it ambiguous
        # even if confidence is low (this handles fallback scenarios better)
        has_specific_filters = (
            len(extracted_filters.genres) > 0 or
            extracted_filters.year_range is not None or
            extracted_filters.rating_range is not None or
            len(extracted_filters.keywords) >= 2
        )
        
        # If we have specific filters, only consider it ambiguous if confidence is very low
        if has_specific_filters:
            return extracted_filters.confidence < 0.2
        
        # Primary indicator: low confidence score for queries without specific filters
        if extracted_filters.confidence < 0.5:
            return True
        
        # Secondary indicators based on extracted content
        ambiguity_score = 0.0
        
        # Check filter specificity
        if not extracted_filters.has_filters():
            ambiguity_score += 0.4
        
        if len(extracted_filters.genres) == 0:
            ambiguity_score += 0.2
        
        if not extracted_filters.year_range and not extracted_filters.rating_range:
            ambiguity_score += 0.2
        
        # Analyze query text if provided
        if user_query:
            query_lower = user_query.lower().strip()
            
            # Very short queries are often ambiguous
            if len(query_lower.split()) <= 2:
                ambiguity_score += 0.3
            
            # Check for vague terms
            vague_terms = [
                'algo', 'something', 'cualquier', 'anything', 'no sé', "don't know",
                'bueno', 'good', 'entretenimiento', 'entertainment', 'película', 'movie',
                'film', 'ver', 'watch', 'recomendación', 'recommendation'
            ]
            
            vague_term_count = sum(1 for term in vague_terms if term in query_lower)
            if vague_term_count >= 2:
                ambiguity_score += 0.3
            elif vague_term_count == 1 and len(query_lower.split()) <= 3:
                ambiguity_score += 0.2
        
        # Query is ambiguous if ambiguity score is high
        return ambiguity_score >= 0.5
    
    def create_clarification_message(self, extracted_filters: ExtractedFilters, user_query: str = "") -> str:
        """
        Create an appropriate clarification message for ambiguous queries.
        
        Args:
            extracted_filters: Processed filters that were deemed ambiguous
            user_query: Original user query
            
        Returns:
            Clarification message asking for more specific information
        """
        messages = [
            "¡Hola! Soy Trini, tu asistente de películas. Para darte mejores recomendaciones, ¿podrías ser más específico?",
            "Necesito un poco más de información para encontrar las películas perfectas para ti.",
            "Tu consulta es un poco general. ¿Podrías darme más detalles?"
        ]
        
        # Choose base message based on confidence level
        if extracted_filters.confidence < 0.2:
            base_message = messages[0]
        elif extracted_filters.confidence < 0.4:
            base_message = messages[1]
        else:
            base_message = messages[2]
        
        # Add specific suggestions based on what's missing
        suggestions = []
        
        if not extracted_filters.genres:
            suggestions.append("¿Qué género prefieres? (acción, comedia, drama, terror, etc.)")
        
        if not extracted_filters.year_range:
            suggestions.append("¿De qué época? (años 90, recientes, clásicas, etc.)")
        
        if not extracted_filters.rating_range and not extracted_filters.keywords:
            suggestions.append("¿Algo en particular que te guste? (superhéroes, romance, aventuras, etc.)")
        
        if suggestions:
            suggestion_text = " Por ejemplo: " + " o ".join(suggestions[:2])  # Limit to 2 suggestions
            return base_message + suggestion_text
        
        return base_message + " ¿Podrías decirme qué tipo de películas te gustan?"
    
    def create_fallback_prompt(self, user_query: str) -> str:
        """
        Create a simplified prompt for fallback scenarios.
        
        Args:
            user_query: User's movie query
            
        Returns:
            Simplified prompt string
        """
        return f"""Extrae géneros de películas de esta consulta: "{user_query}"

Responde solo con géneros separados por comas (acción, comedia, drama, terror, etc.):"""