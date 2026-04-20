import { useState } from 'react'
import { DownloadFormat, getDownloadUrl } from '../lib/api'

const FORMATS: { format: DownloadFormat; label: string; primary: boolean }[] = [
  { format: 'docx', label: 'Download .docx', primary: true },
  { format: 'pdf', label: 'Download .pdf', primary: false },
  { format: 'txt', label: 'Download .txt', primary: false },
]

type Props = {
  bookId: string
  approvedCount: number
  finalized: boolean
}

export function DownloadBar({ bookId, approvedCount, finalized }: Props) {
  const [pending, setPending] = useState<DownloadFormat | null>(null)
  const [error, setError] = useState<string | null>(null)

  const download = async (format: DownloadFormat) => {
    setPending(format)
    setError(null)
    try {
      const { url } = await getDownloadUrl(bookId, format)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(null)
    }
  }

  const toneClass = finalized
    ? 'border bg-emerald-50'
    : 'border border-slate-200 bg-white'
  const heading = finalized
    ? 'Book complete — download the final draft'
    : `Download a snapshot (${approvedCount} approved ${approvedCount === 1 ? 'chapter' : 'chapters'})`
  const headingClass = finalized
    ? 'text-sm font-semibold text-emerald-900'
    : 'text-sm font-semibold text-slate-800'

  return (
    <div className={`rounded-lg p-4 ${toneClass}`}>
      <h3 className={headingClass}>{heading}</h3>
      {!finalized && (
        <p className="mt-1 text-xs text-slate-500">
          Compiled fresh each time from the chapters approved so far.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {FORMATS.map(({ format, label, primary }) => (
          <button
            key={format}
            type="button"
            disabled={pending === format}
            onClick={() => download(format)}
            className={
              primary
                ? 'rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50'
                : 'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
            }
          >
            {pending === format ? 'Generating…' : label}
          </button>
        ))}
      </div>
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
    </div>
  )
}
