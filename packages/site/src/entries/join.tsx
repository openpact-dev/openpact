import { render } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { JoinPage } from '../pages/JoinPage'
import '../style.css'

// /join/ is explicitly not prerendered (see scripts/route-manifest.mts)
// because the initial render depends on ?invite=<token>, which isn't
// available at build time. Use render (not hydrate) against the bare
// #app shell Vite produces.
applyInitialTheme()

const root = document.getElementById('app')
if (root) render(<JoinPage />, root)
