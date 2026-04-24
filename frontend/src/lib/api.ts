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
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---------- types ----------

export type BookStatus =
  | 'created'
  | 'outline_review'
  | 'drafting'
  | 'complete'
  | 'failed'

export interface Book {
  id: string
  title: string
  status: BookStatus | string
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

export type DownloadFormat = 'docx' | 'pdf' | 'txt' | 'md'

export interface DownloadResponse {
  url: string
  format: string
  path: string
}

// ---------- books ----------

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

// ---------- outlines ----------

export function listOutlines(bookId: string) {
  return request<Outline[]>(`/books/${bookId}/outlines`)
}

export function generateOutline(bookId: string) {
  return request<Outline>(`/books/${bookId}/outline/generate`, {
    method: 'POST',
  })
}

export function reviseOutline(bookId: string, note?: string) {
  return request<Outline>(`/books/${bookId}/outline/revise`, {
    method: 'POST',
    body: JSON.stringify({ note: note?.trim() || null }),
  })
}

export function editOutline(bookId: string, content: OutlineContent) {
  return request<Outline>(`/books/${bookId}/outline/edit`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export function approveOutline(bookId: string) {
  return request<Outline>(`/books/${bookId}/outline/approve`, {
    method: 'POST',
  })
}

// ---------- chapters ----------

export function listChapters(bookId: string) {
  return request<Chapter[]>(`/books/${bookId}/chapters`)
}

export function draftChapters(bookId: string) {
  return request<Chapter[]>(`/books/${bookId}/chapters/draft`, {
    method: 'POST',
  })
}

export function generateChapter(bookId: string, index: number) {
  return request<Chapter>(`/books/${bookId}/chapters/${index}/generate`, {
    method: 'POST',
  })
}

export function reviseChapter(
  bookId: string,
  index: number,
  note?: string,
) {
  return request<Chapter>(`/books/${bookId}/chapters/${index}/revise`, {
    method: 'POST',
    body: JSON.stringify({ note: note?.trim() || null }),
  })
}

export function approveChapter(bookId: string, index: number) {
  return request<Chapter>(`/books/${bookId}/chapters/${index}/approve`, {
    method: 'POST',
  })
}

// ---------- downloads ----------

export function getCombinedDownloadUrl(bookId: string, format: DownloadFormat) {
  return request<DownloadResponse>(
    `/books/${bookId}/download?format=${format}`,
  )
}

export function getChapterDownloadUrl(
  bookId: string,
  index: number,
  format: DownloadFormat,
) {
  return request<DownloadResponse>(
    `/books/${bookId}/chapters/${index}/download?format=${format}`,
  )
}
