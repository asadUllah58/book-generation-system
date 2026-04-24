# Book Generation System

A modular, feedback-gated pipeline that turns a title into a finished book.
A human reviews the outline and each chapter; the system waits at every gate,
branches on the reviewer's decision, and compiles the final draft when done.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Orchestration | **Python 3.11 + FastAPI + LangGraph** | LangGraph gives first-class state machines, `interrupt()` for HITL, and a Postgres checkpointer that maps cleanly to Supabase. |
| LLM | **Google Gemini 2.5 Flash** (Flash-Lite for summaries) | Free tier is sufficient for build + demo; quality is good for long-form drafting. |
| Database + Storage + Realtime | **Supabase Cloud** | Single managed service covers Postgres, Storage (final `.docx`/`.txt`), and Realtime push for the reviewer UI. |
| Frontend | **Vite + React 18 + TypeScript + Tailwind + TanStack Query** | Pure SPA, static deploy, no Node server in the middle. |
| Input | **Excel upload** (`.xlsx`, planned) | Satisfies the "Google Sheets or local Excel" requirement with minimal setup. |
| Notifications | **Teams webhook** (phase 1), **SMTP email** (phase 2) | Triggered at every review gate and on completion. |
| Packaging | **Docker Compose** | One-command bring-up; no tooling required on the host. |

**No Node.js in the middle.** Supabase acts as the backend for CRUD +
real-time; Python handles orchestration and LLM calls. Node only exists inside
the `frontend` container as the Vite dev server.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React SPA (Vite)                                           │
│   • BookList — create + list                                │
│   • BookWorkspace — outline, chapters, ReviewPanel          │
│   • Subscribes to Supabase Realtime for live status         │
│   • Posts feedback via POST /books/:id/resume to backend    │
└─────────────────────────────────────────────────────────────┘
         │ REST                          │ realtime + reads
         ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│  FastAPI + LangGraph     │◄──│  Supabase                │
│   • /books CRUD          │──►│   • Postgres (tables)    │
│   • /books/:id/resume    │   │   • Storage (final files)│
│   • LangGraph nodes:     │   │   • Realtime publication │
│     outline → review →   │   │   • RLS                  │
│     draft → review →     │   └──────────────────────────┘
│     compile              │
└──────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│  Gemini 2.5 Flash API    │
└──────────────────────────┘
```

### Pipeline state machine

```
generate_outline
  → review_outline        (interrupt)
      approve → draft_chapter
      revise  → generate_outline  (new version, parent_id → previous)
      reject  → generate_outline  (fresh branch)

draft_chapter
  → review_chapter        (interrupt)
      approve → update_rolling_summary → next chapter | compile_draft
      revise  → draft_chapter  (new version)
      reject  → draft_chapter  (fresh branch)

compile_draft → .docx + .txt → Supabase Storage → END
```

Every review node calls `interrupt()`. Resume is triggered by
`POST /books/:id/resume` which records a `feedback_notes` row and hands the
action + note to LangGraph via `Command(resume=...)`.

---

## Directory layout

```
book-generation-system/
├── docker-compose.yml
├── .env                       # real secrets (gitignored)
├── .env.example               # template
├── CLAUDE.md                  # this file
│
├── supabase/
│   └── migrations/
│       └── 0001_init.sql      # tables, RLS, Realtime, storage bucket
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── src/
│       ├── main.tsx           # router + query providers
│       ├── App.tsx            # shell
│       ├── routes/
│       │   ├── BookList.tsx
│       │   └── BookWorkspace.tsx   # placeholder
│       ├── lib/
│       │   ├── api.ts         # typed FastAPI client
│       │   ├── supabase.ts    # supabase-js client
│       │   └── reviewer.ts    # hardcoded reviewer identity
│       └── index.css
│
└── backend/
    ├── Dockerfile
    ├── requirements.txt
    └── app/
        ├── main.py            # FastAPI app, /health, CORS
        ├── config.py          # env-backed settings
        ├── api/
        │   └── books.py       # REST endpoints
        ├── db/
        │   ├── supabase_client.py
        │   └── repositories.py  # thin DAL
        └── graph/
            ├── state.py       # BookState TypedDict
            ├── nodes.py       # node stubs
            └── graph.py       # LangGraph wiring stub
