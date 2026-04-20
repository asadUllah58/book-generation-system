const STYLES: Record<string, string> = {
  outline_pending: 'bg-slate-100 text-slate-700',
  outline_review: 'bg-amber-100 text-amber-800',
  drafting: 'bg-blue-100 text-blue-800',
  chapter_review: 'bg-amber-100 text-amber-800',
  compiling: 'bg-indigo-100 text-indigo-800',
  complete: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-slate-100 text-slate-700',
  approved: 'bg-emerald-100 text-emerald-800',
  revised: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-800',
  superseded: 'bg-slate-100 text-slate-500',
}

export function StatusBadge({ status }: { status: string }) {
  const cls = STYLES[status] ?? 'bg-slate-100 text-slate-700'
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  )
}
