import { render } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Skill } from '../docs/pages/Skill'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) render(<Skill />, root)
