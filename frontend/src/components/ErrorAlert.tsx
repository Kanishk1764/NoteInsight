interface Props {
  message: string
  onDismiss?: () => void
}

export default function ErrorAlert({ message, onDismiss }: Props) {
  return (
    <div className="alert alert-error" role="alert">
      <strong>Error: </strong>{message}
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  )
}
