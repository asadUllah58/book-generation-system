import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FeedbackAction, submitFeedback } from '../lib/api'

type Props = {
  bookId: string
  targetType: 'outline' | 'chapter'
  targetId: string
  label: string
  onSubmitted?: () => void
}

export function ReviewPanel({
  bookId,
  targetType,
  targetId,
  label,
  onSubmitted,
}: Props) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (action: FeedbackAction) =>
      submitFeedback(bookId, {
        target_type: targetType,
        target_id: targetId,
        action,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      setNote('')
      setNoteError(null)
      qc.invalidateQueries({ queryKey: ['book', bookId] })
      qc.invalidateQueries({ queryKey: ['outlines', bookId] })
      qc.invalidateQueries({ queryKey: ['chapters', bookId] })
      onSubmitted?.()
    },
  })

  const submit = (action: FeedbackAction) => {
    if ((action === 'revise' || action === 'reject') && !note.trim()) {
      setNoteError('A note is required for revise or reject.')
      return
    }
    setNoteError(null)
    mutation.mutate(action)
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">Review {label}</h3>
      <textarea
        className="mt-2 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        placeholder="Notes (optional for approve, required for revise/reject)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />
      {noteError && (
        <div className="mt-1 text-xs text-red-600">{noteError}</div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => submit('approve')}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => submit('revise')}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          Revise
        </button>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => submit('reject')}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {mutation.isError && (
        <div className="mt-2 text-sm text-red-600">
          {(mutation.error as Error).message}
        </div>
      )}
    </div>
  )
}
