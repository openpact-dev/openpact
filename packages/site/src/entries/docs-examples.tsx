import { hydrate } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Examples } from '../docs/pages/Examples'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) hydrate(<Examples />, root)
