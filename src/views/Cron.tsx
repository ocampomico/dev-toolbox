import { useEffect, useMemo, useState } from 'react'
import { CRON_FIELDS, explainCron, fieldRows, formatRun, nextRuns, parseCron } from '../lib/cron'
import { relative } from '../lib/time'
import { Badge, Card, CopyButton, ErrorNote, TextField } from '../ui'

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

const EXAMPLES = [
  { expr: '30 9 * * 1-5', note: 'weekday mornings' },
  { expr: '*/15 * * * *', note: 'every 15 minutes' },
  { expr: '0 0 1 * *', note: 'start of each month' },
  { expr: '0 9-17/2 * * MON-FRI', note: 'every 2 hours at work' },
  { expr: '0 12 1,15 * FRI', note: 'both day fields' },
  { expr: '0 0 29 2 *', note: 'leap days' },
  { expr: '@weekly', note: 'shortcut' },
]

const RUN_COUNT = 5

export function Cron() {
  const [input, setInput] = useState('30 9 * * 1-5')
  const [now, setNow] = useState(() => Date.now())

  // Keeps the upcoming runs current when the tab is left open.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  const parsed = useMemo(() => parseCron(input), [input])
  const schedule = parsed.ok ? parsed.schedule : null
  const error = parsed.ok ? null : parsed.error
  const empty = !input.trim()

  const explanation = schedule ? explainCron(schedule) : ''
  const rows = schedule ? fieldRows(schedule) : []
  const runs = useMemo(() => (schedule ? nextRuns(schedule, new Date(now), RUN_COUNT, LOCAL_TZ) : []), [schedule, now])

  // Shows each field under its token so a mistake is easy to spot.
  const tokens = (schedule ? schedule.expanded : input.trim()).split(/\s+/)
  const showTokens = !empty && !input.trim().startsWith('@') && tokens.length === 5

  return (
    <div className="space-y-4">
      <Card>
        <TextField
          label="Cron expression"
          value={input}
          onChange={setInput}
          mono
          placeholder="30 9 * * 1-5"
          invalid={!!error && !empty}
          describedBy={error && !empty ? 'cron-error' : 'cron-format'}
        />
        <p id="cron-format" className="mt-2 text-xs text-muted">
          Five fields: minute, hour, day of month, month, day of week. Shortcuts like @daily and @hourly work too.
        </p>

        {showTokens && (
          <ol className="mt-3 grid grid-cols-5 gap-1.5" aria-label="Fields">
            {CRON_FIELDS.map((f, i) => {
              const bad = error?.index === i
              return (
                <li key={f.key} className={`min-w-0 rounded-lg border px-1.5 py-1.5 text-center ${bad ? 'border-warn bg-warn-soft' : 'border-line bg-paper'}`}>
                  <span className={`block truncate font-mono text-[13px] ${bad ? 'text-warn' : ''}`}>{tokens[i]}</span>
                  <span className={`mt-0.5 block text-[10px] leading-tight sm:text-[11px] ${bad ? 'text-warn' : 'text-muted'}`}>
                    {f.label}
                    {bad && <span className="sr-only"> (has an error)</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        )}

        {error && !empty && <ErrorNote id="cron-error">{error.message}</ErrorNote>}

        <div className="mt-4">
          <p className="mb-1.5 text-[13px] font-medium text-muted" id="cron-examples">
            Examples
          </p>
          <ul className="flex flex-wrap gap-2" aria-labelledby="cron-examples">
            {EXAMPLES.map((ex) => (
              <li key={ex.expr}>
                <button
                  type="button"
                  onClick={() => setInput(ex.expr)}
                  aria-pressed={input.trim() === ex.expr}
                  className={`flex min-h-9 flex-col items-start rounded-lg border px-2.5 py-1 text-left ${
                    input.trim() === ex.expr ? 'border-ink bg-accent-soft' : 'border-line bg-card hover:border-field'
                  }`}
                >
                  <span className="font-mono text-[13px]">{ex.expr}</span>
                  <span className="text-[11px] text-muted">{ex.note}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card title="Meaning" aside={schedule && <CopyButton text={explanation} small />}>
        <p className="text-lg font-medium tracking-tight" aria-live="polite">
          {schedule ? explanation : empty ? 'Enter an expression to see what it means.' : 'Fix the error above to see what this means.'}
        </p>
        {schedule?.alias && (
          <p className="mt-1 text-sm text-muted">
            {schedule.alias} is short for <code className="font-mono">{schedule.expanded}</code>.
          </p>
        )}
        {schedule && !schedule.fields.dayOfMonth.star && !schedule.fields.dayOfWeek.star && (
          <p className="mt-2 text-xs text-muted">Both day fields are set, so cron runs on days that match either one.</p>
        )}
      </Card>

      {schedule && (
        <Card title={`Next ${RUN_COUNT} runs`} aside={<Badge>{LOCAL_TZ}</Badge>}>
          {runs.length ? (
            <ol className="divide-y divide-line">
              {runs.map((d) => (
                <li key={d.getTime()} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                  <time dateTime={d.toISOString()} className="font-mono text-[13px] tabular-nums">
                    {formatRun(d, LOCAL_TZ)}
                  </time>
                  <span className="text-xs text-muted">{relative(d, now)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-warn">This schedule never runs. No month has that date.</p>
          )}
          <p className="mt-3 text-xs text-muted">
            Times are in this device's time zone. A time that a daylight saving change skips is left out, and a time that happens twice runs once.
          </p>
        </Card>
      )}

      {schedule && (
        <Card title="Fields">
          <dl className="divide-y divide-line">
            {rows.map((r) => (
              <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[8rem_6rem_minmax(0,1fr)]">
                <dt className="text-[13px] text-muted">
                  {r.label}
                  <span className="block text-[11px]">{r.allowed}</span>
                </dt>
                <dd className="text-right font-mono text-[13px] break-all sm:text-left">{r.source}</dd>
                <dd className="col-span-2 min-w-0 text-[13px] sm:col-span-1">
                  {r.meaning}
                  {/* The expanded list only helps when it says something the words and the source do not. */}
                  {r.values !== 'all' && r.values !== r.meaning && r.values !== r.source && (
                    <span className="mt-0.5 block font-mono text-[12px] break-words text-muted">{r.values}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  )
}