```

---

## Data model

| Table | Purpose | Key columns |
|---|---|---|
| `books` | One row per title | `id`, `title`, `status`, `current_node`, `final_docx_path`, `final_txt_path` |
| `outlines` | Versioned outlines | `book_id`, `version`, `parent_id`, `content jsonb`, `status` |
| `chapters` | Versioned chapters | `book_id`, `index`, `version`, `parent_id`, `content_md`, `summary`, `status` |
| `feedback_notes` | Reviewer actions | `book_id`, `target_type`, `target_id`, `action`, `note`, `reviewer_id` |

**Branching:** revise/reject creates a new `version` with `parent_id` set to
the predecessor, preserving full genealogy.

**Rolling summary:** `chapters.summary` is populated by `update_rolling_summary`
and carried in prompts for later chapters — avoids sending full prior chapter
text (cost + context blowup).

Storage bucket `books` (private) holds the final `.docx` / `.txt` / `.pdf`.
Access via signed URLs.

---

## Key design decisions

1. **No Node middle tier.** Supabase is the backend for CRUD; Python is the
   orchestrator. One less language, one less service.
2. **No auth (yet).** Reviewer identity is hardcoded in
   `frontend/src/lib/reviewer.ts`. RLS policies allow `anon` read + feedback
   insert. Can swap in Supabase Auth later without schema changes.
3. **Resume via HTTP, not pg_notify.** React inserts feedback via the backend
   (`POST /books/:id/resume`), which records the note *and* resumes LangGraph
   in one call. Easier to debug than a LISTEN/NOTIFY bridge.
4. **LangGraph over hand-rolled.** Interrupts + checkpointing are the core
   value; rebuilding them is a waste.
5. **Gemini over Claude/OpenAI.** Free tier covers the workload. Swapping is
   trivial — `langchain-google-genai` → `langchain-anthropic` → `langchain-openai`.
6. **Status enums as CHECK constraints**, not Postgres enums — easier to evolve
   in migrations.

---

## What's done

- ✅ Docker Compose scaffold, both containers build and run
- ✅ Supabase cloud project — tables, RLS, Realtime, Storage bucket live
- ✅ FastAPI: `/health`, `GET /books`, `GET /books/:id`, `POST /books`, `POST /books/:id/resume`
- ✅ Supabase repository layer (`repositories.py`)
- ✅ React: BookList page (create + list with status pills + backend health)
- ✅ Gemini API key verified against `gemini-2.5-flash`
- ✅ End-to-end round-trip: title → `books` row → list reflects it

## What's left — ordered

### Phase A — generate a book end-to-end
1. Implement `generate_outline` (Gemini call → persist to `outlines`)
2. Kick off LangGraph run on `POST /books`
3. Interrupt + resume contract — pause at `review_outline` / `review_chapter`
4. Conditional branching edges (approve / revise / reject) with versioned rows
5. `draft_chapter` loop + rolling summary via `update_rolling_summary`
6. `compile_draft` — `.docx` (python-docx) + `.txt` → Supabase Storage

### Phase B — satisfy stack requirements
7. Excel upload: `openpyxl` + `POST /books/bulk` + React button
8. Teams webhook notifier on review gates + completion
9. SMTP email notifier (same triggers)

### Phase C — reviewer UI
10. `BookWorkspace` page — outline, chapter stream, status, feedback history
11. `ReviewPanel` component — approve / revise / reject + notes textarea
12. Supabase Realtime subscriptions for live updates
13. Download button for final draft (signed URL from Storage)

### Phase D — nice-to-haves
- `.pdf` output (docx2pdf or weasyprint)
- Google Sheets input as alternative to Excel
- Swap hardcoded reviewer for Supabase Auth

---

## Running locally

```bash
cp .env.example .env        # fill in all four keys
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000/health
- Supabase dashboard: https://supabase.com/dashboard → your project

### Applying DB migrations

Paste [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql)
into the Supabase SQL Editor and run. (No `supabase-cli` wiring yet — cloud
project only.)

---

## Environment variables

