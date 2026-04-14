const fs = require('fs/promises')
const { configPath } = require('./data-dir')

const DEFAULT_PORT = 7331

const ROLES = ['creator', 'indexer', 'writer', 'reader']

function defaults() {
  return { pactKey: null, role: null, port: DEFAULT_PORT }
}

async function loadConfig(dataDir) {
  const file = configPath(dataDir)
  let raw
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return defaults()
    throw err
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`config file at ${file} is not valid JSON: ${err.message}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`config file at ${file} must contain a JSON object`)
  }
  return { ...defaults(), ...parsed }
}

async function saveConfig(dataDir, config) {
  validate(config)
  await fs.mkdir(dataDir, { recursive: true })
  const file = configPath(dataDir)
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, file)
}

function validate(config) {
  if (config === null || typeof config !== 'object') {
    throw new TypeError('config must be an object')
  }
  if (config.role !== null && config.role !== undefined && !ROLES.includes(config.role)) {
    throw new Error(`invalid role: ${config.role}`)
  }
  if (config.pactKey !== null && config.pactKey !== undefined) {
    if (typeof config.pactKey !== 'string' || !/^[0-9a-f]+$/i.test(config.pactKey)) {
      throw new Error('pactKey must be a hex string or null')
    }
  }
  if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
    throw new Error('port must be an integer in [1, 65535]')
  }
}

module.exports = { loadConfig, saveConfig, defaults, validate, ROLES, DEFAULT_PORT }
