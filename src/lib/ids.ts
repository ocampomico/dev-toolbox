const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

function format(bytes: Uint8Array) {
  const h = hex(bytes)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function uuidV4(): string {
  return crypto.randomUUID()
}

/** RFC 9562 UUIDv7: 48-bit Unix milliseconds, then random bits. Sorts by creation time. */
export function uuidV7(now = Date.now()): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  let ms = now
  for (let i = 5; i >= 0; i--) {
    b[i] = ms % 256
    ms = Math.floor(ms / 256)
  }
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  return format(b)
}

export type UuidInfo = { version: number; variant: string; time?: Date }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Version, variant, and (for v1, v6 and v7) the embedded timestamp. Null if not a UUID. */
export function inspectUuid(input: string): UuidInfo | null {
  const s = input.trim()
  if (!UUID_RE.test(s)) return null
  const h = s.replaceAll('-', '').toLowerCase()
  const version = parseInt(h[12], 16)
  const v = parseInt(h[16], 16)
  const variant = v < 8 ? 'NCS' : v < 12 ? 'RFC 9562' : v < 14 ? 'Microsoft' : 'Future'
  let time: Date | undefined
  if (version === 7) time = new Date(parseInt(h.slice(0, 12), 16))
  // v1 and v6 count 100ns intervals since 1582-10-15.
  const GREGORIAN_OFFSET = 12219292800000n
  if (version === 1) time = new Date(Number((BigInt(`0x${h.slice(13, 16)}${h.slice(8, 12)}${h.slice(0, 8)}`) / 10000n) - GREGORIAN_OFFSET))
  if (version === 6) time = new Date(Number((BigInt(`0x${h.slice(0, 12)}${h.slice(13, 16)}`) / 10000n) - GREGORIAN_OFFSET))
  return { version, variant, time }
}

export const HASHES = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const
export type HashAlgo = (typeof HASHES)[number]

export async function digest(algo: HashAlgo, text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest(algo, new TextEncoder().encode(text))))
}

export async function hmac(algo: HashAlgo, key: string, text: string): Promise<string> {
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: algo }, false, ['sign'])
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text))))
}
