import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Chapter,
  Outline,
  getBook,
  listChapters,
  listOutlines,
  restartBook,
} from '../lib/api'
import { ChapterView } from '../components/ChapterView'
import { DownloadBar } from '../components/DownloadBar'
import { LoadingOverlay } from '../components/LoadingOverlay'
import { OutlineView } from '../components/OutlineView'
import { ReviewPanel } from '../components/ReviewPanel'
import { StatusBadge } from '../components/StatusBadge'

const POLL_MS = 3000

// Polling is only useful while the graph is actively working OR while a
// reviewer just submitted feedback and we're waiting for the status flip.
// Review/terminal states are quiescent: the next change requires a user
// action which itself invalidates queries.
const WORKING_STATUSES = new Set([
  'outline_pending',
  'drafting',
  'compiling',
])

function pollInterval(
  status: string | undefined,
  resuming: boolean,
): number | false {
  if (!status) return POLL_MS // initial load — keep polling until we have data
  if (resuming) return POLL_MS
  if (WORKING_STATUSES.has(status)) return POLL_MS
  return false
}

function latestOutline(outlines: Outline[] | undefined): Outline | null {
  if (!outlines?.length) return null
  return [...outlines].sort((a, b) => b.version - a.version)[0]
}

function latestChapter(chapters: Chapter[] | undefined): Chapter | null {
  if (!chapters?.length) return null
  const sorted = [...chapters].sort(
    (a, b) => a.index - b.index || a.version - b.version,
  )
  return sorted[sorted.length - 1] ?? null
}

export default function BookWorkspace() {
  const { id } = useParams<{ id: string }>()
  const bookId = id!

  // Keeps the overlay up from "feedback submitted" until the graph has
  // actually advanced the book's status — covers the gap between POST-return
  // and the first status flip (set by the next node at its entry).
  const [resuming, setResuming] = useState(false)
  const statusAtSubmitRef = useRef<string | undefined>(undefined)

  const book = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => getBook(bookId),
    refetchInterval: (query) =>
      pollInterval(query.state.data?.status, resuming),
  })

  const status = book.data?.status
  const childInterval = pollInterval(status, resuming)

  const outlines = useQuery({
    queryKey: ['outlines', bookId],
    queryFn: () => listOutlines(bookId),
    refetchInterval: childInterval,
  })
  const chapters = useQuery({
    queryKey: ['chapters', bookId],
    queryFn: () => listChapters(bookId),
    refetchInterval: childInterval,
  })

  const qc = useQueryClient()

  useEffect(() => {
    if (!resuming) return
    const current = book.data?.status
    if (current && current !== statusAtSubmitRef.current) {
      setResuming(false)
    }
  }, [book.data?.status, resuming])

  // When polling was paused (review/terminal state) and we re-enter a
  // working/resuming window, kick the queries so refetchInterval re-evaluates
  // with the new closure and starts polling again.
  useEffect(() => {
    if (resuming) {
      qc.invalidateQueries({ queryKey: ['book', bookId] })
    }
  }, [resuming, qc, bookId])

  // When book.status changes, refresh outlines/chapters once so the UI
  // doesn't lag a poll cycle behind on the rows that the next node just
  // wrote (new chapter on entry, new outline version on revise/reject, etc.).
  useEffect(() => {
    if (!status) return
    qc.invalidateQueries({ queryKey: ['outlines', bookId] })
    qc.invalidateQueries({ queryKey: ['chapters', bookId] })
  }, [status, qc, bookId])

  const handleReviewSubmitted = () => {
    statusAtSubmitRef.current = book.data?.status
    setResuming(true)
  }

  const restart = useMutation({
    mutationFn: () => restartBook(bookId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book', bookId] })
      qc.invalidateQueries({ queryKey: ['outlines', bookId] })
      qc.invalidateQueries({ queryKey: ['chapters', bookId] })
    },
  })

  if (book.isLoading || !book.data) {
    return <LoadingOverlay show message="Loading book…" />
  }
  if (book.isError)
    return (
      <div className="text-sm text-red-600">
        {(book.error as Error).message}
      </div>
    )

  const currentOutline = latestOutline(outlines.data)
  const currentChapter = latestChapter(chapters.data)
  // Count chapter indices that have at least one approved version — matches
  // what the backend's compile_book would include in a download.
  const approvedChapterCount = (() => {
    if (!chapters.data) return 0
    const seen = new Set<number>()
    for (const c of chapters.data) {
      if (c.status === 'approved') seen.add(c.index)
    }
    return seen.size
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            to="/"
            className="text-sm text-slate-500 hover:underline"
          >
            ← Back to books
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{book.data.title}</h1>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={status} />
            {book.data.current_node && (
              <span className="text-xs text-slate-500">
                at {book.data.current_node}
              </span>
            )}
          </div>
        </div>
      </div>

      {currentOutline && <OutlineView outline={currentOutline} />}

      {status === 'outline_review' && currentOutline && (
        <ReviewPanel
          bookId={bookId}
          targetType="outline"
          targetId={currentOutline.id}
          label={`outline v${currentOutline.version}`}
          onSubmitted={handleReviewSubmitted}
        />
      )}

      {status === 'chapter_review' && currentChapter && (
        <>
          <ChapterView chapter={currentChapter} />
          <ReviewPanel
            bookId={bookId}
            targetType="chapter"
            targetId={currentChapter.id}
            label={`chapter ${currentChapter.index + 1} v${currentChapter.version}`}
            onSubmitted={handleReviewSubmitted}
          />
        </>
      )}

      {status === 'drafting' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
            <div className="text-sm font-medium text-blue-900">
              Drafting chapter {approvedChapterCount + 1}…
            </div>
          </div>
        </div>
      )}

      {approvedChapterCount > 0 && (
        <DownloadBar
          bookId={bookId}
          approvedCount={approvedChapterCount}
          finalized={status === 'complete'}
        />
      )}

      <LoadingOverlay
        show={status === 'outline_pending'}
        message="Generating outline…"
      />
      <LoadingOverlay
        show={status === 'compiling'}
        message="Compiling final draft…"
      />
      <LoadingOverlay show={resuming} message="Resuming pipeline…" />

      {status === 'failed' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <h3 className="text-sm font-semibold text-red-900">
            The pipeline hit an error
          </h3>
          <p className="mt-1 text-sm text-red-800">
            The backend caught an exception on a previous run (check logs for
            details). You can restart from scratch — this keeps the book's
            title and id, but wipes outlines, chapters, and feedback.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => restart.mutate()}
              disabled={restart.isPending}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {restart.isPending ? 'Restarting…' : 'Restart pipeline'}
            </button>
          </div>
          {restart.isError && (
            <div className="mt-2 text-sm text-red-700">
              {(restart.error as Error).message}
            </div>
          )}
        </div>
      )}

      {chapters.data && chapters.data.length > 0 && (
        <section className="rounded-lg border bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">
            Chapter history
          </h3>
          <ul className="mt-2 divide-y">
            {chapters.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  Chapter {c.index + 1}
                  {c.title ? ` — ${c.title}` : ''} (v{c.version})
                </span>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
