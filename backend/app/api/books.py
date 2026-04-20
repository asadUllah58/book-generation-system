import logging
from io import BytesIO
from typing import Any, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Response, UploadFile
from langgraph.types import Command
from openpyxl import load_workbook
from pydantic import BaseModel, ConfigDict

from app.compile.builder import compile_book_format, create_signed_url
from app.db import repositories as repo
from app.graph.graph import clear_thread_state, get_graph

MAX_BULK_ROWS = 50

log = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["books"])


# ---------- schemas ----------

class CreateBookPayload(BaseModel):
    title: str


class BookResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    title: str
    status: str
    current_node: Optional[str] = None
    final_docx_path: Optional[str] = None
    final_txt_path: Optional[str] = None
    final_pdf_path: Optional[str] = None
    created_at: str
    updated_at: str


class OutlineResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    book_id: str
    version: int
    parent_id: Optional[str] = None
    content: dict[str, Any]
    status: str
    created_at: str


class ChapterResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    book_id: str
    index: int
    version: int
    parent_id: Optional[str] = None
    title: Optional[str] = None
    content_md: str
    summary: Optional[str] = None
    status: str
    created_at: str


class ResumePayload(BaseModel):
    target_type: Literal["outline", "chapter"]
    target_id: str
    action: Literal["approve", "revise", "reject"]
    reviewer_id: str
    note: Optional[str] = None


class ResumeResponse(BaseModel):
    resumed: bool


# ---------- background helpers ----------

def _thread_config(book_id: str) -> dict[str, Any]:
    return {"configurable": {"thread_id": book_id}}


def _start_graph_run(book_id: str, title: str) -> None:
    try:
        get_graph().invoke(
            {"book_id": book_id, "title": title},
            config=_thread_config(book_id),
        )
    except Exception:
        log.exception("graph run failed for book %s", book_id)
        try:
            repo.update_book_status(book_id, "failed")
        except Exception:
            log.exception("could not mark book %s as failed", book_id)


def _resume_graph_run(book_id: str, action: str, note: Optional[str]) -> None:
    try:
        get_graph().invoke(
            Command(resume={"action": action, "note": note}),
            config=_thread_config(book_id),
        )
    except Exception:
        log.exception("graph resume failed for book %s", book_id)


# ---------- handlers ----------

@router.get("", response_model=list[BookResponse])
def list_books() -> list[BookResponse]:
    return [BookResponse(**b) for b in repo.list_books()]


@router.post("", response_model=BookResponse, status_code=201)
def create_book(
    payload: CreateBookPayload,
    background_tasks: BackgroundTasks,
) -> BookResponse:
    book = repo.create_book(payload.title)
    background_tasks.add_task(_start_graph_run, book["id"], book["title"])
    return BookResponse(**book)


@router.post("/bulk", response_model=list[BookResponse], status_code=201)
async def create_books_bulk(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> list[BookResponse]:
    """Bulk-create books from an .xlsx file.

    Format: column A holds titles, row 1 is a header (ignored), data starts
    at row 2. Blank cells are skipped. Capped at `MAX_BULK_ROWS`.
    """
    filename = (file.filename or "").lower()
    if not filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="expected a .xlsx file")

    content = await file.read()
    try:
        wb = load_workbook(filename=BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:  # noqa: BLE001 — any parse error → 400
        raise HTTPException(status_code=400, detail=f"invalid .xlsx: {exc}") from exc

    ws = wb.active
    if ws is None:
        raise HTTPException(status_code=400, detail="workbook has no sheets")

    titles: list[str] = []
    for row in ws.iter_rows(min_row=2, max_col=1, values_only=True):
        value = row[0]
        if isinstance(value, str) and value.strip():
            titles.append(value.strip())
        if len(titles) >= MAX_BULK_ROWS:
            break

    if not titles:
        raise HTTPException(
            status_code=400,
            detail="no titles found — put titles in column A starting at row 2",
        )

    created: list[BookResponse] = []
    for title in titles:
        book = repo.create_book(title)
        # NOTE: all runs kick off at once. Fine at demo scale; a proper queue
        # would stagger them to avoid LLM rate limits.
        background_tasks.add_task(_start_graph_run, book["id"], book["title"])
        created.append(BookResponse(**book))
    return created


@router.get("/{book_id}", response_model=BookResponse)
def get_book(book_id: str) -> BookResponse:
    book = repo.get_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="book not found")
    return BookResponse(**book)


@router.post("/{book_id}/restart", response_model=BookResponse)
def restart_book(book_id: str, background_tasks: BackgroundTasks) -> BookResponse:
    """Wipe outlines/chapters/feedback/graph-state and re-run the pipeline.

    The book row (id, title, created_at) is preserved so the UI keeps its
    identity; everything else is reset to a fresh-start state.
    """
    book = repo.get_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="book not found")

    clear_thread_state(book_id)
    repo.delete_book_storage(book_id)
    repo.reset_book(book_id)

    background_tasks.add_task(_start_graph_run, book_id, book["title"])
    refreshed = repo.get_book(book_id) or book
    return BookResponse(**refreshed)


@router.delete("/{book_id}", status_code=204, response_class=Response)
def delete_book(book_id: str) -> Response:
    """Delete a book and everything attached to it.

    Cascades outlines/chapters/feedback_notes via FKs. Storage cleanup is
    best-effort — failures are swallowed. Any in-flight LangGraph run keyed
    by this book_id is orphaned (MemorySaver), which is fine: the next
    attempt to write to the DB will no-op since the row is gone.
    """
    if not repo.get_book(book_id):
        raise HTTPException(status_code=404, detail="book not found")
    repo.delete_book(book_id)
    repo.delete_book_storage(book_id)
    return Response(status_code=204)


@router.get("/{book_id}/outlines", response_model=list[OutlineResponse])
def list_outlines(book_id: str) -> list[OutlineResponse]:
    if not repo.get_book(book_id):
        raise HTTPException(status_code=404, detail="book not found")
    return [OutlineResponse(**o) for o in repo.list_outlines(book_id)]


@router.get("/{book_id}/chapters", response_model=list[ChapterResponse])
def list_chapters(book_id: str) -> list[ChapterResponse]:
    if not repo.get_book(book_id):
        raise HTTPException(status_code=404, detail="book not found")
    return [ChapterResponse(**c) for c in repo.list_chapters(book_id)]


@router.get("/{book_id}/download")
def download_book(book_id: str, format: Literal["docx", "pdf", "txt"] = "docx") -> dict[str, str]:
    """Compile a snapshot of the book in the requested format from whatever
    chapters are currently approved, upload it, and return a 1-hour signed URL.

    Works at any stage — a single approved chapter is enough. Files are
    overwritten on each download so the latest state always wins.
    """
    book = repo.get_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="book not found")

    try:
        path = compile_book_format(book_id, book["title"], format)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    url = create_signed_url(path, expires_in_seconds=3600)
    if not url:
        raise HTTPException(status_code=500, detail="could not sign storage url")
    return {"url": url, "format": format, "path": path}


@router.post("/{book_id}/resume", response_model=ResumeResponse)
def resume_book(
    book_id: str,
    payload: ResumePayload,
    background_tasks: BackgroundTasks,
) -> ResumeResponse:
    if not repo.get_book(book_id):
        raise HTTPException(status_code=404, detail="book not found")

    repo.insert_feedback(
        book_id=book_id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        action=payload.action,
        reviewer_id=payload.reviewer_id,
        note=payload.note,
    )
    background_tasks.add_task(
        _resume_graph_run, book_id, payload.action, payload.note
    )
    return ResumeResponse(resumed=True)
