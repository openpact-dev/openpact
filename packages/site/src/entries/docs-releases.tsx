import { hydrate } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Releases } from '../docs/pages/Releases'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) hydrate(<Releases />, root)
