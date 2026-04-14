const { baseEntry } = require('./common')

const SKILL_FORMATS = ['openclaw', 'langchain', 'generic']

module.exports = {
  ...baseEntry,
  properties: {
    ...baseEntry.properties,
    type: { const: 'skill' },
    payload: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 200 },
        version: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        format: { enum: SKILL_FORMATS },
        content: { type: 'string' },
        checksum: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
        requires_approval: { type: 'boolean' },
      },
      required: ['name', 'version', 'format', 'content', 'checksum'],
      additionalProperties: true,
    },
  },
}

module.exports.SKILL_FORMATS = SKILL_FORMATS
