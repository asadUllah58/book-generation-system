import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Book, uploadBooks } from '../lib/api'

export function BulkUpload() {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [lastResult, setLastResult] = useState<Book[] | null>(null)

  const mutation = useMutation({
    mutationFn: (file: File) => uploadBooks(file),
    onSuccess: (books) => {
      setLastResult(books)
      qc.invalidateQueries({ queryKey: ['books'] })
      if (inputRef.current) inputRef.current.value = ''
    },
  })

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) mutation.mutate(file)
  }

  return (
    <section className="rounded-lg border bg-white p-6">
      <h2 className="text-xl font-semibold">Bulk upload</h2>
      <p className="mt-1 text-sm text-slate-500">
        Upload a <code>.xlsx</code> file with book titles in column A (row 1 is a
        header, titles start at row 2). Max 50 rows per upload.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onFile}
          disabled={mutation.isPending}
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800 disabled:opacity-50"
        />
        {mutation.isPending && (
          <span className="text-sm text-slate-500">Uploading…</span>
        )}
      </div>
      {mutation.isError && (
        <div className="mt-3 text-sm text-red-600">
          {(mutation.error as Error).message}
        </div>
      )}
      {lastResult && lastResult.length > 0 && (
        <div className="mt-3 text-sm text-emerald-700">
          Created {lastResult.length} book{lastResult.length === 1 ? '' : 's'}.
        </div>
      )}
    </section>
  )
}
