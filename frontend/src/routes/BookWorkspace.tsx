import { useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'

import { StatusBadge } from '@/components/StatusBadge'
import { Stepper, type StepDef } from '@/components/Stepper'
import { ChaptersStep } from '@/components/steps/ChaptersStep'
import { FinalizeStep } from '@/components/steps/FinalizeStep'
import { OutlineStep } from '@/components/steps/OutlineStep'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Chapter, Outline } from '@/lib/api'
import { useBookQuery, useRestartBookMutation } from '@/queries/books'
import { useChaptersQuery } from '@/queries/chapters'
import { useOutlinesQuery } from '@/queries/outlines'

const STEPS: StepDef[] = [
  {
    id: 1,
    label: 'Generate Outline',
    description: 'AI-drafted chapter outline.',
  },
  {
    id: 2,
    label: 'Draft Chapters',
    description: 'Generate, review, approve.',
  },
  {
    id: 3,
    label: 'Finalize Chapters',
    description: 'Download your book.',
  },
]

function latestOutline(outlines: Outline[] | undefined): Outline | null {
  if (!outlines?.length) return null
  return [...outlines].sort((a, b) => b.version - a.version)[0]
}

function anyApprovedOutline(outlines: Outline[] | undefined): boolean {
  return !!outlines?.some((o) => o.status === 'approved')
}

function anyApprovedChapter(chapters: Chapter[] | undefined): boolean {
  return !!chapters?.some((c) => c.status === 'approved')
}

function approvedOutline(outlines: Outline[] | undefined): Outline | null {
  if (!outlines?.length) return null
  const approved = outlines.filter((o) => o.status === 'approved')
  if (!approved.length) return null
  return approved.sort((a, b) => b.version - a.version)[0]
}

export default function BookWorkspace() {
  const { id } = useParams<{ id: string }>()
  const bookId = id!
  const [searchParams, setSearchParams] = useSearchParams()

  const book = useBookQuery(bookId)
  const outlines = useOutlinesQuery(bookId)
  const chapters = useChaptersQuery(bookId)
  const restart = useRestartBookMutation(bookId)

  const unlocked = useMemo(
    () => ({
      1: true,
      2: anyApprovedOutline(outlines.data),
      3: anyApprovedChapter(chapters.data),
    }),
    [outlines.data, chapters.data],
  )

  const requestedStep = Number(searchParams.get('step') ?? '1')
  const activeStep = (() => {
    if (requestedStep >= 1 && requestedStep <= 3 && unlocked[requestedStep as 1 | 2 | 3]) {
      return requestedStep
    }
    return 1
  })()

  // Normalize an invalid ?step= param (e.g. a locked step, or stale after a
  // page refresh). Deferred until queries settle so we don't briefly "correct"
  // step=2 down to step=1 while outline data is still loading.
  const queriesSettled =
    !outlines.isLoading && !chapters.isLoading && !book.isLoading
  useEffect(() => {
    if (!queriesSettled) return
    const current = searchParams.get('step')
    if (current && Number(current) !== activeStep) {
      const next = new URLSearchParams(searchParams)
      next.set('step', String(activeStep))
      setSearchParams(next, { replace: true })
    }
  }, [activeStep, queriesSettled, searchParams, setSearchParams])

  const selectStep = (step: number) => {
    if (!unlocked[step as 1 | 2 | 3]) return
    const next = new URLSearchParams(searchParams)
    next.set('step', String(step))
    setSearchParams(next, { replace: false })
  }

  if (book.isLoading || !book.data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading book…
        </CardContent>
      </Card>
    )
  }
  if (book.isError) {
    return (
      <div className="text-sm text-destructive">
        {(book.error as Error).message}
      </div>
    )
  }

  const approved = approvedOutline(outlines.data)
  const latestO = latestOutline(outlines.data)
  // Step 1 always shows the latest outline so users can see revision state.
  // Step 2/3 consume the approved outline which is what chapter work is keyed to.
  const outlineForStepOne = latestO

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to books
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{book.data.title}</h1>
          <div className="mt-2">
            <StatusBadge status={book.data.status} />
          </div>
        </div>
      </div>

      <Stepper
        steps={STEPS}
        active={activeStep}
        unlocked={unlocked}
        onSelect={selectStep}
      />

      {book.data.status === 'failed' && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-5">
            <h3 className="text-sm font-semibold text-destructive">
              The pipeline hit an error
            </h3>
            <p className="mt-1 text-sm">
              Wipe outlines, chapters, and compiled files and start over.
            </p>
            <div className="mt-3">
              <Button
                variant="destructive"
                onClick={() => restart.mutate()}
                disabled={restart.isPending}
              >
                <RotateCcw className="h-4 w-4" />
                {restart.isPending ? 'Restarting…' : 'Restart pipeline'}
              </Button>
            </div>
            {restart.isError && (
              <div className="mt-2 text-sm text-destructive">
                {(restart.error as Error).message}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeStep === 1 && (
        <OutlineStep
          bookId={bookId}
          outline={outlineForStepOne}
          onOutlineApproved={() => selectStep(2)}
        />
      )}

      {activeStep === 2 && approved && (
        <ChaptersStep
          bookId={bookId}
          outline={approved}
          chapters={chapters.data ?? []}
        />
      )}

      {activeStep === 3 && (
        <FinalizeStep
          bookId={bookId}
          outline={approved}
          chapters={chapters.data ?? []}
        />
      )}
    </div>
  )
}
