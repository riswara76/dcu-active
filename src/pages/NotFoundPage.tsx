import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { AlertTriangle, SearchX } from 'lucide-react';
import { newReference } from '../lib/errors';

/** S26 — not found (also shown to non-admins on /admin, so admin routes are not revealed). */
export function NotFoundPage() {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <SearchX className="mx-auto mb-4 size-10 text-subtle" aria-hidden="true" />
      <h1 className="text-2xl font-bold">This page doesn&apos;t exist</h1>
      <p className="mt-2 text-muted">The link may be old or mistyped.</p>
      <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-hover">
        Go home
      </Link>
    </main>
  );
}

/** S23 — route-level error boundary. Never shows technical details (SEC-14). */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  const reference = newReference();
  console.error(`[ui ${reference}]`, error instanceof Error ? error.name : 'error');
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <AlertTriangle className="mx-auto mb-4 size-10 text-danger" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-muted">Reference: <span className="font-mono">{reference}</span></p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={() => window.location.reload()}
          className="min-h-11 rounded-lg border border-line px-4 font-semibold hover:bg-surface">Try again</button>
        <Link to="/" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-hover">
          Go home
        </Link>
      </div>
    </main>
  );
}
