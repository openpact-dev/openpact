import { render } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Packages } from '../docs/pages/Packages'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) render(<Packages />, root)
