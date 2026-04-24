"""LLM provider factories.

One thin factory per provider. Returns None if the API key is not configured
so the router can skip the provider cleanly without import-time errors.
"""

from typing import Optional

from langchain_core.language_models.chat_models import BaseChatModel

from app.config import settings


def gemini(model: str, *, temperature: float = 0.7) -> Optional[BaseChatModel]:
    if not settings.google_api_key:
        return None
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=model,
        google_api_key=settings.google_api_key,
        temperature=temperature,
        max_retries=2,
    )


def groq(model: str, *, temperature: float = 0.7) -> Optional[BaseChatModel]:
    if not settings.groq_api_key:
        return None
    from langchain_groq import ChatGroq

    return ChatGroq(
        model=model,
        api_key=settings.groq_api_key,
        temperature=temperature,
        max_retries=2,
    )


def cerebras(model: str, *, temperature: float = 0.7) -> Optional[BaseChatModel]:
    if not settings.cerebras_api_key:
        return None
    from langchain_cerebras import ChatCerebras

    return ChatCerebras(
        model=model,
        api_key=settings.cerebras_api_key,
        temperature=temperature,
        max_retries=2,
    )
