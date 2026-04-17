import { baseEntry } from './common'

const knowledgeSchema = {
  ...baseEntry,
  properties: {
    ...baseEntry.properties,
    type: { const: 'knowledge' },
    payload: {
      type: 'object',
      properties: {
        topic: { type: 'string', minLength: 1, maxLength: 200 },
        content: { type: 'string', minLength: 1 },
        source: { type: 'string' },
      },
      required: ['topic', 'content'],
      additionalProperties: true,
    },
  },
}

export default knowledgeSchema
