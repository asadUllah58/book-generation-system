export const queryKeys = {
  health: ['health'] as const,
  books: ['books'] as const,
  book: (id: string) => ['book', id] as const,
  outlines: (bookId: string) => ['outlines', bookId] as const,
  chapters: (bookId: string) => ['chapters', bookId] as const,
}
