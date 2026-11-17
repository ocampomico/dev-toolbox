import { base64Decode } from './encode'

export type DecodedJwt = {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
}

/** Decode without verifying. Throws with a readable message for malformed tokens. */
export function decodeJwt(token: string): DecodedJwt {
  const parts = token.trim().replace(/^Bearer\s+/i, '').split('.')
  if (parts.length !== 3) throw new Error(`A JWT has 3 parts separated by dots; this has ${parts.length}.`)
  const part = (s: string, name: string) => {
    let text: string
    try {
      text = base64Decode(s)
    } catch {
      throw new Error(`The ${name} is not valid Base64URL.`)
    }
    try {
      const v = JSON.parse(text)
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error()
      return v as Record<string, unknown>
    } catch {
      throw new Error(`The ${name} is not a JSON object.`)
    }
  }
  return { header: part(parts[0], 'header'), payload: part(parts[1], 'payload'), signature: parts[2] }
}

export type TimeClaim = { claim: 'iat' | 'nbf' | 'exp'; label: string; date: Date }

const TIME_CLAIMS = [
  { claim: 'iat', label: 'Issued' },
  { claim: 'nbf', label: 'Not before' },
  { claim: 'exp', label: 'Expires' },
] as const

export function timeClaims(payload: Record<string, unknown>): TimeClaim[] {
  return TIME_CLAIMS.flatMap(({ claim, label }) => {
    const v = payload[claim]
    return typeof v === 'number' && Number.isFinite(v) ? [{ claim, label, date: new Date(v * 1000) }] : []
  })
}

export type JwtStatus = 'valid' | 'expired' | 'not-yet-valid' | 'no-expiry'

export function jwtStatus(payload: Record<string, unknown>, now = Date.now()): JwtStatus {
  const { exp, nbf } = payload
  if (typeof nbf === 'number' && nbf * 1000 > now) return 'not-yet-valid'
  if (typeof exp !== 'number') return 'no-expiry'
  return exp * 1000 <= now ? 'expired' : 'valid'
}
