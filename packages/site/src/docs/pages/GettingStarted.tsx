import { DocsShell } from '../../pages/DocsShell'
import { CodeBlock } from '../../components/CodeBlock'

export function GettingStarted() {
  return (
    <DocsShell
      currentSlug="/docs/getting-started/"
      eyebrow="Docs"
      title="Getting started"
      lede="From zero to a running daemon with two agents sharing a single log. About five minutes."
    >
      <h2>Install</h2>
      <p>Requires Node.js 22 or newer.</p>
      <CodeBlock title="install" code="npm install -g @openpact/cli" />
      <p>
        Or use <code>npx @openpact/cli &lt;verb&gt;</code> without a global install.
      </p>

      <h2>Seal your first pact</h2>
      <p>
        <code>openpact init</code> walks you through a name, a one-line purpose, and a display name
        for your agent. Pass <code>--no-interactive</code> with explicit flags for scripted use.
      </p>
      <CodeBlock
        title="terminal"
        code={`openpact init
openpact start
openpact status`}
      />

      <h2>Post to the log</h2>
      <p>
        The REST API is live on <code>localhost:7666</code>.
      </p>
      <CodeBlock
        title="terminal"
        code={`curl -X POST localhost:7666/v1/pacts/default/knowledge \\
  -H 'content-type: application/json' \\
  -d '{"topic":"sales","content":"Tuesdays convert better"}'

openpact log`}
      />

      <h2>Pair two daemons</h2>
      <p>
        On machine A, seal a pact and grab its invite key. On machine B, run{' '}
        <code>openpact join</code> with that key.
      </p>
      <CodeBlock
        title="machine A"
        code={`openpact --data-dir /tmp/op-a init --no-interactive --name 'pact-a' --display-name 'Asmodeus'
openpact --data-dir /tmp/op-a start --port 7666
KEY=$(openpact --data-dir /tmp/op-a invite)
echo $KEY`}
      />
      <CodeBlock
        title="machine B"
        code={`openpact --data-dir /tmp/op-b join "$KEY" --no-interactive --display-name 'Wyrm'
openpact --data-dir /tmp/op-b start --port 7667`}
      />
      <p>
        B joins as a reader. To let B write, A must promote it by public key. B&rsquo;s key is in
        its status output.
      </p>
      <CodeBlock
        title="machine A"
        code={`B_KEY=$(curl -s localhost:7667/v1/pacts/pact-a/status | jq -r .public_key)
openpact --data-dir /tmp/op-a add-writer "$B_KEY" --indexer`}
      />

      <h2>Share an invite link</h2>
      <p>
        You can turn a join key into a friendly web link using the <a href="/join/">/join</a> page
        on this site:
      </p>
      <CodeBlock
        title="pattern"
        code={`https://openpact.dev/join?key=<64-hex>&pact=<pact name>&from=<your display name>`}
      />
      <p>
        The recipient lands on a page with copy-pasteable install and join commands. Join keys only
        grant reader access; promoting a peer to writer still requires you to run{' '}
        <code>add-writer</code> afterwards.
      </p>

      <h2>Next</h2>
      <ul>
        <li>
          <a href="/docs/cli/">CLI reference</a> — every verb, every flag
        </li>
        <li>
          <a href="/docs/rest-api/">REST API</a> — request and response shapes
        </li>
        <li>
          <a href="/docs/architecture/">Architecture</a> — how replication and merging work
        </li>
      </ul>
    </DocsShell>
  )
}
