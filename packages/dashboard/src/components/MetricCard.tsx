import { CornerBracket } from './Ornament'

interface Props {
  label: string
  value: string | number
  hint?: string
  /** When true, renders as the hero variant — large display number, ember corners. */
  hero?: boolean
  /** Accent hint — defaults to the ember accent. */
  tone?: 'ember' | 'knowledge' | 'task' | 'skill' | 'message'
}

const TONE_VAR: Record<NonNullable<Props['tone']>, string> = {
  ember: 'var(--color-ember)',
  knowledge: 'var(--color-sigil-knowledge)',
  task: 'var(--color-sigil-task)',
  skill: 'var(--color-sigil-skill)',
  message: 'var(--color-sigil-message)',
}

export function MetricCard({ label, value, hint, hero = false, tone = 'ember' }: Props) {
  const accent = TONE_VAR[tone]
  if (hero) {
    return (
      <div class="relative flex flex-col gap-3 px-7 py-7">
        <CornerBracket pos="tl" />
        <CornerBracket pos="br" />
        <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
          {label}
        </div>
        <div
          class="font-display tabular animate-count-in text-[88px] font-light leading-none tracking-[-0.03em]"
          style={{ color: accent }}
        >
          {value}
        </div>
        {hint ? (
          <div class="font-display italic text-[15px] text-[var(--color-ink2)]">{hint}</div>
        ) : null}
      </div>
    )
  }
  return (
    <div class="flex flex-col gap-1">
      <div class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
        {label}
      </div>
      <div
        class="font-display tabular animate-count-in text-[32px] font-normal leading-none tracking-[-0.02em]"
        style={{ color: accent }}
      >
        {value}
      </div>
      {hint ? <div class="text-[12px] text-[var(--color-ink3)]">{hint}</div> : null}
    </div>
  )
}
