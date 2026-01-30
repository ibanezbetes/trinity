"""
Data models for extracted filters from AI processing.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any


@dataclass
class YearRange:
    """Represents a year range filter for movies."""
    
    min_year: Optional[int] = None
    max_year: Optional[int] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'minYear': self.min_year,
            'maxYear': self.max_year
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'YearRange':
        """Create from dictionary."""
        return cls(
            min_year=data.get('minYear'),
            max_year=data.get('maxYear')
        )
    
    def is_valid(self) -> bool:
        """Check if the year range is valid."""
        if self.min_year and self.max_year:
            return self.min_year <= self.max_year
        return True


@dataclass
class RatingRange:
    """Represents a rating range filter for movies."""
    
    min_rating: Optional[float] = None
    max_rating: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'minRating': self.min_rating,
            'maxRating': self.max_rating
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'RatingRange':
        """Create from dictionary."""
        return cls(
            min_rating=data.get('minRating'),
            max_rating=data.get('maxRating')
        )
    
    def is_valid(self) -> bool:
        """Check if the rating range is valid."""
        if self.min_rating is not None and (self.min_rating < 0 or self.min_rating > 10):
            return False
        if self.max_rating is not None and (self.max_rating < 0 or self.max_rating > 10):
            return False
        if self.min_rating and self.max_rating:
            return self.min_rating <= self.max_rating
        return True


@dataclass
class ExtractedFilters:
    """Represents structured filters extracted from natural language queries."""
    
    genres: List[str] = field(default_factory=list)  # TMDB genre IDs as strings
    year_range: Optional[YearRange] = None
    rating_range: Optional[RatingRange] = None
    keywords: List[str] = field(default_factory=list)
    intent: str = "recommendation"  # 'recommendation' | 'information' | 'clarification'
    confidence: float = 0.0
    exclude_ids: List[str] = field(default_factory=list)  # Movie IDs to exclude
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'genres': self.genres,
            'yearRange': self.year_range.to_dict() if self.year_range else None,
            'ratingRange': self.rating_range.to_dict() if self.rating_range else None,
            'keywords': self.keywords,
            'intent': self.intent,
            'confidence': self.confidence,
            'excludeIds': self.exclude_ids
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ExtractedFilters':
        """Create from dictionary."""
        year_range = None
        if data.get('yearRange'):
            year_range = YearRange.from_dict(data['yearRange'])
        
        rating_range = None
        if data.get('ratingRange'):
            rating_range = RatingRange.from_dict(data['ratingRange'])
        
        return cls(
            genres=data.get('genres', []),
            year_range=year_range,
            rating_range=rating_range,
            keywords=data.get('keywords', []),
            intent=data.get('intent', 'recommendation'),
            confidence=data.get('confidence', 0.0),
            exclude_ids=data.get('excludeIds', [])
        )
    
    def has_filters(self) -> bool:
        """Check if any meaningful filters are present."""
        return bool(
            self.genres or 
            self.year_range or 
            self.rating_range or 
            self.keywords
        )
    
    def is_ambiguous(self) -> bool:
        """Check if the query is ambiguous based on confidence score."""
        return self.confidence < 0.5
    
    def get_tmdb_genre_ids(self) -> List[int]:
        """Convert genre strings to TMDB integer IDs."""
        try:
            return [int(genre_id) for genre_id in self.genres if genre_id.isdigit()]
        except (ValueError, AttributeError):
            return []
    
    def merge_with_context(self, context_filters: 'ExtractedFilters') -> 'ExtractedFilters':
        """Merge current filters with context from previous conversations."""
        merged = ExtractedFilters(
            genres=list(set(self.genres + context_filters.genres)),
            year_range=self.year_range or context_filters.year_range,
            rating_range=self.rating_range or context_filters.rating_range,
            keywords=list(set(self.keywords + context_filters.keywords)),
            intent=self.intent,
            confidence=self.confidence,
            exclude_ids=list(set(self.exclude_ids + context_filters.exclude_ids))
        )
        return merged