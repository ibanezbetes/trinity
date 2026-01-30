"""
User context data model for personalized recommendations.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from decimal import Decimal


@dataclass
class UserContext:
    """Represents user context for personalized movie recommendations."""
    
    user_id: str = ""
    preferred_genres: List[str] = field(default_factory=list)  # TMDB genre IDs
    recent_movies: List[str] = field(default_factory=list)  # Recently recommended movie IDs
    disliked_genres: List[str] = field(default_factory=list)  # Genres to avoid
    preferred_decades: List[str] = field(default_factory=list)  # e.g., ['1990s', '2000s']
    rating_preference: Optional[float] = None  # Minimum rating preference
    language_preference: str = "en"  # ISO language code
    current_room_id: Optional[str] = None  # If user is in a Trinity room
    room_voted_movies: List[str] = field(default_factory=list)  # Movies already voted in current room
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage/serialization."""
        # Convert rating_preference to Decimal for DynamoDB compatibility
        rating_preference = None
        if self.rating_preference is not None:
            rating_preference = Decimal(str(self.rating_preference))
        
        return {
            'userId': self.user_id,
            'preferredGenres': self.preferred_genres,
            'recentMovies': self.recent_movies,
            'dislikedGenres': self.disliked_genres,
            'preferredDecades': self.preferred_decades,
            'ratingPreference': rating_preference,
            'languagePreference': self.language_preference,
            'currentRoomId': self.current_room_id,
            'roomVotedMovies': self.room_voted_movies
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UserContext':
        """Create from dictionary."""
        # Convert Decimal rating_preference back to float
        rating_preference = data.get('ratingPreference')
        if isinstance(rating_preference, Decimal):
            rating_preference = float(rating_preference)
        
        return cls(
            user_id=data.get('userId', ''),
            preferred_genres=data.get('preferredGenres', []),
            recent_movies=data.get('recentMovies', []),
            disliked_genres=data.get('dislikedGenres', []),
            preferred_decades=data.get('preferredDecades', []),
            rating_preference=rating_preference,
            language_preference=data.get('languagePreference', 'en'),
            current_room_id=data.get('currentRoomId'),
            room_voted_movies=data.get('roomVotedMovies', [])
        )
    
    def add_preferred_genre(self, genre_id: str) -> None:
        """Add a genre to user preferences."""
        if genre_id not in self.preferred_genres:
            self.preferred_genres.append(genre_id)
    
    def add_recent_movie(self, movie_id: str) -> None:
        """Add a movie to recent recommendations."""
        if movie_id not in self.recent_movies:
            self.recent_movies.insert(0, movie_id)  # Add to beginning
            # Keep only last 20 movies
            self.recent_movies = self.recent_movies[:20]
    
    def should_exclude_movie(self, movie_id: str) -> bool:
        """Check if a movie should be excluded from recommendations."""
        return (
            movie_id in self.recent_movies or 
            movie_id in self.room_voted_movies
        )
    
    def get_exclude_list(self) -> List[str]:
        """Get complete list of movies to exclude."""
        return list(set(self.recent_movies + self.room_voted_movies))
    
    def has_room_context(self) -> bool:
        """Check if user is currently in a Trinity room."""
        return self.current_room_id is not None
    
    def update_from_chat_session(self, chat_session) -> None:
        """Update context based on chat session history."""
        # Extract preferred genres from recent conversations
        recent_genres = chat_session.get_recent_genres(limit=10)
        for genre in recent_genres:
            self.add_preferred_genre(genre)
        
        # Update recent movies
        recent_movies = chat_session.get_recent_movies(limit=20)
        for movie_id in recent_movies:
            self.add_recent_movie(movie_id)
    
    def create_ai_context_string(self) -> str:
        """Create context string for AI prompt generation."""
        context_parts = []
        
        if self.preferred_genres:
            context_parts.append(f"Géneros preferidos: {', '.join(self.preferred_genres)}")
        
        if self.recent_movies:
            context_parts.append(f"Películas vistas recientemente: {len(self.recent_movies)} películas")
        
        if self.rating_preference:
            context_parts.append(f"Preferencia de rating mínimo: {self.rating_preference}")
        
        if self.preferred_decades:
            context_parts.append(f"Décadas preferidas: {', '.join(self.preferred_decades)}")
        
        if self.has_room_context():
            context_parts.append(f"Usuario en sala de votación (excluir {len(self.room_voted_movies)} películas ya votadas)")
        
        return "; ".join(context_parts) if context_parts else "Sin contexto previo"