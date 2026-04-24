import { useState } from 'react'
import { BookOpen, CheckCircle2, Eye, Sparkles } from 'lucide-react'

import { ChapterModal } from '@/components/ChapterModal'
import { SectionOverlay } from '@/components/SectionOverlay'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Chapter, Outline } from '@/lib/api'
import {
  useDraftChaptersMutation,
  useGenerateChapterMutation,
} from '@/queries/chapters'

type Props = {
  bookId: string
  outline: Outline
  chapters: Chapter[]
}

type SlotState =
  | { kind: 'empty' }
  | { kind: 'generated'; versions: Chapter[] }
  | { kind: 'approved'; versions: Chapter[] }

function slotStateFor(chapters: Chapter[], index: number): SlotState {
  const versions = chapters
    .filter((c) => c.index === index)
    .sort((a, b) => a.version - b.version)
  if (versions.length === 0) return { kind: 'empty' }
  const latest = versions[versions.length - 1]
  const anyApproved = versions.some((v) => v.status === 'approved')
  if (anyApproved) return { kind: 'approved', versions }
  if (!latest.content_md) return { kind: 'empty' }
  return { kind: 'generated', versions }
}

export function ChaptersStep({ bookId, outline, chapters }: Props) {
  const slotsCreated = chapters.length > 0
  const draft = useDraftChaptersMutation(bookId)

  if (!slotsCreated) {
    return (
      <Card className="relative">
        <SectionOverlay
          show={draft.isPending}
          message="Creating chapter slots…"
        />
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div>
            <h2 className="text-lg font-semibold">Draft chapters</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Create a slot for every chapter in your outline. You'll generate
              and review each chapter from there.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => draft.mutate()}
            disabled={draft.isPending}
          >
            <BookOpen className="h-4 w-4" />
            Draft chapters
          </Button>
          {draft.isError && (
            <div className="text-sm text-destructive">
              {(draft.error as Error).message}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const outlineChapters = [...outline.content.chapters].sort(
    (a, b) => a.index - b.index,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Draft chapters</CardTitle>
        <CardDescription>
          Generate each chapter, then approve or revise it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {outlineChapters.map((entry) => (
            <ChapterSlot
              key={entry.index}
              bookId={bookId}
              index={entry.index}
              title={entry.title}
              summary={entry.summary}
              state={slotStateFor(chapters, entry.index)}
            />
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

type SlotProps = {
  bookId: string
  index: number
  title: string
  summary: string
  state: SlotState
}

function ChapterSlot({ bookId, index, title, summary, state }: SlotProps) {
  const [open, setOpen] = useState(false)
  const generate = useGenerateChapterMutation(bookId)

  const latestStatus =
    state.kind === 'empty'
      ? 'pending'
      : state.versions[state.versions.length - 1].status

  return (
    <li
      className={cn(
        'relative rounded-md border p-4',
        state.kind === 'approved'
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-border bg-background',
      )}
    >
      <SectionOverlay
        show={generate.isPending}
        message="Generating chapter…"
      />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              Chapter {index + 1} — {title}
            </span>
            <StatusBadge status={latestStatus} />
            {state.kind === 'approved' && (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>

        <div className="shrink-0">
          {state.kind === 'empty' ? (
            <Button
              onClick={() => generate.mutate(index)}
              disabled={generate.isPending}
              size="sm"
            >
              <Sparkles className="h-4 w-4" />
              Generate
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(true)}
            >
              <Eye className="h-4 w-4" />
              View chapter
            </Button>
          )}
        </div>
      </div>

      {generate.isError && (
        <div className="mt-2 text-sm text-destructive">
          {(generate.error as Error).message}
        </div>
      )}

      {state.kind !== 'empty' && (
        <ChapterModal
          bookId={bookId}
          index={index}
          title={title}
          versions={state.versions}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </li>
  )
}
