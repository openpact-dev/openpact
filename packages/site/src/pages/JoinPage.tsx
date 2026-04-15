import { useMemo } from 'preact/hooks'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { CodeBlock } from '../components/CodeBlock'
import { WatchingEye, CornerBracket } from '../components/WatchingEye'

/**
 * Mirror of the CLI's rule at packages/cli/src/commands/join.ts:19
 * and the daemon route at packages/daemon/src/api/routes/pacts.ts:27.
 * Join keys are the 64-hex canonical pactId.
 */
const KEY_PATTERN = /^[0-9a-f]{64}$/i

interface ParsedInvite {
  key: string | null
  pact: string | null
  from: string | null
  raw: { key: string | null; rejected: boolean }
}

function parseInvite(search: string): ParsedInvite {
  const p = new URLSearchParams(search)
  const rawKey = p.get('key')?.trim() ?? null
  const key = rawKey && KEY_PATTERN.test(rawKey) ? rawKey.toLowerCase() : null
  return {
    key,
    pact: p.get('pact')?.trim() || null,
    from: p.get('from')?.trim() || null,
    raw: { key: rawKey, rejected: !!rawKey && !key },
  }
}

const INSTALL = `npm install -g @openpact/cli`

export function JoinPage() {
  const invite = useMemo(
    () => parseInvite(typeof window === 'undefined' ? '' : window.location.search),
    [],
  )

  const pactLabel = invite.pact ?? 'the pact'
  const joinCmd = invite.key ? `openpact join ${invite.key}` : 'openpact join <key>'

  return (
    <>
      <Header current="join" />

      <main class="relative z-10">
        <section class="mx-auto max-w-[860px] px-6 pt-14 pb-10">
          <div class="mb-4 flex items-center gap-3 animate-drift">
            <WatchingEye size={40} />
            <div class="eyebrow">An invitation arrives</div>
          </div>

          {invite.key ? (
            <ValidInvite
              pactKey={invite.key}
              pactLabel={pactLabel}
              from={invite.from}
              joinCmd={joinCmd}
            />
          ) : (
            <InvalidInvite rejected={invite.raw.rejected} />
          )}
        </section>
      </main>

      <Footer />
    </>
  )
}

function ValidInvite({
  pactKey,
  pactLabel,
  from,
  joinCmd,
}: {
  pactKey: string
  pactLabel: string
  from: string | null
  joinCmd: string
}) {
  return (
    <>
      <h1 class="font-display text-[clamp(2.4rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-tight text-[var(--color-ink)] animate-etch">
        You&rsquo;ve been invited to <span class="text-[var(--color-ember)]">{pactLabel}</span>.
      </h1>
      <p class="mt-5 text-lg text-[var(--color-ink2)] leading-relaxed">
        {from ? (
          <>
            <span class="font-display italic text-[var(--color-ink)]">{from}</span> wants you in the
            pact. Three steps and you&rsquo;re in.
          </>
        ) : (
          <>A pact is waiting for you. Three steps and you&rsquo;re in.</>
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

        <Step n="II" title="Join the pact">
          <p class="text-[var(--color-ink2)] mb-3 leading-relaxed">
            Run this command. Your key is pre-filled.
          </p>
          <CodeBlock title="~/openpact — join" code={joinCmd} />
          <p class="mt-3 text-sm text-[var(--color-ink3)] leading-relaxed">
            You&rsquo;ll join as a <strong class="text-[var(--color-ink)]">reader</strong>. The
            pact&rsquo;s creator can promote you to writer after your daemon is running.
          </p>
        </Step>

        <Step n="III" title="Summon the daemon" last>
          <p class="text-[var(--color-ink2)] mb-3 leading-relaxed">
            Start the daemon. It will find the pact&rsquo;s peers over the DHT.
          </p>
          <CodeBlock title="~/openpact — start" code="openpact start" />
        </Step>
      </div>

      <div class="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="text-sm text-[var(--color-ink3)]">
          <span class="smallcaps mr-2">Pact key</span>
          <span class="font-mono text-[12px] text-[var(--color-ink2)]">
            {pactKey.slice(0, 16)}…{pactKey.slice(-8)}
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

function InvalidInvite({ rejected }: { rejected: boolean }) {
  return (
    <>
      <h1 class="font-display text-4xl font-medium leading-tight text-[var(--color-ink)]">
        {rejected ? 'That invite key looks wrong.' : 'No invite in the link.'}
      </h1>
      <p class="mt-4 text-lg text-[var(--color-ink2)] leading-relaxed">
        {rejected
          ? 'A join key is a 64-character hexadecimal string. The one in your URL doesn\u2019t match.'
          : 'Invite links look like '}
        {!rejected && (
          <code class="font-mono text-sm text-[var(--color-ember)]">
            openpact.dev/join?key=&lt;64-hex&gt;
          </code>
        )}
      </p>
      <p class="mt-3 text-[var(--color-ink2)] leading-relaxed">
        Ask whoever sent you this link to run{' '}
        <code class="font-mono text-sm text-[var(--color-ember)]">openpact invite</code> and paste
        the output into a fresh link. Or start your own pact.
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
