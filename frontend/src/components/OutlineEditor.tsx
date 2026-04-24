import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import type { OutlineContent } from '@/lib/api'

type Draft = {
  title: string
  summary: string
  chapters: { title: string; summary: string }[]
}

function toDraft(content: OutlineContent): Draft {
  return {
    title: content.title,
    summary: content.summary,
    chapters: content.chapters
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((c) => ({ title: c.title, summary: c.summary })),
  }
}

function toContent(draft: Draft): OutlineContent {
  return {
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    chapters: draft.chapters.map((c, i) => ({
      index: i,
      title: c.title.trim(),
      summary: c.summary.trim(),
    })),
  }
}

type Props = {
  initial: OutlineContent
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: (content: OutlineContent) => void
}

export function OutlineEditor({
  initial,
  saving,
  error,
  onCancel,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const [validationError, setValidationError] = useState<string | null>(null)

  const updateChapter = (
    i: number,
    field: 'title' | 'summary',
    value: string,
  ) => {
    setDraft((d) => {
      const next = { ...d, chapters: [...d.chapters] }
      next.chapters[i] = { ...next.chapters[i], [field]: value }
      return next
    })
  }

  const addChapter = () => {
    setDraft((d) => ({
      ...d,
      chapters: [...d.chapters, { title: '', summary: '' }],
    }))
  }

  const removeChapter = (i: number) => {
    setDraft((d) => ({
      ...d,
      chapters: d.chapters.filter((_, idx) => idx !== i),
    }))
  }

  const handleSave = () => {
    const content = toContent(draft)
    if (!content.title) {
      setValidationError('Book title is required.')
      return
    }
    if (content.chapters.length < 3) {
      setValidationError('At least 3 chapters are required.')
      return
    }
    if (content.chapters.some((c) => !c.title)) {
      setValidationError('Every chapter needs a title.')
      return
    }
    setValidationError(null)
    onSave(content)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="outline-title">Book title</Label>
        <Input
          id="outline-title"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          disabled={saving}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="outline-summary">Book summary</Label>
        <Textarea
          id="outline-summary"
          value={draft.summary}
          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
          rows={3}
          disabled={saving}
        />
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Chapters</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addChapter}
            disabled={saving}
          >
            <Plus className="h-4 w-4" />
            Add chapter
          </Button>
        </div>

        <ol className="space-y-3">
          {draft.chapters.map((ch, i) => (
            <li
              key={i}
              className="rounded-md border bg-background p-3 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="mt-2 text-sm font-medium text-muted-foreground">
                  {i + 1}.
                </span>
                <div className="flex-1 space-y-2">
                  <Input
                    placeholder="Chapter title"
                    value={ch.title}
                    onChange={(e) => updateChapter(i, 'title', e.target.value)}
                    disabled={saving}
                  />
                  <Textarea
                    placeholder="Chapter summary (2–4 sentences)"
                    value={ch.summary}
                    onChange={(e) =>
                      updateChapter(i, 'summary', e.target.value)
                    }
                    rows={2}
                    disabled={saving}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeChapter(i)}
                  disabled={saving || draft.chapters.length <= 3}
                  aria-label={`Remove chapter ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {(validationError || error) && (
        <div className="text-sm text-destructive">
          {validationError ?? error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save and approve'}
        </Button>
      </div>
    </div>
  )
}
