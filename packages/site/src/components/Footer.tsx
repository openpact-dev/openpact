import { WatchingEye } from './WatchingEye'

export function Footer() {
  return (
    <footer class="relative z-10 mt-24 border-t border-[var(--color-line)]">
      <div class="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-10 md:flex-row md:items-start md:justify-between">
        <div class="space-y-2 max-w-md">
          <div class="flex items-center gap-2.5">
            <WatchingEye size={26} />
            <span class="font-display text-[19px] font-medium tracking-tight text-[var(--color-ink)]">
              OpenPact
            </span>
          </div>
          <p class="pt-2 font-display text-lg leading-snug text-[var(--color-ink)]">
            P2P shared memory for software agents.
          </p>
          <p class="text-sm text-[var(--color-ink3)]">
            No central server. Local-first. Signed, append-only, yours.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
          <div>
            <div class="smallcaps mb-2">Project</div>
            <ul class="space-y-1.5">
              <li>
                <a class="text-[var(--color-ink2)] hover:text-[var(--color-ember)]" href="/docs/">
                  Docs
                </a>
              </li>
              <li>
                <a
                  class="text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
                  href="/docs/getting-started/"
                >
                  Getting started
                </a>
              </li>
              <li>
                <a
                  class="text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
                  href="/docs/rest-api/"
                >
                  REST API
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div class="smallcaps mb-2">Source</div>
            <ul class="space-y-1.5">
              <li>
                <a
                  class="text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
                  href="https://github.com/openpact-dev/openpact"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  class="text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
                  href="https://github.com/openpact-dev/openpact/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Issues
                </a>
              </li>
              <li>
                <a
                  class="text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
                  href="https://github.com/openpact-dev/openpact/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  License
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div class="smallcaps mb-2">Elsewhere</div>
            <ul class="space-y-1.5">
              <li>
                <a
                  class="text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
                  href="/llms.txt"
                >
                  llms.txt
                </a>
              </li>
              <li>
                <a
                  class="text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
                  href="/docs/architecture/"
                >
                  Architecture
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="border-t border-[var(--color-line)]">
        <div class="mx-auto flex max-w-[1200px] flex-col items-center justify-center gap-2 px-6 py-5 md:flex-row md:gap-4">
          <a
            href="https://pears.com"
            target="_blank"
            rel="noopener noreferrer"
            class="group inline-flex items-center gap-2 text-[var(--color-ink2)] transition-colors hover:text-[#B0D944]"
            aria-label="Pears"
          >
            <span class="smallcaps text-[var(--color-ink3)] transition-colors group-hover:text-[#B0D944]">
              Built on
            </span>
            <img src="/logos/pears.svg" alt="" width="14" height="20" class="h-5 w-auto" />
            <span class="font-display text-[15px] font-medium leading-none">Pears</span>
          </a>
          <span class="hidden smallcaps text-[var(--color-ink3)] md:inline" aria-hidden="true">
            ·
          </span>
          <span class="smallcaps text-[var(--color-ink3)]">
            Hypercore · Autobase · Hyperswarm · HyperDHT
          </span>
        </div>
      </div>
      <div class="border-t border-[var(--color-line)]">
        <div class="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <a
            class="smallcaps hover:text-[var(--color-ember)]"
            href="https://github.com/openpact-dev/openpact/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sustainable Use License
          </a>
          <span class="smallcaps">openpact.dev</span>
        </div>
      </div>
    </footer>
  )
}
