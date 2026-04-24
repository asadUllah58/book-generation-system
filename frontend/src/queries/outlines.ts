import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as api from '@/lib/api'
import type { OutlineContent } from '@/lib/api'
import { queryKeys } from '@/queries/keys'

export function useOutlinesQuery(bookId: string) {
  return useQuery({
    queryKey: queryKeys.outlines(bookId),
    queryFn: () => api.listOutlines(bookId),
  })
}

function useInvalidateOutlineState(bookId: string) {
  const qc = useQueryClient()
  // Returning the Promise from onSuccess makes react-query wait for the
  // refetch before calling the caller's onSuccess — so components that need
  // to act on fresh query state (e.g. auto-advancing the stepper once an
  // outline is approved) don't race against stale cache reads.
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.book(bookId) }),
      qc.invalidateQueries({ queryKey: queryKeys.outlines(bookId) }),
      qc.invalidateQueries({ queryKey: queryKeys.chapters(bookId) }),
    ])
}

export function useGenerateOutlineMutation(bookId: string) {
  const invalidate = useInvalidateOutlineState(bookId)
  return useMutation({
    mutationFn: () => api.generateOutline(bookId),
    onSuccess: invalidate,
  })
}

export function useReviseOutlineMutation(bookId: string) {
  const invalidate = useInvalidateOutlineState(bookId)
  return useMutation({
    mutationFn: (note?: string) => api.reviseOutline(bookId, note),
    onSuccess: invalidate,
  })
}

export function useEditOutlineMutation(bookId: string) {
  const invalidate = useInvalidateOutlineState(bookId)
  return useMutation({
    mutationFn: (content: OutlineContent) => api.editOutline(bookId, content),
    onSuccess: invalidate,
  })
}

export function useApproveOutlineMutation(bookId: string) {
  const invalidate = useInvalidateOutlineState(bookId)
  return useMutation({
    mutationFn: () => api.approveOutline(bookId),
    onSuccess: invalidate,
  })
}
