import { useEffect, useState } from 'react'
import { digest, HASHES, hmac, inspectUuid, uuidV4, uuidV7 } from '../lib/ids'
import { Button, Card, Code, CopyButton, Rows, Segmented, TextField, Toggle } from '../ui'

type Version = 'v4' | 'v7'

const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long' })

function makeIds(version: Version, count: number, upper: boolean, hyphens: boolean) {
  return Array.from({ length: count }, () => {
    let id = version === 'v4' ? uuidV4() : uuidV7()
    if (!hyphens) id = id.replaceAll('-', '')
    return upper ? id.toUpperCase() : id
  }).join('\n')
}

export function Uuid() {
  const [version, setVersion] = useState<Version>('v4')
  const [count, setCount] = useState(5)
  const [upper, setUpper] = useState(false)
  const [hyphens, setHyphens] = useState(true)
  const [ids, setIds] = useState(() => makeIds('v4', 5, false, true))
  const [check, setCheck] = useState('')

  const regen = (v = version, c = count, u = upper, h = hyphens) => setIds(makeIds(v, c, u, h))
  const info = check.trim() ? inspectUuid(check) : null

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-x-5 gap-y-3">
          <Segmented
            label="Version"
            value={version}
            onChange={(v) => {
              setVersion(v)
              regen(v)
            }}
            options={[
              { value: 'v4', label: 'v4 random' },
              { value: 'v7', label: 'v7 time-ordered' },
            ]}
          />
          <label className="flex items-center gap-2 text-sm">
            How many
            <input
              type="number"
              min={1}
              max={1000}
              value={count}
              onChange={(e) => {
                const c = Math.min(1000, Math.max(1, Math.round(Number(e.target.value) || 1)))
                setCount(c)
                regen(version, c)
              }}
              className="h-9 w-20 rounded-lg border border-field bg-card px-2 text-sm"
            />
          </label>
          <Toggle
            label="Uppercase"
            checked={upper}
            onChange={(u) => {
              setUpper(u)
              regen(version, count, u)
            }}
          />
          <Toggle
            label="Hyphens"
            checked={hyphens}
            onChange={(h) => {
              setHyphens(h)
              regen(version, count, upper, h)
            }}
          />
        </div>
        <Code label={`${count} UUID${count === 1 ? '' : 's'}`} value={ids} rows={Math.min(12, Math.max(3, count))} />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => regen()}>
            Generate
          </Button>
          <CopyButton text={ids} label="Copy all" />
        </div>
      </Card>

      <Card title="Inspect a UUID">
        <TextField label="UUID" value={check} onChange={setCheck} mono placeholder="0190a7e4-6b4c-7d3a-9f1e-2c5b8a0d4e6f" />
        {check.trim() && (
          <div className="mt-3 text-sm">
            {info ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted">Version</dt>
                <dd>{info.version}</dd>
                <dt className="text-muted">Variant</dt>
                <dd>{info.variant}</dd>
                {info.time && (
                  <>
                    <dt className="text-muted">Created</dt>
                    <dd>{fmt.format(info.time)}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-warn">Not a UUID. Expected 32 hex digits in 8-4-4-4-12 groups.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

export function Hash() {
  const [text, setText] = useState('')
  const [key, setKey] = useState('')
  const [rows, setRows] = useState<{ label: string; value: string }[]>([])

  useEffect(() => {
    let live = true
    Promise.all(HASHES.map(async (a) => ({ label: key ? `HMAC-${a}` : a, value: key ? await hmac(a, key, text) : await digest(a, text) }))).then(
      (r) => live && setRows(r),
    )
    return () => {
      live = false
    }
  }, [text, key])

  return (
    <div className="space-y-4">
      <Card>
        <Code label="Text" value={text} onChange={setText} rows={6} placeholder="Text to hash, as UTF-8" />
        <div className="mt-4 max-w-md">
          <TextField label="HMAC key (optional)" value={key} onChange={setKey} mono />
        </div>
      </Card>
      <Card title={key ? 'HMAC' : 'Digests'} aside="Hex">
        <Rows rows={rows} />
        <p className="mt-3 text-xs text-muted">Uses the browser's Web Crypto API. MD5 is not offered because Web Crypto does not support it.</p>
      </Card>
    </div>
  )
}
