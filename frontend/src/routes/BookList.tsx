import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createBook, deleteBook, getHealth, listBooks } from '../lib/api'
import { BulkUpload } from '../components/BulkUpload'

const STATUS_STYLES: Record<string, string> = {
  outline_pending: 'bg-slate-100 text-slate-700',
  outline_review: 'bg-amber-100 text-amber-800',
  drafting: 'bg-blue-100 text-blue-800',
  chapter_review: 'bg-amber-100 text-amber-800',
  compiling: 'bg-indigo-100 text-indigo-800',
  complete: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
}

export default function BookList() {
  const [title, setTitle] = useState('')
  const qc = useQueryClient()

  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false })
  const books = useQuery({ queryKey: ['books'], queryFn: listBooks })

  const mutation = useMutation({
    mutationFn: createBook,
    onSuccess: () => {
      setTitle('')
      qc.invalidateQueries({ queryKey: ['books'] })
    },
  })

  const deletion = useMutation({
    mutationFn: deleteBook,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['books'] }),
  })

  const handleDelete = (id: string, title: string) => {
    if (
      window.confirm(
        `Delete "${title}"? This removes the book, its outlines, chapters, feedback, and any compiled files.`,
      )
    ) {
      deletion.mutate(id)
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-white p-6">
        <h1 className="text-xl font-semibold">Start a new book</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter a title to kick off outline generation.
        </p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim()) mutation.mutate(title.trim())
          }}
        >
          <input
            className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="e.g. A Practical Guide to LangGraph"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating…' : 'Create'}
          </button>
        </form>
        {mutation.isError && (
          <div className="mt-3 text-sm text-red-600">
            {(mutation.error as Error).message}
          </div>
        )}
      </section>

      <BulkUpload />

      <section className="rounded-lg border bg-white">
        <div className="flex items-center justify-between border-b px-6 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Books
          </h2>
          <span className="text-xs text-slate-500">
            {health.isSuccess ? (
              <span className="text-emerald-700">Connected</span>
            ) : health.isError ? (
              <span className="text-red-600">Not Connected</span>
            ) : (
              <span>checking…</span>
            )}
          </span>
        </div>

        {books.isLoading && (
          <div className="px-6 py-4 text-sm text-slate-500">Loading…</div>
        )}
        {books.isError && (
          <div className="px-6 py-4 text-sm text-red-600">
            {(books.error as Error).message}
          </div>
        )}
        {books.isSuccess && books.data.length === 0 && (
          <div className="px-6 py-4 text-sm text-slate-500">
            No books yet. Create one above.
          </div>
        )}
        {books.isSuccess && books.data.length > 0 && (
          <ul className="divide-y">
            {books.data.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-6 py-3">
                <Link
                  to={`/books/${b.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-4 hover:underline"
                >
                  <span className="truncate text-sm font-medium">{b.title}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[b.status] ?? 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {b.status}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(b.id, b.title)}
                  disabled={deletion.isPending && deletion.variables === b.id}
                  title="Delete book"
                  className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  aria-label={`Delete ${b.title}`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.75 1a.75.75 0 0 0-.75.75V3H4.25a.75.75 0 0 0 0 1.5h.293l.767 11.506A2.75 2.75 0 0 0 8.052 18.5h3.896a2.75 2.75 0 0 0 2.742-2.494L15.457 4.5h.293a.75.75 0 0 0 0-1.5H12V1.75A.75.75 0 0 0 11.25 1h-2.5Zm2 2h-1.5v-.5h1.5V3Zm-3.47 3.22a.75.75 0 0 1 1.06 0L8.5 6.94l.16-.16a.75.75 0 1 1 1.06 1.06l-.16.16.16.16a.75.75 0 1 1-1.06 1.06l-.16-.16-.16.16a.75.75 0 1 1-1.06-1.06l.16-.16-.16-.16a.75.75 0 0 1 0-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
