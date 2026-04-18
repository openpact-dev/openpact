import { hydrate } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { NotFound } from '../pages/NotFound'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) hydrate(<NotFound />, root)
