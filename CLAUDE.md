# Book Generation System

A 3-step, CTA-driven pipeline that turns a title into a finished book.
Reviewer drives each step from a stepper UI: generate an outline, draft
each chapter, then download the approved chapters (per-chapter or combined)
in docx / pdf / txt / md.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **Python 3.11 + FastAPI** | Synchronous REST endpoints per action. No graph, no interrupts — each CTA is a blocking request. |
| LLM routing | **QuotaAwareRouter** across Gemini / Cerebras / Groq | Free-tier stacking — each model is an independent quota bucket. |
| Database + Storage | **Supabase Cloud** | Postgres tables + private Storage bucket for compiled files. |
| Frontend | **Vite + React 18 + TypeScript + Tailwind + shadcn/ui + TanStack Query** | SPA; shadcn for UI primitives; TanStack Query for server state. |
| Input | **Excel upload** (`.xlsx`) | Bulk-create books from column A. |
| Notifications | **Teams webhook** (planned), **SMTP** (planned) | On approval + completion. |
| Packaging | **Docker Compose** | One-command bring-up. |

**No Node.js in the middle.** Supabase is the backend for CRUD; FastAPI is
the orchestrator. Node only runs inside the `frontend` container as Vite's
dev server.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React SPA (Vite + shadcn/ui)                               │
│   • BookList — create + list                                │
│   • BookWorkspace — 3-step Stepper:                         │
│       1. OutlineStep     (generate / approve / revise /     │
│                           edit)                             │
│       2. ChaptersStep    (draft slots → per-slot generate   │
│                           → ChapterModal with version tabs  │
│                           → approve / revise)               │
│       3. FinalizeStep    (per-chapter + combined downloads) │
│   • All React Query hooks live in src/queries/              │
└─────────────────────────────────────────────────────────────┘
         │ REST
         ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│  FastAPI                 │──►│  Supabase                │
│   /books CRUD            │   │   • Postgres (tables)    │
│   /books/:id/outline/... │   │   • Storage (books/)     │
│   /books/:id/chapters/.. │   └──────────────────────────┘
│   /books/:id/download    │
└──────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│  QuotaAwareRouter        │
│   Gemini / Cerebras / Groq │
└──────────────────────────┘
```

### Step flow

```
Step 1 — Outline
  generate_outline → outline (status=pending)
    approve        → outline.status=approved, book.status=drafting (auto-advance)
    revise(note)   → new outline version, predecessor=superseded
    edit(content)  → new version, saved directly as approved

Step 2 — Draft chapters (unlocks on outline approved)
  draft_chapter_slots → one empty v1 row per outline chapter (idempotent)
  generate(index)     → fills an empty slot OR creates one on the fly
  revise(index, note) → new version of the latest non-approved row
  approve(index)      → latest → approved, summary generated for rolling context
                        siblings → superseded
                        if all outline chapters have an approved version →
                        book.status=complete

Step 3 — Finalize (unlocks on any chapter approved)
  /books/:id/chapters/:index/download?format=docx|pdf|txt|md
  /books/:id/download?format=...   (combined: title + outline + approved chapters)
```

All LLM-backed endpoints are **synchronous** — the client sees an in-flight
spinner via a section-level overlay and the fresh resource on return.

---

## Directory layout

```
book-generation-system/
├── docker-compose.yml
├── .env                       # secrets (gitignored)
├── .env.example
├── CLAUDE.md
│
├── supabase/
│   └── migrations/
│       ├── 0001_init.sql      # tables, RLS, Realtime, storage bucket
│       └── 0002_new_flow.sql  # status remap for 3-step flow
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts         # @/ path alias
│   ├── tsconfig.json
│   ├── tailwind.config.ts     # shadcn theme tokens
│   ├── components.json        # shadcn CLI config
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css          # shadcn CSS vars
│       ├── routes/
│       │   ├── BookList.tsx
│       │   └── BookWorkspace.tsx       # stepper + URL-driven step
│       ├── components/
│       │   ├── Stepper.tsx
│       │   ├── SectionOverlay.tsx      # per-section loading overlay
│       │   ├── OutlineEditor.tsx       # inline outline edit form
│       │   ├── ChapterModal.tsx        # version tabs + approve/revise
│       │   ├── StatusBadge.tsx
│       │   ├── BulkUpload.tsx
│       │   ├── steps/
│       │   │   ├── OutlineStep.tsx
│       │   │   ├── ChaptersStep.tsx
│       │   │   └── FinalizeStep.tsx
│       │   └── ui/                     # shadcn primitives
│       │       ├── button.tsx
│       │       ├── card.tsx
│       │       ├── dialog.tsx
│       │       ├── input.tsx
│       │       ├── label.tsx
│       │       ├── separator.tsx
│       │       ├── tabs.tsx
│       │       ├── textarea.tsx
│       │       └── badge.tsx
│       ├── queries/                    # ALL useQuery/useMutation live here
│       │   ├── keys.ts
│       │   ├── books.ts
│       │   ├── outlines.ts
│       │   ├── chapters.ts
│       │   └── downloads.ts
│       └── lib/
│           ├── api.ts         # thin fetch client, typed
│           ├── supabase.ts
│           ├── reviewer.ts    # hardcoded reviewer (kept for future auth)
│           └── utils.ts       # cn helper (clsx + tailwind-merge)
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
        ├── services/          # business logic (replaces graph/)
        │   ├── outline_service.py
        │   ├── chapter_service.py
        │   └── compile_service.py   # docx/pdf/txt/md builders + uploads
        └── llm/
            ├── engine.py      # per-task routers + prompts
            ├── providers.py
            ├── router.py      # QuotaAwareRouter
            └── schemas.py     # BookOutline pydantic schema
