import { useState } from 'react'
import { CheckCircle2, Pencil, Sparkles } from 'lucide-react'

import { OutlineEditor } from '@/components/OutlineEditor'
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
import { Textarea } from '@/components/ui/textarea'
import type { Outline } from '@/lib/api'
import {
  useApproveOutlineMutation,
  useEditOutlineMutation,
  useGenerateOutlineMutation,
  useReviseOutlineMutation,
} from '@/queries/outlines'

type Props = {
  bookId: string
  outline: Outline | null
  onOutlineApproved: () => void
}

type Mode = 'view' | 'revise' | 'edit'

export function OutlineStep({ bookId, outline, onOutlineApproved }: Props) {
  const [mode, setMode] = useState<Mode>('view')
  const [note, setNote] = useState('')

  const generate = useGenerateOutlineMutation(bookId)
  const approve = useApproveOutlineMutation(bookId)
  const revise = useReviseOutlineMutation(bookId)
  const edit = useEditOutlineMutation(bookId)

  const pending = generate.isPending
    ? 'Generating outline…'
    : approve.isPending
      ? 'Approving outline…'
      : revise.isPending
        ? 'Revising outline…'
        : edit.isPending
          ? 'Saving outline…'
          : null

  if (!outline) {
    return (
      <Card className="relative">
        <SectionOverlay show={!!pending} message={pending ?? undefined} />
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div>
            <h2 className="text-lg font-semibold">Generate an outline</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Start by generating a chapter-by-chapter outline for your book.
              You can approve, revise, or edit it before drafting chapters.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            <Sparkles className="h-4 w-4" />
            Generate outline
          </Button>
          {generate.isError && (
            <div className="text-sm text-destructive">
              {(generate.error as Error).message}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const approved = outline.status === 'approved'

  const handleRevise = () => {
    revise.mutate(note, {
      onSuccess: () => {
        setMode('view')
        setNote('')
      },
    })
  }

  const handleApprove = () => {
    approve.mutate(undefined, { onSuccess: onOutlineApproved })
  }

  const handleEditSave = (content: Parameters<typeof edit.mutate>[0]) => {
    edit.mutate(content, {
      onSuccess: () => {
        setMode('view')
        onOutlineApproved()
      },
    })
  }

  return (
    <Card className="relative">
      <SectionOverlay show={!!pending} message={pending ?? undefined} />
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg">{outline.content.title}</CardTitle>
          <CardDescription>
            Outline v{outline.version}
            {approved && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approved
              </span>
            )}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {mode === 'edit' ? (
          <OutlineEditor
            initial={outline.content}
            saving={edit.isPending}
            error={edit.error ? (edit.error as Error).message : null}
            onCancel={() => setMode('view')}
            onSave={handleEditSave}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {outline.content.summary}
            </p>

            <ol className="mt-5 space-y-3">
              {outline.content.chapters
                .slice()
                .sort((a, b) => a.index - b.index)
                .map((c) => (
                  <li
                    key={c.index}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="text-sm font-medium">
                      {c.index + 1}. {c.title}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {c.summary}
                    </p>
                  </li>
                ))}
            </ol>

            {!approved && (
              <>
                <Separator className="my-5" />
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
                    <div className="flex justify-end gap-2">
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
                      <Button
                        onClick={handleRevise}
                        disabled={revise.isPending}
                      >
                        Revise with AI
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleApprove} disabled={approve.isPending}>
                      Approve outline
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setMode('revise')}
                    >
                      <Sparkles className="h-4 w-4" />
                      Revise with AI
                    </Button>
                    <Button variant="outline" onClick={() => setMode('edit')}>
                      <Pencil className="h-4 w-4" />
                      Edit manually
                    </Button>
                  </div>
                )}
                {approve.isError && (
                  <div className="mt-2 text-sm text-destructive">
                    {(approve.error as Error).message}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
