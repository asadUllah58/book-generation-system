"""Outline lifecycle: generate, revise, edit, approve.

No graph, no interrupts — each function is a synchronous call made from a
FastAPI endpoint. Book status transitions:
  - `generate` / `revise`  → books.status = outline_review
  - `approve` / `edit`     → books.status = drafting
"""

from typing import Any, Optional

from app.db import repositories as repo
from app.llm.engine import generate_outline as llm_generate_outline
from app.llm.schemas import BookOutline


def generate(book_id: str) -> dict[str, Any]:
    """First-time outline generation for a freshly created book."""
    book = repo.get_book(book_id)
    if not book:
        raise LookupError(f"book {book_id} not found")

    outline = llm_generate_outline(book["title"])
    row = repo.create_outline(
        book_id=book_id,
        version=1,
        content=outline.model_dump(),
        parent_id=None,
    )
    repo.update_book_status(book_id, "outline_review")
    return row


def revise(book_id: str, note: Optional[str]) -> dict[str, Any]:
    """AI-driven revision — regenerates the outline informed by `note`.

    The previous latest outline is marked `superseded` and a new version is
    appended with `parent_id` pointing at it.
    """
    book = repo.get_book(book_id)
    if not book:
        raise LookupError(f"book {book_id} not found")

    previous = repo.get_latest_outline(book_id)
    if not previous:
        raise RuntimeError("cannot revise: no existing outline")

    outline = llm_generate_outline(book["title"], revision_note=note)

    repo.update_outline_status(previous["id"], "superseded")
    row = repo.create_outline(
        book_id=book_id,
        version=previous["version"] + 1,
        content=outline.model_dump(),
        parent_id=previous["id"],
    )
    repo.update_book_status(book_id, "outline_review")
    return row


def edit(book_id: str, content: dict[str, Any]) -> dict[str, Any]:
    """Manual edit — caller supplies full outline content; saved as approved.

    Validates the incoming dict against `BookOutline` to keep the chapter
    schema consistent with generated outlines.
    """
    validated = BookOutline.model_validate(content)

    previous = repo.get_latest_outline(book_id)
    if previous:
        repo.update_outline_status(previous["id"], "superseded")

    row = repo.create_outline(
        book_id=book_id,
        version=(previous["version"] + 1) if previous else 1,
        content=validated.model_dump(),
        parent_id=previous["id"] if previous else None,
    )
    repo.update_outline_status(row["id"], "approved")
    repo.update_book_status(book_id, "drafting")
    # Returned row doesn't reflect the status update we just made.
    row["status"] = "approved"
    return row


def approve(book_id: str) -> dict[str, Any]:
    """Mark the latest outline as approved; unlock chapter drafting."""
    latest = repo.get_latest_outline(book_id)
    if not latest:
        raise RuntimeError("cannot approve: no outline exists")

    repo.update_outline_status(latest["id"], "approved")
    repo.update_book_status(book_id, "drafting")
    latest["status"] = "approved"
    return latest
