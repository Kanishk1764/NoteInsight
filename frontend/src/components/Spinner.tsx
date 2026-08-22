export default function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="spinner-wrapper">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
