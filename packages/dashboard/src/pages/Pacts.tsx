import { useState } from 'preact/hooks'
import { route } from 'preact-router'
import { hostPact } from '../hooks/usePact'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PactEditDialog } from '../components/PactEditDialog'
import { Sigil } from '../components/Sigil'

interface PactSnapshot {
  alias: string
  pact_id: string
  pact_name: string | null
  pact_purpose: string | null
  display_name: string | null
  role: string | null
  is_current: boolean
  added_at: string
}

interface Props {
  current: string | null
  pacts: PactSnapshot[]
  onChange: () => void
}

const INPUT =
  'w-full rounded-none border-0 border-b-[0.5px] border-[var(--color-line)] bg-transparent px-1 py-2 text-[14px] text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink3)] focus:border-[var(--color-ember)]'

/**
 * /pacts — manage every pact on this host. The PactSwitcher in the
 * sidebar handles fast switching; this page is the authoritative
 * surface for create / join / rename / leave.
 */
export function Pacts({ current, pacts, onChange }: Props) {
  const host = hostPact()
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [removingAlias, setRemovingAlias] = useState<string | null>(null)
  const [editingAlias, setEditingAlias] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const editing = editingAlias ? (pacts.find((p) => p.alias === editingAlias) ?? null) : null

  const popToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <section data-testid="page-pacts" class="mx-auto max-w-[1180px]">
      <header class="mb-6 flex items-end justify-between gap-6 border-b-[0.5px] border-[var(--color-line)] pb-4">
        <h1 class="font-display text-[28px] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
          Pacts
        </h1>
        <div class="flex items-center gap-2">
          <button
            type="button"
            data-testid="join-pact"
            onClick={() => setJoining(true)}
            class="rounded-sm border-[0.5px] border-[var(--color-line)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
          >
            Join with key
          </button>
          <button
            type="button"
            data-testid="create-pact"
            onClick={() => setCreating(true)}
            class="rounded-sm border-[0.5px] border-[var(--color-ember)] bg-[var(--color-ember-soft)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)] hover:bg-[var(--color-ember)] hover:text-[#fff]"
          >
            New pact
          </button>
        </div>
      </header>

      {pacts.length === 0 ? (
        <div class="px-1 py-12 text-center text-[14px] text-[var(--color-ink3)]">
          No pacts yet. Use{' '}
          <code class="rounded-[2px] border border-[var(--color-line)] bg-[var(--color-ember-soft)] px-[0.35rem] py-[0.1rem] font-mono text-[12px] text-[var(--color-ember)]">
            openpact init
          </code>{' '}
          in a terminal, or click <strong>New pact</strong> above.
        </div>
      ) : (
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="pacts-grid">
          {pacts.map((p) => (
            <PactCard
              key={p.alias}
              pact={p}
              isCurrent={p.alias === current}
              onSwitch={async () => {
                if (p.alias === current) return
                await host.pacts.switch(p.alias)
                if (typeof localStorage !== 'undefined') {
                  localStorage.setItem('openpact:current-pact', p.alias)
                }
                onChange()
                route('/')
              }}
              onEdit={() => setEditingAlias(p.alias)}
              onRemove={() => setRemovingAlias(p.alias)}
            />
          ))}
        </div>
      )}

      <CreatePactDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(alias) => {
          popToast(`Created ${alias}`)
          setCreating(false)
          onChange()
        }}
      />
      <JoinPactDialog
        open={joining}
        onClose={() => setJoining(false)}
        onJoined={(alias) => {
          popToast(`Joined ${alias}`)
          setJoining(false)
          onChange()
        }}
      />

      <ConfirmDialog
        open={removingAlias !== null}
        title={`Leave ${removingAlias ?? ''}?`}
        description={
          removingAlias
            ? `This deletes the local data for "${removingAlias}". Other agents keep their copy of the pact; you can re-join later by redeeming a fresh invite.`
            : ''
        }
        confirmLabel="Leave + delete"
        destructive
        requireTyping={removingAlias ?? undefined}
        onCancel={() => setRemovingAlias(null)}
        onConfirm={async () => {
          if (!removingAlias) return
          await host.pacts.remove(removingAlias)
          popToast(`Removed ${removingAlias}`)
          setRemovingAlias(null)
          onChange()
        }}
      />

      {editing ? (
        <PactEditDialog
          alias={editing.alias}
          pactName={editing.pact_name}
          pactPurpose={editing.pact_purpose}
          isCreator={editing.role === 'creator'}
          onCancel={() => setEditingAlias(null)}
          onSaved={({ newAlias, infoChanged }) => {
            const parts: string[] = []
            if (infoChanged) parts.push('Pact info updated')
            if (newAlias) parts.push(`Alias → ${newAlias}`)
            popToast(parts.join(' · ') || 'Saved')
            // If the alias changed and this was the current pact,
            // re-pin localStorage so the sidebar + next reload land
            // on the new alias instead of falling back to daemon state.
            if (newAlias && editing.alias === current && typeof localStorage !== 'undefined') {
              localStorage.setItem('openpact:current-pact', newAlias)
            }
            setEditingAlias(null)
            onChange()
          }}
        />
      ) : null}

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

