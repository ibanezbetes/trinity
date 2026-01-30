"""
AI service for integrating with Hugging Face Salamandra-2b model.

This module handles the actual API calls to Hugging Face for natural language
processing and movie filter extraction.
"""

import json
import logging
import asyncio
import aiohttp
from typing import Dict, Any, Optional
import os

logger = logging.getLogger(__name__)


class AIService:
    """Service for interacting with Hugging Face Salamandra-2b model."""
    
    def __init__(self, api_key: str, model_name: str = 'BSC-LT/salamandra-2b-instruct'):
        """
        Initialize the AI service.
        
        Args:
            api_key: Hugging Face API key
            model_name: Model name to use
        """
        self.api_key = api_key
        self.model_name = model_name
        self.base_url = "https://router.huggingface.co/models"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        logger.info(f"🤖 AIService initialized with model: {model_name}")
    
    async def generate_response(self, prompt: str, max_tokens: int = 500, temperature: float = 0.1) -> Optional[str]:
        """
        Generate response from Salamandra-2b model.
        
        Args:
            prompt: Input prompt for the model
            max_tokens: Maximum tokens to generate
            temperature: Temperature for generation (lower = more deterministic)
            
        Returns:
            Generated response text or None if failed
        """
        try:
            url = f"{self.base_url}/{self.model_name}"
            
            payload = {
                "inputs": prompt,
                "parameters": {
                    "max_new_tokens": max_tokens,
                    "temperature": temperature,
                    "do_sample": True,
                    "return_full_text": False,
                    "stop": ["</s>", "\n\n", "IMPORTANTE:"]  # Stop tokens
                }
            }
            
            logger.info(f"🚀 Calling Hugging Face API for model: {self.model_name}")
            logger.debug(f"📝 Prompt length: {len(prompt)} characters")
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=self.headers, json=payload, timeout=30) as response:
                    if response.status == 200:
                        result = await response.json()
                        
                        if isinstance(result, list) and len(result) > 0:
                            generated_text = result[0].get('generated_text', '').strip()
                            logger.info(f"✅ AI response received: {len(generated_text)} characters")
                            logger.debug(f"🔍 AI response preview: {generated_text[:100]}...")
                            return generated_text
                        else:
                            logger.warning(f"⚠️ Unexpected response format: {result}")
                            return None
                    
                    elif response.status == 503:
                        # Model is loading
                        error_data = await response.json()
                        estimated_time = error_data.get('estimated_time', 20)
                        logger.warning(f"⏳ Model is loading, estimated time: {estimated_time}s")
                        
                        # Wait and retry once
                        await asyncio.sleep(min(estimated_time, 30))
                        return await self._retry_request(url, payload)
                    
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Hugging Face API error {response.status}: {error_text}")
                        return None
                        
        except asyncio.TimeoutError:
            logger.error("⏰ Hugging Face API timeout")
            return None
        except Exception as e:
            logger.error(f"❌ Error calling Hugging Face API: {str(e)}")
            return None
    
    async def _retry_request(self, url: str, payload: Dict[str, Any]) -> Optional[str]:
        """Retry the API request once after model loading."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=self.headers, json=payload, timeout=30) as response:
                    if response.status == 200:
                        result = await response.json()
                        if isinstance(result, list) and len(result) > 0:
                            generated_text = result[0].get('generated_text', '').strip()
                            logger.info(f"✅ AI retry successful: {len(generated_text)} characters")
                            return generated_text
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Retry failed {response.status}: {error_text}")
                        return None
        except Exception as e:
            logger.error(f"❌ Retry error: {str(e)}")
            return None
    
    async def extract_movie_filters(self, user_query: str, user_context_prompt: str) -> Optional[str]:
        """
        Extract movie filters from user query using AI.
        
        Args:
            user_query: User's natural language query
            user_context_prompt: Full prompt with context and instructions
            
        Returns:
            AI response with extracted filters or None if failed
        """
        try:
            logger.info(f"🎬 Extracting movie filters for query: '{user_query[:50]}...'")
            
            # Generate response with specific parameters for JSON extraction
            response = await self.generate_response(
                prompt=user_context_prompt,
                max_tokens=300,  # Shorter for JSON responses
                temperature=0.1  # Very deterministic for structured output
            )
            
            if response:
                logger.info(f"🎯 Filter extraction successful")
                return response
            else:
                logger.warning(f"⚠️ Filter extraction failed")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error in filter extraction: {str(e)}")
            return None
    
    def validate_api_key(self) -> bool:
        """
        Validate that the API key is configured.
        
        Returns:
            True if API key is valid, False otherwise
        """
        return bool(self.api_key and len(self.api_key.strip()) > 10)
    
    async def test_connection(self) -> bool:
        """
        Test connection to Hugging Face API.
        
        Returns:
            True if connection successful, False otherwise
        """
        try:
            test_prompt = "Hola, ¿cómo estás?"
            response = await self.generate_response(test_prompt, max_tokens=50)
            return response is not None
        except Exception as e:
            logger.error(f"❌ Connection test failed: {str(e)}")
            return False


# Global service instance
_ai_service_instance = None


def get_ai_service(api_key: str = None, model_name: str = None) -> AIService:
    """
    Get or create AI service instance.
    
    Args:
        api_key: Hugging Face API key (optional, uses env var if not provided)
        model_name: Model name (optional, uses env var if not provided)
        
    Returns:
        AIService instance
    """
    global _ai_service_instance
    
    if _ai_service_instance is None:
        # Get from environment if not provided
        if not api_key:
            api_key = os.environ.get('HUGGINGFACE_API_KEY') or os.environ.get('HF_API_TOKEN')
        
        if not model_name:
            model_name = os.environ.get('SALAMANDRA_MODEL', 'BSC-LT/salamandra-2b-instruct')
        
        if not api_key:
            raise ValueError("Hugging Face API key not provided and not found in environment")
        
        _ai_service_instance = AIService(api_key, model_name)
    
    return _ai_service_instance


def reset_ai_service():
    """Reset the global AI service instance (for testing)."""
    global _ai_service_instance
    _ai_service_instance = None