| Name | Used by | Source |
|---|---|---|
| `SUPABASE_URL` | backend + frontend | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | frontend | Supabase → Settings → API Keys |
| `SUPABASE_SERVICE_KEY` | backend | Supabase → Settings → API Keys (server-only) |
| `GOOGLE_API_KEY` | backend | https://aistudio.google.com/apikey |
| `GROQ_API_KEY` | backend (optional fallback) | https://console.groq.com/keys |
| `CEREBRAS_API_KEY` | backend (optional fallback) | https://cloud.cerebras.ai |
| `TEAMS_WEBHOOK_URL` | backend (planned) | Teams channel → Connectors → Incoming Webhook |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | backend (planned) | any SMTP provider |
| `REVIEW_UI_BASE_URL` | backend (planned) | e.g. `http://localhost:5173` — embedded in notification links |

`SUPABASE_SERVICE_KEY` **must never** reach the browser. `VITE_*` vars do.

---

## Conventions & gotchas

- **Vite env vars** must be prefixed `VITE_` to reach the browser (see
  `docker-compose.yml` frontend env block).
- **IDE host-side errors** (missing `react`, `fastapi`, etc.) are expected —
  dependencies live inside containers. Run `npm install` / `pip install -r`
  on the host only if you want the IDE quiet.
- **supabase-py returns `data` as a list** even for single-row inserts — use
  `res.data[0]`.
- **CHECK constraints, not Postgres enums** — status values are string-checked
  at the DB level; changing them requires a migration.
- **LangGraph checkpoint tables** are created by `PostgresSaver.setup()` at
  runtime; they are intentionally *not* in the init migration.
- **Checkpointer is `SqliteSaver`** backed by `/data/graph.db` on the
  `graph-state` Docker named volume. Graph state survives `uvicorn --reload`
  and `docker compose restart`; it's lost only on `docker compose down -v`
  (which wipes the volume). For true production-grade durability, swap to
  `PostgresSaver` against Supabase by adding `DATABASE_URL` to `.env`.
- **Free-tier quotas are handled by a multi-provider router.** See
  [backend/app/llm/router.py](backend/app/llm/router.py) —
  `QuotaAwareRouter` tries providers in order, marks any 429/quota error as
  "blocked" for one hour, and falls through to the next. Per-task provider
  ordering lives in [backend/app/llm/engine.py](backend/app/llm/engine.py).
  **Key insight:** Google's free tier is metered per-model, not per-project,
  so each Gemini tier (`2.5-pro`, `2.5-flash`, `2.5-flash-lite`, `2.0-flash`,
  `2.0-flash-lite`) is an independent free bucket. We stack them as
  consecutive router entries before falling through to Cerebras / Groq /
  OpenRouter. Per-task tuning:
    - **outline** (1 call, quality first): `2.5-pro` → `2.5-flash` →
      `2.0-flash` → cerebras-70B → groq-70B → `2.5-flash-lite`
    - **draft** (10+ calls, throughput first): `2.5-flash-lite` →
      `2.0-flash-lite` → `2.0-flash` → `2.5-flash` → cerebras-70B →
      cerebras-llama4-scout → groq-70B
    - **summary** (10+ calls, cheap + fast): `2.0-flash-lite` →
      `2.5-flash-lite` → groq-llama8 → groq-gemma2-9B → cerebras-70B
  Only `GOOGLE_API_KEY` is required — `GROQ_API_KEY` / `CEREBRAS_API_KEY`
  are optional, and providers without a key are silently dropped from the
  router chain.
- **Reasoning models deliberately excluded from draft/summary routers.**
  `deepseek-r1-distill-llama-70b` (Groq) and Qwen-3 in thinking mode emit
  thinking traces that would bleed into chapter prose. Safe to add to the
  outline router (structured output filters them) but not the free-form
  text paths.
- **Hardcoded reviewer** — change in
  [frontend/src/lib/reviewer.ts](frontend/src/lib/reviewer.ts) if needed.
  Sent with every feedback submission as `reviewer_id`.

---

## Extending

- **Swap LLM provider:** edit `requirements.txt` + one line in each node.
  LangGraph doesn't care which `ChatModel` you pass.
- **Add a new review gate:** add a node + `interrupt()` + a status value to
  the `books.status` CHECK constraint.
- **New output format:** extend `compile_draft` — the bucket already exists.
- **Real auth:** drop the hardcoded reviewer, enable Supabase Auth, tighten
  RLS policies to `auth.uid()`.
