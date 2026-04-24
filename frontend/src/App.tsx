import { Outlet, Link } from 'react-router-dom'

import { REVIEWER } from '@/lib/reviewer'

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            Book Generation System
          </Link>
          <span className="text-sm text-muted-foreground">
            Reviewer: {REVIEWER.name}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
