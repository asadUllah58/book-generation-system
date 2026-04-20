"""LangGraph node implementations.

Each node is a pure function: (state) -> partial state update.
Review nodes call `interrupt()` to pause execution for human feedback.
"""

from typing import Any, Literal, Optional

from langgraph.types import interrupt

from app.compile.builder import compile_book
from app.db import repositories as repo
from app.graph.state import BookState
from app.llm.gemini import (
    draft_chapter as llm_draft_chapter,
    generate_outline as llm_generate_outline,
    summarize_chapter as llm_summarize_chapter,
)


OUTLINE_ACTION_TO_STATUS: dict[str, str] = {
    "approve": "approved",
    "revise": "revised",
    "reject": "rejected",
}

CHAPTER_ACTION_TO_STATUS: dict[str, str] = {
    "approve": "approved",
    "revise": "revised",
    "reject": "rejected",
}


# ---------- outline ----------

def generate_outline(state: BookState) -> BookState:
    """Generate an outline with Gemini and persist a new version.

    Runs on initial outline creation AND on revise/reject (branching).
    The previous version, if any, is chained via `parent_id`.
    """
    book_id = state["book_id"]
    title = state["title"]

    # Flip status immediately so the UI overlay reflects "working" during the
    # LLM call instead of lingering on whatever the previous state was.
    repo.update_book_status(book_id, "outline_pending", current_node="generate_outline")

    outline = llm_generate_outline(title)

    previous = repo.get_latest_outline(book_id)
    version = (previous["version"] + 1) if previous else 1
    parent_id = previous["id"] if previous else None

    row = repo.create_outline(
        book_id=book_id,
        version=version,
        content=outline.model_dump(),
        parent_id=parent_id,
    )
    repo.update_book_status(book_id, "outline_review", current_node="review_outline")

    return {
        "outline": row,
        "status": "outline_review",
    }


def review_outline(state: BookState) -> BookState:
    """Pause until a reviewer posts feedback on the current outline."""
    outline = state.get("outline") or {}
    outline_id = outline.get("id")

    feedback = interrupt(
        {
            "kind": "outline_review",
            "outline_id": outline_id,
            "outline_version": outline.get("version"),
        }
    )
    action = _action_from(feedback)

    if outline_id and action in OUTLINE_ACTION_TO_STATUS:
        repo.update_outline_status(outline_id, OUTLINE_ACTION_TO_STATUS[action])

    return {"last_feedback": _feedback_dict(feedback)}


def route_after_outline_review(
    state: BookState,
) -> Literal["approve", "revise", "reject"]:
    return _route(state)


# ---------- chapter drafting ----------

def draft_chapter(state: BookState) -> BookState:
    """Draft the chapter at `current_chapter_index` and persist a new version.

    Invoked for both fresh chapters (after previous chapter approved) and
    revisions. Distinguished by `last_feedback.action`: if revise/reject AND
    `current_chapter` at the same index exists, this is a revision.
    """
    book_id = state["book_id"]
    index = state.get("current_chapter_index", 0)

    # Flip status at entry so the frontend stops rendering the previous review
    # panel as soon as the graph moves on — otherwise the old review UI sticks
    # around for the full 20-30s the LLM call takes.
    repo.update_book_status(book_id, "drafting", current_node="draft_chapter")

    outline = repo.get_approved_outline(book_id)
    if not outline:
        raise RuntimeError(f"no approved outline for book {book_id}")

    content = outline["content"]
    chapter_def = content["chapters"][index]

    last_fb = state.get("last_feedback") or {}
    feedback_note: Optional[str] = None
    if last_fb.get("action") in ("revise", "reject"):
        previous = state.get("current_chapter") or {}
        if previous.get("index") == index:
            feedback_note = last_fb.get("note")

    rolling = _rolling_summary(book_id, up_to_index=index)

    chapter_md = llm_draft_chapter(
        book_title=content["title"],
        book_summary=content["summary"],
        chapter_title=chapter_def["title"],
        chapter_summary=chapter_def["summary"],
        rolling_summary=rolling,
        feedback_note=feedback_note,
    )

    existing = repo.get_latest_chapter_version(book_id, index)
    version = (existing["version"] + 1) if existing else 1
    parent_id = existing["id"] if existing else None

    row = repo.create_chapter(
        book_id=book_id,
        index=index,
        version=version,
        parent_id=parent_id,
        title=chapter_def["title"],
        content_md=chapter_md,
    )
    repo.update_book_status(book_id, "chapter_review", current_node="review_chapter")

    return {
        "current_chapter": row,
        "current_chapter_index": index,
        "status": "chapter_review",
    }


