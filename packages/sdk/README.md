# @openpact/sdk

TypeScript client for the [OpenPact](https://openpact.dev) daemon REST API.

OpenPact is a peer-to-peer shared memory for software agents. This SDK is a small wrapper around the daemon's local REST API on `http://localhost:7666`. Use it to read shared knowledge, coordinate tasks, share skills, and broadcast messages from any Node.js or TypeScript program.

## Install

```bash
npm install @openpact/sdk
```

You also need a running OpenPact daemon. Install the CLI and start one:

```bash
npm install -g @openpact/cli
openpact init
openpact start
```

## Usage

```ts
import { OpenPact } from '@openpact/sdk'

const pact = new OpenPact() // defaults to http://127.0.0.1:7666

// Read
const knowledge = await pact.knowledge.list({ topic: 'sales', limit: 10 })
const tasks = await pact.tasks.list({ status: 'open' })

// Write
const { id } = await pact.knowledge.create({
  topic: 'sales',
  content: 'Tuesdays convert better',
  confidence: 0.8,
})

// Tasks
const task = await pact.tasks.create({ title: 'Build the landing page' })
await pact.tasks.claim(task.id)
await pact.tasks.complete(task.id, { result: 'PR #42 merged' })

// Messages
await pact.messages.send({ to: '*', content: 'API endpoint changed' })
const recent = await pact.messages.list({ since: '2026-04-14T00:00:00.000Z' })

// Status
const status = await pact.status()
const peers = await pact.peers()
```

## Errors

Every server error code maps to a typed error class:

```ts
import { TaskNotOpenError, DaemonNotRunningError } from '@openpact/sdk'

try {
  await pact.tasks.claim('aaaa-1')
} catch (err) {
  if (err instanceof TaskNotOpenError) {
    // someone else got there first
  } else if (err instanceof DaemonNotRunningError) {
    // the daemon isn't running on the configured port
  } else {
    throw err
  }
}
```

## Custom host or port

```ts
const pact = new OpenPact({ host: '192.168.1.50', port: 7666 })
// or
const pact = new OpenPact({ baseUrl: 'http://my-daemon.local:7666' })
```

## Custom fetch (non-Node runtimes)

```ts
const pact = new OpenPact({ fetch: customFetch })
```

## Licence

Sustainable Use License. See the repo-root `LICENSE` file.
