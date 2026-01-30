"""
Chat session data models for Trini conversations.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Any, Optional
from decimal import Decimal
import uuid


@dataclass
class ChatMessage:
    """Represents a single message in a chat session."""
    
    message_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    type: str = ""  # 'user_query' | 'trini_response'
    content: str = ""
    extracted_filters: Optional[Dict[str, Any]] = None
    recommendations: Optional[List[str]] = field(default_factory=list)  # Movie IDs
    timestamp: datetime = field(default_factory=datetime.utcnow)
    confidence: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for DynamoDB storage."""
        # Convert float confidence to Decimal for DynamoDB compatibility
        confidence_decimal = Decimal(str(self.confidence)) if self.confidence is not None else Decimal('0.0')
        
        # Convert extracted_filters floats to Decimals
        extracted_filters = None
        if self.extracted_filters:
            extracted_filters = {}
            for key, value in self.extracted_filters.items():
                if isinstance(value, float):
                    extracted_filters[key] = Decimal(str(value))
                elif isinstance(value, dict):
                    # Handle nested dictionaries (like year_range)
                    nested_dict = {}
                    for nested_key, nested_value in value.items():
                        if isinstance(nested_value, float):
                            nested_dict[nested_key] = Decimal(str(nested_value))
                        else:
                            nested_dict[nested_key] = nested_value
                    extracted_filters[key] = nested_dict
                else:
                    extracted_filters[key] = value
        
        return {
            'messageId': self.message_id,
            'type': self.type,
            'content': self.content,
            'extractedFilters': extracted_filters,
            'recommendations': self.recommendations or [],
            'timestamp': self.timestamp.isoformat(),
            'confidence': confidence_decimal
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ChatMessage':
        """Create from dictionary loaded from DynamoDB."""
        # Convert Decimal confidence back to float
        confidence = data.get('confidence', 0.0)
        if isinstance(confidence, Decimal):
            confidence = float(confidence)
        
        # Convert extracted_filters Decimals back to floats
        extracted_filters = data.get('extractedFilters')
        if extracted_filters:
            converted_filters = {}
            for key, value in extracted_filters.items():
                if isinstance(value, Decimal):
                    converted_filters[key] = float(value)
                elif isinstance(value, dict):
                    # Handle nested dictionaries (like year_range)
                    nested_dict = {}
                    for nested_key, nested_value in value.items():
                        if isinstance(nested_value, Decimal):
                            nested_dict[nested_key] = float(nested_value)
                        else:
                            nested_dict[nested_key] = nested_value
                    converted_filters[key] = nested_dict
                else:
                    converted_filters[key] = value
            extracted_filters = converted_filters
        
        return cls(
            message_id=data.get('messageId', str(uuid.uuid4())),
            type=data.get('type', ''),
            content=data.get('content', ''),
            extracted_filters=extracted_filters,
            recommendations=data.get('recommendations', []),
            timestamp=datetime.fromisoformat(data.get('timestamp', datetime.utcnow().isoformat())),
            confidence=confidence
        )


@dataclass
class ChatSession:
    """Represents a complete chat session between user and Trini."""
    
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    messages: List[ChatMessage] = field(default_factory=list)
    user_preferences: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    ttl: int = field(default_factory=lambda: int((datetime.utcnow().timestamp() + (30 * 24 * 60 * 60))))  # 30 days
    
    def add_message(self, message: ChatMessage) -> None:
        """Add a message to the session and update timestamp."""
        self.messages.append(message)
        self.updated_at = datetime.utcnow()
        
        # Keep only last 10 messages as per requirements
        if len(self.messages) > 10:
            self.messages = self.messages[-10:]
    
    def get_recent_genres(self, limit: int = 5) -> List[str]:
        """Extract recently mentioned genres from chat history."""
        genres = []
        for message in reversed(self.messages):
            if message.extracted_filters and 'genres' in message.extracted_filters:
                genres.extend(message.extracted_filters['genres'])
                if len(genres) >= limit:
                    break
        return list(set(genres))[:limit]
    
    def get_recent_movies(self, limit: int = 10) -> List[str]:
        """Get recently recommended movie IDs."""
        movies = []
        for message in reversed(self.messages):
            if message.recommendations:
                movies.extend(message.recommendations)
                if len(movies) >= limit:
                    break
        return list(set(movies))[:limit]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for DynamoDB storage."""
        return {
            'sessionId': self.session_id,
            'userId': self.user_id,
            'messages': [msg.to_dict() for msg in self.messages],
            'userPreferences': self.user_preferences,
            'createdAt': self.created_at.isoformat(),
            'updatedAt': self.updated_at.isoformat(),
            'ttl': self.ttl
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ChatSession':
        """Create from dictionary loaded from DynamoDB."""
        messages = [ChatMessage.from_dict(msg) for msg in data.get('messages', [])]
        
        return cls(
            session_id=data.get('sessionId', str(uuid.uuid4())),
            user_id=data.get('userId', ''),
            messages=messages,
            user_preferences=data.get('userPreferences', {}),
            created_at=datetime.fromisoformat(data.get('createdAt', datetime.utcnow().isoformat())),
            updated_at=datetime.fromisoformat(data.get('updatedAt', datetime.utcnow().isoformat())),
            ttl=data.get('ttl', int((datetime.utcnow().timestamp() + (30 * 24 * 60 * 60))))
        )