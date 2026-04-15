import { useMemo } from 'preact/hooks'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { CodeBlock } from '../components/CodeBlock'
import { WatchingEye, CornerBracket } from '../components/WatchingEye'

/*
 * One-time invite tokens. The token is a base64url-encoded JSON object
 * with {v:1, pactId, nonce, expiresAt, pactName?, issuerDisplay?}.
 * Single-use is enforced server-side by the `_invites/<nonce>` view
 * key; we just decode here for display. No signature check — the
 * joiner's daemon (and ultimately the creator's) validate.
 *
 * Mirrors packages/daemon/src/invites.ts decodeToken().
 */

interface DecodedToken {
  pactId: string
  nonce: string
  expiresAt: string
  pactName: string | null
  issuerDisplay: string | null
}

type ParseResult =
  | { kind: 'ok'; token: string; decoded: DecodedToken }
  | { kind: 'missing' }
  | { kind: 'malformed'; reason: string }
  | { kind: 'expired'; decoded: DecodedToken }

function parseInvite(search: string): ParseResult {
  const p = new URLSearchParams(search)
  const token = p.get('invite')?.trim()
  if (!token) return { kind: 'missing' }
  let json: string
  try {
    json = atob(token.replace(/-/g, '+').replace(/_/g, '/'))
  } catch {
    return { kind: 'malformed', reason: 'token is not valid base64url' }
  }
  let obj: unknown
  try {
    obj = JSON.parse(json)
  } catch {
    return { kind: 'malformed', reason: 'token payload is not valid JSON' }
  }
  if (!obj || typeof obj !== 'object') {
    return { kind: 'malformed', reason: 'token payload is not an object' }
  }
  const o = obj as { v?: number } & Partial<DecodedToken>
  if (o.v !== 1) return { kind: 'malformed', reason: `unsupported token version ${String(o.v)}` }
  if (typeof o.pactId !== 'string' || !/^[0-9a-f]{64}$/i.test(o.pactId)) {
    return { kind: 'malformed', reason: 'token.pactId is missing or malformed' }
  }
  if (typeof o.nonce !== 'string' || !/^[0-9a-f]{48}$/i.test(o.nonce)) {
    return { kind: 'malformed', reason: 'token.nonce is missing or malformed' }
  }
  if (typeof o.expiresAt !== 'string' || Number.isNaN(Date.parse(o.expiresAt))) {
    return { kind: 'malformed', reason: 'token.expiresAt is missing or malformed' }
  }
  const decoded: DecodedToken = {
    pactId: o.pactId,
    nonce: o.nonce,
    expiresAt: o.expiresAt,
    pactName: typeof o.pactName === 'string' ? o.pactName : null,
    issuerDisplay: typeof o.issuerDisplay === 'string' ? o.issuerDisplay : null,
  }
  if (Date.parse(decoded.expiresAt) <= Date.now()) {
    return { kind: 'expired', decoded }
  }
  return { kind: 'ok', token, decoded }
}

function formatRelative(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  const abs = Math.abs(ms)
  const future = ms >= 0
  const units: Array<[string, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ]
  for (const [label, div] of units) {
    if (abs >= div) {
      const n = Math.round(abs / div)
      const plural = n === 1 ? '' : 's'
      return future ? `in ${n} ${label}${plural}` : `${n} ${label}${plural} ago`
    }
  }
  return future ? 'any moment' : 'just now'
}

const INSTALL = `npm install -g @openpact/cli`

export function JoinPage() {
  const parsed = useMemo(
    () => parseInvite(typeof window === 'undefined' ? '' : window.location.search),
    [],
  )

  return (
    <>
      <Header current="join" />

      <main class="relative z-10">
        <section class="mx-auto max-w-[860px] px-6 pt-14 pb-10">
          <div class="mb-4 flex items-center gap-3 animate-drift">
            <WatchingEye size={40} />
            <div class="eyebrow">An invitation arrives</div>
          </div>

          {parsed.kind === 'ok' ? (
            <ValidInvite decoded={parsed.decoded} token={parsed.token} />
          ) : parsed.kind === 'expired' ? (
            <ExpiredInvite decoded={parsed.decoded} />
          ) : (
            <InvalidInvite reason={parsed.kind === 'malformed' ? parsed.reason : null} />
          )}
        </section>
      </main>

      <Footer />
    </>
  )
}

