import { useEffect, useLayoutEffect, useState } from 'preact/hooks'
import { BRAND_PATHS, type BrandName } from './BrandIcon'

/*
 * Live coordination diagram for the landing hero. Five named agents
 * orbit the OpenPact daemon. A scripted loop moves through five
 * scenarios covering all four entry types (knowledge, task, skill,
 * message). For each scenario:
 *
 *   outbound (0 - 1100ms)   a glowing pulse travels from the sender's
 *                           seal into the central daemon; the sender
 *                           is highlighted with a halo and the
 *                           connecting line lights ember.
 *   seal     (1100 - 1500ms) the daemon core pulses outward, the
 *                           entry counter ticks up.
 *   inbound  (1500 - 2700ms) pulses radiate from the daemon to each
 *                           target agent (all peers for broadcasts,
 *                           just the addressee for messages).
 *   rest     (2700 - 4200ms) everything settles so the reader can
 *                           read the narrator line and see the active
 *                           agent still glowing faintly.
 *
 * Animation is CSS transitions on SVG cx/cy for pulses, plus keyframe
 * animations for halos and the core seal flash. prefers-reduced-motion
 * hides pulses and collapses the loop to a still diagram.
 */

type SigilKey = 'knowledge' | 'task' | 'skill' | 'message'
type AgentId = 'claude' | 'openclaw' | 'langchain' | 'crewai' | 'shell'
type Phase = 'outbound' | 'seal' | 'inbound' | 'rest'

interface Agent {
  id: AgentId
  name: string
  role: string
  logo: BrandName
  x: number
  y: number
}

interface Scenario {
  sender: AgentId
  targets: AgentId[]
  type: SigilKey
  sigil: string
  verb: string
  summary: string
}

/* SVG stage uses a 500x500 viewBox. Agents arranged on a 72° circle
 * at radius 170, center (250, 240). Top position is reserved for
 * CrewAI so the label doesn't collide with anything above. */
const CX = 250
const CY = 240

const AGENTS: Record<AgentId, Agent> = {
  crewai: { id: 'crewai', name: 'CrewAI', role: 'crew', logo: 'crewai', x: 250, y: 70 },
  claude: { id: 'claude', name: 'Claude Code', role: 'cli', logo: 'claude-code', x: 412, y: 187 },
  langchain: {
    id: 'langchain',
    name: 'LangChain',
    role: 'python',
    logo: 'langchain',
    x: 350,
    y: 378,
  },
  openclaw: {
    id: 'openclaw',
    name: 'OpenClaw',
    role: 'runtime',
    logo: 'openclaw',
    x: 150,
    y: 378,
  },
  shell: { id: 'shell', name: 'Shell @ 2am', role: 'cron', logo: 'shell', x: 88, y: 187 },
}

const AGENT_LIST: AgentId[] = ['crewai', 'claude', 'langchain', 'openclaw', 'shell']

const SCENARIOS: Scenario[] = [
  {
    sender: 'claude',
    targets: ['openclaw', 'langchain', 'crewai', 'shell'],
    type: 'knowledge',
    sigil: '◈',
    verb: 'inscribes',
    summary: '“Tuesdays convert 18% better”',
  },
  {
    sender: 'openclaw',
    targets: ['claude', 'langchain', 'crewai', 'shell'],
    type: 'task',
    sigil: '✕',
    verb: 'claims',
    summary: '“write Q3 recap”',
  },
  {
    sender: 'langchain',
    targets: ['claude', 'openclaw', 'crewai', 'shell'],
    type: 'skill',
    sigil: '⌘',
    verb: 'offers skill',
    summary: 'pdf-summarizer v0.3',
  },
  {
    sender: 'shell',
    targets: ['openclaw'],
    type: 'message',
    sigil: '☌',
    verb: 'messages OpenClaw',
    summary: '“picked up the Q3 recap”',
  },
  {
    sender: 'crewai',
    targets: ['claude', 'openclaw', 'langchain', 'shell'],
    type: 'knowledge',
    sigil: '◈',
    verb: 'inscribes',
    summary: '“Q2 sitemap indexed”',
  },
]

const OUTBOUND_MS = 1100
const SEAL_MS = 400
const INBOUND_MS = 1200
const REST_MS = 1500
const CYCLE_MS = OUTBOUND_MS + SEAL_MS + INBOUND_MS + REST_MS

