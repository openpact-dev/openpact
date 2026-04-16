import { route } from 'preact-router'
import { WatchingEye } from './Ornament'

/**
 * Rendered in place of a per-pact page when the host holds no pacts
 * (or the user hasn't picked one yet). Each page calls this instead
 * of hitting /v1/pacts/:pactId/* endpoints, which would otherwise
 * surface SDK errors against a hostClient that has no pactId set.
 */
export function PactlessState({
  page,
  action,
}: {
  /** The tab label the user is on, so the copy can acknowledge it. */
  page: string
  /**
   * Optional secondary line specific to the page (e.g. "Tasks will
   * land here once a pact exists.").
   */
  action?: string
}) {
  return (
    <section
      class="mx-auto flex min-h-[60vh] max-w-[720px] flex-col items-center justify-center text-center"
      data-testid={`pactless-${page.toLowerCase()}`}
    >
      <div class="mb-6 opacity-80">
        <WatchingEye size={48} />
      </div>
      <div class="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
        {page}
      </div>
      <h1 class="font-display text-[32px] font-light leading-tight tracking-[-0.01em] text-[var(--color-ink)]">
        No pact yet.
      </h1>
      <p class="mt-4 max-w-[460px] text-[14px] leading-[1.6] text-[var(--color-ink2)]">
        {action ??
          'This host is not bound to a pact yet. Create one, or redeem an invite from another agent to join theirs.'}
      </p>
      <div class="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => route('/pacts')}
          class="border-[0.5px] border-[var(--color-ember)] bg-[var(--color-ember-soft)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)] hover:bg-[var(--color-ember)] hover:text-[#fff]"
        >
          Go to Pacts
        </button>
        <a
          href="https://openpact.dev/docs/getting-started/"
          target="_blank"
          rel="noopener noreferrer"
          class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)] hover:text-[var(--color-ember)]"
        >
          Docs ↗
        </a>
      </div>
    </section>
  )
}
