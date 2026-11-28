import { useEffect, useMemo, useRef, useState } from 'react'
import { CHEAT_SHEET, compileRegex, flagString, highlightSegments, REGEX_FLAGS, supportsFlag, type FlagKey, type RegexMatch } from '../lib/regex'
import type { RegexJob, RegexReply } from '../workers/regex.worker'
import { Badge, Card, Code, CopyButton, ErrorNote, TextField } from '../ui'

const MATCH_LIMIT = 1000
const TIMEOUT_MS = 1000

const SAMPLE_PATTERN = '(?<user>[\\w.+-]+)@(?<domain>[\\w-]+(?:\\.[\\w-]+)+)'
const SAMPLE_TEXT = 'Write to ada@example.com or grace.hopper@navy.mil.\nBounced: not-an-email@, @nobody.org\nCc: linus+lists@kernel.org'
const SAMPLE_REPLACEMENT = '$<user> at $<domain>'

// Checked once: browsers older than Chrome 112 and Safari 17 throw on the v flag.
const FLAGS = REGEX_FLAGS.filter((f) => supportsFlag(f.key))

type Run =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'done'; reply: Extract<RegexReply, { ok: true }> }
  | { state: 'failed'; error: string }
  | { state: 'timeout' }

function newWorker() {
  return new Worker(new URL('../workers/regex.worker.ts', import.meta.url), { type: 'module' })
}

/**
 * Runs matching in a worker and kills it if it takes too long. A busy worker is replaced rather
 * than queued behind, so each run gets its own full second.
 */
function useRegexRun(job: Omit<RegexJob, 'id'> | null): Run {
  const [run, setRun] = useState<Run>({ state: 'idle' })
  const worker = useRef<Worker | null>(null)
  const busy = useRef(false)
  const nextId = useRef(0)

  useEffect(() => () => worker.current?.terminate(), [])

  useEffect(() => {
    if (!job) return
    let timer: number | undefined
    // A short pause so typing a long test string does not start a run per keystroke.
    const start = window.setTimeout(() => {
      if (busy.current && worker.current) {
        worker.current.terminate()
        worker.current = null
      }
      const w = (worker.current ??= newWorker())
      const id = ++nextId.current
      busy.current = true
      setRun({ state: 'running' })
      w.onmessage = (e: MessageEvent<RegexReply>) => {
        if (e.data.id !== id) return
        window.clearTimeout(timer)
        busy.current = false
        setRun(e.data.ok ? { state: 'done', reply: e.data } : { state: 'failed', error: e.data.error })
      }
      w.onerror = (e) => {
        e.preventDefault()
        window.clearTimeout(timer)
        busy.current = false
        w.terminate()
        if (worker.current === w) worker.current = null
        setRun({ state: 'failed', error: 'Matching stopped with an internal error. Try again or change the pattern.' })
      }
      timer = window.setTimeout(() => {
        w.terminate()
        if (worker.current === w) worker.current = null
        busy.current = false
        setRun({ state: 'timeout' })
      }, TIMEOUT_MS)
      w.postMessage({ ...job, id } satisfies RegexJob)
    }, 120)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(timer)
    }
  }, [job])

  // Without a job (empty or invalid pattern) whatever ran last no longer applies.
  return job ? run : { state: 'idle' }
}

function Value({ text }: { text: string | undefined }) {
  if (text === undefined) return <span className="font-sans text-muted italic">not matched</span>
  if (text === '') return <span className="font-sans text-muted italic">empty</span>
  return <span className="break-all whitespace-pre-wrap">{text}</span>
}

