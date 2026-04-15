import { render } from 'preact'

function Boot() {
  return (
    <div class="boot">
      <h1>OpenPact</h1>
      <p>scaffold ready · slice C wires the screens</p>
    </div>
  )
}

const root = document.getElementById('app')
if (root) render(<Boot />, root)
