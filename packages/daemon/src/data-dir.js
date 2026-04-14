const os = require('os')
const path = require('path')

const DEFAULT_DIR_NAME = '.openpact'

function defaultDataDir() {
  return process.env.OPENPACT_DATA_DIR || path.join(os.homedir(), DEFAULT_DIR_NAME)
}

function configPath(dataDir) {
  return path.join(dataDir, 'config.json')
}

function corestorePath(dataDir) {
  return path.join(dataDir, 'data')
}

function pidPath(dataDir) {
  return path.join(dataDir, 'pid')
}

module.exports = { defaultDataDir, configPath, corestorePath, pidPath }
