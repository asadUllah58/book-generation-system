import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'

import { BulkUpload } from '@/components/BulkUpload'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  useBooksQuery,
  useCreateBookMutation,
  useDeleteBookMutation,
  useHealthQuery,
} from '@/queries/books'

export default function BookList() {
  const [title, setTitle] = useState('')

  const health = useHealthQuery()
  const books = useBooksQuery()
  const create = useCreateBookMutation()
  const destroy = useDeleteBookMutation()

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    create.mutate(t, { onSuccess: () => setTitle('') })
  }

  const onDelete = (id: string, t: string) => {
    if (
      window.confirm(
        `Delete "${t}"? This removes the book, its outlines, chapters, and any compiled files.`,
      )
    ) {
      destroy.mutate(id)
    }
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Start a new book</CardTitle>
          <CardDescription>
            Enter a title to create a book. You'll generate the outline from
            inside the book workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex gap-2" onSubmit={onCreate}>
            <Input
              placeholder="e.g. A Practical Guide to LangGraph"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </form>
          {create.isError && (
            <div className="mt-3 text-sm text-destructive">
              {(create.error as Error).message}
            </div>
          )}
        </CardContent>
      </Card>

      <BulkUpload />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Books
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {health.isSuccess && (
              <span className="text-emerald-700">Connected</span>
            )}
            {health.isError && (
              <span className="text-destructive">Not Connected</span>
            )}
            {health.isLoading && <span>checking…</span>}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {books.isLoading && (
            <div className="px-6 py-4 text-sm text-muted-foreground">
              Loading…
            </div>
          )}
          {books.isError && (
            <div className="px-6 py-4 text-sm text-destructive">
              {(books.error as Error).message}
            </div>
          )}
          {books.isSuccess && books.data.length === 0 && (
            <div className="px-6 py-4 text-sm text-muted-foreground">
              No books yet. Create one above.
            </div>
          )}
          {books.isSuccess && books.data.length > 0 && (
            <ul className="divide-y">
              {books.data.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-3 px-6 py-3"
                >
                  <Link
                    to={`/books/${b.id}`}
                    className="flex min-w-0 flex-1 items-center justify-between gap-4 hover:underline"
                  >
                    <span className="truncate text-sm font-medium">
                      {b.title}
                    </span>
                    <StatusBadge status={b.status} />
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(b.id, b.title)}
                    disabled={
                      destroy.isPending && destroy.variables === b.id
                    }
                    aria-label={`Delete ${b.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
