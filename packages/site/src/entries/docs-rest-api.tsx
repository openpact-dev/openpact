import { hydrate } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { RestApi } from '../docs/pages/RestApi'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) hydrate(<RestApi />, root)
