import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as api from '@/lib/api'
import { queryKeys } from '@/queries/keys'

export function useHealthQuery() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: api.getHealth,
    retry: false,
  })
}

export function useBooksQuery() {
  return useQuery({
    queryKey: queryKeys.books,
    queryFn: api.listBooks,
  })
}

export function useBookQuery(bookId: string) {
  return useQuery({
    queryKey: queryKeys.book(bookId),
    queryFn: () => api.getBook(bookId),
  })
}

export function useCreateBookMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (title: string) => api.createBook(title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.books })
    },
  })
}

export function useDeleteBookMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteBook(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.books })
    },
  })
}

export function useRestartBookMutation(bookId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.restartBook(bookId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.book(bookId) })
      qc.invalidateQueries({ queryKey: queryKeys.outlines(bookId) })
      qc.invalidateQueries({ queryKey: queryKeys.chapters(bookId) })
    },
  })
}

export function useUploadBooksMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => api.uploadBooks(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.books })
    },
  })
}
