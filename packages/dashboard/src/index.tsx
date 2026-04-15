import { render } from 'preact'
import { App } from './app'
import { applyInitialTheme } from './hooks/useTheme'
import './style.css'

// Paint the right theme before render so we don't flash light when
// the user's preference is dark (or vice versa).
applyInitialTheme()

const root = document.getElementById('app')
if (root) render(<App />, root)
