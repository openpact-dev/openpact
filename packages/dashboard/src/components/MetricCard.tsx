interface Props {
  label: string
  value: string | number
  hint?: string
}

export function MetricCard({ label, value, hint }: Props) {
  return (
    <div class="metric-card">
      <div class="metric-label">{label}</div>
      <div class="metric-value">{value}</div>
      {hint ? <div class="metric-hint">{hint}</div> : null}
    </div>
  )
}
