import { useMemo, useState } from 'react'
import { formatJson } from '../lib/json'
import { decodeJwt, jwtStatus, timeClaims, type JwtStatus } from '../lib/jwt'
import { relative } from '../lib/time'
import { Badge, Card, Code, CopyButton, ErrorNote } from '../ui'

const STATUS: Record<JwtStatus, { label: string; tone: 'good' | 'warn' | 'neutral' }> = {
  valid: { label: 'Not expired', tone: 'good' },
  expired: { label: 'Expired', tone: 'warn' },
  'not-yet-valid': { label: 'Not valid yet', tone: 'warn' },
  'no-expiry': { label: 'No expiry', tone: 'neutral' },
}

const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long' })

export function Jwt() {
  const [token, setToken] = useState('')

  const res = useMemo(() => {
    if (!token.trim()) return null
    try {
      return { ok: true as const, jwt: decodeJwt(token) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [token])

  const header = res?.ok ? formatJson(res.jwt.header) : ''
  const payload = res?.ok ? formatJson(res.jwt.payload) : ''
  const status = res?.ok ? STATUS[jwtStatus(res.jwt.payload)] : null

  return (
    <div className="space-y-4">
      <Card>
        <Code
          label="Token"
          value={token}
          onChange={setToken}
          rows={5}
          placeholder="eyJhbGciOi..."
          invalid={res?.ok === false}
          describedBy={res?.ok === false ? 'jwt-error' : undefined}
        />
        {res?.ok === false && <ErrorNote id="jwt-error">{res.error}</ErrorNote>}
        <p className="mt-2 text-xs text-muted">The token is decoded in this page and never stored or sent anywhere. The signature is not checked.</p>
      </Card>

      {res?.ok && (
        <>
          <Card
            title="Claims"
            aside={
              <>
                {typeof res.jwt.header.alg === 'string' && <Badge>{res.jwt.header.alg}</Badge>}
                {status && <Badge tone={status.tone}>{status.label}</Badge>}
              </>
            }
          >
            {timeClaims(res.jwt.payload).length ? (
              <dl className="divide-y divide-line">
                {timeClaims(res.jwt.payload).map((c) => (
                  <div key={c.claim} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2">
                    <dt className="w-full text-[13px] text-muted sm:w-32">
                      {c.label} <span className="font-mono">({c.claim})</span>
                    </dt>
                    <dd className="text-sm">
                      {fmt.format(c.date)} <span className="text-muted">· {relative(c.date)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted">No iat, nbf, or exp claims.</p>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Header" aside={<CopyButton text={header} small />}>
              <Code label="Header JSON" value={header} rows={6} />
            </Card>
            <Card title="Payload" aside={<CopyButton text={payload} small />}>
              <Code label="Payload JSON" value={payload} rows={12} />
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
