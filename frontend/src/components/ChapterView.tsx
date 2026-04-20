import ReactMarkdown from 'react-markdown'
import { Chapter } from '../lib/api'
import { StatusBadge } from './StatusBadge'

export function ChapterView({ chapter }: { chapter: Chapter }) {
  return (
    <article className="rounded-lg border bg-white p-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            Chapter {chapter.index + 1}
            {chapter.title ? ` — ${chapter.title}` : ''}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Version {chapter.version}
          </p>
        </div>
        <StatusBadge status={chapter.status} />
      </header>
      <div className="prose prose-slate mt-4 max-w-none text-sm">
        <ReactMarkdown>{chapter.content_md}</ReactMarkdown>
      </div>
    </article>
  )
}
