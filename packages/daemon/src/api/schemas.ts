/**
 * Shared JSON-Schema partials for the HTTP layer. Keep route-local
 * querystrings consistent so third-party SDKs and agents see one
 * pagination contract across every list endpoint.
 */

/** Properties that every paginated list route accepts. */
export const LIST_PAGE_QUERY = {
  order: { enum: ['asc', 'desc'] },
  limit: { type: 'integer', minimum: 1, maximum: 1000 },
  cursor: { type: 'string', minLength: 1, maxLength: 512 },
} as const

export interface ListPageQuery {
  order?: 'asc' | 'desc'
  limit?: number
  cursor?: string
}
