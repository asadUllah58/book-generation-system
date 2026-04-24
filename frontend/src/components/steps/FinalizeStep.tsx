import { Download, FileText } from 'lucide-react'

import { SectionOverlay } from '@/components/SectionOverlay'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { Chapter, DownloadFormat, Outline } from '@/lib/api'
import {
  useChapterDownloadMutation,
  useCombinedDownloadMutation,
} from '@/queries/downloads'

const FORMATS: DownloadFormat[] = ['pdf', 'docx', 'txt', 'md']

type Props = {
  bookId: string
  outline: Outline | null
  chapters: Chapter[]
}

function approvedChaptersInOrder(chapters: Chapter[]): Chapter[] {
  const byIndex = new Map<number, Chapter>()
  for (const c of chapters) {
    if (c.status !== 'approved') continue
    const existing = byIndex.get(c.index)
    if (!existing || c.version > existing.version) byIndex.set(c.index, c)
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index)
}

export function FinalizeStep({ bookId, outline, chapters }: Props) {
  const approved = approvedChaptersInOrder(chapters)
  const combined = useCombinedDownloadMutation(bookId)
  const perChapter = useChapterDownloadMutation(bookId)

  if (approved.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
          <FileText className="h-8 w-8" />
          <p className="text-sm">
            Approve a chapter in Step 2 to start downloading.
          </p>
        </CardContent>
      </Card>
    )
  }

  const total = outline?.content.chapters.length ?? 0
  const allDone = total > 0 && approved.length === total

  const downloadCombined = async (format: DownloadFormat) => {
    const res = await combined.mutateAsync(format)
    window.open(res.url, '_blank', 'noopener,noreferrer')
  }

  const downloadChapter = async (index: number, format: DownloadFormat) => {
    const res = await perChapter.mutateAsync({ index, format })
    window.open(res.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6">
      <Card
        className={cn(
          'relative',
          allDone && 'border-emerald-200 bg-emerald-50/40',
        )}
      >
        <SectionOverlay
          show={combined.isPending}
          message={`Preparing ${(combined.variables ?? '').toString().toUpperCase()}…`}
        />
        <CardHeader>
          <CardTitle className="text-lg">
            {allDone ? 'Book complete' : 'Download what you have so far'}
          </CardTitle>
          <CardDescription>
            {approved.length} of {total || '?'} chapters approved. The combined
            download includes the outline and every approved chapter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormatButtons
            onPick={downloadCombined}
            loading={combined.isPending}
            pendingFormat={combined.variables}
            label="Download all"
          />
          {combined.isError && (
            <div className="mt-2 text-sm text-destructive">
              {(combined.error as Error).message}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="relative">
        <SectionOverlay
          show={perChapter.isPending}
          message="Preparing chapter…"
        />
        <CardHeader>
          <CardTitle className="text-base">Approved chapters</CardTitle>
          <CardDescription>
            Download a single chapter in your preferred format.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="divide-y">
            {approved.map((ch, i) => (
              <li
                key={ch.id}
                className={cn(
                  'flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between',
                  i === 0 && 'pt-0',
                )}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    Chapter {ch.index + 1}
                    {ch.title ? ` — ${ch.title}` : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    v{ch.version}
                  </div>
                </div>
                <FormatButtons
                  onPick={(fmt) => downloadChapter(ch.index, fmt)}
                  loading={
                    perChapter.isPending &&
                    perChapter.variables?.index === ch.index
                  }
                  pendingFormat={
                    perChapter.isPending &&
                    perChapter.variables?.index === ch.index
                      ? perChapter.variables?.format
                      : undefined
                  }
                />
              </li>
            ))}
          </ol>
          {perChapter.isError && (
            <>
              <Separator className="my-3" />
              <div className="text-sm text-destructive">
                {(perChapter.error as Error).message}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

type FormatButtonsProps = {
  onPick: (format: DownloadFormat) => void
  loading: boolean
  pendingFormat: DownloadFormat | undefined
  label?: string
}

function FormatButtons({
  onPick,
  loading,
  pendingFormat,
  label,
}: FormatButtonsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {label && <span className="mr-1 text-sm font-medium">{label}:</span>}
      {FORMATS.map((format) => (
        <Button
          key={format}
          size="sm"
          variant="outline"
          onClick={() => onPick(format)}
          disabled={loading}
        >
          <Download className="h-3.5 w-3.5" />
          {loading && pendingFormat === format
            ? '…'
            : format.toUpperCase()}
        </Button>
      ))}
    </div>
  )
}
