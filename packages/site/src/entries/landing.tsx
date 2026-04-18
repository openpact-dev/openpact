import { hydrate } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Landing } from '../pages/Landing'
import { registerWebMCPTools } from '../webmcp'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) hydrate(<Landing />, root)

registerWebMCPTools()
