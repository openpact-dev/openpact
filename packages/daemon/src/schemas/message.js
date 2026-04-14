const { baseEntry, PEER_HANDLE_RE } = require('./common')

const MESSAGE_PRIORITIES = ['low', 'normal', 'high']

module.exports = {
  ...baseEntry,
  properties: {
    ...baseEntry.properties,
    type: { const: 'message' },
    payload: {
      type: 'object',
      properties: {
        to: {
          oneOf: [{ const: '*' }, { type: 'string', pattern: PEER_HANDLE_RE }],
        },
        content: { type: 'string', minLength: 1 },
        priority: { enum: MESSAGE_PRIORITIES },
      },
      required: ['to', 'content'],
      additionalProperties: true,
    },
  },
}

module.exports.MESSAGE_PRIORITIES = MESSAGE_PRIORITIES
