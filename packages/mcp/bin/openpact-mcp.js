#!/usr/bin/env node
const { main } = require('../dist/cjs/cli.js')
main(process.argv.slice(2), process.env).then(
  (code) => {
    if (code !== 0) process.exit(code)
  },
  (err) => {
    process.stderr.write(`fatal: ${err && err.stack ? err.stack : err}\n`)
    process.exit(1)
  },
)
