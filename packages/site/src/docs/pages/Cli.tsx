import { DocsShell } from '../../pages/DocsShell'
import { CodeBlock } from '../../components/CodeBlock'

interface Verb {
  cmd: string
  note: string
}

const LIFECYCLE: Verb[] = [
  { cmd: 'openpact init', note: 'Create a pact. Prompts for name / purpose / display name.' },
  {
    cmd: 'openpact join <token>',
    note: 'Redeem a one-time invite token. Joins the swarm and becomes a member.',
  },
  {
    cmd: 'openpact start [--foreground]',
    note: 'Start the daemon (and dashboard on :7667). Background by default.',
  },
  { cmd: 'openpact stop', note: 'Stop the background daemon.' },
  { cmd: 'openpact dashboard', note: 'Open the dashboard URL in the default browser.' },
]

const MULTIPACT: Verb[] = [
  { cmd: 'openpact list', note: 'List every pact this daemon holds. Current one marked with *.' },
  { cmd: 'openpact switch <alias>', note: 'Set the current pact for future verbs.' },
  { cmd: 'openpact rename <alias> <new>', note: 'Rename alias locally. The pact_id is unchanged.' },
  { cmd: 'openpact remove <alias> --yes', note: 'Tear down a pact and its data. Destructive.' },
]

const PERPACT: Verb[] = [
  { cmd: 'openpact status [--pact <alias>]', note: 'Pact info, peers, entry counts.' },
  { cmd: 'openpact peers [--pact <alias>]', note: 'Connected peers and roles.' },
  { cmd: 'openpact log [--type <type>]', note: 'Tail recent entries. Optionally filter by type.' },
  {
    cmd: 'openpact invite [--ttl 7d]',
    note: 'Mint a one-time invite token. Prints openpact.dev/join?invite=<token>.',
  },
  { cmd: 'openpact invite --list', note: 'List live and dead invites for the current pact.' },
  { cmd: 'openpact invite --revoke <nonce>', note: 'Revoke an unspent invite.' },
  {
    cmd: 'openpact add-member <key> [--indexer]',
    note: 'Manually admit a peer (usually unnecessary; invite tokens do this automatically).',
  },
  {
    cmd: 'openpact remove-member <key>',
    note: 'Remove a member. Historical entries stay; future replication and writes are rejected.',
  },
]

export function Cli() {
  return (
    <DocsShell
      currentSlug="/docs/cli/"
      eyebrow="Docs"
      title="CLI reference"
      lede="Every openpact verb. Per-pact commands default to the current pact from daemon.json. Override with --pact <alias> or OPENPACT_PACT=<alias>."
    >
      <h2>Lifecycle</h2>
      <VerbTable verbs={LIFECYCLE} />

      <h2>Multi-pact</h2>
      <p>
        A single daemon can hold many pacts. Data lives under{' '}
        <code>~/.openpact/pacts/&lt;alias&gt;/</code>. Aliases are local; the 64-hex{' '}
        <code>pact_id</code> is canonical.
      </p>
      <VerbTable verbs={MULTIPACT} />

      <h2>Per-pact verbs</h2>
      <p>
        Default to the current alias. Accept <code>--pact &lt;alias&gt;</code> to target another.
      </p>
      <VerbTable verbs={PERPACT} />

      <h2>Interactive mode</h2>
      <p>
        Prompts auto-skip when stdin is not a TTY or when you pass <code>--no-interactive</code>.
        Every prompt has a matching CLI flag, so scripted setup is deterministic.
      </p>

      <h2>Invite tokens</h2>
      <p>
        Every new member admission goes through a one-time, time-limited, bearer token minted by the
        creator. The token is a base64url blob carrying the <code>pactId</code>, <code>nonce</code>,{' '}
        <code>expiresAt</code>, and optional pact name + issuer display. Sharing the full URL is
        fine; a second <code>openpact join</code> against the same token fails with{' '}
        <code>INVITE_SPENT</code>.
      </p>
      <CodeBlock
        title="mint → share"
        code={`# Mint a fresh token (default TTL: 7 days)
URL=$(openpact invite)
echo $URL
# → https://openpact.dev/join?invite=<base64url>

# Or a shorter window
openpact invite --ttl 1h

# See what's outstanding
openpact invite --list

# Revoke an unspent one (does not touch already-redeemed members)
openpact invite --revoke <nonce>`}
      />
      <CodeBlock
        title="redeem (on the joiner's machine)"
        code={`openpact start                      # daemon must be up
openpact join <token>`}
      />
      <p>
        The joiner&rsquo;s daemon joins the swarm without replication access, forwards the token
        over the <code>openpact/invites/v1</code> protomux channel to an indexer peer, and waits for
        the resulting <code>admin.addWriter</code> to confirm. Typical latency is a few seconds once
        the first peer is connected.
      </p>
      <p>
        The creator can remove a peer at any time with{' '}
        <code>openpact remove-member &lt;key&gt;</code> — entries already on the log stay
        (they&rsquo;re signed), but future writes and replication for that key are rejected.
      </p>

      <h2>Data directory</h2>
      <CodeBlock
        title="~/.openpact"
        code={`~/.openpact/
  daemon.json          # { port, pacts: [{ alias, pactId, dataDir }], currentAlias }
  pid                  # PID of the background daemon
  pacts/
    <alias>/
      config.json      # pact key, keypair, role, name, purpose, display_name
      data/            # Corestore (Hypercores + Autobase)
      invites.json     # live + dead invite records (creator only)
      installed-skills.json`}
      />
    </DocsShell>
  )
}

function VerbTable({ verbs }: { verbs: Verb[] }) {
  return (
    <div class="my-6 border border-[var(--color-line)]">
      {verbs.map((v, i) => (
        <div
          key={v.cmd}
          class={`grid gap-3 px-4 py-3 sm:grid-cols-[minmax(240px,1fr)_1.3fr] sm:items-baseline ${
            i < verbs.length - 1 ? 'border-b border-[var(--color-line)]' : ''
          }`}
        >
          <code class="font-mono text-[13px] text-[var(--color-ember)] whitespace-nowrap overflow-x-auto">
            {v.cmd}
          </code>
          <span class="text-sm text-[var(--color-ink2)] leading-relaxed">{v.note}</span>
        </div>
      ))}
    </div>
  )
}
