# Book Generation System

A feedback-gated book-writing pipeline. You give it a title; it generates an
outline, then writes each chapter one at a time, pausing at every stage so a
human reviewer can **approve**, **revise**, or **reject**. When the reviewer
is happy with every chapter, the system compiles a final `.docx` / `.pdf` /
`.txt` you can download.

All state (book, outline versions, chapter versions, reviewer feedback) is
stored in Supabase. The LangGraph runtime is what makes the "pause for
human input" work — each review gate literally freezes the pipeline to disk
and resumes when feedback arrives.

## What it does

- **Accepts a title** (single entry form, or bulk `.xlsx` upload).
- **Generates an outline** with Gemini (structured JSON — book summary +
  chapter list).
- **Waits for the reviewer**, supports revise / reject with a freeform note
  — new versions are versioned, linked to their predecessor via `parent_id`.
- **Drafts each chapter in order** using the approved outline plus a rolling
  summary of prior chapters so Gemini keeps continuity without re-reading
  every chapter in full.
- **Waits for the reviewer again**, same approve/revise/reject options per
  chapter.
- **Compiles** the approved chapters into `.docx` (`python-docx`),
  `.pdf` (`reportlab`), and `.txt`, uploads to Supabase Storage, serves a
  signed URL.
- **Download at any stage** — a snapshot of the currently-approved chapters
  is available the moment the first one is approved.
- **Restart a failed book** in place — keeps the id/title, wipes children
  and graph state, re-runs the pipeline from scratch.

## Stack

| Layer | Choice |
|---|---|
| Orchestration | Python 3.11 · FastAPI · LangGraph (SqliteSaver checkpointer) |
| LLM | Google Gemini 2.5 Flash-Lite (via `langchain-google-genai`) |
| Database + Storage + Realtime | Supabase Cloud |
| Frontend | Vite · React 18 · TypeScript · Tailwind · TanStack Query |
| Input source | Excel upload (`openpyxl`) |
| Output | `.docx` (`python-docx`), `.pdf` (`reportlab`), `.txt` |
| Packaging | Docker Compose |

A one-paragraph architecture note: React talks to a FastAPI backend; FastAPI
orchestrates a LangGraph state machine that calls Gemini and writes to
Supabase. No Node.js middleman — Supabase is the backend for data.
See [CLAUDE.md](CLAUDE.md) for the detailed design rationale.

## Prerequisites

- **Docker Desktop** (containers run the backend + frontend — nothing else
  needs to be installed on the host).
- **A Supabase account** (free tier is fine) → <https://supabase.com>.
- **A Google AI Studio API key** (free tier is fine) →
  <https://aistudio.google.com/apikey>.

## Setup

### 1. Create a Supabase project

- Sign in at <https://supabase.com> → **New project**.
- Pick any name + region. Save the database password somewhere safe (you
  won't need it for `.env`).
- Wait ~1–2 minutes for provisioning.

### 2. Grab the three Supabase values

Dashboard → **Project Settings** → **API Keys**. You need:

| `.env` key | Where on the page |
|---|---|
| `SUPABASE_URL` | Settings → General → **Reference ID** → construct `https://<ref>.supabase.co` (or find it under Data API) |
| `SUPABASE_ANON_KEY` | API Keys → **`anon` / `public`** |
| `SUPABASE_SERVICE_KEY` | API Keys → **`service_role`** (click reveal) |

The legacy-keys tab and the newer publishable/secret tab both work — just
map publishable → `ANON_KEY` and secret → `SERVICE_KEY`.

### 3. Grab a Gemini API key

- <https://aistudio.google.com/apikey> → **Create API key**.
- If this is your first time, pick **Create API key in new project**.
- Copy the value (format: `AIzaSy...`).

### 4. Apply the database schema

In the Supabase dashboard → **SQL Editor** → **New query**. Run the
migrations in order:

1. Paste contents of [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) → Run.
2. Paste contents of [supabase/migrations/0002_add_pdf_path.sql](supabase/migrations/0002_add_pdf_path.sql) → Run.

This creates `books`, `outlines`, `chapters`, `feedback_notes`, a private
storage bucket named `books`, RLS policies, and enables Realtime on the
four tables.

### 5. Create `.env`

```bash
cp .env.example .env
```

Open `.env` and fill in the four values from steps 2 and 3:

```
SUPABASE_URL=https://xxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_KEY=eyJhbGciOi...
GOOGLE_API_KEY=AIzaSy...
```

### 6. Run

```bash
docker compose up --build
```

First build takes 2–3 minutes. Subsequent starts are near-instant. When it's
up:

- **Frontend:** <http://localhost:5173>
- **Backend health:** <http://localhost:8000/health>
- **Docker status:** `docker compose ps`
- **Backend logs:** `docker compose logs -f backend`

To stop: `Ctrl+C`, or `docker compose down` from another terminal.

## Using it

1. Open <http://localhost:5173>.
2. **Create a book** by typing a title (e.g. `A Practical Guide to
   LangGraph`) and clicking **Create**. Or upload a `.xlsx` with titles in
   column A starting at row 2.
3. Watch the status pill progress: `outline_pending` → `outline_review`.
4. Click the book → read the outline → **Approve** / **Revise** / **Reject**.
5. Gemini drafts the first chapter (~20–30 s). Review it. Repeat.
6. Download a snapshot any time once the first chapter is approved.
7. On completion, the download card turns green — final `.docx` / `.pdf` /
   `.txt`.

## Troubleshooting

- **Stuck in `failed`?** Rate-limit spiral on Gemini free tier is the
  usual culprit. Click **Restart pipeline** on the failed-state card.
- **Stale connection / 500 on polls?** The supabase-py client is recreated
  per request to dodge stale keepalive sockets — this should already be
  handled. If you see it, hard-reload the frontend.
- **LangGraph won't resume?** Graph checkpoints live on the `graph-state`
  Docker volume. `docker compose down -v` wipes them (use carefully).
- **Frontend IDE errors about missing `react`, `@tanstack/react-query`,
  etc.?** Expected — everything runs inside containers; `node_modules`
  aren't on the host. For a quiet editor, run `cd frontend && npm install`
  locally (doesn't affect Docker).

## Project structure

```
book-generation-system/
├── docker-compose.yml              # two services: backend + frontend
├── .env.example                    # template (.env is gitignored)
├── CLAUDE.md                       # design rationale & deep context
│
├── supabase/migrations/            # SQL — apply via dashboard
│
├── frontend/                       # Vite + React + TS + Tailwind
│   └── src/
│       ├── routes/                 # BookList, BookWorkspace
│       ├── components/             # ReviewPanel, DownloadBar, etc.
│       └── lib/                    # API client, Supabase JS, reviewer id
│
└── backend/                        # FastAPI + LangGraph
    └── app/
        ├── main.py                 # app + CORS + router
        ├── api/books.py            # REST endpoints
        ├── db/                     # Supabase client + repositories
        ├── graph/                  # LangGraph state + nodes + wiring
        ├── llm/                    # Gemini client + prompts + throttle
        └── compile/                # .docx/.pdf/.txt builders + Storage
```

## License

Unlicensed — internal / assessment project.
