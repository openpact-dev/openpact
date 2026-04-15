import { render } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { JoinPage } from '../pages/JoinPage'
import '../style.css'

applyInitialTheme()

const root = document.getElementById('app')
if (root) render(<JoinPage />, root)
