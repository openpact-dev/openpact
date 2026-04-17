#!/usr/bin/env node
// Tsx loader shim: register TypeScript transpilation, then run the CLI.
// This is the only .js file we ship in @openpact/cli; the CLI itself is
// TypeScript. Phase 4 will replace this with a tsc-built dist/ entry
// alongside the SDK build.
require('tsx/cjs')
require('../src/bin.ts').run()
