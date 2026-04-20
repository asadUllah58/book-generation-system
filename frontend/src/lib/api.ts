import { REVIEWER } from './reviewer'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[${res.status}] ${text || res.statusText}`)
  }
  return res.json() as Promise<T>
}

// ---------- types ----------

export interface Book {
  id: string
  title: string
  status: string
  current_node: string | null
  final_docx_path: string | null
  final_txt_path: string | null
  final_pdf_path: string | null
  created_at: string
  updated_at: string
}

export interface OutlineChapterEntry {
  index: number
  title: string
  summary: string
}

export interface OutlineContent {
  title: string
  summary: string
  chapters: OutlineChapterEntry[]
}

export interface Outline {
  id: string
  book_id: string
  version: number
  parent_id: string | null
  content: OutlineContent
  status: string
  created_at: string
}

export interface Chapter {
  id: string
  book_id: string
  index: number
  version: number
  parent_id: string | null
  title: string | null
  content_md: string
  summary: string | null
  status: string
  created_at: string
}

export type FeedbackAction = 'approve' | 'revise' | 'reject'

// ---------- fetchers ----------

export function getHealth() {
  return request<{ status: string }>('/health')
}

export function listBooks() {
  return request<Book[]>('/books')
}

export function getBook(id: string) {
  return request<Book>(`/books/${id}`)
}

export function createBook(title: string) {
  return request<Book>('/books', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export function restartBook(id: string) {
  return request<Book>(`/books/${id}/restart`, { method: 'POST' })
}

export async function deleteBook(id: string): Promise<void> {
  const res = await fetch(`${BASE}/books/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '')
    throw new Error(`[${res.status}] ${text || res.statusText}`)
  }
}

export async function uploadBooks(file: File): Promise<Book[]> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${BASE}/books/bulk`, { method: 'POST', body: fd })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[${res.status}] ${text || res.statusText}`)
  }
  return res.json() as Promise<Book[]>
}

export function listOutlines(bookId: string) {
  return request<Outline[]>(`/books/${bookId}/outlines`)
}

export function listChapters(bookId: string) {
  return request<Chapter[]>(`/books/${bookId}/chapters`)
}

export function submitFeedback(
  bookId: string,
  params: {
    target_type: 'outline' | 'chapter'
    target_id: string
    action: FeedbackAction
    note?: string
  },
) {
  return request<{ resumed: boolean }>(`/books/${bookId}/resume`, {
    method: 'POST',
    body: JSON.stringify({ ...params, reviewer_id: REVIEWER.id }),
  })
}

export type DownloadFormat = 'docx' | 'pdf' | 'txt'

export function getDownloadUrl(bookId: string, format: DownloadFormat) {
  return request<{ url: string; format: string; path: string }>(
    `/books/${bookId}/download?format=${format}`,
  )
}