```

---

## Data model

| Table | Purpose | Key columns |
|---|---|---|
| `books` | One row per title | `id`, `title`, `status`, `current_node` (unused), `final_*_path` |
| `outlines` | Versioned outlines | `book_id`, `version`, `parent_id`, `content jsonb`, `status` |
| `chapters` | Versioned chapters | `book_id`, `index`, `version`, `parent_id`, `content_md`, `summary`, `status` |
| `feedback_notes` | Reviewer actions (legacy — unused under current flow) | — |

**Branching:** revise creates a new `version` with `parent_id` set to the
predecessor; the predecessor is marked `superseded`.

**Rolling summary:** when a chapter is approved, the LLM produces a short
summary stored in `chapters.summary`. Later chapter generations use it as
context (approved chapters with lower index only). Out-of-order drafting
is allowed — chapters drafted before their predecessors get a shorter
rolling summary.

### Status values

**`books.status`** (after `0002_new_flow.sql`):
`created → outline_review → drafting → complete`, plus `failed` sideband.
The column is mostly cosmetic — the stepper unlocks steps from derived
data (outline exists? outline approved? any chapter approved?).

**`outlines.status` / `chapters.status`:**
`pending | approved | revised | rejected | superseded`. `rejected` is a
valid DB value but not exposed in the UI.

Storage bucket `books` (private) holds `book.{docx,pdf,txt,md}` and
`chapter-{i}.{docx,pdf,txt,md}`. Accessed via 1-hour signed URLs.

---

## Key design decisions

1. **No LangGraph.** The new UX is request/response per button click, not
   pause-and-resume at review gates. Services call the LLM router directly;
   no checkpointing, no interrupt plumbing. The graph/checkpointer + SQLite
   volume were removed.
2. **No Node middle tier.** Supabase for CRUD; Python for orchestration.
3. **No auth (yet).** Reviewer identity hardcoded in
   `frontend/src/lib/reviewer.ts`. RLS policies allow `anon` read. Can swap
   in Supabase Auth later without schema changes.
4. **Reject is suppressed in UI** but retained as a valid DB status value
   in CHECK constraints — surfacing it later requires no migration.
5. **Status values as CHECK constraints**, not Postgres enums — easier to
   evolve via migrations.
6. **Free-tier stacking** — each Gemini model tier is an independent quota
   bucket; the router tries them in task-tuned order before falling through
   to Cerebras / Groq.

---

## REST endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/books` | List |
| POST | `/books` | Create (does NOT auto-generate) |
| POST | `/books/bulk` | Bulk-create from `.xlsx` |
| GET | `/books/:id` | Fetch |
| DELETE | `/books/:id` | Delete (cascades + storage cleanup) |
| POST | `/books/:id/restart` | Wipe outlines/chapters/storage; status → `created` |
| GET | `/books/:id/outlines` | List outline versions |
| POST | `/books/:id/outline/generate` | First-time outline generation |
| POST | `/books/:id/outline/revise` | AI revision (optional `note`) |
| POST | `/books/:id/outline/edit` | Manual content, saved as approved |
| POST | `/books/:id/outline/approve` | Approve latest outline |
| GET | `/books/:id/chapters` | List all chapter versions |
| POST | `/books/:id/chapters/draft` | Create empty slots for every outline chapter (idempotent) |
| POST | `/books/:id/chapters/:index/generate` | Fill slot at index (auto-creates slot if missing) |
| POST | `/books/:id/chapters/:index/revise` | AI revision (optional `note`) |
| POST | `/books/:id/chapters/:index/approve` | Approve latest + generate summary |
| GET | `/books/:id/chapters/:index/download?format=...` | Per-chapter compile + signed URL |
| GET | `/books/:id/download?format=...` | Combined (title + outline + approved chapters) |

Download `format` is one of `docx | pdf | txt | md`. Combined downloads
prefix the outline right after the book title.

---

## Running locally

```bash
cp .env.example .env        # fill in keys
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:8000/health
- Supabase dashboard: https://supabase.com/dashboard → your project

### Applying migrations

Paste each file from `supabase/migrations/` into the Supabase SQL Editor in
order (`0001_init.sql`, then `0002_new_flow.sql`). `0002` remaps old book
statuses into the new enum — safe to run on a populated DB.

### When `package.json` changes

The frontend container bakes `node_modules` at image build time. After
adding/removing deps, either:

```bash
docker compose exec frontend npm install     # fast path
# or
docker compose up --build frontend           # full rebuild
```

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
| `TEAMS_WEBHOOK_URL` | backend (planned) | Teams channel → Connectors |
| `SMTP_*` | backend (planned) | any SMTP provider |
| `REVIEW_UI_BASE_URL` | backend (planned) | e.g. `http://localhost:5173` |

