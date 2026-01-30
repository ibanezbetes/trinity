"""
Genre mapping utilities for converting between Spanish/English terms and TMDB IDs.
"""

import re
from typing import List, Dict, Set, Optional
from .constants import TMDB_GENRE_MAP, GENRE_ID_TO_NAME


class GenreMapper:
    """Utility class for mapping genre terms to TMDB genre IDs."""
    
    def __init__(self):
        """Initialize the genre mapper with TMDB mappings."""
        self.genre_map = TMDB_GENRE_MAP
        self.id_to_name = GENRE_ID_TO_NAME
        
        # Create pattern mappings for fuzzy matching
        self._create_pattern_mappings()
    
    def _create_pattern_mappings(self) -> None:
        """Create regex patterns for fuzzy genre matching."""
        self.pattern_mappings = {}
        
        # Create patterns for common variations
        patterns = {
            r'\b(terror|miedo|horror|espanto)\b': ['27'],  # Horror
            r'\b(comedia|gracioso|divertido|humor|chistoso)\b': ['35'],  # Comedy
            r'\b(acción|accion|aventura|action)\b': ['28', '12'],  # Action/Adventure
            r'\b(romance|romántico|romantico|amor)\b': ['10749'],  # Romance
            r'\b(drama|dramático|dramatico)\b': ['18'],  # Drama
            r'\b(ciencia ficción|sci-?fi|futurista|espacial)\b': ['878'],  # Sci-Fi
            r'\b(fantasía|fantasia|fantasy|mágico|magico)\b': ['14'],  # Fantasy
            r'\b(crimen|policial|detective|noir)\b': ['80'],  # Crime
            r'\b(animación|animacion|animation|dibujos|caricatura)\b': ['16'],  # Animation
            r'\b(documental|documentary)\b': ['99'],  # Documentary
            r'\b(familiar|family|niños|ninos|infantil)\b': ['10751'],  # Family
            r'\b(historia|histórico|historico|history)\b': ['36'],  # History
            r'\b(música|musica|music|musical)\b': ['10402'],  # Music
            r'\b(misterio|mystery|enigma)\b': ['9648'],  # Mystery
            r'\b(guerra|war|bélico|belico)\b': ['10752'],  # War
            r'\b(western|oeste|vaqueros)\b': ['37'],  # Western
            r'\b(suspenso|thriller|tensión|tension)\b': ['53']  # Thriller
        }
        
        for pattern, genre_ids in patterns.items():
            self.pattern_mappings[re.compile(pattern, re.IGNORECASE)] = genre_ids
    
    def extract_genres_from_text(self, text: str) -> List[str]:
        """
        Extract genre IDs from natural language text.
        
        Args:
            text: Natural language text containing genre references
            
        Returns:
            List of TMDB genre IDs as strings
        """
        found_genres = set()
        text_lower = text.lower()
        
        # First, try exact matches from the genre map
        for genre_term, genre_id in self.genre_map.items():
            if genre_term in text_lower:
                found_genres.add(genre_id)
        
        # Then, try pattern matching for more complex expressions
        for pattern, genre_ids in self.pattern_mappings.items():
            if pattern.search(text):
                found_genres.update(genre_ids)
        
        return list(found_genres)
    
    def get_genre_name(self, genre_id: str) -> str:
        """
        Get genre name from TMDB genre ID.
        
        Args:
            genre_id: TMDB genre ID as string
            
        Returns:
            Genre name or the ID if not found
        """
        return self.id_to_name.get(genre_id, genre_id)
    
    def get_genre_id_by_name(self, genre_name: str) -> Optional[str]:
        """
        Get TMDB genre ID from genre name.
        
        Args:
            genre_name: Genre name (in Spanish or English)
            
        Returns:
            TMDB genre ID as string, or None if not found
        """
        genre_name_lower = genre_name.lower().strip()
        
        # Direct lookup in genre map
        if genre_name_lower in self.genre_map:
            return self.genre_map[genre_name_lower]
        
        # Try pattern matching
        for pattern, genre_ids in self.pattern_mappings.items():
            if pattern.search(genre_name_lower):
                return genre_ids[0] if genre_ids else None
        
        return None
    
    def validate_genre_ids(self, genre_ids: List[str]) -> List[str]:
        """
        Validate and filter genre IDs to ensure they're valid TMDB IDs.
        
        Args:
            genre_ids: List of genre IDs to validate
            
        Returns:
            List of valid TMDB genre IDs
        """
        valid_ids = set(self.genre_map.values())
        return [gid for gid in genre_ids if gid in valid_ids]
    
    def prioritize_genres(self, genre_ids: List[str], query: str) -> List[str]:
        """
        Prioritize genres based on specificity and context in the query.
        
        Args:
            genre_ids: List of extracted genre IDs
            query: Original query text
            
        Returns:
            Prioritized list of genre IDs
        """
        if not genre_ids:
            return []
        
        # Create priority scoring
        priority_scores = {}
        query_lower = query.lower()
        
        for genre_id in genre_ids:
            score = 0
            genre_name = self.get_genre_name(genre_id)
            
            # Higher score for exact matches
            if genre_name in query_lower:
                score += 10
            
            # Bonus for specific genres mentioned explicitly
            specific_terms = {
                '27': ['terror', 'horror', 'miedo'],  # Horror
                '35': ['comedia', 'gracioso', 'divertido'],  # Comedy
                '28': ['acción', 'accion', 'action'],  # Action
                '878': ['ciencia ficción', 'sci-fi', 'futurista'],  # Sci-Fi
                '14': ['fantasía', 'fantasia', 'fantasy']  # Fantasy
            }
            
            if genre_id in specific_terms:
                for term in specific_terms[genre_id]:
                    if term in query_lower:
                        score += 5
                        break
            
            priority_scores[genre_id] = score
        
        # Sort by priority score (descending)
        return sorted(genre_ids, key=lambda gid: priority_scores.get(gid, 0), reverse=True)
    
    def get_complementary_genres(self, primary_genres: List[str]) -> List[str]:
        """
        Get complementary genres that work well with the primary genres.
        
        Args:
            primary_genres: List of primary genre IDs
            
        Returns:
            List of complementary genre IDs
        """
        complementary_map = {
            '28': ['12', '53'],  # Action -> Adventure, Thriller
            '35': ['10749', '10751'],  # Comedy -> Romance, Family
            '18': ['80', '36'],  # Drama -> Crime, History
            '27': ['53', '9648'],  # Horror -> Thriller, Mystery
            '878': ['28', '12'],  # Sci-Fi -> Action, Adventure
            '14': ['12', '10751'],  # Fantasy -> Adventure, Family
            '80': ['18', '53'],  # Crime -> Drama, Thriller
            '10749': ['35', '18']  # Romance -> Comedy, Drama
        }
        
        complementary = set()
        for genre_id in primary_genres:
            if genre_id in complementary_map:
                complementary.update(complementary_map[genre_id])
        
        # Remove primary genres from complementary list
        complementary -= set(primary_genres)
        return list(complementary)
    
    def create_genre_context_string(self, genre_ids: List[str]) -> str:
        """
        Create a human-readable string describing the genres.
        
        Args:
            genre_ids: List of genre IDs
            
        Returns:
            Human-readable genre description
        """
        if not genre_ids:
            return "sin géneros específicos"
        
        genre_names = [self.get_genre_name(gid) for gid in genre_ids]
        
        if len(genre_names) == 1:
            return f"género {genre_names[0]}"
        elif len(genre_names) == 2:
            return f"géneros {genre_names[0]} y {genre_names[1]}"
        else:
            return f"géneros {', '.join(genre_names[:-1])} y {genre_names[-1]}"