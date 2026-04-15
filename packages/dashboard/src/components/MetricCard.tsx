interface Props {
  label: string
  value: string | number
  hint?: string
  /** Tailwind text-* color class (e.g. 'text-purple', 'text-teal'). */
  tone?: string
}

export function MetricCard({ label, value, hint, tone = 'text-ink' }: Props) {
  return (
    <div class="rounded-[12px] border-[0.5px] border-line bg-paper px-[18px] py-4">
      <div class="text-[11px] uppercase tracking-[0.04em] text-ink3">{label}</div>
      <div class={`mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.03em] ${tone}`}>
        {value}
      </div>
      {hint ? <div class="mt-1 text-[11px] text-ink2">{hint}</div> : null}
    </div>
  )
}
