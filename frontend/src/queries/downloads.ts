import { useMutation } from '@tanstack/react-query'

import * as api from '@/lib/api'
import type { DownloadFormat } from '@/lib/api'

export function useCombinedDownloadMutation(bookId: string) {
  return useMutation({
    mutationFn: (format: DownloadFormat) =>
      api.getCombinedDownloadUrl(bookId, format),
  })
}

export function useChapterDownloadMutation(bookId: string) {
  return useMutation({
    mutationFn: ({ index, format }: { index: number; format: DownloadFormat }) =>
      api.getChapterDownloadUrl(bookId, index, format),
  })
}
