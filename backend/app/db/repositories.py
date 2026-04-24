"""Thin Supabase data-access layer.

Kept deliberately small — API handlers and LangGraph nodes both call these
functions instead of reaching into the Supabase client directly.
"""

from typing import Any, Optional

from app.db.supabase_client import get_supabase


# ---------- books ----------

def create_book(title: str) -> dict[str, Any]:
    res = get_supabase().table("books").insert({"title": title}).execute()
    return res.data[0]


def get_book(book_id: str) -> Optional[dict[str, Any]]:
    res = (
        get_supabase()
        .table("books")
        .select("*")
        .eq("id", book_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def list_books(limit: int = 50) -> list[dict[str, Any]]:
    res = (
        get_supabase()
        .table("books")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def update_book_status(book_id: str, status: str, current_node: Optional[str] = None) -> None:
    patch: dict[str, Any] = {"status": status}
    if current_node is not None:
        patch["current_node"] = current_node
    get_supabase().table("books").update(patch).eq("id", book_id).execute()


def delete_book(book_id: str) -> None:
    """Delete the book row. Cascades to outlines/chapters/feedback_notes via FKs."""
    get_supabase().table("books").delete().eq("id", book_id).execute()


def reset_book(book_id: str) -> None:
    """Clear all child rows for a book and reset its status to a fresh start.

    The book row itself is kept so the id/title/created_at stay stable for the
    UI; everything else is blown away so a restarted pipeline run has nothing
    stale to trip over.
    """
    client = get_supabase()
    client.table("outlines").delete().eq("book_id", book_id).execute()
    client.table("chapters").delete().eq("book_id", book_id).execute()
    client.table("feedback_notes").delete().eq("book_id", book_id).execute()
    client.table("books").update(
        {
            "status": "created",
            "current_node": None,
            "final_docx_path": None,
            "final_pdf_path": None,
            "final_txt_path": None,
        }
    ).eq("id", book_id).execute()


def delete_book_storage(book_id: str) -> None:
    """Best-effort cleanup of the book's files in the Storage `books` bucket.

    Lists the `{book_id}/` prefix and removes whatever is there — tolerant of
    missing folders (book never compiled) and of file-name drift.
    """
    bucket = get_supabase().storage.from_("books")
    try:
        items = bucket.list(book_id) or []
    except Exception:
        return
    paths = [f"{book_id}/{item['name']}" for item in items if item.get("name")]
    if paths:
        try:
            bucket.remove(paths)
        except Exception:
            pass


def update_book_outputs(
    book_id: str,
    docx_path: str,
    txt_path: str,
    pdf_path: Optional[str] = None,
) -> None:
    patch: dict[str, Any] = {
        "final_docx_path": docx_path,
        "final_txt_path": txt_path,
    }
    if pdf_path is not None:
        patch["final_pdf_path"] = pdf_path
    get_supabase().table("books").update(patch).eq("id", book_id).execute()


# ---------- outlines ----------

def create_outline(
    book_id: str,
    version: int,
    content: dict[str, Any],
    parent_id: Optional[str] = None,
) -> dict[str, Any]:
    res = (
        get_supabase()
        .table("outlines")
        .insert(
            {
                "book_id": book_id,
                "version": version,
                "parent_id": parent_id,
                "content": content,
            }
        )
        .execute()
    )
    return res.data[0]


def list_outlines(book_id: str) -> list[dict[str, Any]]:
    res = (
        get_supabase()
        .table("outlines")
        .select("*")
        .eq("book_id", book_id)
        .order("version", desc=False)
        .execute()
    )
    return res.data or []


def get_latest_outline(book_id: str) -> Optional[dict[str, Any]]:
    res = (
        get_supabase()
        .table("outlines")
        .select("*")
        .eq("book_id", book_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def next_outline_version(book_id: str) -> int:
    latest = get_latest_outline(book_id)
    return (latest["version"] + 1) if latest else 1


def update_outline_status(outline_id: str, status: str) -> None:
    get_supabase().table("outlines").update({"status": status}).eq(
        "id", outline_id
    ).execute()


def get_approved_outline(book_id: str) -> Optional[dict[str, Any]]:
    """Latest approved outline — what chapter drafting reads from."""
    res = (
        get_supabase()
        .table("outlines")
        .select("*")
        .eq("book_id", book_id)
        .eq("status", "approved")
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


# ---------- chapters ----------

def create_chapter(
    *,
    book_id: str,
    index: int,
    version: int,
    title: str,
    content_md: str,
    parent_id: Optional[str] = None,
) -> dict[str, Any]:
    res = (
        get_supabase()
        .table("chapters")
        .insert(
            {
                "book_id": book_id,
                "index": index,
                "version": version,
                "parent_id": parent_id,
                "title": title,
                "content_md": content_md,
            }
        )
        .execute()
    )
    return res.data[0]


def list_chapters(book_id: str) -> list[dict[str, Any]]:
    res = (
        get_supabase()
        .table("chapters")
        .select("*")
        .eq("book_id", book_id)
        .order("index", desc=False)
        .order("version", desc=False)
        .execute()
    )
    return res.data or []


def get_latest_chapter_version(
    book_id: str, index: int
) -> Optional[dict[str, Any]]:
    res = (
        get_supabase()
        .table("chapters")
        .select("*")
        .eq("book_id", book_id)
        .eq("index", index)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def update_chapter_status(chapter_id: str, status: str) -> None:
    get_supabase().table("chapters").update({"status": status}).eq(
        "id", chapter_id
    ).execute()


def update_chapter_summary(chapter_id: str, summary: str) -> None:
    get_supabase().table("chapters").update({"summary": summary}).eq(
        "id", chapter_id
    ).execute()


def update_chapter_content(chapter_id: str, content_md: str) -> dict[str, Any]:
    """Replace the prose of an existing chapter row (used to fill empty slots)."""
    res = (
        get_supabase()
        .table("chapters")
        .update({"content_md": content_md})
        .eq("id", chapter_id)
        .execute()
    )
    return res.data[0]


# ---------- feedback ----------

def insert_feedback(
    book_id: str,
    target_type: str,
    target_id: str,
    action: str,
    reviewer_id: str,
    note: Optional[str] = None,
) -> dict[str, Any]:
    res = (
        get_supabase()
        .table("feedback_notes")
        .insert(
            {
                "book_id": book_id,
                "target_type": target_type,
                "target_id": target_id,
                "action": action,
                "reviewer_id": reviewer_id,
                "note": note,
            }
        )
        .execute()
    )
    return res.data[0]
