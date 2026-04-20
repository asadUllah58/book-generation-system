from typing import Literal, Optional, TypedDict

BookStatus = Literal[
    "outline_pending",
    "outline_review",
    "drafting",
    "chapter_review",
    "compiling",
    "complete",
]


class ChapterDraft(TypedDict, total=False):
    index: int
    title: str
    content_md: str
    summary: str
    version: int


class Feedback(TypedDict, total=False):
    target_type: Literal["outline", "chapter"]
    target_id: str
    action: Literal["approve", "revise", "reject"]
    note: Optional[str]
    reviewer_id: str


class BookState(TypedDict, total=False):
    book_id: str
    title: str
    outline: Optional[dict]
    current_chapter: Optional[dict]
    current_chapter_index: int
    last_feedback: Optional[Feedback]
    status: BookStatus
