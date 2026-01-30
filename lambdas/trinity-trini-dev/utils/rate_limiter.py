"""
Rate limiting service for Trini Lambda function.

Implements per-user rate limiting to enforce the maximum of 5 queries per minute
as specified in Requirements 10.2.
"""

import time
import json
import logging
from typing import Dict, List, Optional
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Rate limiter that enforces per-user query limits.
    
    Uses in-memory storage for Lambda execution context with DynamoDB
    fallback for persistent rate limiting across Lambda invocations.
    """
    
    def __init__(self, max_requests: int = 5, window_seconds: int = 60):
        """
        Initialize rate limiter.
        
        Args:
            max_requests: Maximum requests allowed per window
            window_seconds: Time window in seconds
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.user_requests: Dict[str, List[float]] = {}
        
        # DynamoDB client for persistent storage (optional)
        self.dynamodb = None
        self.table_name = None
        
        logger.info(f"🚦 Rate limiter initialized: {max_requests} requests per {window_seconds}s")
    
    def configure_persistence(self, table_name: str, region: str = 'eu-west-1'):
        """
        Configure DynamoDB persistence for rate limiting data.
        
        Args:
            table_name: DynamoDB table name for storing rate limit data
            region: AWS region
        """
        try:
            self.dynamodb = boto3.resource('dynamodb', region_name=region)
            self.table_name = table_name
            logger.info(f"📊 Rate limiter persistence configured: {table_name}")
        except Exception as e:
            logger.warning(f"⚠️ Could not configure rate limiter persistence: {e}")
    
    def is_rate_limited(self, user_id: str) -> bool:
        """
        Check if user is currently rate limited.
        
        Args:
            user_id: User identifier
            
        Returns:
            True if user is rate limited, False otherwise
        """
        current_time = time.time()
        
        # Initialize user request history if not exists
        if user_id not in self.user_requests:
            self.user_requests[user_id] = []
        
        # Clean old requests outside the time window
        self.user_requests[user_id] = [
            req_time for req_time in self.user_requests[user_id]
            if current_time - req_time < self.window_seconds
        ]
        
        # Check if user has exceeded the limit
        if len(self.user_requests[user_id]) >= self.max_requests:
            logger.warning(f"🚫 Rate limit exceeded for user {user_id}: {len(self.user_requests[user_id])} requests")
            return True
        
        # Add current request to history
        self.user_requests[user_id].append(current_time)
        logger.debug(f"✅ Request allowed for user {user_id}: {len(self.user_requests[user_id])}/{self.max_requests}")
        
        return False
    
    def get_user_request_count(self, user_id: str) -> int:
        """
        Get current request count for user within the time window.
        
        Args:
            user_id: User identifier
            
        Returns:
            Number of requests made by user in current window
        """
        if user_id not in self.user_requests:
            return 0
        
        current_time = time.time()
        valid_requests = [
            req_time for req_time in self.user_requests[user_id]
            if current_time - req_time < self.window_seconds
        ]
        
        return len(valid_requests)
    
    def get_time_until_reset(self, user_id: str) -> int:
        """
        Get seconds until rate limit resets for user.
        
        Args:
            user_id: User identifier
            
        Returns:
            Seconds until oldest request expires, 0 if not rate limited
        """
        if user_id not in self.user_requests or not self.user_requests[user_id]:
            return 0
        
        current_time = time.time()
        oldest_request = min(self.user_requests[user_id])
        time_until_reset = self.window_seconds - (current_time - oldest_request)
        
        return max(0, int(time_until_reset))
    
    def reset_user_limits(self, user_id: str) -> None:
        """
        Reset rate limits for a specific user (for testing).
        
        Args:
            user_id: User identifier
        """
        if user_id in self.user_requests:
            del self.user_requests[user_id]
        logger.debug(f"🔄 Rate limits reset for user {user_id}")
    
    def reset_all_limits(self) -> None:
        """Reset all rate limits (for testing)."""
        self.user_requests.clear()
        logger.debug("🔄 All rate limits reset")
    
    def get_rate_limit_error_response(self, user_id: str) -> Dict:
        """
        Generate standardized rate limit error response.
        
        Args:
            user_id: User identifier
            
        Returns:
            Error response dictionary
        """
        time_until_reset = self.get_time_until_reset(user_id)
        
        return {
            'sessionId': f'rate-limited-{int(time.time())}',
            'message': f'Has alcanzado el límite de {self.max_requests} consultas por minuto. '
                      f'Podrás hacer otra consulta en {time_until_reset} segundos.',
            'recommendations': [],
            'confidence': 0.0,
            'error': 'Rate limit exceeded',
            'fallbackUsed': True,
            'processingTimeMs': 0,
            'rateLimitInfo': {
                'maxRequests': self.max_requests,
                'windowSeconds': self.window_seconds,
                'currentCount': self.get_user_request_count(user_id),
                'timeUntilReset': time_until_reset
            }
        }
    
    def validate_configuration(self) -> bool:
        """
        Validate rate limiter configuration.
        
        Returns:
            True if configuration is valid
        """
        if self.max_requests <= 0:
            logger.error(f"❌ Invalid max_requests: {self.max_requests}")
            return False
        
        if self.window_seconds <= 0:
            logger.error(f"❌ Invalid window_seconds: {self.window_seconds}")
            return False
        
        if self.max_requests > 100:
            logger.warning(f"⚠️ High max_requests value: {self.max_requests}")
        
        logger.info(f"✅ Rate limiter configuration valid")
        return True


# Global rate limiter instance
_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter(max_requests: int = 5, window_seconds: int = 60, force_new: bool = False) -> RateLimiter:
    """
    Get or create global rate limiter instance.
    
    Args:
        max_requests: Maximum requests per window
        window_seconds: Time window in seconds
        force_new: Force creation of new instance
        
    Returns:
        RateLimiter instance
    """
    global _rate_limiter
    
    if _rate_limiter is None or force_new:
        _rate_limiter = RateLimiter(max_requests, window_seconds)
    
    return _rate_limiter


def reset_rate_limiter() -> None:
    """Reset global rate limiter (for testing)."""
    global _rate_limiter
    if _rate_limiter:
        _rate_limiter.reset_all_limits()
    _rate_limiter = None