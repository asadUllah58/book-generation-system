"""Chapter lifecycle: slot creation, generation, revision, approval.

Chapter versioning:
  - `create_slots` inserts one v1 row per outline chapter with empty content.
  - `generate` fills v1 if empty, else errors (user must `revise` instead).
  - `revise`    creates a new version; prior non-approved versions → superseded.
  - `approve`   marks the latest version approved + triggers summary generation;
                prior non-approved versions → superseded. If every outline
                chapter has an approved version, the book flips to `complete`.

Drafting chapter N uses the rolling summary of approved chapters with index
< N as context. Out-of-order drafting is allowed — chapters drafted without
prior approved context just get a shorter rolling summary.
"""

from typing import Any, Optional

from app.db import repositories as repo
from app.llm.engine import (
    draft_chapter as llm_draft_chapter,
    summarize_chapter as llm_summarize_chapter,
)


def create_slots(book_id: str) -> list[dict[str, Any]]:
    """Create empty v1 rows for every chapter in the approved outline.

    Idempotent: if a row already exists at an index, that index is skipped.
    Returns the full ordered list of chapters for the book after insertion.
    """
    outline = repo.get_approved_outline(book_id)
    if not outline:
        raise RuntimeError("cannot draft chapters: no approved outline")

    chapters_def = outline["content"]["chapters"]
    existing = {c["index"] for c in repo.list_chapters(book_id)}

    for entry in chapters_def:
        idx = entry["index"]
        if idx in existing:
            continue
        repo.create_chapter(
            book_id=book_id,
            index=idx,
            version=1,
            title=entry.get("title"),
            content_md="",
        )

    repo.update_book_status(book_id, "drafting")
    return repo.list_chapters(book_id)


def generate(book_id: str, index: int) -> dict[str, Any]:
    """Fill the v1 slot at `index` with LLM-generated prose.

    If no slot row exists yet (e.g. an older book migrated from the pre-stepper
    flow where slots weren't pre-created for every outline index), one is
    created on the fly. Errors if a slot already has content — the caller
    should use `revise` to replace existing prose.
    """
    outline = repo.get_approved_outline(book_id)
    if not outline:
        raise RuntimeError("no approved outline")

    chapter_def = _chapter_def(outline, index)
    content_md = llm_draft_chapter(
        book_title=outline["content"]["title"],
        book_summary=outline["content"]["summary"],
        chapter_title=chapter_def["title"],
        chapter_summary=chapter_def["summary"],
        rolling_summary=_rolling_summary(book_id, up_to_index=index),
    )

    slot = _latest_at_index(book_id, index)
    if slot and slot["content_md"]:
        raise RuntimeError(
            f"chapter {index} already has content; use revise instead"
        )
    if slot:
        return repo.update_chapter_content(slot["id"], content_md)
    return repo.create_chapter(
        book_id=book_id,
        index=index,
        version=1,
        title=chapter_def.get("title"),
        content_md=content_md,
    )


def revise(book_id: str, index: int, note: Optional[str]) -> dict[str, Any]:
    """Create a new version with an AI-generated revision at `index`.

    Prior non-approved versions at this index are marked `superseded`. Note
    is optional — an empty note still signals "give me a different take".
    """
    outline = repo.get_approved_outline(book_id)
    if not outline:
        raise RuntimeError("no approved outline")

    chapter_def = _chapter_def(outline, index)
    versions = _versions_at_index(book_id, index)
    if not versions:
        raise RuntimeError(f"chapter {index} has no versions to revise")
    latest = versions[-1]
    if latest["status"] == "approved":
        raise RuntimeError(f"chapter {index} is approved and cannot be revised")

    content_md = llm_draft_chapter(
        book_title=outline["content"]["title"],
        book_summary=outline["content"]["summary"],
        chapter_title=chapter_def["title"],
        chapter_summary=chapter_def["summary"],
        rolling_summary=_rolling_summary(book_id, up_to_index=index),
        feedback_note=(note.strip() if note else None) or None,
    )

    for v in versions:
        if v["status"] in ("pending", "revised"):
            repo.update_chapter_status(v["id"], "superseded")

    return repo.create_chapter(
        book_id=book_id,
        index=index,
        version=latest["version"] + 1,
        parent_id=latest["id"],
        title=chapter_def["title"],
        content_md=content_md,
    )


def approve(book_id: str, index: int) -> dict[str, Any]:
    """Approve the latest version at `index`; supersede siblings.

    Also generates the rolling-summary entry for this chapter so later
    out-of-order drafts can use it as context. Promotes the book to
    `complete` when every outline chapter has at least one approved version.
    """
    versions = _versions_at_index(book_id, index)
    if not versions:
        raise RuntimeError(f"chapter {index} has no versions to approve")
    latest = versions[-1]
    if not latest["content_md"]:
        raise RuntimeError(f"chapter {index} has no content to approve")

    repo.update_chapter_status(latest["id"], "approved")
    for v in versions[:-1]:
        if v["status"] in ("pending", "revised"):
            repo.update_chapter_status(v["id"], "superseded")

    summary = llm_summarize_chapter(
        latest.get("title") or "",
        latest.get("content_md") or "",
    )
    repo.update_chapter_summary(latest["id"], summary)
    latest["summary"] = summary
    latest["status"] = "approved"

    _maybe_mark_complete(book_id)
    return latest


# ---------- helpers ----------

def _chapter_def(outline: dict[str, Any], index: int) -> dict[str, Any]:
    for entry in outline["content"]["chapters"]:
        if entry["index"] == index:
            return entry
    raise RuntimeError(f"chapter index {index} not found in outline")


def _versions_at_index(book_id: str, index: int) -> list[dict[str, Any]]:
    """All versions at an index, oldest first."""
    return [c for c in repo.list_chapters(book_id) if c["index"] == index]


def _latest_at_index(book_id: str, index: int) -> Optional[dict[str, Any]]:
    versions = _versions_at_index(book_id, index)
    return versions[-1] if versions else None


def _rolling_summary(book_id: str, up_to_index: int) -> str:
    """Concatenated summaries of approved chapters with index < up_to_index."""
    if up_to_index == 0:
        return ""
    rows = repo.list_chapters(book_id)
    best: dict[int, dict[str, Any]] = {}
    for c in rows:
        if c["status"] != "approved" or c["index"] >= up_to_index:
            continue
        existing = best.get(c["index"])
        if not existing or c["version"] > existing["version"]:
            best[c["index"]] = c

    parts: list[str] = []
    for idx in sorted(best):
        ch = best[idx]
        summary = ch.get("summary") or f"(summary unavailable for chapter {idx + 1})"
        parts.append(f"Chapter {idx + 1} — {ch.get('title', '')}: {summary}")
    return "\n\n".join(parts)


def _maybe_mark_complete(book_id: str) -> None:
    outline = repo.get_approved_outline(book_id)
    if not outline:
        return
    total = len(outline["content"]["chapters"])
    approved = {
        c["index"]
        for c in repo.list_chapters(book_id)
        if c["status"] == "approved"
    }
    if len(approved) >= total:
        repo.update_book_status(book_id, "complete")
