import { hydrate } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Cli } from '../docs/pages/Cli'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) hydrate(<Cli />, root)
