interface ErrorStateProps {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}

/** Explains what failed and offers a retry. The most common cause in dev is the API not running. */
export function ErrorState({ title = 'Could not load data', error, onRetry }: ErrorStateProps) {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const looksOffline = /fetch|network|ECONNREFUSED|502|503|504/i.test(message);
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-line bg-sunken px-4 py-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" className="text-critical">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5v4.2M8 11.2v.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {title}
      </div>
      <p className="text-sm text-ink2">{message}</p>
      {looksOffline && (
        <p className="text-xs text-muted">Check that the WindSight API is running and reachable at /api.</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-sunken"
        >
          Try again
        </button>
      )}
    </div>
  );
}
