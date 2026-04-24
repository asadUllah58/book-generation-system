import { cn } from '@/lib/utils'

const STYLES: Record<string, string> = {
  // book statuses
  created: 'bg-slate-100 text-slate-700',
  outline_review: 'bg-amber-100 text-amber-800',
  drafting: 'bg-blue-100 text-blue-800',
  complete: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',

  // outline / chapter statuses
  pending: 'bg-slate-100 text-slate-700',
  approved: 'bg-emerald-100 text-emerald-800',
  revised: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-800',
  superseded: 'bg-slate-100 text-slate-500',
}

const LABELS: Record<string, string> = {
  created: 'Created',
  outline_review: 'Outline review',
  drafting: 'Drafting',
  complete: 'Complete',
  failed: 'Failed',
  pending: 'Pending',
  approved: 'Approved',
  revised: 'Revised',
  rejected: 'Rejected',
  superseded: 'Superseded',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STYLES[status] ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {LABELS[status] ?? status}
    </span>
  )
}
