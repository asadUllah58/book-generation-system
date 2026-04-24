import { useRef, useState } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { Book } from '@/lib/api'
import { useUploadBooksMutation } from '@/queries/books'

export function BulkUpload() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [lastResult, setLastResult] = useState<Book[] | null>(null)
  const mutation = useUploadBooksMutation()

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    mutation.mutate(file, {
      onSuccess: (books) => {
        setLastResult(books)
        if (inputRef.current) inputRef.current.value = ''
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Bulk upload</CardTitle>
        <CardDescription>
          Upload a <code>.xlsx</code> file with book titles in column A (row 1
          is a header, titles start at row 2). Max 50 rows per upload.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onFile}
            disabled={mutation.isPending}
            className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
          />
          {mutation.isPending && (
            <span className="text-sm text-muted-foreground">Uploading…</span>
          )}
        </div>
        {mutation.isError && (
          <div className="mt-3 text-sm text-destructive">
            {(mutation.error as Error).message}
          </div>
        )}
        {lastResult && lastResult.length > 0 && (
          <div className="mt-3 text-sm text-emerald-700">
            Created {lastResult.length} book
            {lastResult.length === 1 ? '' : 's'}.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
