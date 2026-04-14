const { baseEntry } = require('./common')

const ADMIN_ACTIONS = ['addWriter', 'removeWriter']

module.exports = {
  ...baseEntry,
  properties: {
    ...baseEntry.properties,
    type: { const: 'admin' },
    payload: {
      type: 'object',
      properties: {
        action: { enum: ADMIN_ACTIONS },
        key: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        indexer: { type: 'boolean' },
      },
      required: ['action', 'key'],
      additionalProperties: false,
    },
  },
}

module.exports.ADMIN_ACTIONS = ADMIN_ACTIONS
