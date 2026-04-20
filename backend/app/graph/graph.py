"""LangGraph wiring — full pipeline: outline → review → chapters → review → compile.

Checkpointer: `SqliteSaver` backed by a file on a Docker named volume. Graph
state survives `uvicorn --reload` and `docker compose restart`; it's only
lost when the volume itself is removed (`docker compose down -v`).

For a true production deploy, swap to `PostgresSaver` against the Supabase DB.
"""

import sqlite3
from functools import lru_cache
from pathlib import Path

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, StateGraph

from app.graph.nodes import (
    compile_draft,
    draft_chapter,
    generate_outline,
    review_chapter,
    review_outline,
    route_after_chapter_review,
    route_after_outline_review,
    route_next_chapter_or_compile,
    update_rolling_summary,
)
from app.graph.state import BookState


STATE_DB_PATH = Path("/data/graph.db")
STATE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# check_same_thread=False — FastAPI runs sync handlers in a threadpool and
# BackgroundTasks on separate threads; all of them share this one connection.
_conn = sqlite3.connect(STATE_DB_PATH, check_same_thread=False)
_checkpointer = SqliteSaver(_conn)
_checkpointer.setup()  # idempotent; creates checkpoint tables on first run


def build_graph():
    g = StateGraph(BookState)

    g.add_node("generate_outline", generate_outline)
    g.add_node("review_outline", review_outline)
    g.add_node("draft_chapter", draft_chapter)
    g.add_node("review_chapter", review_chapter)
    g.add_node("update_rolling_summary", update_rolling_summary)
    g.add_node("compile_draft", compile_draft)

    g.set_entry_point("generate_outline")

    g.add_edge("generate_outline", "review_outline")
    g.add_conditional_edges(
        "review_outline",
        route_after_outline_review,
        {
            "approve": "draft_chapter",
            "revise": "generate_outline",
            "reject": "generate_outline",
        },
    )

    g.add_edge("draft_chapter", "review_chapter")
    g.add_conditional_edges(
        "review_chapter",
        route_after_chapter_review,
        {
            "approve": "update_rolling_summary",
            "revise": "draft_chapter",
            "reject": "draft_chapter",
        },
    )

    g.add_conditional_edges(
        "update_rolling_summary",
        route_next_chapter_or_compile,
        {
            "draft_chapter": "draft_chapter",
            "compile_draft": "compile_draft",
        },
    )

    g.add_edge("compile_draft", END)

    return g.compile(checkpointer=_checkpointer)


@lru_cache(maxsize=1)
def get_graph():
    return build_graph()


def clear_thread_state(thread_id: str) -> None:
    """Wipe all LangGraph checkpoints for a given thread (= book_id).

    Used when restarting a failed book so the next `graph.invoke` starts
    clean instead of trying to resume from a broken checkpoint.
    """
    _conn.execute("DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,))
    _conn.execute("DELETE FROM writes WHERE thread_id = ?", (thread_id,))
    _conn.commit()