`SUPABASE_SERVICE_KEY` **must never** reach the browser. `VITE_*` vars do.

---

## Frontend conventions

- **shadcn/ui** for every primitive (`Button`, `Card`, `Dialog`, `Tabs`,
  `Input`, `Textarea`, `Label`, `Separator`, `Badge`). Components live in
  [frontend/src/components/ui/](frontend/src/components/ui/). Add new
  primitives via the shadcn CLI or copy from the upstream repo — never
  hand-roll.
- **Conditional classes go through `cn(...)`**, never template-string
  ternaries. `cn` is `clsx + tailwind-merge`, defined in
  [frontend/src/lib/utils.ts](frontend/src/lib/utils.ts).
- **Path alias `@/`** resolves to `src/` (set in both `tsconfig.json` and
  `vite.config.ts`).
- **All `useQuery` / `useMutation` calls live in
  [frontend/src/queries/](frontend/src/queries/)** — one file per resource.
  Components import custom hooks (e.g. `useGenerateOutlineMutation(bookId)`)
  and never touch `useQueryClient` directly. Invalidation is baked into the
  mutation hook's `onSuccess`, and each invalidation helper returns
  `Promise.all([...])` so react-query awaits the refetch before calling the
  caller's `onSuccess` (this is what prevents the "approve outline →
  selectStep(2) → unlocked[2] still stale" race).
- **Active stepper step is encoded in the URL** as `?step=1|2|3`. Refresh
  preserves it; opening a book from `BookList` defaults to step 1 (no
  query param). An effect normalises invalid/locked values *only after*
  queries have settled — otherwise stale data would briefly downgrade the
  URL during hydration.
- **Section-level loading** via
  [SectionOverlay.tsx](frontend/src/components/SectionOverlay.tsx). Put it
  inside the card/container being awaited. **Do not** merge `relative`
  into a shadcn `DialogContent`'s className — it's `fixed`, and
  `tailwind-merge` will drop the positioning. Overlay's `absolute inset-0`
  anchors to the fixed dialog on its own.

## Backend conventions

- **Services own business logic** ([backend/app/services/](backend/app/services/)):
  `outline_service`, `chapter_service`, `compile_service`. REST handlers
  in `api/books.py` are thin — parse payload → call service → shape
  response.
- **supabase-py returns `data` as a list** even for single-row inserts —
  use `res.data[0]`.
- **Versioning rule:** revise creates a new version, `parent_id` points at
  the predecessor, predecessor flips to `superseded`. Approve promotes
  the latest version and supersedes any non-approved siblings at the
  same index.
- **`chapter_service.generate` auto-creates the slot** if it's missing,
  so books migrated from pre-stepper data (partial chapter rows) still
  work when the user clicks `Generate` on an outline index that never got
  a slot row via `draft_chapter_slots`.
- **Free-tier quota routing** lives in
  [backend/app/llm/router.py](backend/app/llm/router.py) and
  [backend/app/llm/engine.py](backend/app/llm/engine.py). Each Gemini tier
  (`2.5-pro`, `2.5-flash`, `2.5-flash-lite`, `2.0-flash`, `2.0-flash-lite`)
  is an independent bucket. Per-task order:
    - **outline** (1 call, quality first): `2.5-pro` → `2.5-flash` →
      `2.0-flash` → cerebras-70B → groq-70B → `2.5-flash-lite`
    - **draft** (10+ calls, throughput first): `2.5-flash-lite` →
      `2.0-flash-lite` → `2.0-flash` → `2.5-flash` → cerebras-70B →
      cerebras-llama4-scout → groq-70B
    - **summary** (10+ calls, cheap + fast): `2.0-flash-lite` →
      `2.5-flash-lite` → groq-llama8 → groq-gemma2-9B → cerebras-70B
  Only `GOOGLE_API_KEY` is required; others are optional and silently
  dropped if unset.
- **Reasoning models excluded from draft/summary routers** —
  `deepseek-r1-distill-llama-70b` and Qwen-3 thinking mode emit thinking
  traces that would bleed into prose. Safe for the outline router
  (structured output filters them) but not free-form text.
- **`current_node` column is retained but unused** — legacy from the
  graph era; can be dropped in a later migration.

---

## Extending

- **Swap LLM provider:** edit `requirements.txt` + add a provider entry to
  [backend/app/llm/providers.py](backend/app/llm/providers.py) and the
  router stacks in [engine.py](backend/app/llm/engine.py).
- **New output format:** add a builder in
  [compile_service.py](backend/app/services/compile_service.py), register
  it in `CONTENT_TYPES` and `_build`, extend `DownloadFormat` in
  [lib/api.ts](frontend/src/lib/api.ts).
- **Re-surface reject:** add the action to `ReviewPanel`-equivalent UI —
  DB already permits it.
- **Real auth:** drop the hardcoded reviewer, enable Supabase Auth,
  tighten RLS policies to `auth.uid()`.
