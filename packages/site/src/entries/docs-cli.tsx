import { render } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Cli } from '../docs/pages/Cli'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) render(<Cli />, root)
