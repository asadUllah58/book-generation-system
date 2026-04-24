import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

type Props = {
  show: boolean
  message?: string
  className?: string
}

export function SectionOverlay({ show, message, className }: Props) {
  if (!show) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        {message && (
          <p className="text-sm font-medium text-foreground">{message}</p>
        )}
      </div>
    </div>
  )
}
