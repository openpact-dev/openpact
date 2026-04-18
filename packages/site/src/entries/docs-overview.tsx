import { hydrate } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Overview } from '../docs/pages/Overview'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) hydrate(<Overview />, root)
