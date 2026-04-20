import { Outline } from '../lib/api'
import { StatusBadge } from './StatusBadge'

export function OutlineView({ outline }: { outline: Outline }) {
  const { title, summary, chapters } = outline.content
  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Outline v{outline.version}
          </p>
        </div>
        <StatusBadge status={outline.status} />
      </div>
      <p className="mt-3 text-sm text-slate-700">{summary}</p>
      <ol className="mt-5 space-y-3">
        {chapters.map((c) => (
          <li key={c.index} className="rounded-md border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {c.index + 1}. {c.title}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{c.summary}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