function PactCard({
  pact,
  isCurrent,
  onSwitch,
  onEdit,
  onRemove,
}: {
  pact: PactSnapshot
  isCurrent: boolean
  onSwitch: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <div
      data-testid={`pact-card-${pact.alias}`}
      class={`relative border-[0.5px] px-5 py-4 ${
        isCurrent
          ? 'border-[var(--color-ember)] bg-[var(--color-ember-soft)]'
          : 'border-[var(--color-line)] bg-[var(--color-paper)]/40'
      }`}
    >
      <div class="flex items-start gap-3">
        <Sigil kind="knowledge" size={14} bordered />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <span class="text-[15px] font-medium text-[var(--color-ink)]">
              {pact.pact_name ?? <span class="italic text-[var(--color-ink3)]">unnamed</span>}
            </span>
            {isCurrent ? (
              <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)]">
                current
              </span>
            ) : null}
          </div>
          {pact.pact_purpose ? (
            <p class="mt-1 text-[13px] leading-[1.5] text-[var(--color-ink2)]">
              {pact.pact_purpose}
            </p>
          ) : null}
          <div class="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
            <span class="text-[var(--color-ink2)]">{pact.alias}</span>
            <span class="opacity-50">·</span>
            <span>{pact.role ?? '—'}</span>
            <span class="opacity-50">·</span>
            <span class="opacity-70">{pact.pact_id.slice(0, 12)}…</span>
          </div>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-2 border-t-[0.5px] border-[var(--color-line)] pt-3">
        {!isCurrent ? (
          <button
            type="button"
            data-testid={`switch-${pact.alias}`}
            onClick={onSwitch}
            class="rounded-sm border-[0.5px] border-[var(--color-online)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-online)] hover:bg-[var(--color-online)]/10"
          >
            Switch to
          </button>
        ) : null}
        <button
          type="button"
          data-testid={`edit-${pact.alias}`}
          onClick={onEdit}
          class="rounded-sm border-[0.5px] border-[var(--color-line)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
        >
          Edit
        </button>
        <button
          type="button"
          data-testid={`remove-${pact.alias}`}
          onClick={onRemove}
          class="ml-auto rounded-sm border-[0.5px] border-[var(--color-line)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
        >
          Leave
        </button>
      </div>
    </div>
  )
}

function CreatePactDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (alias: string) => void
}) {
  const host = hostPact()
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const reset = () => {
    setName('')
    setPurpose('')
    setDisplayName('')
    setError(null)
    setSaving(false)
  }

  const submit = async () => {
    if (!name.trim()) {
      setError('Pact name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await host.pacts.create({
        name: name.trim(),
        purpose: purpose.trim() || null,
        display_name: displayName.trim() || null,
      })
      reset()
      onCreated(res.alias)
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setSaving(false)
    }
  }

  return (
    <Modal title="Create a new pact" onClose={onClose}>
      <Field
        label="Pact name"
        value={name}
        onInput={setName}
        placeholder="The Obsidian Accord"
        max={64}
      />
      <Field
        label="Purpose"
        value={purpose}
        onInput={setPurpose}
        placeholder="a pact among daemons"
        max={200}
      />
      <Field
        label="Agent display name"
        value={displayName}
        onInput={setDisplayName}
        placeholder="Cinnabar"
        max={64}
      />
      {error ? <div class="text-[12px] text-[var(--color-ember)]">{error}</div> : null}
      <ModalFooter
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel={saving ? 'Sealing…' : 'Seal pact'}
        disabled={saving}
        confirmTestid="create-pact-submit"
      />
    </Modal>
  )
}

function JoinPactDialog({
  open,
  onClose,
  onJoined,
}: {
  open: boolean
  onClose: () => void
  onJoined: (alias: string) => void
}) {
  const host = hostPact()
  const [key, setKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const submit = async () => {
    if (!/^[0-9a-f]{64}$/i.test(key.trim())) {
      setError('Pact key must be 64 hex chars.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Alias omitted on purpose — the daemon slugs `joined-<first8>`
      // of the pact key. Users can rename it after the fact via the
      // pact card's menu; forcing a choice here just slows the path
      // through the dialog.
      const res = await host.pacts.join({
        key: key.trim(),
        display_name: displayName.trim() || null,
      })
      setKey('')
      setDisplayName('')
      setSaving(false)
      onJoined(res.alias)
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setSaving(false)
    }
  }

  return (
    <Modal title="Join an existing pact" onClose={onClose}>
      <Field label="Pact key (64 hex)" value={key} onInput={setKey} placeholder="0000…" mono />
      <Field
        label="Agent display name"
        value={displayName}
        onInput={setDisplayName}
        placeholder="Cinnabar"
        max={64}
      />
      {error ? <div class="text-[12px] text-[var(--color-ember)]">{error}</div> : null}
      <ModalFooter
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel={saving ? 'Joining…' : 'Join'}
        disabled={saving}
        confirmTestid="join-pact-submit"
      />
    </Modal>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: preact.ComponentChildren
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-canvas)]/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        class="relative w-[min(560px,90vw)] border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="border-b-[0.5px] border-[var(--color-line)] px-5 py-3.5">
          <h3 class="font-display text-[18px] font-medium text-[var(--color-ink)]">{title}</h3>
        </header>
        <div class="space-y-3 px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function ModalFooter({
  onCancel,
  onConfirm,
  confirmLabel,
  disabled,
  confirmTestid,
}: {
  onCancel: () => void
  onConfirm: () => void | Promise<void>
  confirmLabel: string
  disabled: boolean
  confirmTestid?: string
}) {
  return (
    <footer class="-mx-5 mt-2 flex items-center justify-end gap-2 border-t-[0.5px] border-[var(--color-line)] px-5 pt-3">
      <button
        type="button"
        onClick={onCancel}
        class="rounded-sm border-[0.5px] border-[var(--color-line)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ink)]"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void onConfirm()}
        disabled={disabled}
        data-testid={confirmTestid}
        class="rounded-sm border-[0.5px] border-[var(--color-online)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-online)] hover:bg-[var(--color-online)]/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {confirmLabel}
      </button>
    </footer>
  )
}

function Field({
  label,
  value,
  onInput,
  placeholder,
  max,
  mono,
}: {
  label: string
  value: string
  onInput: (v: string) => void
  placeholder?: string
  max?: number
  mono?: boolean
}) {
  return (
    <label class="block">
      <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        maxLength={max}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        class={`${INPUT} mt-1${mono ? ' font-mono text-[12px]' : ''}`}
      />
    </label>
  )
}
