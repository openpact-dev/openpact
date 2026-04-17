#!/usr/bin/env node
/**
 * Parallel brittle runner.
 *
 * Brittle is single-threaded within a process and has no built-in
 * parallel mode, so a glob of 13 e2e test files runs serially today.
 * This script spawns one brittle worker per test file with a bounded
 * concurrency pool, collects their outputs, and prints a per-file
 * summary plus an aggregate pass/fail tally. Any non-zero child exit
 * fails the run.
 *
 * Usage:
 *   node scripts/run-parallel-tests.mjs '<glob>' [--concurrency N]
 *
 * Example:
 *   node scripts/run-parallel-tests.mjs 'packages/&#42;/test/e2e/&#42;&#42;/&#42;.test.ts' --concurrency 4
 *
 * Concurrency defaults to min(4, numCpus). Raise with `--concurrency`
 * or `TEST_CONCURRENCY=N`. Keep it modest: every e2e test spins up a
 * daemon and binds a free port, so too many parallel workers can
 * saturate the kernel's ephemeral-port pool or disk I/O.
 */
import { spawn } from 'node:child_process'
import { glob } from 'node:fs/promises'
import os from 'node:os'
import process from 'node:process'

const args = process.argv.slice(2)
const pattern = args.find((a) => !a.startsWith('-'))
if (!pattern) {
  console.error("usage: run-parallel-tests.mjs '<glob>' [--concurrency N]")
  process.exit(2)
}

const envConcurrency = Number.parseInt(process.env.TEST_CONCURRENCY ?? '', 10)
const flagIdx = args.indexOf('--concurrency')
const flagConcurrency = flagIdx !== -1 ? Number.parseInt(args[flagIdx + 1] ?? '', 10) : NaN
const concurrency =
  (Number.isFinite(flagConcurrency) && flagConcurrency) ||
  (Number.isFinite(envConcurrency) && envConcurrency) ||
  Math.min(4, Math.max(1, os.cpus().length))

const files = []
for await (const f of glob(pattern)) files.push(f)
if (files.length === 0) {
  console.error(`no files matched ${pattern}`)
  process.exit(2)
}
files.sort()

const started = Date.now()
console.error(
  `[parallel-tests] ${files.length} files × ${concurrency} workers (brittle per file)`,
)

/**
 * Run brittle on one file. Stdout + stderr are buffered so we can
 * print them contiguously, prefixed with the filename — interleaving
 * 4 TAP streams would be unreadable.
 */
function runOne(file) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn('npx', ['brittle', file], {
      env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--import tsx' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (b) => (stdout += b.toString()))
    child.stderr.on('data', (b) => (stderr += b.toString()))
    child.on('error', (err) => {
      resolve({ file, code: 1, ms: Date.now() - startedAt, stdout, stderr: stderr + err.message })
    })
    child.on('close', (code) => {
      resolve({ file, code: code ?? 0, ms: Date.now() - startedAt, stdout, stderr })
    })
  })
}

/**
 * Tiny bounded-concurrency pool. Pull the next file off the queue as
 * soon as any worker finishes so wall-clock is dominated by the
 * slowest file, not the slot assignment.
 */
async function runAll() {
  const queue = [...files]
  const results = []
  const workers = []
  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const file = queue.shift()
          if (!file) break
          const r = await runOne(file)
          results.push(r)
          // Interleave-safe: one file's full output at a time.
          process.stdout.write(`\n===== ${file} (${r.ms}ms, exit ${r.code}) =====\n`)
          if (r.stdout) process.stdout.write(r.stdout)
          if (r.stderr) process.stderr.write(r.stderr)
        }
      })(),
    )
  }
  await Promise.all(workers)
  return results
}

const results = await runAll()
const total = Date.now() - started
const failed = results.filter((r) => r.code !== 0)

console.error(
  `\n[parallel-tests] ${results.length - failed.length}/${results.length} files passed in ${(
    total / 1000
  ).toFixed(1)}s (wall).`,
)
if (failed.length) {
  console.error('[parallel-tests] failing files:')
  for (const f of failed) console.error(`  - ${f.file} (exit ${f.code}, ${f.ms}ms)`)
  process.exit(1)
}
