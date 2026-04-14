import { baseEntry } from './common'

export const TASK_STATUSES = ['open', 'claimed', 'complete'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

const taskSchema = {
  ...baseEntry,
  properties: {
    ...baseEntry.properties,
    type: { const: 'task' },
    payload: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string' },
        status: { enum: TASK_STATUSES as unknown as string[] },
        claimed_by: { type: ['string', 'null'] },
        result: { type: ['string', 'null'] },
      },
      required: ['title', 'status'],
      additionalProperties: true,
    },
  },
}

export default taskSchema
