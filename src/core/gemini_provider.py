import os
import re
import time
from typing import Any, Dict, Generator, List, Optional

from google import genai
from google.genai import types

from src.core.llm_provider import LLMProvider

class GeminiProvider(LLMProvider):
    def __init__(self, model_name: str = "gemini-2.5-flash", api_key: Optional[str] = None):
        super().__init__(model_name, api_key)
        resolved_api_key = self.api_key or os.getenv("GOOGLE_API_KEY")
        self.client = genai.Client(api_key=resolved_api_key)
        self.fallback_models = self._load_fallback_models(model_name)
        self.max_retries = int(os.getenv("GEMINI_MAX_RETRIES", "3"))
        self.base_retry_delay = float(os.getenv("GEMINI_RETRY_DELAY_SECONDS", "2"))

    def _load_fallback_models(self, primary_model: str) -> List[str]:
        configured = os.getenv("GEMINI_FALLBACK_MODELS", "")
        fallbacks = [item.strip() for item in configured.split(",") if item.strip()]
        if not fallbacks:
            fallbacks = ["gemini-2.0-flash", "gemini-2.5-flash-lite"]
        models = [primary_model]
        for model in fallbacks:
            if model not in models:
                models.append(model)
        return models

    @staticmethod
    def _build_config(system_prompt: Optional[str] = None) -> types.GenerateContentConfig:
        config_kwargs: Dict[str, Any] = {}
        if system_prompt:
            config_kwargs["system_instruction"] = system_prompt
        return types.GenerateContentConfig(**config_kwargs)

    @staticmethod
    def _extract_retry_delay_seconds(error: Exception) -> Optional[float]:
        message = str(error)
        match = re.search(r"Please retry in ([0-9]+(?:\.[0-9]+)?)s", message)
        if match:
            return float(match.group(1))
        return None

    @staticmethod
    def _is_retryable_error(error: Exception) -> bool:
        message = str(error)
        return any(code in message for code in ("503 UNAVAILABLE", "429 RESOURCE_EXHAUSTED", "429"))

    def _generate_once(self, model_name: str, prompt: str, system_prompt: Optional[str]) -> Any:
        return self.client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=self._build_config(system_prompt),
        )

    def _stream_once(self, model_name: str, prompt: str, system_prompt: Optional[str]) -> Any:
        return self.client.models.generate_content_stream(
            model=model_name,
            contents=prompt,
            config=self._build_config(system_prompt),
        )

    def generate(self, prompt: str, system_prompt: Optional[str] = None) -> Dict[str, Any]:
        start_time = time.time()
        last_error: Optional[Exception] = None

        for model_name in self.fallback_models:
            attempt = 0
            while attempt <= self.max_retries:
                try:
                    response = self._generate_once(model_name, prompt, system_prompt)
                    end_time = time.time()
                    latency_ms = int((end_time - start_time) * 1000)

                    content = response.text
                    usage_metadata = response.usage_metadata
                    usage = {
                        "prompt_tokens": getattr(usage_metadata, "prompt_token_count", 0) if usage_metadata else 0,
                        "completion_tokens": getattr(usage_metadata, "response_token_count", 0) if usage_metadata else 0,
                        "total_tokens": getattr(usage_metadata, "total_token_count", 0) if usage_metadata else 0,
                    }

                    self.model_name = model_name
                    return {
                        "content": content,
                        "usage": usage,
                        "latency_ms": latency_ms,
                        "provider": "gemini",
                        "model_used": model_name,
                    }
                except Exception as exc:
                    last_error = exc
                    if not self._is_retryable_error(exc):
                        break

                    retry_delay = self._extract_retry_delay_seconds(exc)
                    sleep_seconds = retry_delay if retry_delay is not None else self.base_retry_delay * (2**attempt)
                    time.sleep(min(sleep_seconds, 60))
                    attempt += 1
                    continue

                break

        if last_error is not None:
            raise last_error

    def stream(self, prompt: str, system_prompt: Optional[str] = None) -> Generator[str, None, None]:
        last_error: Optional[Exception] = None

        for model_name in self.fallback_models:
            attempt = 0
            while attempt <= self.max_retries:
                try:
                    response = self._stream_once(model_name, prompt, system_prompt)
                    self.model_name = model_name
                    for chunk in response:
                        if chunk.text:
                            yield chunk.text
                    return
                except Exception as exc:
                    last_error = exc
                    if not self._is_retryable_error(exc):
                        break

                    retry_delay = self._extract_retry_delay_seconds(exc)
                    sleep_seconds = retry_delay if retry_delay is not None else self.base_retry_delay * (2**attempt)
                    time.sleep(min(sleep_seconds, 60))
                    attempt += 1
                    continue

                break

        if last_error is not None:
            raise last_error
