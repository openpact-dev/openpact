import { baseEntry, PEER_HANDLE_RE } from './common'

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
        // Optional peer handle the task is assigned to. Set on the
        // original create entry and honored by the reducer: if present,
        // only that peer may claim. The HTTP claim handler short-circuits
        // with 409 NOT_ASSIGNEE before appending so callers get a
        // deterministic error instead of a silent no-op.
        assigned_to: { type: ['string', 'null'], pattern: PEER_HANDLE_RE },
      },
      required: ['title', 'status'],
      additionalProperties: true,
    },
  },
}

export default taskSchema