export function NetworkHero() {
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<Phase>('outbound')
  const [count, setCount] = useState(1247)

  useEffect(() => {
    setPhase('outbound')
    const t1 = setTimeout(() => setPhase('seal'), OUTBOUND_MS)
    const t2 = setTimeout(() => {
      setPhase('inbound')
      setCount((c) => c + 1)
    }, OUTBOUND_MS + SEAL_MS)
    const t3 = setTimeout(() => setPhase('rest'), OUTBOUND_MS + SEAL_MS + INBOUND_MS)
    const t4 = setTimeout(() => setStep((s) => (s + 1) % SCENARIOS.length), CYCLE_MS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    }
  }, [step])

  const scenario = SCENARIOS[step]
  const sender = AGENTS[scenario.sender]
  const sigilColor = `var(--color-sigil-${scenario.type})`

  return (
    <figure class="nh" aria-label="agents coordinating through openpact">
      <Narrator key={`nar-${step}`} scenario={scenario} sender={sender} sigilColor={sigilColor} />

      <div class="nh__stage">
        <svg class="nh__svg" viewBox="0 0 500 500" role="img" aria-hidden="true">
          {/* concentric guide rings */}
          <circle class="nh__ring nh__ring--outer" cx={CX} cy={CY} r="200" />
          <circle class="nh__ring" cx={CX} cy={CY} r="170" />
          <circle class="nh__ring" cx={CX} cy={CY} r="80" />

          {/* connection lines */}
          {AGENT_LIST.map((id) => {
            const a = AGENTS[id]
            const isOutbound = phase === 'outbound' && scenario.sender === id
            const isInbound = phase === 'inbound' && scenario.targets.includes(id)
            const cls = `nh__link${isOutbound ? ' is-outbound' : ''}${
              isInbound ? ' is-inbound' : ''
            }`
            return (
              <line key={`link-${id}`} class={cls} x1={a.x} y1={a.y} x2={CX} y2={CY} />
            )
          })}

          {/* central daemon */}
          <g class={`nh__core${phase === 'seal' ? ' is-sealing' : ''}`}>
            <circle class="nh__core-halo" cx={CX} cy={CY} r="58" />
            <circle class="nh__core-burst" cx={CX} cy={CY} r="34" />
            <circle class="nh__core-shell" cx={CX} cy={CY} r="34" />
            <circle class="nh__core-shell-inner" cx={CX} cy={CY} r="28" />
            {/* Watching eye */}
            <g transform={`translate(${CX} ${CY - 2})`}>
              <ellipse class="nh__core-lens" cx="0" cy="0" rx="17" ry="10" />
              <circle class="nh__core-pupil" cx="0" cy="0" r="5" />
              <circle class="nh__core-glint" cx="-2" cy="-2.5" r="1.3" />
            </g>
            <text class="nh__core-label" x={CX} y={CY + 55}>
              OPENPACT
            </text>
            <text
              class={`nh__core-count${phase === 'inbound' || phase === 'rest' ? ' is-ticking' : ''}`}
              x={CX}
              y={CY + 70}
              key={`count-${step}`}
            >
              {count.toLocaleString()} entries
            </text>
          </g>

          {/* agent nodes */}
          {AGENT_LIST.map((id) => {
            const a = AGENTS[id]
            const isSender = scenario.sender === id
            const isReceiving = phase === 'inbound' && scenario.targets.includes(id)
            const cls = `nh__node${isSender ? ' is-sender' : ''}${
              isReceiving ? ' is-receiving' : ''
            }`
            return (
              <g class={cls} transform={`translate(${a.x} ${a.y})`} key={`node-${id}`}>
                {/* halo behind seal */}
                <circle class="nh__node-halo" cx="0" cy="0" r="30" />
                {/* seal + corner ticks */}
                <rect class="nh__node-seal" x="-28" y="-22" width="56" height="44" rx="1" />
                {cornerTicks()}
                {/* brand logo */}
                <svg
                  class="nh__node-logo"
                  x="-11"
                  y="-11"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                >
                  <path d={BRAND_PATHS[a.logo]} fill="currentColor" />
                </svg>
                <text class="nh__node-name" x="0" y="40">
                  {a.name}
                </text>
                <text class="nh__node-role" x="0" y="54">
                  {a.role}
                </text>
              </g>
            )
          })}

          {/* pulses */}
          {phase === 'outbound' && (
            <SvgPulse
              key={`out-${step}`}
              from={{ x: sender.x, y: sender.y }}
              to={{ x: CX, y: CY }}
              color={sigilColor}
              duration={OUTBOUND_MS}
              trailDelay={120}
              sigil={scenario.sigil}
            />
          )}
          {phase === 'inbound' &&
            scenario.targets.map((tId, i) => {
              const t = AGENTS[tId]
              return (
                <SvgPulse
                  key={`in-${step}-${tId}`}
                  from={{ x: CX, y: CY }}
                  to={{ x: t.x, y: t.y }}
                  color={sigilColor}
                  duration={INBOUND_MS}
                  trailDelay={100}
                  delay={i * 60}
                  sigil={scenario.sigil}
                />
              )
            })}
        </svg>
      </div>

      <figcaption class="nh__footer">
        <span class="nh__footer-hint">
          One signed log. Every peer. No server in between.
        </span>
        <span class="nh__footer-live">Live</span>
      </figcaption>
    </figure>
  )
}

