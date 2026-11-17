import { useEffect, useMemo, useState } from 'react'
import { parseTime, timeRows } from '../lib/time'
import { Button, Card, CopyButton, Rows, Select, TextField } from '../ui'

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

const ZONES = (() => {
  let all: string[] = []
  try {
    all = Intl.supportedValuesOf('timeZone')
  } catch {
    all = []
  }
  const set = new Set([LOCAL_TZ, 'UTC', ...all])
  return [...set].map((z) => ({ value: z, label: z === LOCAL_TZ ? `${z} (this device)` : z }))
})()

const FROM = { seconds: 'Read as Unix seconds', milliseconds: 'Read as Unix milliseconds', text: 'Read as a date' }

export function Time() {
  const [now, setNow] = useState(() => Date.now())
  const [input, setInput] = useState('')
  const [zone, setZone] = useState(LOCAL_TZ)

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const parsed = useMemo(() => parseTime(input), [input])
  const nowSec = String(Math.floor(now / 1000))

  return (
    <div className="space-y-4">
      <Card title="Now" aside={<CopyButton text={nowSec} small />}>
        <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums">{nowSec}</p>
        <p className="mt-1 text-sm text-muted">{new Date(now).toISOString()}</p>
      </Card>

      <Card title="Convert">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-end">
          <TextField label="Timestamp or date" value={input} onChange={setInput} mono placeholder="1700000000, 1700000000000, or 2026-03-01T09:30:00Z" />
          <Select label="Time zone" value={zone} onChange={setZone} options={ZONES} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setInput(nowSec)}>
            Use now
          </Button>
          {input.trim() && <p className={`text-[13px] ${parsed ? 'text-muted' : 'text-warn'}`}>{parsed ? FROM[parsed.from] : 'Not a timestamp or a date this browser can read.'}</p>}
        </div>
        {parsed && (
          <div className="mt-4">
            <Rows rows={timeRows(parsed.date, zone, now)} />
          </div>
        )}
      </Card>
    </div>
  )
}
