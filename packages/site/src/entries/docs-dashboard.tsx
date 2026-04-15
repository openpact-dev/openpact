import { render } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Dashboard } from '../docs/pages/Dashboard'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) render(<Dashboard />, root)