function Narrator({
  scenario,
  sender,
  sigilColor,
}: {
  scenario: Scenario
  sender: Agent
  sigilColor: string
}) {
  return (
    <div class="nh__narrator">
      <span class="nh__narrator-sigil" style={{ color: sigilColor }} aria-hidden="true">
        {scenario.sigil}
      </span>
      <span class="nh__narrator-actor">{sender.name}</span>
      <span class="nh__narrator-verb">{scenario.verb}</span>
      <span class="nh__narrator-summary">{scenario.summary}</span>
    </div>
  )
}

function cornerTicks() {
  const L = 5
  const X = 28
  const Y = 22
  return (
    <>
      <path class="nh__node-corner" d={`M${-X + L},${-Y} L${-X},${-Y} L${-X},${-Y + L}`} />
      <path class="nh__node-corner" d={`M${X - L},${-Y} L${X},${-Y} L${X},${-Y + L}`} />
      <path class="nh__node-corner" d={`M${-X + L},${Y} L${-X},${Y} L${-X},${Y - L}`} />
      <path class="nh__node-corner" d={`M${X - L},${Y} L${X},${Y} L${X},${Y - L}`} />
    </>
  )
}

function SvgPulse({
  from,
  to,
  color,
  duration,
  trailDelay = 120,
  delay = 0,
  sigil,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  color: string
  duration: number
  trailDelay?: number
  delay?: number
  sigil?: string
}) {
  const [pos, setPos] = useState(from)
  const [started, setStarted] = useState(false)

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      const t = setTimeout(() => {
        setStarted(true)
        setPos(to)
      }, delay)
      return () => clearTimeout(t)
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const trailFrom = from
  const trailTo = to
  const [trailPos, setTrailPos] = useState(trailFrom)
  useLayoutEffect(() => {
    const t = setTimeout(
      () => {
        requestAnimationFrame(() => setTrailPos(trailTo))
      },
      delay + trailDelay
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const transition = `cx ${duration}ms cubic-bezier(0.4, 0, 0.6, 1), cy ${duration}ms cubic-bezier(0.4, 0, 0.6, 1)`

  return (
    <g style={{ opacity: started ? 1 : 0 }}>
      <circle
        class="nh__pulse-trail"
        cx={trailPos.x}
        cy={trailPos.y}
        r="4"
        style={{
          fill: color,
          filter: `drop-shadow(0 0 4px ${color})`,
          transition,
        }}
      />
      <circle
        class="nh__pulse"
        cx={pos.x}
        cy={pos.y}
        r="7"
        style={{
          fill: color,
          filter: `drop-shadow(0 0 8px ${color})`,
          transition,
        }}
      />
      {sigil && (
        <text
          class="nh__pulse"
          x={pos.x}
          y={pos.y + 2}
          style={{
            fill: 'var(--color-paper)',
            fontFamily: 'var(--font-display)',
            fontSize: '8px',
            fontWeight: 700,
            textAnchor: 'middle',
            transition,
          }}
          aria-hidden="true"
        >
          {sigil}
        </text>
      )}
    </g>
  )
}
