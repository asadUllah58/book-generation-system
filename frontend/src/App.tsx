import { Outlet, Link } from 'react-router-dom'
import { useIsMutating } from '@tanstack/react-query'
import { LoadingOverlay } from './components/LoadingOverlay'
import { REVIEWER } from './lib/reviewer'

export default function App() {
  const mutationCount = useIsMutating()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            Book Generation System
          </Link>
          <span className="text-sm text-slate-500">Reviewer: {REVIEWER.name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
      <LoadingOverlay show={mutationCount > 0} />
    </div>
  )
}