function MatchItem({ m, n }: { m: RegexMatch; n: number }) {
  // Names come from a scan of the pattern; when that scan could not label a named group, list them separately.
  const unlabeled = m.named.filter((g) => !m.groups.some((x) => x.name === g.name))
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[13px] font-medium">Match {n}</span>
        <span className="num text-xs text-muted">
          index {m.index}, length {m.end - m.index}
        </span>
      </div>
      <code className="mt-1 block rounded-md bg-paper px-2 py-1 font-mono text-[13px]">
        <Value text={m.text} />
      </code>
      {(m.groups.length > 0 || unlabeled.length > 0) && (
        <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-[12px]">
          {m.groups.map((g) => (
            <div key={g.index} className="contents">
              <dt className="text-muted">
                ${g.index}
                {g.name && <span className="block text-[11px]">$&lt;{g.name}&gt;</span>}
              </dt>
              <dd>
                <Value text={g.value} />
                {g.start !== undefined && (
                  <span className="num ml-2 font-sans text-[11px] text-muted">
                    {g.start} to {g.end}
                  </span>
                )}
              </dd>
            </div>
          ))}
          {unlabeled.map((g) => (
            <div key={g.name} className="contents">
              <dt className="text-muted">$&lt;{g.name}&gt;</dt>
              <dd>
                <Value text={g.value} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}

function Highlighted({ text, matches }: { text: string; matches: RegexMatch[] }) {
  const segments = useMemo(() => highlightSegments(text, matches), [text, matches])
  return (
    <pre
      tabIndex={0}
      aria-label="Highlighted matches"
      className="max-h-80 overflow-auto rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap"
    >
      {segments.map((s, i) =>
        s.match === undefined ? (
          s.text
        ) : s.text === '' ? (
          // Zero-length matches get a thin bar so positions like ^ or \b are still visible.
          <span key={i} aria-hidden="true" className="mx-px inline-block h-[1.1em] w-0.5 translate-y-[0.15em] bg-series-2" />
        ) : (
          <mark key={i} className={`rounded-sm text-ink ${s.match % 2 ? 'bg-series-3/30' : 'bg-series-1/25'}`}>
            {s.text}
          </mark>
        ),
      )}
    </pre>
  )
}

export function Regex() {
  const [pattern, setPattern] = useState(SAMPLE_PATTERN)
  const [flags, setFlags] = useState<Set<FlagKey>>(() => new Set<FlagKey>(['g']))
  const [text, setText] = useState(SAMPLE_TEXT)
  const [replacement, setReplacement] = useState(SAMPLE_REPLACEMENT)

  const flagText = flagString(flags)
  // Compiling is quick and cannot hang, so syntax errors show while typing without a worker round trip.
  const compiled = useMemo(() => (pattern ? compileRegex(pattern, flagText) : null), [pattern, flagText])
  const syntaxError = compiled && !compiled.ok ? compiled.error : ''

  const job = useMemo(
    () => (compiled?.ok ? { pattern, flags: flagText, text, replacement, limit: MATCH_LIMIT } : null),
    [compiled, pattern, flagText, text, replacement],
  )
  const run = useRegexRun(job)
  const reply = run.state === 'done' ? run.reply : null
  const matches = reply?.list.matches ?? []

  const toggle = (key: FlagKey, on: boolean) =>
    setFlags((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      // u and v cannot be combined, so turning one on turns the other off.
      if (on && key === 'u') next.delete('v')
      if (on && key === 'v') next.delete('u')
      return next
    })

  const count = matches.length
  const status = !pattern
    ? 'Enter a pattern to start.'
    : syntaxError
      ? 'Fix the pattern to see matches.'
      : run.state === 'timeout'
        ? ''
        : run.state === 'failed'
          ? ''
          : !reply
            ? 'Matching...'
            : count === 0
              ? 'No matches.'
              : reply.list.capped
                ? `Showing the first ${MATCH_LIMIT.toLocaleString()} matches. There are more.`
                : `${count.toLocaleString()} ${count === 1 ? 'match' : 'matches'}.`

  return (
    <div className="space-y-4">
      <Card>
        <TextField
          label="Pattern"
          value={pattern}
          onChange={setPattern}
          mono
          placeholder="\d{3}-\d{4}"
          invalid={!!syntaxError}
          describedBy={syntaxError ? 'regex-error' : 'regex-literal'}
        />
        {syntaxError ? (
          <ErrorNote id="regex-error">{syntaxError}</ErrorNote>
        ) : (
          <p id="regex-literal" className="mt-2 font-mono text-xs break-all text-muted">
            /{pattern}/{flagText}
          </p>
        )}

        <fieldset className="mt-4">
          <legend className="mb-1.5 text-[13px] font-medium text-muted">
            Flags
          </legend>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 min-[390px]:grid-cols-2 sm:grid-cols-4">
            {FLAGS.map((f) => (
              <label key={f.key} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm" title={f.hint}>
                <input type="checkbox" className="size-4 accent-(--accent)" checked={flags.has(f.key)} onChange={(e) => toggle(f.key, e.target.checked)} />
                <span className="w-3 font-mono text-[13px] font-semibold">{f.key}</span>
                <span className="text-muted">{f.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <Code label="Test string" value={text} onChange={setText} rows={8} placeholder="Paste text to match against" />
        </div>
      </Card>

      <Card title="Matches" aside={reply && count > 0 && <Badge>{reply.list.capped ? `${MATCH_LIMIT.toLocaleString()}+` : count.toLocaleString()}</Badge>}>
        <p id="regex-status" className="text-sm text-muted" aria-live="polite">
          {status}
        </p>
        {run.state === 'timeout' && (
          <ErrorNote>
            Matching took longer than {TIMEOUT_MS / 1000} second and was stopped. The pattern probably backtracks too much on this text, which often happens with
            nested repeats like (a+)+ or (\w*)*. Make the repeats more specific or shorten the test string.
          </ErrorNote>
        )}
        {run.state === 'failed' && <ErrorNote>{run.error}</ErrorNote>}

        {reply && text && (
          <div className="mt-3">
            <Highlighted text={text} matches={matches} />
            {reply.list.capped && <p className="mt-2 text-xs text-muted">Highlighting stops after match {MATCH_LIMIT.toLocaleString()}.</p>}
          </div>
        )}

        {count > 0 && (
          <ol className="mt-2 divide-y divide-line" aria-label="Match list">
            {matches.map((m, i) => (
              <MatchItem key={`${m.index}-${i}`} m={m} n={i + 1} />
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted">Indexes count UTF-16 code units, the same as JavaScript, so an emoji usually counts as 2.</p>
      </Card>

      <Card title="Replace" aside={reply && <CopyButton text={reply.replaced} small />}>
        <TextField label="Replacement" value={replacement} onChange={setReplacement} mono placeholder="$1, $<name> or $&" describedBy="regex-replace-help" />
        <p id="regex-replace-help" className="mt-2 text-xs text-muted">
          $&amp; is the whole match, $1 is the first group and $&lt;name&gt; is a named group. Without the g flag only the first match is replaced.
        </p>
        <div className="mt-3">
          <Code label="Result" value={reply ? reply.replaced : ''} rows={6} placeholder={syntaxError ? 'Fix the pattern to see the result' : ''} />
        </div>
      </Card>

      <Card title="Cheat sheet">
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {CHEAT_SHEET.map((sec) => (
            <section key={sec.title}>
              <h3 className="mb-1 text-[13px] font-medium text-muted">{sec.title}</h3>
              <dl className="divide-y divide-line">
                {sec.items.map(([token, meaning]) => (
                  <div key={token} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 py-1.5">
                    <dt className="font-mono text-[13px] break-words">{token}</dt>
                    <dd className="text-[13px]">{meaning}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Card>
    </div>
  )
}
