import { DocsShell } from '../../pages/DocsShell'
import { CodeBlock } from '../../components/CodeBlock'

interface Verb {
  cmd: string
  note: string
}

const LIFECYCLE: Verb[] = [
  { cmd: 'openpact init', note: 'Create a pact. Prompts for name / purpose / display name.' },
  { cmd: 'openpact join <key>', note: 'Join an existing pact. Prompts for display-name + alias.' },
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
  { cmd: 'openpact invite', note: 'Print the 64-hex join key.' },
  {
    cmd: 'openpact add-writer <key> [--indexer]',
    note: 'Promote a peer to writer (creator only).',
  },
  { cmd: 'openpact remove-writer <key>', note: 'Demote a writer (creator only).' },
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