function ValidInvite({ decoded, token }: { decoded: DecodedToken; token: string }) {
  const pactLabel = decoded.pactName ?? 'the pact'
  const joinCmd = `openpact join ${token}`
  const expiresIn = formatRelative(decoded.expiresAt)

  return (
    <>
      <h1 class="font-display text-[clamp(2.4rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-tight text-[var(--color-ink)] animate-etch">
        You&rsquo;re invited to <span class="text-[var(--color-ember)]">{pactLabel}</span>.
      </h1>
      <p class="mt-5 text-lg text-[var(--color-ink2)] leading-relaxed">
        {decoded.issuerDisplay ? (
          <>
            <span class="font-display italic text-[var(--color-ink)]">{decoded.issuerDisplay}</span>{' '}
            minted this invite {expiresIn === 'any moment' ? 'moments ago' : ''}. One-time use.
            Expires {expiresIn}.
          </>
        ) : (
          <>
            One-time invite token. Expires {expiresIn}. Once you redeem, you&rsquo;re a writer on
            the pact.
          </>
        )}
      </p>

      <div class="relative mt-10 border border-[var(--color-line)] bg-[var(--color-paper)]/70 p-6">
        <CornerBracket pos="tl" />
        <CornerBracket pos="tr" />
        <CornerBracket pos="bl" />
        <CornerBracket pos="br" />

        <Step n="I" title="Install OpenPact">
          <p class="text-[var(--color-ink2)] mb-3 leading-relaxed">
            OpenPact runs as a local daemon. You need{' '}
            <a
              class="text-[var(--color-ember)] hover:underline"
              href="https://nodejs.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Node.js 22 or newer
            </a>
            .
          </p>
          <CodeBlock title="install" code={INSTALL} />
        </Step>

        <Step n="II" title="Start the daemon">
          <p class="text-[var(--color-ink2)] mb-3 leading-relaxed">
            Initialise your local host (once) then start the daemon.
          </p>
          <CodeBlock title="quickstart" code={'openpact init\nopenpact start'} />
        </Step>

        <Step n="III" title="Redeem the invite" last>
          <p class="text-[var(--color-ink2)] mb-3 leading-relaxed">
            This command joins the swarm and promotes you to a writer in one step. The token is
            single-use; don&rsquo;t share this page.
          </p>
          <CodeBlock title="join" code={joinCmd} />
          <p class="mt-3 text-sm text-[var(--color-ink3)] leading-relaxed">
            Your daemon finds an indexer peer, hands it the token + your writer key, and the
            indexer issues an <code class="font-mono text-[var(--color-ember)]">admin.addWriter</code>{' '}
            for you. Expect promotion within a few seconds of the first peer connection.
          </p>
        </Step>
      </div>

      <div class="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="text-sm text-[var(--color-ink3)]">
          <span class="smallcaps mr-2">Nonce</span>
          <span class="font-mono text-[12px] text-[var(--color-ink2)]">
            {decoded.nonce.slice(0, 8)}…{decoded.nonce.slice(-4)}
          </span>
        </div>
        <a
          href="/docs/getting-started/"
          class="group inline-flex items-center gap-2 text-sm text-[var(--color-ember)] hover:underline"
        >
          New to OpenPact? Read the overview{' '}
          <span class="transition-transform group-hover:translate-x-0.5">→</span>
        </a>
      </div>
    </>
  )
}

function ExpiredInvite({ decoded }: { decoded: DecodedToken }) {
  const pactLabel = decoded.pactName ?? 'that pact'
  return (
    <>
      <h1 class="font-display text-4xl font-medium leading-tight text-[var(--color-ink)]">
        This invite has expired.
      </h1>
      <p class="mt-4 text-lg text-[var(--color-ink2)] leading-relaxed">
        The invite to {pactLabel} was valid until{' '}
        <span class="font-mono text-[var(--color-ink)]">{decoded.expiresAt}</span>. Ask{' '}
        {decoded.issuerDisplay ?? 'the creator'} for a fresh one — they can mint a new token with{' '}
        <code class="font-mono text-sm text-[var(--color-ember)]">openpact invite</code>.
      </p>
      <div class="mt-8 flex gap-3">
        <a
          href="/docs/getting-started/"
          class="inline-flex items-center gap-2 border border-[var(--color-line)] px-5 py-2.5 text-sm font-medium tracking-wide text-[var(--color-ink)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
        >
          Getting started
        </a>
      </div>
    </>
  )
}

function InvalidInvite({ reason }: { reason: string | null }) {
  return (
    <>
      <h1 class="font-display text-4xl font-medium leading-tight text-[var(--color-ink)]">
        {reason ? 'That invite link looks wrong.' : 'No invite in the link.'}
      </h1>
      <p class="mt-4 text-lg text-[var(--color-ink2)] leading-relaxed">
        {reason ? (
          <>
            The URL must carry a valid{' '}
            <code class="font-mono text-sm text-[var(--color-ember)]">?invite=&lt;token&gt;</code>{' '}
            parameter. Details:{' '}
            <span class="font-mono text-sm text-[var(--color-ink)]">{reason}</span>.
          </>
        ) : (
          <>
            Invite links look like{' '}
            <code class="font-mono text-sm text-[var(--color-ember)]">
              openpact.dev/join?invite=&lt;token&gt;
            </code>
            .
          </>
        )}
      </p>
      <p class="mt-3 text-[var(--color-ink2)] leading-relaxed">
        Ask whoever sent you this link to run{' '}
        <code class="font-mono text-sm text-[var(--color-ember)]">openpact invite</code> and paste
        the URL it prints. Or start your own pact.
      </p>
      <div class="mt-8 flex gap-3">
        <a
          href="/"
          class="inline-flex items-center gap-2 bg-[var(--color-ember)] px-5 py-2.5 text-sm font-medium tracking-wide text-[var(--color-paper)]"
        >
          Home
        </a>
        <a
          href="/docs/getting-started/"
          class="inline-flex items-center gap-2 border border-[var(--color-line)] px-5 py-2.5 text-sm font-medium tracking-wide text-[var(--color-ink)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
        >
          Getting started
        </a>
      </div>
    </>
  )
}

function Step({
  n,
  title,
  children,
  last,
}: {
  n: string
  title: string
  children: preact.ComponentChildren
  last?: boolean
}) {
  return (
    <div class={last ? '' : 'mb-8 pb-8 border-b border-dashed border-[var(--color-line)]'}>
      <div class="mb-2 flex items-baseline gap-3">
        <span class="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-ember)]">
          {n}
        </span>
        <h2 class="font-display text-xl font-medium leading-tight text-[var(--color-ink)]">
          {title}
        </h2>
      </div>
      {children}
    </div>
  )
}
