#!/usr/bin/env tsx
// Render each Preact docs page to HTML, strip the site chrome, convert
// the article body to markdown, and write it under public/ so Vercel
// can serve it when an agent sends `Accept: text/markdown`. Matches the
// Cloudflare "Markdown for Agents" content-negotiation pattern.

import { h, type ComponentType } from 'preact'
import { renderToString } from 'preact-render-to-string'
import TurndownService from 'turndown'
import { parse } from 'node-html-parser'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const siteRoot = resolve(here, '..')
const publicDir = resolve(siteRoot, 'public')

interface Route {
  url: string
  mdPath: string
  module: string
  export: string
}

// Keep in sync with vite.config.ts rollup inputs + vercel.json rewrites.
// Landing (/) already has a hand-authored llms.txt overview; join/ is
// interactive and offers no useful markdown payload.
const ROUTES: Route[] = [
  { url: '/docs/', mdPath: 'docs.md', module: 'src/docs/pages/Overview.tsx', export: 'Overview' },
  {
    url: '/docs/getting-started/',
    mdPath: 'docs/getting-started.md',
    module: 'src/docs/pages/GettingStarted.tsx',
    export: 'GettingStarted',
  },
  {
    url: '/docs/architecture/',
    mdPath: 'docs/architecture.md',
    module: 'src/docs/pages/Architecture.tsx',
    export: 'Architecture',
  },
  { url: '/docs/cli/', mdPath: 'docs/cli.md', module: 'src/docs/pages/Cli.tsx', export: 'Cli' },
  {
    url: '/docs/dashboard/',
    mdPath: 'docs/dashboard.md',
    module: 'src/docs/pages/Dashboard.tsx',
    export: 'Dashboard',
  },
  {
    url: '/docs/rest-api/',
    mdPath: 'docs/rest-api.md',
    module: 'src/docs/pages/RestApi.tsx',
    export: 'RestApi',
  },
  {
    url: '/docs/packages/',
    mdPath: 'docs/packages.md',
    module: 'src/docs/pages/Packages.tsx',
    export: 'Packages',
  },
  {
    url: '/docs/skill/',
    mdPath: 'docs/skill.md',
    module: 'src/docs/pages/Skill.tsx',
    export: 'Skill',
  },
  {
    url: '/docs/examples/',
    mdPath: 'docs/examples.md',
    module: 'src/docs/pages/Examples.tsx',
    export: 'Examples',
  },
  {
    url: '/docs/releases/',
    mdPath: 'docs/releases.md',
    module: 'src/docs/pages/Releases.tsx',
    export: 'Releases',
  },
  {
    url: '/docs/roadmap/',
    mdPath: 'docs/roadmap.md',
    module: 'src/docs/pages/Roadmap.tsx',
    export: 'Roadmap',
  },
  {
    url: '/for-agents/',
    mdPath: 'for-agents.md',
    module: 'src/pages/ForAgents.tsx',
    export: 'ForAgents',
  },
]

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
  strongDelimiter: '**',
  linkStyle: 'inlined',
})

// Drop chrome with no markdown analogue (icons, scripts, copy buttons).
turndown.remove(['script', 'style', 'svg', 'button'])

// Force plain, language-less fenced blocks. <CodeBlock> renders
// <pre><code>…</code></pre> with Tailwind classes; the default turndown
// fenced-code rule would otherwise try to parse a language from them.
turndown.addRule('fenced-code', {
  filter: (node) =>
    node.nodeName === 'PRE' && node.firstChild !== null && node.firstChild.nodeName === 'CODE',
  replacement: (_content, node) => {
    const code = (node.firstChild as { textContent?: string }).textContent ?? ''
    const trimmed = code.replace(/\n+$/, '')
    return `\n\n\`\`\`\n${trimmed}\n\`\`\`\n\n`
  },
})

// Strip site chrome from the rendered HTML before turndown sees it.
// These classes appear verbatim in the SSR output (Tailwind utility
// strings get flattened but our custom utility names survive).
const STRIP_CLASS_SELECTORS = ['.eyebrow', '.smallcaps']

function stripChrome(article: ReturnType<typeof parse>): void {
  for (const sel of STRIP_CLASS_SELECTORS) {
    for (const el of article.querySelectorAll(sel)) el.remove()
  }
  // DocsShell appends a prev/next nav inside the article. It's a
  // duplicate of the sidebar for visual flow; agents already see the
  // full doc list in the llms.txt index.
  for (const nav of article.querySelectorAll('nav')) nav.remove()
}

async function renderRoute(route: Route): Promise<string> {
  const modUrl = pathToFileURL(resolve(siteRoot, route.module)).href
  const mod = (await import(modUrl)) as Record<string, unknown>
  const Component = mod[route.export] as ComponentType | undefined
  if (typeof Component !== 'function') {
    throw new Error(`generate-markdown: missing export ${route.export} in ${route.module}`)
  }

  const html = renderToString(h(Component, {}))
  const root = parse(html)
  // DocsShell wraps content in <article class="prose">; other pages
  // put it directly under <main>. Fall back to the whole tree if
  // neither exists.
  const container = root.querySelector('article.prose') ?? root.querySelector('main') ?? root
  stripChrome(container)
  const contentHtml = container.innerHTML

  const markdown = turndown.turndown(contentHtml).trim()
  const frontmatter = [
    '---',
    `url: https://openpact.dev${route.url}`,
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
    '',
  ].join('\n')

  return frontmatter + markdown + '\n'
}

let count = 0
for (const route of ROUTES) {
  const body = await renderRoute(route)
  const outPath = resolve(publicDir, route.mdPath)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, body, 'utf8')
  count += 1
}

console.log(`markdown-for-agents: generated ${count} page(s) under public/`)
