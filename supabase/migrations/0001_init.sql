-- Book Generation System — initial schema
-- Run in Supabase SQL Editor (or psql against the project DB).
-- LangGraph's PostgresSaver creates its own checkpoint tables at runtime;
-- they are intentionally NOT declared here.

-- =============================================================
-- Tables
-- =============================================================

create table if not exists books (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  status        text not null default 'outline_pending'
                check (status in (
                  'outline_pending',
                  'outline_review',
                  'drafting',
                  'chapter_review',
                  'compiling',
                  'complete',
                  'failed'
                )),
  current_node  text,
  final_docx_path text,                       -- Supabase Storage path, set on completion
  final_txt_path  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Versioned outlines per book. parent_id tracks branch genealogy
-- (revise/reject creates a new version pointing at its predecessor).
create table if not exists outlines (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references books(id) on delete cascade,
  version     int  not null,
  parent_id   uuid references outlines(id) on delete set null,
  content     jsonb not null,                  -- [{ index, title, summary }, ...]
  status      text not null default 'pending'
              check (status in ('pending','approved','revised','rejected','superseded')),
  created_at  timestamptz not null default now(),
  unique (book_id, version)
);

create index if not exists outlines_book_id_idx on outlines(book_id);

-- Versioned chapters per book+index. Same branching pattern as outlines.
create table if not exists chapters (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references books(id) on delete cascade,
  index       int  not null,                  -- chapter number, 0-based
  version     int  not null,
  parent_id   uuid references chapters(id) on delete set null,
  title       text,
  content_md  text not null default '',
  summary     text,                            -- rolling-summary input for later chapters
  status      text not null default 'pending'
              check (status in ('pending','approved','revised','rejected','superseded')),
  created_at  timestamptz not null default now(),
  unique (book_id, index, version)
);

create index if not exists chapters_book_idx on chapters(book_id, index);

-- Reviewer feedback. Polymorphic on (target_type, target_id).
create table if not exists feedback_notes (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references books(id) on delete cascade,
  target_type  text not null check (target_type in ('outline','chapter')),
  target_id    uuid not null,
  action       text not null check (action in ('approve','revise','reject')),
  note         text,
  reviewer_id  text not null,
  created_at   timestamptz not null default now()
);

create index if not exists feedback_book_created_idx
  on feedback_notes(book_id, created_at desc);
create index if not exists feedback_target_idx
  on feedback_notes(target_type, target_id);

-- =============================================================
-- updated_at trigger on books
-- =============================================================

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists books_updated_at on books;
create trigger books_updated_at
  before update on books
  for each row execute function touch_updated_at();

-- =============================================================
-- Realtime — let the frontend subscribe to changes
-- =============================================================

alter publication supabase_realtime add table books;
alter publication supabase_realtime add table outlines;
alter publication supabase_realtime add table chapters;
alter publication supabase_realtime add table feedback_notes;

-- =============================================================
-- Row Level Security
-- No auth in this phase — hardcoded reviewer. service_role bypasses RLS,
-- so policies only need to cover the anon role (frontend).
-- =============================================================

alter table books          enable row level security;
alter table outlines       enable row level security;
alter table chapters       enable row level security;
alter table feedback_notes enable row level security;

-- Reads
create policy "anon read books"      on books          for select to anon using (true);
create policy "anon read outlines"   on outlines       for select to anon using (true);
create policy "anon read chapters"   on chapters       for select to anon using (true);
create policy "anon read feedback"   on feedback_notes for select to anon using (true);

-- Feedback inserts come from the browser.
create policy "anon write feedback"  on feedback_notes for insert to anon with check (true);

-- =============================================================
-- Storage bucket for final outputs (.docx, .txt, .pdf)
-- =============================================================

insert into storage.buckets (id, name, public)
values ('books', 'books', false)
on conflict (id) do nothing;
