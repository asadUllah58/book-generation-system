import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { CheckCircle2, Sparkles } from 'lucide-react'

import { SectionOverlay } from '@/components/SectionOverlay'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { Chapter } from '@/lib/api'
import {
  useApproveChapterMutation,
  useReviseChapterMutation,
} from '@/queries/chapters'

type Props = {
  bookId: string
  index: number
  title: string | null
  versions: Chapter[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChapterModal({
  bookId,
  index,
  title,
  versions,
  open,
  onOpenChange,
}: Props) {
  const sorted = [...versions].sort((a, b) => b.version - a.version)
  const latest = sorted[0]
  const anyApproved = versions.some((v) => v.status === 'approved')
  const locked = anyApproved

  const [activeVersionId, setActiveVersionId] = useState<string | undefined>(
    latest?.id,
  )
  const [mode, setMode] = useState<'view' | 'revise'>('view')
  const [note, setNote] = useState('')

  const approve = useApproveChapterMutation(bookId)
  const revise = useReviseChapterMutation(bookId)

  const pending = approve.isPending
    ? 'Approving chapter…'
    : revise.isPending
      ? 'Revising chapter…'
      : null

  useEffect(() => {
    if (open) {
      setActiveVersionId(latest?.id)
      setMode('view')
      setNote('')
    }
  }, [open, latest?.id])

  const handleRevise = () => {
    revise.mutate(
      { index, note },
      {
        onSuccess: () => {
          setMode('view')
          setNote('')
        },
      },
    )
  }

  const handleApprove = () => {
    approve.mutate(index, { onSuccess: () => onOpenChange(false) })
  }

  if (!latest) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden">
        {/* DialogContent is `fixed` — don't merge `relative` into className
            (tailwind-merge would drop `fixed` and break centering). The
            overlay's `absolute inset-0` anchors to the fixed dialog fine. */}
        <SectionOverlay show={!!pending} message={pending ?? undefined} />

        <DialogHeader>
          <DialogTitle>
            Chapter {index + 1}
            {title ? ` — ${title}` : ''}
          </DialogTitle>
          <DialogDescription>
            {sorted.length} {sorted.length === 1 ? 'version' : 'versions'}
            {locked && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approved
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeVersionId}
          onValueChange={setActiveVersionId}
          className="min-h-[320px]"
        >
          <TabsList>
            {sorted.map((v) => (
              <TabsTrigger key={v.id} value={v.id}>
                v{v.version}
              </TabsTrigger>
            ))}
          </TabsList>

          {sorted.map((v) => (
            <TabsContent key={v.id} value={v.id}>
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge status={v.status} />
              </div>
              <div className="prose prose-slate max-h-[50vh] max-w-none overflow-y-auto rounded-md border bg-background p-4 text-sm">
                <ReactMarkdown>{v.content_md}</ReactMarkdown>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {!locked && (
          <>
            <Separator />
            {mode === 'revise' ? (
              <div className="space-y-3">
                <Textarea
                  placeholder="What should change? (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  disabled={revise.isPending}
                />
                {revise.isError && (
                  <div className="text-sm text-destructive">
                    {(revise.error as Error).message}
                  </div>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMode('view')
                      setNote('')
                    }}
                    disabled={revise.isPending}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleRevise} disabled={revise.isPending}>
                    Revise with AI
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setMode('revise')}
                  disabled={approve.isPending || activeVersionId !== latest.id}
                >
                  <Sparkles className="h-4 w-4" />
                  Revise
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={approve.isPending || activeVersionId !== latest.id}
                >
                  Approve chapter
                </Button>
              </DialogFooter>
            )}
            {activeVersionId !== latest.id && mode === 'view' && (
              <p className="text-xs text-muted-foreground">
                Switch to the latest version (v{latest.version}) to approve or
                revise.
              </p>
            )}
            {approve.isError && (
              <div className="text-sm text-destructive">
                {(approve.error as Error).message}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
