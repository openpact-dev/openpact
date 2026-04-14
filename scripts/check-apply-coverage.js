#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const REPORT = path.resolve('coverage/coverage-final.json')
const TARGET_BASENAME = 'apply.js'
const LINE_FLOOR = 95
const BRANCH_FLOOR = 90

function fail(msg) {
  console.error(`check-apply-coverage: ${msg}`)
  process.exit(1)
}

if (!fs.existsSync(REPORT)) {
  fail(`coverage report missing at ${REPORT} — run with the json reporter`)
}

const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'))
const key = Object.keys(report).find(
  (k) => k.endsWith(`/src/${TARGET_BASENAME}`) || k.endsWith(`\\src\\${TARGET_BASENAME}`),
)
if (!key) fail(`${TARGET_BASENAME} not present in coverage report`)

const file = report[key]
const sValues = Object.values(file.s)
const sCovered = sValues.filter((v) => v > 0).length
const sTotal = sValues.length
const linePct = sTotal === 0 ? 100 : (sCovered / sTotal) * 100

const bArrays = Object.values(file.b)
const bCovered = bArrays.reduce((sum, arr) => sum + arr.filter((v) => v > 0).length, 0)
const bTotal = bArrays.reduce((sum, arr) => sum + arr.length, 0)
const branchPct = bTotal === 0 ? 100 : (bCovered / bTotal) * 100

let ok = true
if (linePct < LINE_FLOOR) {
  console.error(
    `apply.js line coverage ${linePct.toFixed(2)}% below floor ${LINE_FLOOR}%`,
  )
  ok = false
}
if (branchPct < BRANCH_FLOOR) {
  console.error(
    `apply.js branch coverage ${branchPct.toFixed(2)}% below floor ${BRANCH_FLOOR}%`,
  )
  ok = false
}

if (!ok) process.exit(1)
console.log(
  `apply.js coverage OK — lines ${linePct.toFixed(2)}%, branches ${branchPct.toFixed(2)}%`,
)
