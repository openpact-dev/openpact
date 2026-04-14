import { baseEntry } from './common'

export const ADMIN_ACTIONS = ['addWriter', 'removeWriter'] as const
export type AdminAction = (typeof ADMIN_ACTIONS)[number]

const adminSchema = {
  ...baseEntry,
  properties: {
    ...baseEntry.properties,
    type: { const: 'admin' },
    payload: {
      type: 'object',
      properties: {
        action: { enum: ADMIN_ACTIONS as unknown as string[] },
        key: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        indexer: { type: 'boolean' },
      },
      required: ['action', 'key'],
      additionalProperties: false,
    },
  },
}

export default adminSchema
