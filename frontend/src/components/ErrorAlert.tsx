interface Props {
  message: string
  hint?: string
  onDismiss?: () => void
  onRetry?: () => void
}

export default function ErrorAlert({ message, hint, onDismiss, onRetry }: Props) {
  return (
    <div className="alert alert-error" role="alert">
      <div style={{ flex: 1 }}>
        <strong>Error: </strong>{message}
        {hint && (
          <p style={{ marginTop: '0.35rem', marginBottom: 0, fontSize: '0.85em', opacity: 0.85 }}>
            {hint}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: '0.75rem' }}>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{ background: 'none', border: '1px solid currentColor', borderRadius: '4px', cursor: 'pointer', padding: '2px 10px', fontWeight: 600, fontSize: '0.85em' }}
            aria-label="Retry"
          >
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
