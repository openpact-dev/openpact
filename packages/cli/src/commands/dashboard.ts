import open from 'open'
import { c, emoji } from '../lib/theme'

export interface DashboardCmdOpts {
  port?: string | number
}

/**
 * `openpact dashboard` — open the dashboard URL in the user's default
 * browser. Doesn't start a daemon; assumes one is already running
 * (otherwise the dashboard's /api proxy will return upstream errors,
 * but the SPA shell still loads — the user can read the connection
 * error and run `openpact start`).
 */
export async function dashboardCmd(opts: DashboardCmdOpts = {}): Promise<void> {
  const port = Number(opts.port ?? 7667)
  const url = `http://localhost:${port}`
  await open(url)
  console.log(`  ${emoji.brand} ${c.brandBold('Opened the dashboard.')}  ${c.bone(url)}`)
}
