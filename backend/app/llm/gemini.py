"""Gemini client — lazy singletons + typed wrappers.

One `ChatGoogleGenerativeAI` instance per model tier. Using
`with_structured_output()` where it helps (outline); free-form text for
long-form chapter prose.
"""

import logging
import threading
import time
from collections import deque
from functools import lru_cache
from queue import Empty, Queue
from threading import Lock
from typing import Any, Callable, Optional, TypeVar

from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings
from app.llm.schemas import BookOutline

log = logging.getLogger(__name__)

MODEL_FLASH = "gemini-2.5-flash"
MODEL_FLASH_LITE = "gemini-2.5-flash-lite"


# -------- rate-limit throttle --------
# Gemini free tier caps gemini-2.5-flash-lite at ~20 RPM per project.
# Concurrent books + langchain's automatic retries can blow past this in
# seconds, and each 429 burns more budget. We proactively cap ourselves at
# MAX_CALLS_PER_MIN with a simple sliding-window — blocking (sleeping) the
# caller if the bucket is full. Cheap to run, simple to reason about, keeps
# graph runs stable under load.

MAX_CALLS_PER_MIN = 15
_WINDOW_SECONDS = 60.0
_call_times: deque[float] = deque()
_call_lock = Lock()


def _throttle() -> None:
    while True:
        now = time.time()
        with _call_lock:
            while _call_times and now - _call_times[0] > _WINDOW_SECONDS:
                _call_times.popleft()
            if len(_call_times) < MAX_CALLS_PER_MIN:
                _call_times.append(now)
                return
            wait = _WINDOW_SECONDS - (now - _call_times[0]) + 0.1
        log.info("gemini throttle: sleeping %.1fs (queue full)", wait)
        time.sleep(max(wait, 0.1))


@lru_cache(maxsize=4)
def _llm(model: str, temperature: float = 0.7) -> ChatGoogleGenerativeAI:
    if not settings.google_api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set")
    return ChatGoogleGenerativeAI(
        model=model,
        google_api_key=settings.google_api_key,
        temperature=temperature,
        # Keep retries modest — the proactive throttle below prevents most
        # 429s, and a long retry chain just delays failure (a broken call
        # would retry for 4+ minutes with the old max_retries=8).
        max_retries=3,
    )


# -------- per-call wall-clock budget --------
# Bound how long a single LLM invocation can hold the graph. Anything past
# this is almost certainly a network hang or a retry spiral — fail fast so
# the graph's exception handler flips the book to `failed` and the UI shows
# the restart card instead of "Drafting chapter…" forever.

_LLM_TIMEOUT_SEC = 90.0
T = TypeVar("T")


def _with_budget(fn: Callable[[], T]) -> T:
    result: Queue[tuple[str, Any]] = Queue()

    def worker() -> None:
        try:
            result.put(("ok", fn()))
        except BaseException as exc:  # noqa: BLE001 — re-raised below
            result.put(("err", exc))

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    try:
        kind, value = result.get(timeout=_LLM_TIMEOUT_SEC)
    except Empty:
        raise TimeoutError(
            f"LLM call exceeded {_LLM_TIMEOUT_SEC:.0f}s budget"
        ) from None
    if kind == "err":
        raise value
    return value  # type: ignore[return-value]


# ---------- outline ----------

OUTLINE_SYSTEM_PROMPT = """You are an expert book planner.

Given a book title, produce a detailed chapter-by-chapter outline:
- 8 to 12 chapters
- Each chapter has a short title and a 2-4 sentence summary
- The outline should have a coherent arc across chapters
- Return valid data matching the schema exactly
"""


def generate_outline(title: str) -> BookOutline:
    # Flash-Lite across the board — Flash-level RPM is too tight on free tier
    # once a project is doing many restarts / multiple books. Outline quality
    # is still good for a planning task.
    _throttle()
    structured = _llm(MODEL_FLASH_LITE).with_structured_output(BookOutline)
    outline = _with_budget(
        lambda: structured.invoke(
            [
                ("system", OUTLINE_SYSTEM_PROMPT),
                ("human", f"Book title: {title}"),
            ]
        )
    )
    return outline  # type: ignore[return-value]


# ---------- chapter drafting ----------

CHAPTER_SYSTEM_PROMPT = """You are a professional book author.

Write one chapter of a book, in polished markdown prose:
- Match the chapter's title and summary
- Fit coherently with prior chapters (via the rolling summary below)
- Aim for roughly 800-1500 words unless the summary implies otherwise
- Use heading syntax for the chapter title (# Title) at the top
- Return only the chapter markdown — no front-matter, no commentary
"""


def draft_chapter(
    *,
    book_title: str,
    book_summary: str,
    chapter_title: str,
    chapter_summary: str,
    rolling_summary: str,
    feedback_note: Optional[str] = None,
) -> str:
    """Draft a single chapter. Returns the chapter content as markdown."""
    prior = rolling_summary.strip() or "(this is the first chapter; no prior context)"
    revision_note = (
        f"\n\nThe previous draft of this chapter needs revision. "
        f"Reviewer note: {feedback_note}"
        if feedback_note
        else ""
    )

    user_message = f"""Book: {book_title}
Book summary: {book_summary}

Chapter to write:
- Title: {chapter_title}
- Summary: {chapter_summary}

Rolling summary of prior chapters:
{prior}
{revision_note}

Write the chapter now."""

    # Flash-Lite for per-chapter drafting — many calls, higher free-tier RPM
    # than the full Flash model. Quality is plenty for prose.
    _throttle()
    response = _with_budget(
        lambda: _llm(MODEL_FLASH_LITE, temperature=0.8).invoke(
            [
                ("system", CHAPTER_SYSTEM_PROMPT),
                ("human", user_message),
            ]
        )
    )
    content = response.content
    if isinstance(content, list):
        content = "\n".join(str(p) for p in content)
    return str(content).strip()


# ---------- rolling summary ----------

SUMMARY_SYSTEM_PROMPT = """You are an editor summarising chapters for continuity.

Summarise the given chapter in 3-5 sentences. Capture plot events, character
arcs, and anything later chapters need to remember. Avoid flowery language.
"""


def summarize_chapter(chapter_title: str, content_md: str) -> str:
    _throttle()
    response = _with_budget(
        lambda: _llm(MODEL_FLASH_LITE, temperature=0.2).invoke(
            [
                ("system", SUMMARY_SYSTEM_PROMPT),
                ("human", f"Chapter: {chapter_title}\n\n{content_md}"),
            ]
        )
    )
    content = response.content
    if isinstance(content, list):
        content = "\n".join(str(p) for p in content)
    return str(content).strip()
