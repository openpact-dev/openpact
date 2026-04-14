#!/usr/bin/env node

const message = `
OpenPact is pre-release.

This 'openpact' package is a placeholder reserving the name on npm.
The real CLI ships under @openpact/cli at v0.1.0.

  npm install -g @openpact/cli

Source:  https://github.com/openpact-dev/openpact
Website: https://openpact.dev
`

process.stdout.write(message)
