import { render } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { GettingStarted } from '../docs/pages/GettingStarted'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) render(<GettingStarted />, root)
