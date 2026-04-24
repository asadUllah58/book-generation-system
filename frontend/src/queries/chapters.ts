import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as api from '@/lib/api'
import { queryKeys } from '@/queries/keys'

export function useChaptersQuery(bookId: string) {
  return useQuery({
    queryKey: queryKeys.chapters(bookId),
    queryFn: () => api.listChapters(bookId),
  })
}

function useInvalidateChapterState(bookId: string) {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.book(bookId) }),
      qc.invalidateQueries({ queryKey: queryKeys.chapters(bookId) }),
    ])
}

export function useDraftChaptersMutation(bookId: string) {
  const invalidate = useInvalidateChapterState(bookId)
  return useMutation({
    mutationFn: () => api.draftChapters(bookId),
    onSuccess: invalidate,
  })
}

export function useGenerateChapterMutation(bookId: string) {
  const invalidate = useInvalidateChapterState(bookId)
  return useMutation({
    mutationFn: (index: number) => api.generateChapter(bookId, index),
    onSuccess: invalidate,
  })
}

export function useReviseChapterMutation(bookId: string) {
  const invalidate = useInvalidateChapterState(bookId)
  return useMutation({
    mutationFn: ({ index, note }: { index: number; note?: string }) =>
      api.reviseChapter(bookId, index, note),
    onSuccess: invalidate,
  })
}

export function useApproveChapterMutation(bookId: string) {
  const invalidate = useInvalidateChapterState(bookId)
  return useMutation({
    mutationFn: (index: number) => api.approveChapter(bookId, index),
    onSuccess: invalidate,
  })
}
