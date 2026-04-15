import { useMemo, useState } from 'preact/hooks'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSse } from '../hooks/useSse'
import { Sigil } from '../components/Sigil'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { preferredName } from '../lib/format'

interface SkillRow {
  id: string
  timestamp: string
  agent_id: string
  display_name?: string | null
  payload: {
    name: string
    version: string
    format: string
    description?: string
    requires_approval?: boolean
  }
}

interface InstalledSkill {
  id: string
  name: string
  version: string
  format: string
  path: string
  installed_at: string
}

export function Skills() {
  const pact = usePact()
  const sse = useSse()
  const trigger = sse.last?.seq ?? 0

  const skills = useQuery(() => pact.skills.list({ limit: 200 }), {
    key: `skills:all:${pact.pactId}`,
    trigger,
  })
  const installed = useQuery(() => pact.skills.installed(), {
    key: `skills:installed:${pact.pactId}`,
    trigger,
  })

  const [inspecting, setInspecting] = useState<string | null>(null)
  const [pendingInstall, setPendingInstall] = useState<SkillRow | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const installedIds = useMemo(
    () => new Set((installed.data ?? []).map((s: InstalledSkill) => s.id)),
    [installed.data],
  )

  const network = useMemo(
    () => (skills.data?.entries ?? []).filter((s: SkillRow) => !installedIds.has(s.id)),
    [skills.data, installedIds],
  )

  return (
    <section data-testid="page-skills" class="mx-auto max-w-[1180px]">
      <header class="mb-6 flex items-end justify-between gap-6 border-b-[0.5px] border-[var(--color-line)] pb-4">
        <h1 class="font-display text-[28px] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
          Skills
        </h1>
        <span class="font-mono text-[12px] text-[var(--color-ink3)]">
          {installed.data?.length ?? 0} installed · {network.length} available
        </span>
      </header>

      <section class="mb-8">
        <div class="mb-3 flex items-baseline justify-between">
          <h2 class="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink)]">
            From the network
          </h2>
          <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
            Install surfaces for approval
          </span>
        </div>
        {skills.loading ? (
          <p class="px-1 py-4 text-[13px] text-[var(--color-ink3)]">Loading…</p>
        ) : network.length === 0 ? (
          <p class="px-1 py-6 text-[13px] text-[var(--color-ink3)]" data-testid="skills-empty">
            No skills from the network yet.
          </p>
        ) : (
          <div class="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {network.map((s: SkillRow, i: number) => (
              <SkillCard
                key={s.id}
                skill={s}
                index={i}
                onInspect={() => setInspecting(s.id)}
                onInstall={() => setPendingInstall(s)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div class="mb-3 flex items-baseline justify-between">
          <h2 class="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink)]">
            Installed locally
          </h2>
        </div>
        {installed.loading ? (
          <p class="px-1 py-4 text-[13px] text-[var(--color-ink3)]">Loading…</p>
        ) : (installed.data ?? []).length === 0 ? (
          <p class="px-1 py-6 text-[13px] text-[var(--color-ink3)]">
            None installed. Accept one from the network above.
          </p>
        ) : (
          <div class="divide-y-[0.5px] divide-[var(--color-line)] border-y-[0.5px] border-[var(--color-line)]">
            {(installed.data ?? []).map((s: InstalledSkill, i: number) => (
              <InstalledRow key={s.id} skill={s} index={i} />
            ))}
          </div>
        )}
      </section>

      {inspecting ? (
        <InspectModal skillId={inspecting} onClose={() => setInspecting(null)} />
      ) : null}

      <ConfirmDialog
        open={pendingInstall !== null}
        title="Install this skill?"
        description={
          pendingInstall
            ? `${pendingInstall.payload.name} v${pendingInstall.payload.version} will be written to ~/.openpact/skills/. Only install skills from peers you trust — skills run with the permissions of the tool that loads them.`
            : ''
        }
        confirmLabel="Install"
        destructive={pendingInstall?.payload.requires_approval ?? false}
        onCancel={() => setPendingInstall(null)}
        onConfirm={async () => {
          if (!pendingInstall) return
          await pact.skills.install(pendingInstall.id)
          setToast(`Installed ${pendingInstall.payload.name} v${pendingInstall.payload.version}.`)
          setPendingInstall(null)
          installed.refetch()
          setTimeout(() => setToast(null), 3000)
        }}
      />

      {toast ? (
        <div
          class="fixed bottom-6 right-6 z-50 border-[0.5px] border-[var(--color-online)] bg-[var(--color-paper)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-online)] shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </section>
  )
}

function SkillCard({
  skill,
  index,
  onInspect,
  onInstall,
}: {
  skill: SkillRow
  index: number
  onInspect: () => void
  onInstall: () => void
}) {
  return (
    <div
      class="animate-etch relative border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/40 p-4"
      style={{ animationDelay: `${index * 25}ms` }}
      data-testid="skill-card"
    >
      <div class="flex items-start gap-3">
        <Sigil kind="skill" size={14} bordered />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <span class="text-[15px] font-medium text-[var(--color-ink)]">
              {skill.payload.name}
            </span>
            <span class="font-mono text-[11px] text-[var(--color-ink3)]">
              v{skill.payload.version}
            </span>
            <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-sigil-skill)]">
              {skill.payload.format}
            </span>
          </div>
          {skill.payload.description ? (
            <p class="mt-1 text-[13px] leading-[1.5] text-[var(--color-ink2)]">
              {skill.payload.description}
            </p>
          ) : null}
          <div class="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink3)]">
            <span class="text-[var(--color-ember)]" title={skill.agent_id}>
              {preferredName(skill)}
            </span>
            <span class="opacity-50">·</span>
            <span class="opacity-70">{skill.id}</span>
          </div>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-2 border-t-[0.5px] border-[var(--color-line)] pt-3">
        <button
          type="button"
          onClick={onInspect}
          class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
        >
          Inspect →
        </button>
        <span class="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
          {skill.payload.requires_approval ? 'Requires approval' : 'Install available'}
        </span>
        <button
          type="button"
          onClick={onInstall}
          data-testid="skill-install"
          class="rounded-sm border-[0.5px] border-[var(--color-ember)] bg-[var(--color-ember-soft)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ember)] transition-colors hover:bg-[var(--color-ember)] hover:text-[var(--color-paper)]"
        >
          Install
        </button>
      </div>
    </div>
  )
}

function InstalledRow({ skill, index }: { skill: InstalledSkill; index: number }) {
  return (
    <div
      class="animate-etch flex items-center gap-3 px-5 py-3"
      style={{ animationDelay: `${index * 25}ms` }}
    >
      <Sigil kind="skill" size={14} bordered />
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span class="text-[14px] font-medium text-[var(--color-ink)]">{skill.name}</span>
          <span class="font-mono text-[11px] text-[var(--color-ink3)]">v{skill.version}</span>
          <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-sigil-skill)]">
            {skill.format}
          </span>
        </div>
        <div class="truncate font-mono text-[10px] text-[var(--color-ink3)]">{skill.path}</div>
      </div>
      <time class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
        {new Date(skill.installed_at).toLocaleDateString()}
      </time>
    </div>
  )
}

function InspectModal({ skillId, onClose }: { skillId: string; onClose: () => void }) {
  const pact = usePact()
  const content = useQuery(() => pact.skills.getContent(skillId), {
    key: `content:${pact.pactId}:${skillId}`,
  })

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-canvas)]/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        class="relative max-h-[80vh] w-[min(720px,90vw)] overflow-auto border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="sticky top-0 flex items-center justify-between gap-4 border-b-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)] px-5 py-3">
          <div>
            <h3 class="font-display text-[18px] font-medium text-[var(--color-ink)]">
              {(content.data as any)?.name ?? 'Skill'}
            </h3>
            <div class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
              {skillId}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            class="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
          >
            Close ✕
          </button>
        </header>
        <div class="px-5 py-4">
          {content.loading ? (
            <p class="text-[13px] text-[var(--color-ink3)]">Loading…</p>
          ) : content.error ? (
            <p class="text-[13px] text-[var(--color-ember)]">
              Failed to load: {content.error.message}
            </p>
          ) : (
            <pre class="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.55] text-[var(--color-ink)]">
              {(content.data as any)?.content ?? ''}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
