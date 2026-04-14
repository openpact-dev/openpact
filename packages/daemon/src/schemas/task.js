const { baseEntry } = require('./common')

const TASK_STATUSES = ['open', 'claimed', 'complete']

module.exports = {
  ...baseEntry,
  properties: {
    ...baseEntry.properties,
    type: { const: 'task' },
    payload: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string' },
        status: { enum: TASK_STATUSES },
        claimed_by: { type: ['string', 'null'] },
        result: { type: ['string', 'null'] },
      },
      required: ['title', 'status'],
      additionalProperties: true,
    },
  },
}

module.exports.TASK_STATUSES = TASK_STATUSES
