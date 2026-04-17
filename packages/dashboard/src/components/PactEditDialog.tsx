import { useEffect, useState } from 'preact/hooks'
import type { OpenPact } from '@openpact/sdk'
import { hostPact } from '../hooks/usePact'
import { clientForPact } from '../lib/client'

/**
 * Unified pact-edit surface. Replaces the two bespoke edit flows
 * that used to live in `/pacts` (alias rename only) and Network
 * (name + purpose only). One dialog, three fields:
 *
 *   - Pact name + purpose: creator-only. Appended via admin.setInfo,
 *     so every peer on the pact converges on the same value. Hidden
 *     for non-creators because the REST route (`PUT /v1/pacts/:id/info`)
 *     returns NOT_INDEXER for them.
 *   - Local alias: per-host. Identifies this pact in the CLI and on
 *     this machine's dashboard only. Other peers keep whatever alias
 *     they chose on their side.
 *
 * Saves run sequentially:
 *   1. admin.setInfo (if name/purpose actually changed and we're creator)
 *   2. host rename (if alias actually changed)
 *
 * On success the dialog reports which side changed via `onSaved` so
 * the caller can re-fetch the pact registry / status / route.
 */
export interface PactEditDialogProps {
  alias: string
  pactName: string | null
  pactPurpose: string | null
  isCreator: boolean
  onCancel: () => void
  onSaved: (result: { newAlias: string | null; infoChanged: boolean }) => void
  /**
   * Optional override — pass a pre-built client when editing a
   * non-current pact from a host-level surface (e.g. the /pacts
   * manager). Defaults to a client bound to the target alias.
   */
  client?: OpenPact
}

const INPUT =
  'w-full rounded-none border-0 border-b-[0.5px] border-[var(--color-line)] bg-transparent px-1 py-2 text-[14px] text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink3)] focus:border-[var(--color-ember)] disabled:cursor-not-allowed disabled:opacity-50'

export function PactEditDialog({
  alias,
  pactName,
  pactPurpose,
  isCreator,
  onCancel,
  onSaved,
  client,
}: PactEditDialogProps) {
  // Bind to the target alias explicitly. `usePact()` would give us
  // whatever the enclosing app-level PactContext points at, which is
  // the current pact — wrong when the /pacts page opens this dialog
  // for a non-current pact.
  const pact = client ?? clientForPact(alias)
  const host = hostPact()
  const [nameDraft, setNameDraft] = useState(pactName ?? '')
  const [purposeDraft, setPurposeDraft] = useState(pactPurpose ?? '')
  const [aliasDraft, setAliasDraft] = useState(alias)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset drafts if the incoming props change while the dialog is open
  // (e.g. an SSE update bumped the pact name out from under us).
  useEffect(() => {
    setNameDraft(pactName ?? '')
    setPurposeDraft(pactPurpose ?? '')
    setAliasDraft(alias)
  }, [alias, pactName, pactPurpose])

  const normName = nameDraft.trim()
  const normPurpose = purposeDraft.trim()
  const normAlias = aliasDraft.trim()
  const currentName = pactName ?? ''
  const currentPurpose = pactPurpose ?? ''
  const nameChanged = isCreator && normName !== currentName
  const purposeChanged = isCreator && normPurpose !== currentPurpose
  const aliasChanged = normAlias !== alias
  const somethingChanged = nameChanged || purposeChanged || aliasChanged
  const aliasValid = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(normAlias) && normAlias.length <= 48

  const submit = async () => {
    if (!somethingChanged || saving) return
    if (aliasChanged && !aliasValid) {
      setError('Alias must be lowercase letters, digits, and hyphens (no leading/trailing hyphen).')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (nameChanged || purposeChanged) {
        await pact.admin.setPactInfo({
          name: nameChanged ? normName || null : undefined,
          purpose: purposeChanged ? normPurpose || null : undefined,
        })
      }
      if (aliasChanged) {
        await host.pacts.rename(alias, normAlias)
      }
      onSaved({
        newAlias: aliasChanged ? normAlias : null,
        infoChanged: nameChanged || purposeChanged,
      })
    } catch (e) {
      setError((e as Error)?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${pactName ?? alias}`}
      class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-canvas)]/85 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        class="relative w-[min(560px,90vw)] border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="border-b-[0.5px] border-[var(--color-line)] px-5 py-3.5">
          <h3 class="font-display text-[18px] font-medium text-[var(--color-ink)]">
            Edit {pactName ?? alias}
          </h3>
        </header>
        <div class="space-y-4 px-5 py-4">
          <section class="space-y-2">
            <div class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
              Synced to every peer
            </div>
            <p class="text-[12px] leading-[1.5] text-[var(--color-ink2)]">
              {isCreator
                ? 'Pact name + purpose live on the shared ledger. Changes replicate to every peer via an admin entry.'
                : 'Only the creator may rename the pact or edit its purpose. The fields below are read-only for you.'}
            </p>
            <label class="block">
              <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
                Pact name
              </span>
              <input
                type="text"
                class={`${INPUT} mt-1`}
                value={nameDraft}
                maxLength={64}
                disabled={!isCreator || saving}
                placeholder={pactName ?? 'Unnamed pact'}
                onInput={(e) => setNameDraft((e.target as HTMLInputElement).value)}
                data-testid="pact-edit-name"
              />
            </label>
            <label class="block">
              <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
                Purpose
              </span>
              <input
                type="text"
                class={`${INPUT} mt-1`}
                value={purposeDraft}
                maxLength={200}
                disabled={!isCreator || saving}
                placeholder={pactPurpose ?? 'No purpose set'}
                onInput={(e) => setPurposeDraft((e.target as HTMLInputElement).value)}
                data-testid="pact-edit-purpose"
              />
            </label>
          </section>

          <div class="border-t-[0.5px] border-[var(--color-line)]" />

          <section class="space-y-2">
            <div class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
              This machine only
            </div>
            <p class="text-[12px] leading-[1.5] text-[var(--color-ink2)]">
              The local alias is how the CLI + this dashboard reference the pact on this computer.
              Other peers keep their own aliases; nothing is published.
            </p>
            <label class="block">
              <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
                Local alias
              </span>
              <input
                type="text"
                class={`${INPUT} mt-1 font-mono text-[13px]`}
                value={aliasDraft}
                maxLength={48}
                disabled={saving}
                onInput={(e) => setAliasDraft((e.target as HTMLInputElement).value)}
                data-testid="pact-edit-alias"
              />
            </label>
          </section>

          {error ? (
            <div class="text-[12px] text-[var(--color-ember)]" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <footer class="flex items-center justify-end gap-2 border-t-[0.5px] border-[var(--color-line)] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            class="rounded-sm border-[0.5px] border-[var(--color-line)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ink)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !somethingChanged}
            data-testid="pact-edit-save"
            class="rounded-sm border-[0.5px] border-[var(--color-online)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-online)] hover:bg-[var(--color-online)]/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
