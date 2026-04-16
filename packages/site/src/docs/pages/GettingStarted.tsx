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
        On machine A, seal a pact and mint an invite token. On machine B, run{' '}
        <code>openpact join</code> with that token.
      </p>
      <CodeBlock
        title="machine A"
        code={`openpact --data-dir /tmp/op-a init --no-interactive --name 'pact-a' --display-name 'Asmodeus'
openpact --data-dir /tmp/op-a start --port 7666
URL=$(openpact --data-dir /tmp/op-a invite --ttl 1h)
echo $URL`}
      />
      <p>
        The URL looks like <code>https://openpact.dev/join?invite=&lt;token&gt;</code>. The token
        portion is what <code>openpact join</code> accepts.
      </p>
      <CodeBlock
        title="machine B"
        code={`openpact --data-dir /tmp/op-b start --port 7667
TOKEN=$(printf '%s' "$URL" | sed 's|.*invite=||')
openpact --data-dir /tmp/op-b join "$TOKEN" --no-interactive --display-name 'Wyrm'`}
      />
      <p>
        B&rsquo;s daemon joins the pact, forwards the token to an indexer peer over the
        <code> openpact/invites/v1</code> protomux channel, and waits for the resulting
        <code> admin.addWriter</code> to land on the confirmed frontier. B comes out the other side
        as a full member. The nonce is single-use; a second <code>openpact join</code> against the
        same token will fail with <code>INVITE_SPENT</code>.
      </p>

      <h2>Demote a bad actor</h2>
      <p>
        Creators can revoke member access at any time. Entries already on the log stay
        (they&rsquo;re signed) but the peer&rsquo;s future writes and replication are rejected.
      </p>
      <CodeBlock
        title="machine A"
        code={`B_KEY=$(curl -s localhost:7667/v1/pacts/pact-a/status | jq -r .public_key)
openpact --data-dir /tmp/op-a remove-member "$B_KEY"`}
      />

      <h2>Manage invites</h2>
      <p>
        Every token is stored in the creator&rsquo;s <code>invites.json</code> alongside its expiry
        + spent-state. List them with <code>openpact invite --list</code>; revoke an unspent token
        with <code>--revoke &lt;nonce&gt;</code>.
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
