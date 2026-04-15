import type { ListOpts, ListPage } from '../types'

/**
 * Walks every page of a paginated list endpoint. Yields each entry in
 * order and stops when `has_more` becomes false.
 *
 * Rebuilds the opts on every call so the caller's original `cursor`
 * is ignored on the first iteration — this helper starts from
 * scratch. Pass `limit` through for page size; 50 is the daemon's
 * default.
 */
export async function* paginate<T, O extends ListOpts>(
  list: (opts: O) => Promise<ListPage<T>>,
  opts: O,
): AsyncGenerator<T> {
  let cursor: string | null = null
  let has_more = true
  while (has_more) {
    const page: ListPage<T> = await list({ ...opts, cursor })
    for (const entry of page.entries) yield entry
    cursor = page.cursor
    has_more = page.has_more
    if (!cursor && page.entries.length === 0) break
  }
}