def review_chapter(state: BookState) -> BookState:
    """Pause until a reviewer posts feedback on the current chapter."""
    chapter = state.get("current_chapter") or {}
    chapter_id = chapter.get("id")

    feedback = interrupt(
        {
            "kind": "chapter_review",
            "chapter_id": chapter_id,
            "chapter_index": chapter.get("index"),
            "chapter_version": chapter.get("version"),
        }
    )
    action = _action_from(feedback)

    if chapter_id and action in CHAPTER_ACTION_TO_STATUS:
        repo.update_chapter_status(chapter_id, CHAPTER_ACTION_TO_STATUS[action])

    return {"last_feedback": _feedback_dict(feedback)}


def route_after_chapter_review(
    state: BookState,
) -> Literal["approve", "revise", "reject"]:
    return _route(state)


def update_rolling_summary(state: BookState) -> BookState:
    """After chapter approval, persist its summary and advance the index."""
    book_id = state["book_id"]
    # Flip out of `chapter_review` so the frontend hides the review panel and
    # shows the "working" overlay during the Flash-Lite summary call.
    repo.update_book_status(book_id, "drafting", current_node="update_rolling_summary")

    chapter = state.get("current_chapter") or {}
    chapter_id = chapter.get("id")
    if chapter_id:
        summary = llm_summarize_chapter(
            chapter.get("title") or "",
            chapter.get("content_md") or "",
        )
        repo.update_chapter_summary(chapter_id, summary)

    next_index = state.get("current_chapter_index", 0) + 1
    return {"current_chapter_index": next_index}


def route_next_chapter_or_compile(
    state: BookState,
) -> Literal["draft_chapter", "compile_draft"]:
    book_id = state["book_id"]
    outline = repo.get_approved_outline(book_id)
    total = len(outline["content"]["chapters"]) if outline else 0
    next_index = state.get("current_chapter_index", 0)
    return "draft_chapter" if next_index < total else "compile_draft"


# ---------- compile ----------

def compile_draft(state: BookState) -> BookState:
    """Build .docx + .txt from approved chapters, upload to Supabase Storage."""
    book_id = state["book_id"]
    title = state["title"]

    repo.update_book_status(book_id, "compiling", current_node="compile_draft")
    paths = compile_book(book_id, title)
    repo.update_book_outputs(
        book_id,
        docx_path=paths["docx_path"],
        txt_path=paths["txt_path"],
        pdf_path=paths.get("pdf_path"),
    )
    repo.update_book_status(book_id, "complete", current_node=None)

    return {"status": "complete"}


# ---------- helpers ----------

def _action_from(feedback: Any) -> str:
    if isinstance(feedback, dict):
        return feedback.get("action", "approve")
    return str(feedback) if feedback else "approve"


def _feedback_dict(feedback: Any) -> dict[str, Any]:
    if isinstance(feedback, dict):
        return feedback
    return {"action": _action_from(feedback)}


def _route(state: BookState) -> Literal["approve", "revise", "reject"]:
    action = (state.get("last_feedback") or {}).get("action", "approve")
    if action not in ("approve", "revise", "reject"):
        action = "approve"
    return action  # type: ignore[return-value]


def _rolling_summary(book_id: str, up_to_index: int) -> str:
    if up_to_index == 0:
        return ""
    # Latest approved chapter per index, strictly before up_to_index.
    rows = repo.list_chapters(book_id)
    best_per_index: dict[int, dict[str, Any]] = {}
    for c in rows:
        if c["status"] != "approved" or c["index"] >= up_to_index:
            continue
        existing = best_per_index.get(c["index"])
        if not existing or c["version"] > existing["version"]:
            best_per_index[c["index"]] = c

    parts: list[str] = []
    for idx in sorted(best_per_index.keys()):
        ch = best_per_index[idx]
        summary = ch.get("summary") or f"(summary unavailable for chapter {idx + 1})"
        parts.append(f"Chapter {idx + 1} — {ch.get('title', '')}: {summary}")
    return "\n\n".join(parts)
