const Ajv = require('ajv')
const addFormats = require('ajv-formats')

const knowledge = require('./knowledge')
const task = require('./task')
const skill = require('./skill')
const message = require('./message')
const admin = require('./admin')

const MAX_PAYLOAD_BYTES = 64 * 1024

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)

const validators = {
  knowledge: ajv.compile(knowledge),
  task: ajv.compile(task),
  skill: ajv.compile(skill),
  message: ajv.compile(message),
  admin: ajv.compile(admin),
}

function validate(entry) {
  if (entry === null || typeof entry !== 'object') {
    return { valid: false, reason: 'not-an-object' }
  }
  const v = validators[entry.type]
  if (!v) return { valid: false, reason: 'unknown-type' }
  if (!v(entry)) return { valid: false, reason: 'schema', errors: v.errors }

  const payloadSize = Buffer.byteLength(JSON.stringify(entry.payload), 'utf8')
  if (payloadSize > MAX_PAYLOAD_BYTES) {
    return { valid: false, reason: 'payload-too-large', payloadSize }
  }

  return { valid: true }
}

module.exports = {
  validate,
  validators,
  schemas: { knowledge, task, skill, message, admin },
  MAX_PAYLOAD_BYTES,
}
