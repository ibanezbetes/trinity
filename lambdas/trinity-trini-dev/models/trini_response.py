"""
Response data models for Trini chatbot interactions.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import uuid


@dataclass
class MovieRecommendation:
    """Represents a single movie recommendation with relevance scoring."""
    
    movie: Dict[str, Any] = field(default_factory=dict)  # Movie object from TMDB
    relevance_score: float = 0.0
    reasoning: str = ""
    source: str = "ai_recommendation"  # 'ai_recommendation' | 'fallback' | 'cache'
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for GraphQL response."""
        return {
            'movie': self.movie,
            'relevanceScore': self.relevance_score,
            'reasoning': self.reasoning,
            'source': self.source
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'MovieRecommendation':
        """Create from dictionary."""
        return cls(
            movie=data.get('movie', {}),
            relevance_score=data.get('relevanceScore', 0.0),
            reasoning=data.get('reasoning', ''),
            source=data.get('source', 'ai_recommendation')
        )
    
    def get_movie_id(self) -> Optional[str]:
        """Extract movie ID from movie object."""
        return self.movie.get('id') or self.movie.get('movieId')
    
    def get_movie_title(self) -> str:
        """Extract movie title from movie object."""
        return self.movie.get('title', 'Unknown Title')
    
    def has_complete_data(self) -> bool:
        """Check if movie has all required fields."""
        required_fields = ['id', 'title', 'overview', 'vote_average', 'release_date']
        return all(field in self.movie and self.movie[field] is not None for field in required_fields)


@dataclass
class TriniResponse:
    """Complete response from Trini chatbot including recommendations and metadata."""
    
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    message: str = ""
    recommendations: List[MovieRecommendation] = field(default_factory=list)
    extracted_filters: Optional[Dict[str, Any]] = None
    confidence: float = 0.0
    intent: str = "recommendation"
    error: Optional[str] = None
    fallback_used: bool = False
    processing_time_ms: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for GraphQL response."""
        return {
            'sessionId': self.session_id,
            'message': self.message,
            'recommendations': [rec.to_dict() for rec in self.recommendations],
            'extractedFilters': self.extracted_filters,
            'confidence': self.confidence,
            'intent': self.intent,
            'error': self.error,
            'fallbackUsed': self.fallback_used,
            'processingTimeMs': self.processing_time_ms
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TriniResponse':
        """Create from dictionary."""
        recommendations = [
            MovieRecommendation.from_dict(rec) 
            for rec in data.get('recommendations', [])
        ]
        
        return cls(
            session_id=data.get('sessionId', str(uuid.uuid4())),
            message=data.get('message', ''),
            recommendations=recommendations,
            extracted_filters=data.get('extractedFilters'),
            confidence=data.get('confidence', 0.0),
            intent=data.get('intent', 'recommendation'),
            error=data.get('error'),
            fallback_used=data.get('fallbackUsed', False),
            processing_time_ms=data.get('processingTimeMs', 0)
        )
    
    def add_recommendation(self, recommendation: MovieRecommendation) -> None:
        """Add a recommendation to the response."""
        self.recommendations.append(recommendation)
    
    def get_movie_ids(self) -> List[str]:
        """Get list of all recommended movie IDs."""
        return [rec.get_movie_id() for rec in self.recommendations if rec.get_movie_id()]
    
    def has_recommendations(self) -> bool:
        """Check if response contains any recommendations."""
        return len(self.recommendations) > 0
    
    def is_successful(self) -> bool:
        """Check if the response represents a successful interaction."""
        return self.error is None and (self.has_recommendations() or self.intent == 'clarification')
    
    def set_error(self, error_message: str, fallback_used: bool = False) -> None:
        """Set error state for the response."""
        self.error = error_message
        self.fallback_used = fallback_used
        self.confidence = 0.0
    
    def create_clarification_response(self, clarification_message: str) -> 'TriniResponse':
        """Create a clarification response when query is ambiguous."""
        return TriniResponse(
            session_id=self.session_id,
            message=clarification_message,
            recommendations=[],
            extracted_filters=self.extracted_filters,
            confidence=self.confidence,
            intent='clarification',
            processing_time_ms=self.processing_time_ms
        )