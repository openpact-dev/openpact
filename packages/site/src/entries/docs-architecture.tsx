import { render } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Architecture } from '../docs/pages/Architecture'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) render(<Architecture />, root)
