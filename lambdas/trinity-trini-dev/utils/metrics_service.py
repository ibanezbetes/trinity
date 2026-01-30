"""
CloudWatch Metrics Service for Trini Lambda

Provides structured logging and custom metrics for monitoring Trini operations.
"""

import json
import time
import logging
from typing import Dict, Any, Optional
import boto3
from datetime import datetime

logger = logging.getLogger(__name__)


class MetricsService:
    """Service for publishing CloudWatch metrics and structured logs."""
    
    def __init__(self, region: str = 'eu-west-1'):
        """Initialize the metrics service."""
        self.cloudwatch = boto3.client('cloudwatch', region_name=region)
        self.namespace = 'Trinity/Trini'
        
    def log_structured(self, level: str, message: str, **kwargs):
        """Log structured data for CloudWatch Insights."""
        log_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': level,
            'message': message,
            'service': 'trini-lambda',
            **kwargs
        }
        
        # Use appropriate log level
        if level == 'ERROR':
            logger.error(json.dumps(log_entry))
        elif level == 'WARN':
            logger.warning(json.dumps(log_entry))
        elif level == 'INFO':
            logger.info(json.dumps(log_entry))
        else:
            logger.debug(json.dumps(log_entry))
    
    def put_metric(self, metric_name: str, value: float, unit: str = 'Count', 
                   dimensions: Optional[Dict[str, str]] = None):
        """Put a custom metric to CloudWatch."""
        try:
            metric_data = {
                'MetricName': metric_name,
                'Value': value,
                'Unit': unit,
                'Timestamp': datetime.utcnow()
            }
            
            if dimensions:
                metric_data['Dimensions'] = [
                    {'Name': k, 'Value': v} for k, v in dimensions.items()
                ]
            
            self.cloudwatch.put_metric_data(
                Namespace=self.namespace,
                MetricData=[metric_data]
            )
            
            logger.debug(f"📊 Metric published: {metric_name} = {value}")
            
        except Exception as e:
            logger.error(f"❌ Failed to publish metric {metric_name}: {e}")
    
    def record_query_processed(self, query_type: str, success: bool, 
                              processing_time: float, user_id: str = None):
        """Record metrics for a processed query."""
        # Query count metric
        self.put_metric(
            'QueriesProcessed',
            1,
            'Count',
            {'QueryType': query_type, 'Status': 'Success' if success else 'Error'}
        )
        
        # Processing time metric
        self.put_metric(
            'ProcessingTime',
            processing_time * 1000,  # Convert to milliseconds
            'Milliseconds',
            {'QueryType': query_type}
        )
        
        # Log structured data
        self.log_structured(
            'INFO' if success else 'ERROR',
            f'Query processed: {query_type}',
            query_type=query_type,
            success=success,
            processing_time_ms=processing_time * 1000,
            user_id=user_id
        )
    
    def record_ai_api_call(self, model: str, success: bool, response_time: float,
                          tokens_used: Optional[int] = None):
        """Record metrics for AI API calls."""
        # API call count
        self.put_metric(
            'AIApiCalls',
            1,
            'Count',
            {'Model': model, 'Status': 'Success' if success else 'Error'}
        )
        
        # Response time
        self.put_metric(
            'AIApiResponseTime',
            response_time * 1000,
            'Milliseconds',
            {'Model': model}
        )
        
        # Token usage if available
        if tokens_used:
            self.put_metric(
                'AITokensUsed',
                tokens_used,
                'Count',
                {'Model': model}
            )
        
        # Log structured data
        self.log_structured(
            'INFO' if success else 'ERROR',
            f'AI API call: {model}',
            model=model,
            success=success,
            response_time_ms=response_time * 1000,
            tokens_used=tokens_used
        )
    
    def record_movie_search(self, search_type: str, results_count: int, 
                           search_time: float, filters_applied: Dict[str, Any]):
        """Record metrics for movie search operations."""
        # Search count
        self.put_metric(
            'MovieSearches',
            1,
            'Count',
            {'SearchType': search_type}
        )
        
        # Results count
        self.put_metric(
            'MovieSearchResults',
            results_count,
            'Count',
            {'SearchType': search_type}
        )
        
        # Search time
        self.put_metric(
            'MovieSearchTime',
            search_time * 1000,
            'Milliseconds',
            {'SearchType': search_type}
        )
        
        # Log structured data
        self.log_structured(
            'INFO',
            f'Movie search completed: {search_type}',
            search_type=search_type,
            results_count=results_count,
            search_time_ms=search_time * 1000,
            filters_applied=filters_applied
        )
    
    def record_rate_limit_hit(self, user_id: str, current_count: int, limit: int):
        """Record when rate limiting is triggered."""
        self.put_metric(
            'RateLimitHits',
            1,
            'Count',
            {'UserId': user_id[:8] + '...' if user_id else 'anonymous'}  # Truncate for privacy
        )
        
        self.log_structured(
            'WARN',
            'Rate limit exceeded',
            user_id=user_id[:8] + '...' if user_id else 'anonymous',
            current_count=current_count,
            limit=limit
        )
    
    def record_session_operation(self, operation: str, success: bool, 
                                session_id: str, user_id: str = None):
        """Record metrics for chat session operations."""
        self.put_metric(
            'SessionOperations',
            1,
            'Count',
            {'Operation': operation, 'Status': 'Success' if success else 'Error'}
        )
        
        self.log_structured(
            'INFO' if success else 'ERROR',
            f'Session operation: {operation}',
            operation=operation,
            success=success,
            session_id=session_id,
            user_id=user_id[:8] + '...' if user_id else 'anonymous'
        )
    
    def record_error(self, error_type: str, error_message: str, 
                    context: Dict[str, Any] = None):
        """Record error metrics and structured logs."""
        self.put_metric(
            'Errors',
            1,
            'Count',
            {'ErrorType': error_type}
        )
        
        self.log_structured(
            'ERROR',
            f'Error occurred: {error_type}',
            error_type=error_type,
            error_message=error_message,
            context=context or {}
        )


# Global metrics service instance
_metrics_service = None


def get_metrics_service(region: str = 'eu-west-1') -> MetricsService:
    """Get or create the global metrics service instance."""
    global _metrics_service
    if _metrics_service is None:
        _metrics_service = MetricsService(region)
    return _metrics_service