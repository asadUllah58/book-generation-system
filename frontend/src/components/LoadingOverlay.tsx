type Props = {
  show: boolean
  message?: string
}

export function LoadingOverlay({ show, message }: Props) {
  if (!show) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white px-8 py-6 shadow-xl">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        {message && <div className="text-sm text-slate-700">{message}</div>}
      </div>
    </div>
  )
}
