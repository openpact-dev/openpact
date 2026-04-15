import { render } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Landing } from '../pages/Landing'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) render(<Landing />, root)
