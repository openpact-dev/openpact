import { hydrate } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { ForAgents } from '../pages/ForAgents'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) hydrate(<ForAgents />, root)
