# Trinity Trini Lambda Function (LEGACY - DEPRECATED)

> **⚠️ DEPRECATION NOTICE**: This Lambda function has been superseded by `trinity-ai-dev` which uses Qwen2.5-1.5B-Instruct via OpenAI SDK + HuggingFace Serverless. This Python implementation is kept for reference but is no longer actively used.
> 
> **Active AI Lambda**: Use `trinity-ai-dev` for all AI functionality.
> **Migration Date**: January 2026
> **Status**: LEGACY - Not recommended for new development

## Overview

The `trinity-trini-dev` Lambda function implements the Trini chatbot functionality for the Trinity movie voting ecosystem. This Python 3.10 function integrates with Hugging Face's Salamandra-2b model to process natural language movie queries and provide intelligent movie recommendations.

## Architecture

- **Runtime**: Python 3.10
- **Handler**: `trini.handler`
- **Timeout**: 30 seconds
- **Memory**: 1024 MB

## Core Features

1. **AI Query Processing**: Uses Salamandra-2b model to extract structured filters from natural language queries
2. **Movie Search Integration**: Coordinates with existing `trinity-movie-dev` Lambda for TMDB searches
3. **Chat Session Management**: Persists conversation history in DynamoDB
4. **Room Integration**: Supports adding recommendations to Trinity voting rooms
5. **Error Handling**: Graceful degradation with fallback mechanisms

## Dependencies

- `requests`: HTTP client for Hugging Face API calls
- `boto3`: AWS SDK for DynamoDB and Lambda invocations
- `json`: JSON processing for AI responses
- `asyncio`: Asynchronous operations support

## Environment Variables

All environment variables are inherited from the Trinity ecosystem `.env` file:

- `HUGGINGFACE_API_KEY`: API key for Hugging Face Inference API
- `TMDB_API_KEY`: TMDB API key (shared with trinity-movie-dev)
- `AWS_REGION`: AWS region (eu-west-1)
- `CHAT_SESSIONS_TABLE`: DynamoDB table for chat sessions
- `MOVIES_CACHE_TABLE`: Shared movie cache table
- `USERS_TABLE`: Trinity users table
- `DEBUG_MODE`: Enable debug logging
- `LOG_LEVEL`: Logging level configuration

## Data Models

### ChatSession
Represents a conversation session between user and Trini.

### ExtractedFilters
Structured filters extracted from natural language queries.

### TriniResponse
Complete response object containing recommendations and metadata.

## Integration Points

- **trinity-movie-dev**: Movie search and TMDB integration
- **trinity-chat-sessions-dev**: Chat history persistence
- **trinity-users-dev**: User context and preferences
- **GraphQL API**: Exposed through Trinity's AppSync API

## Error Handling

The function implements multiple fallback layers:
1. Full AI + TMDB (optimal experience)
2. Pattern matching + TMDB (no AI, fresh data)
3. Full cache (no external APIs)
4. Default recommendations (curated fallback)

## Testing

The function includes comprehensive testing:
- Unit tests for core functionality
- Property-based tests for universal correctness
- Integration tests with Trinity ecosystem
- End-to-end chat flow validation