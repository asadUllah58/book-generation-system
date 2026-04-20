"""Structured-output schemas the LLM is bound to."""

from pydantic import BaseModel, Field


class ChapterOutline(BaseModel):
    index: int = Field(description="Zero-based chapter number.")
    title: str
    summary: str = Field(description="2-4 sentence chapter summary.")


class BookOutline(BaseModel):
    title: str
    summary: str = Field(description="A paragraph describing the book's arc.")
    chapters: list[ChapterOutline] = Field(
        description="Between 8 and 12 chapters.",
        min_length=3,
    )
