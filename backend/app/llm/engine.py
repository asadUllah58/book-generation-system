"""Multi-provider LLM engine for the book pipeline.

Each task (outline / draft / summary) has its own QuotaAwareRouter with a
provider order tuned for that task:
  - outline: runs once, quality first
  - draft:   runs per chapter, favour high-RPM providers
  - summary: short + cheap, favour the fastest small model

Configured providers are probed in order; on quota exhaustion the router
cools that provider down for an hour and falls through to the next.
"""

import logging
import threading
from functools import lru_cache
from queue import Empty, Queue
from typing import Any, Callable, Optional, TypeVar

from app.llm import providers
from app.llm.router import QuotaAwareRouter
from app.llm.schemas import BookOutline

log = logging.getLogger(__name__)


# -------- per-call wall-clock budget --------
# Bound how long a single LLM invocation can hold the graph. Anything past
# this is almost certainly a network hang or a retry spiral — fail fast so
# the graph's exception handler flips the book to `failed` and the UI shows
# the restart card instead of "Drafting chapter…" forever.

_LLM_TIMEOUT_SEC = 120.0
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


# -------- per-task routers --------
# Each router stacks free-tier models so quota exhaustion on one model (or one
# provider) cascades through independent buckets before failing. Google's
# free-tier limits are per-model, not per-project, so multiple Gemini entries
# is legitimately multiple free quotas. Same pattern for Groq and Cerebras.

@lru_cache(maxsize=1)
def _outline_router() -> QuotaAwareRouter:
    # Runs once per book. Quality first, then fall through to the high-RPM
    # free tiers. Only well-tested structured-output models live here.
    t = 0.7
    return QuotaAwareRouter([
        ("gemini-2.5-pro",        providers.gemini("gemini-2.5-pro", temperature=t)),
        ("gemini-2.5-flash",      providers.gemini("gemini-2.5-flash", temperature=t)),
        ("gemini-2.0-flash",      providers.gemini("gemini-2.0-flash", temperature=t)),
        ("cerebras-llama70",      providers.cerebras("llama-3.3-70b", temperature=t)),
        ("groq-llama70",          providers.groq("llama-3.3-70b-versatile", temperature=t)),
        ("gemini-2.5-flash-lite", providers.gemini("gemini-2.5-flash-lite", temperature=t)),
    ])


@lru_cache(maxsize=1)
def _draft_router() -> QuotaAwareRouter:
    # 10+ calls per book — throughput wins. Lite models first (highest RPM),
    # escalate to the bigger Gemini tiers, then other providers.
    t = 0.8
    return QuotaAwareRouter([
        ("gemini-2.5-flash-lite", providers.gemini("gemini-2.5-flash-lite", temperature=t)),
        ("gemini-2.0-flash-lite", providers.gemini("gemini-2.0-flash-lite", temperature=t)),
        ("gemini-2.0-flash",      providers.gemini("gemini-2.0-flash", temperature=t)),
        ("gemini-2.5-flash",      providers.gemini("gemini-2.5-flash", temperature=t)),
        ("cerebras-llama70",      providers.cerebras("llama-3.3-70b", temperature=t)),
        ("cerebras-llama4-scout", providers.cerebras("llama-4-scout-17b-16e-instruct", temperature=t)),
        ("groq-llama70",          providers.groq("llama-3.3-70b-versatile", temperature=t)),
    ])


@lru_cache(maxsize=1)
def _summary_router() -> QuotaAwareRouter:
    # Short, deterministic, runs per chapter. Cheapest + fastest models first.
    t = 0.2
    return QuotaAwareRouter([
        ("gemini-2.0-flash-lite", providers.gemini("gemini-2.0-flash-lite", temperature=t)),
        ("gemini-2.5-flash-lite", providers.gemini("gemini-2.5-flash-lite", temperature=t)),
        ("groq-llama8",           providers.groq("llama-3.1-8b-instant", temperature=t)),
        ("groq-gemma2-9b",        providers.groq("gemma2-9b-it", temperature=t)),
        ("cerebras-llama70",      providers.cerebras("llama-3.3-70b", temperature=t)),
    ])


def _content_str(response: Any) -> str:
    content = response.content
    if isinstance(content, list):
        content = "\n".join(str(p) for p in content)
    return str(content).strip()


# ---------- outline ----------

OUTLINE_SYSTEM_PROMPT = """You are an expert book planner.

Given a book title, produce a detailed chapter-by-chapter outline:
- 8 to 12 chapters
- Each chapter has a short title and a 2-4 sentence summary
- The outline should have a coherent arc across chapters
- Return valid data matching the schema exactly
"""


def generate_outline(title: str, revision_note: Optional[str] = None) -> BookOutline:
    user_message = f"Book title: {title}"
    if revision_note and revision_note.strip():
        user_message += (
            f"\n\nThe previous outline needs revision. "
            f"Reviewer note: {revision_note.strip()}"
        )
    structured = _outline_router().with_structured_output(BookOutline)
    outline = _with_budget(
        lambda: structured.invoke(
            [
                ("system", OUTLINE_SYSTEM_PROMPT),
                ("human", user_message),
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

    response = _with_budget(
        lambda: _draft_router().invoke(
            [
                ("system", CHAPTER_SYSTEM_PROMPT),
                ("human", user_message),
            ]
        )
    )
    return _content_str(response)


# ---------- rolling summary ----------

SUMMARY_SYSTEM_PROMPT = """You are an editor summarising chapters for continuity.

Summarise the given chapter in 3-5 sentences. Capture plot events, character
arcs, and anything later chapters need to remember. Avoid flowery language.
"""


def summarize_chapter(chapter_title: str, content_md: str) -> str:
    response = _with_budget(
        lambda: _summary_router().invoke(
            [
                ("system", SUMMARY_SYSTEM_PROMPT),
                ("human", f"Chapter: {chapter_title}\n\n{content_md}"),
            ]
        )
    )
    return _content_str(response)
