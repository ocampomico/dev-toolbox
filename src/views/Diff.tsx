import { useEffect, useMemo, useState } from 'react'
import { countDiff, diffJson, previewValue, type DiffEntry, type DiffKind } from '../lib/diff'
import { formatJson, parseJson, type ParseResult } from '../lib/json'
import { Badge, Button, Card, Code, ErrorNote } from '../ui'

const SAMPLE_LEFT = '{"user":{"name":"Ada","email":"ada@example.com","tags":["math","engines","poetry"],"team":{"id":7,"lead":true}},"version":1}'
const SAMPLE_RIGHT = '{"version":"2","user":{"name":"Ada","tags":["math","engines"],"team":null,"phone":"+44 20 7946 0000"}}'

// Showing every row of a huge diff costs more than it helps; the counts still cover everything.
const MAX_ROWS = 500

const KIND_LABEL: Record<DiffKind, string> = { added: 'Added', removed: 'Removed', changed: 'Changed' }

/** The value after it has stopped changing for a moment. Longer pauses for bigger input so typing stays smooth. */
function useSettled(value: string): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), value.length > 200_000 ? 500 : 200)
    return () => window.clearTimeout(t)
  }, [value])
  return settled
}

const parseSide = (text: string): ParseResult | null => (text.trim() ? parseJson(text) : null)

const errorText = (r: ParseResult | null) => (r && !r.ok ? (r.line ? `Line ${r.line}, column ${r.column}: ${r.error}` : r.error) : '')

function safePreview(v: unknown) {
  try {
    return previewValue(v)
  } catch {
    return '(too deeply nested to show)'
  }
}

function Side({ label, value, onChange, error, errId }: { label: string; value: string; onChange: (s: string) => void; error: string; errId: string }) {
  return (
    <div>
      <Code label={label} value={value} onChange={onChange} rows={14} invalid={!!error} describedBy={error ? errId : undefined} placeholder='{"paste": "JSON here"}' />
      {error && <ErrorNote id={errId}>{error}</ErrorNote>}
    </div>
  )
}

function Row({ e }: { e: DiffEntry }) {
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={e.kind === 'changed' ? 'neutral' : e.kind === 'added' ? 'good' : 'warn'}>{KIND_LABEL[e.kind]}</Badge>
        <code className="min-w-0 font-mono text-[13px] break-all">{e.path}</code>
      </div>
      <dl className="mt-1.5 grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 font-mono text-[12px]">
        {e.kind !== 'added' && (
          <>
            <dt className="font-sans text-muted">Old</dt>
            <dd className="break-all">{safePreview(e.before)}</dd>
          </>
        )}
        {e.kind !== 'removed' && (
          <>
            <dt className="font-sans text-muted">New</dt>
            <dd className="break-all">{safePreview(e.after)}</dd>
          </>
        )}
      </dl>
    </li>
  )
}

export function Diff() {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const sLeft = useSettled(left)
  const sRight = useSettled(right)
  const pending = sLeft !== left || sRight !== right

  const pl = useMemo(() => parseSide(sLeft), [sLeft])
  const pr = useMemo(() => parseSide(sRight), [sRight])

  const entries = useMemo(() => (pl?.ok && pr?.ok ? diffJson(pl.value, pr.value) : null), [pl, pr])
  const counts = entries ? countDiff(entries) : null

  const swap = () => {
    setLeft(right)
    setRight(left)
  }

  // Formats whichever sides parse and leaves a broken side alone so its error stays visible.
  const formatBoth = () => {
    const l = parseJson(left)
    const r = parseJson(right)
    if (l.ok && left.trim()) setLeft(formatJson(l.value))
    if (r.ok && right.trim()) setRight(formatJson(r.value))
  }

  let status = 'Paste JSON on both sides to compare them.'
  if (entries && counts) {
    status = entries.length
      ? `${entries.length} ${entries.length === 1 ? 'difference' : 'differences'}: ${counts.added} added, ${counts.removed} removed, ${counts.changed} changed.`
      : 'No differences. Both sides hold the same JSON.'
  } else if ((pl && !pl.ok) || (pr && !pr.ok)) {
    status = 'Fix the JSON error above to see the differences.'
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={swap} disabled={!left && !right}>
          Swap sides
        </Button>
        <Button onClick={formatBoth} disabled={!left.trim() && !right.trim()}>
          Format both
        </Button>
        <span className="ml-auto">
          <Button
            variant="ghost"
            onClick={() => {
              setLeft(formatJson(JSON.parse(SAMPLE_LEFT)))
              setRight(formatJson(JSON.parse(SAMPLE_RIGHT)))
            }}
          >
            Load sample
          </Button>
        </span>
      </div>

      <Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Side label="Left (original)" value={left} onChange={setLeft} error={errorText(pl)} errId="diff-left-error" />
          <Side label="Right (changed)" value={right} onChange={setRight} error={errorText(pr)} errId="diff-right-error" />
        </div>
        <p className="mt-3 text-xs text-muted">Objects are matched by key, so key order does not count as a change. Arrays are matched by position.</p>
      </Card>

      <Card
        title="Differences"
        aside={
          counts && entries?.length ? (
            <>
              <Badge tone="good">{counts.added} added</Badge>
              <Badge tone="warn">{counts.removed} removed</Badge>
              <Badge>{counts.changed} changed</Badge>
            </>
          ) : entries ? (
            <Badge tone="good">Identical</Badge>
          ) : undefined
        }
      >
        <p className="text-sm text-muted">
          <span aria-live="polite">{status}</span>
          {pending && <span aria-hidden="true"> Comparing...</span>}
        </p>
        {entries && entries.length > 0 && (
          <>
            <ul className="mt-2 divide-y divide-line">
              {entries.slice(0, MAX_ROWS).map((e) => (
                <Row key={`${e.kind}:${e.path}`} e={e} />
              ))}
            </ul>
            {entries.length > MAX_ROWS && (
              <p className="mt-2 text-xs text-muted">
                Showing the first {MAX_ROWS} of {entries.length} differences.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
