interface Props {
  value: number // 0–1
}

export default function ConfidenceBar({ value }: Props) {
  const pct = Math.round(value * 100)
  return (
    <div className="confidence-bar-wrapper">
      <div className="confidence-bar-track">
        <div
          className="confidence-bar-fill"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <span className="confidence-label">{pct}%</span>
    </div>
  )
}
