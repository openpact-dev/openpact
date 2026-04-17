import { render } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Roadmap } from '../docs/pages/Roadmap'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) render(<Roadmap />, root)
