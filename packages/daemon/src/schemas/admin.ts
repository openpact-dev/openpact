import { baseEntry } from './common'

export const ADMIN_ACTIONS = ['addWriter', 'removeWriter', 'setInfo'] as const
export type AdminAction = (typeof ADMIN_ACTIONS)[number]

/**
 * Admin entries carry two shapes: writer-set mutations
 * (addWriter/removeWriter, both require `key`) and pact metadata
 * updates (setInfo, optional name + purpose). The oneOf keeps the
 * two shapes from mixing — `key` on setInfo or `name` on
 * addWriter both fail schema validation.
 *
 * `name` and `purpose` accept null to explicitly clear a value.
 * Empty strings are normalised to null at the REST boundary.
 */
const adminSchema = {
  ...baseEntry,
  properties: {
    ...baseEntry.properties,
    type: { const: 'admin' },
    payload: {
      oneOf: [
        {
          type: 'object',
          properties: {
            action: { enum: ['addWriter', 'removeWriter'] },
            key: { type: 'string', pattern: '^[0-9a-f]{64}$' },
            indexer: { type: 'boolean' },
          },
          required: ['action', 'key'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            action: { const: 'setInfo' },
            name: { type: ['string', 'null'], maxLength: 64 },
            purpose: { type: ['string', 'null'], maxLength: 200 },
          },
          required: ['action'],
          additionalProperties: false,
        },
      ],
    },
  },
}

export default adminSchema
