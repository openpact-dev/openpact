// Single source of truth for the prerenderable routes in the site.
// Keep in sync with vite.config.ts rollup inputs and vercel.json rewrites.

export interface Route {
  // Canonical URL path, trailing slash matching the hosted rewrite.
  url: string
  // Path relative to packages/site/ of the Preact component module.
  module: string
  // Named export within that module.
  export: string
  // Path relative to packages/site/dist of the HTML shell to inject into.
  distHtml: string
  // Whether generate-markdown.mts should also emit a markdown counterpart.
  // Landing has a hand-authored /llms.txt overview already. /join is an
  // interactive invite-redeem UI that would not produce useful markdown.
  markdown?: { path: string }
}

export const ROUTES: Route[] = [
  {
    url: '/',
    module: 'src/pages/Landing.tsx',
    export: 'Landing',
    distHtml: 'index.html',
  },
  {
    url: '/docs/',
    module: 'src/docs/pages/Overview.tsx',
    export: 'Overview',
    distHtml: 'docs/index.html',
    markdown: { path: 'docs.md' },
  },
  {
    url: '/docs/getting-started/',
    module: 'src/docs/pages/GettingStarted.tsx',
    export: 'GettingStarted',
    distHtml: 'docs/getting-started/index.html',
    markdown: { path: 'docs/getting-started.md' },
  },
  {
    url: '/docs/architecture/',
    module: 'src/docs/pages/Architecture.tsx',
    export: 'Architecture',
    distHtml: 'docs/architecture/index.html',
    markdown: { path: 'docs/architecture.md' },
  },
  {
    url: '/docs/cli/',
    module: 'src/docs/pages/Cli.tsx',
    export: 'Cli',
    distHtml: 'docs/cli/index.html',
    markdown: { path: 'docs/cli.md' },
  },
  {
    url: '/docs/dashboard/',
    module: 'src/docs/pages/Dashboard.tsx',
    export: 'Dashboard',
    distHtml: 'docs/dashboard/index.html',
    markdown: { path: 'docs/dashboard.md' },
  },
  {
    url: '/docs/rest-api/',
    module: 'src/docs/pages/RestApi.tsx',
    export: 'RestApi',
    distHtml: 'docs/rest-api/index.html',
    markdown: { path: 'docs/rest-api.md' },
  },
  {
    url: '/docs/packages/',
    module: 'src/docs/pages/Packages.tsx',
    export: 'Packages',
    distHtml: 'docs/packages/index.html',
    markdown: { path: 'docs/packages.md' },
  },
  {
    url: '/docs/skill/',
    module: 'src/docs/pages/Skill.tsx',
    export: 'Skill',
    distHtml: 'docs/skill/index.html',
    markdown: { path: 'docs/skill.md' },
  },
  {
    url: '/docs/examples/',
    module: 'src/docs/pages/Examples.tsx',
    export: 'Examples',
    distHtml: 'docs/examples/index.html',
    markdown: { path: 'docs/examples.md' },
  },
  {
    url: '/docs/releases/',
    module: 'src/docs/pages/Releases.tsx',
    export: 'Releases',
    distHtml: 'docs/releases/index.html',
    markdown: { path: 'docs/releases.md' },
  },
  {
    url: '/docs/roadmap/',
    module: 'src/docs/pages/Roadmap.tsx',
    export: 'Roadmap',
    distHtml: 'docs/roadmap/index.html',
    markdown: { path: 'docs/roadmap.md' },
  },
  {
    url: '/for-agents/',
    module: 'src/pages/ForAgents.tsx',
    export: 'ForAgents',
    distHtml: 'for-agents/index.html',
    markdown: { path: 'for-agents.md' },
  },
  {
    url: '/join/',
    module: 'src/pages/JoinPage.tsx',
    export: 'JoinPage',
    distHtml: 'join/index.html',
  },
  {
    url: '/404',
    module: 'src/pages/NotFound.tsx',
    export: 'NotFound',
    distHtml: '404.html',
  },
]
