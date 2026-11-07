import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <main className="grid flex-1 place-items-center p-6 text-center">
      <div>
        <p className="text-5xl font-semibold tracking-tight text-accent">404</p>
        <h1 className="mt-3 text-lg font-semibold">This page doesn’t exist</h1>
        <p className="mt-2 text-sm text-muted">
          The link may be out of date, or the page may have moved.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
        >
          Back to all mentors
        </Link>
      </div>
    </main>
  )
}
