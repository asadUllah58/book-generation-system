import { cn } from '@/lib/utils'

export type StepDef = {
  id: number
  label: string
  description: string
}

type StepperProps = {
  steps: StepDef[]
  active: number
  unlocked: Record<number, boolean>
  onSelect: (step: number) => void
}

export function Stepper({ steps, active, unlocked, onSelect }: StepperProps) {
  return (
    <nav
      aria-label="Book generation steps"
      className="rounded-lg border bg-card px-4 py-4 shadow-sm"
    >
      <ol className="flex items-start gap-2">
        {steps.map((step, i) => {
          const isActive = step.id === active
          const isUnlocked = unlocked[step.id] ?? false
          const isLast = i === steps.length - 1

          return (
            <li key={step.id} className="flex flex-1 items-start gap-3">
              <StepButton
                step={step}
                active={isActive}
                unlocked={isUnlocked}
                onSelect={onSelect}
              />
              {!isLast && (
                <div
                  aria-hidden
                  className={cn(
                    'mt-[18px] h-px flex-1 transition-colors',
                    isUnlocked ? 'bg-border' : 'bg-muted',
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

type StepButtonProps = {
  step: StepDef
  active: boolean
  unlocked: boolean
  onSelect: (step: number) => void
}

function StepButton({ step, active, unlocked, onSelect }: StepButtonProps) {
  return (
    <button
      type="button"
      disabled={!unlocked}
      onClick={() => onSelect(step.id)}
      aria-current={active ? 'step' : undefined}
      className={cn(
        'group flex min-w-0 items-start gap-3 rounded-md px-1 text-left transition-opacity',
        !unlocked && 'cursor-not-allowed opacity-50',
        unlocked && !active && 'hover:opacity-80',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
          active && 'border-primary bg-primary text-primary-foreground',
          !active && unlocked && 'border-border bg-background text-foreground',
          !active && !unlocked && 'border-border bg-muted text-muted-foreground',
        )}
      >
        {step.id}
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            'text-sm font-semibold',
            active ? 'text-foreground' : 'text-foreground/80',
          )}
        >
          {step.label}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {step.description}
        </span>
      </span>
    </button>
  )
}
