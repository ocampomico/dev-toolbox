import { useEffect, useState } from 'react'
import { ThemeSwitch } from './theme'
import { Encode } from './views/Encode'
import { Hash, Uuid } from './views/Ids'
import { Json } from './views/Json'
import { Jwt } from './views/Jwt'
import { Time } from './views/Time'

const TABS = [
  { id: 'json', label: 'JSON', title: 'JSON and CSV', blurb: 'Format, validate, and convert between JSON and CSV.', View: Json },
  { id: 'encode', label: 'Encode', title: 'Base64 and URL', blurb: 'Encode and decode Base64 (UTF-8 safe) and URL components.', View: Encode },
  { id: 'jwt', label: 'JWT', title: 'JWT decoder', blurb: 'Read the header, payload, and expiry of a JSON Web Token.', View: Jwt },
  { id: 'uuid', label: 'UUID', title: 'UUIDs', blurb: 'Generate v4 or v7 UUIDs, or inspect one.', View: Uuid },
  { id: 'hash', label: 'Hash', title: 'Hashes', blurb: 'SHA digests and HMACs of any text.', View: Hash },
  { id: 'time', label: 'Time', title: 'Timestamps', blurb: 'Convert Unix timestamps and dates across time zones.', View: Time },
] as const

type TabId = (typeof TABS)[number]['id']

const tabFromHash = (): TabId => TABS.find((t) => `#${t.id}` === window.location.hash)?.id ?? 'json'

export default function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash)
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    document.title = `${active.title} · Dev Toolbox`
  }, [active])

  const goTo = (id: TabId) => {
    window.history.replaceState(null, '', `#${id}`)
    setTab(id)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10 lg:px-8">
      <aside className="relative flex items-center justify-between gap-1 py-4 lg:sticky lg:top-0 lg:h-dvh lg:flex-col lg:items-stretch lg:justify-start lg:py-8">
        <p className="mr-auto text-[15px] font-semibold tracking-tight lg:mr-0 lg:px-3">Dev Toolbox</p>
        <nav
          aria-label="Tools"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:pb-0"
        >
          <ul className="flex lg:flex-col lg:gap-0.5">
            {TABS.map((t) => {
              const on = t.id === tab
              return (
                <li key={t.id} className="min-w-0 flex-1 lg:flex-none">
                  <a
                    href={`#${t.id}`}
                    aria-current={on ? 'page' : undefined}
                    onClick={(e) => {
                      e.preventDefault()
                      goTo(t.id)
                    }}
                    className={`flex min-h-14 items-center justify-center border-t-2 text-[11px] lg:min-h-0 lg:justify-start lg:rounded-lg lg:border-0 lg:px-3 lg:py-2 lg:text-sm ${
                      on ? 'border-ink font-semibold text-ink lg:bg-accent-soft lg:font-medium' : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    {t.label}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="lg:mt-auto">
          <ThemeSwitch storageKey="dev-toolbox:theme" />
        </div>
      </aside>

      <div className="min-w-0 pt-2 pb-28 lg:py-8">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">{active.title}</h1>
          <p className="mt-1 text-sm text-muted">{active.blurb}</p>
        </header>

        {/* Every tool stays mounted so its input survives switching tabs. */}
        <main>
          {TABS.map((t) => (
            <div key={t.id} hidden={t.id !== tab}>
              <t.View />
            </div>
          ))}
        </main>

        <footer className="mt-8">
          <p className="text-xs text-muted">Everything runs in this browser. Nothing you paste is stored or sent to a server.</p>
        </footer>
      </div>
    </div>
  )
}
