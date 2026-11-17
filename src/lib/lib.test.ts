import { describe, expect, it } from 'vitest'
import { base64Decode, base64Encode, urlDecode, urlEncode } from './encode'
import { digest, hmac, inspectUuid, uuidV4, uuidV7 } from './ids'
import { csvToJson, detectDelimiter, findErrorIndex, jsonToCsv, parseCsv, parseJson, sortKeys } from './json'
import { decodeJwt, jwtStatus, timeClaims } from './jwt'
import { parseTime, relative, timeRows } from './time'

describe('json', () => {
  it('reports a line and column for syntax errors', () => {
    const r = parseJson('{\n  "a": 1,\n  "b": }')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.line).toBe(3)
      expect(r.column).toBeGreaterThan(1)
    }
  })

  it('sorts keys deeply', () => {
    expect(JSON.stringify(sortKeys({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } }))).toBe('{"a":{"c":[{"y":2,"z":1}],"d":1},"b":1}')
  })

  it('converts objects to CSV with flattened keys and escaping', () => {
    const csv = jsonToCsv([
      { id: 1, name: 'Ann "A"', addr: { city: 'LA' } },
      { id: 2, tags: ['x', 'y'], note: 'a,b' },
    ])
    expect(csv).toBe('id,name,addr.city,tags,note\n1,"Ann ""A""",LA,,\n2,,,"[""x"",""y""]","a,b"')
  })

  it('rejects arrays of non-objects', () => {
    expect(() => jsonToCsv([1, 2])).toThrow()
  })

  it('parses quoted CSV fields with newlines', () => {
    expect(parseCsv('a,b\r\n"x\ny","he said ""hi"""\n', ',')).toEqual([
      ['a', 'b'],
      ['x\ny', 'he said "hi"'],
    ])
  })

  it('round-trips CSV back into nested, typed JSON', () => {
    const data = [{ id: 1, ok: true, user: { name: 'Ann' }, empty: null }]
    expect(csvToJson(jsonToCsv(data))).toEqual(data)
    expect(csvToJson('zip\n02134', { inferTypes: true })).toEqual([{ zip: '02134' }])
  })

  it('detects tab and semicolon delimiters', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
    expect(detectDelimiter('a;b\n1;2')).toBe(';')
  })
})

describe('encode', () => {
  it('handles UTF-8 Base64 both ways', () => {
    expect(base64Encode('héllo ✓')).toBe('aMOpbGxvIOKckw==')
    expect(base64Decode('aMOpbGxvIOKckw==')).toBe('héllo ✓')
  })
  it('makes and reads URL-safe Base64 without padding', () => {
    const s = base64Encode('??>>', true)
    expect(s).not.toMatch(/[+/=]/)
    expect(base64Decode(s)).toBe('??>>')
  })
  it('rejects invalid Base64', () => {
    expect(() => base64Decode('abc$')).toThrow()
    expect(() => base64Decode('a')).toThrow()
  })
  it('URL encodes and decodes', () => {
    expect(urlEncode('a b&c=d/é')).toBe('a%20b%26c%3Dd%2F%C3%A9')
    expect(urlDecode('a+b%26c')).toBe('a b&c')
  })
})

describe('jwt', () => {
  const make = (payload: object) => `${base64Encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), true)}.${base64Encode(JSON.stringify(payload), true)}.sig`

  it('decodes header, payload and time claims', () => {
    const d = decodeJwt(`Bearer ${make({ sub: '1', iat: 1_700_000_000, exp: 1_700_003_600 })}`)
    expect(d.header.alg).toBe('HS256')
    expect(d.payload.sub).toBe('1')
    expect(timeClaims(d.payload).map((c) => c.date.toISOString())).toEqual(['2023-11-14T22:13:20.000Z', '2023-11-14T23:13:20.000Z'])
  })

  it('explains malformed tokens', () => {
    expect(() => decodeJwt('abc.def')).toThrow(/3 parts/)
    expect(() => decodeJwt('e30.bm90IGpzb24.x')).toThrow(/payload is not a JSON object/)
  })

  it('reports status', () => {
    const now = 1_700_000_000_000
    expect(jwtStatus({ exp: now / 1000 - 1 }, now)).toBe('expired')
    expect(jwtStatus({ exp: now / 1000 + 60 }, now)).toBe('valid')
    expect(jwtStatus({ nbf: now / 1000 + 60 }, now)).toBe('not-yet-valid')
    expect(jwtStatus({}, now)).toBe('no-expiry')
  })
})

describe('ids', () => {
  it('makes v4 and v7 UUIDs that inspect correctly', () => {
    expect(inspectUuid(uuidV4())?.version).toBe(4)
    const t = 1_700_000_000_123
    const info = inspectUuid(uuidV7(t))
    expect(info?.version).toBe(7)
    expect(info?.variant).toBe('RFC 9562')
    expect(info?.time?.getTime()).toBe(t)
  })

  it('sorts v7 by time', () => {
    expect(uuidV7(1000) < uuidV7(2000)).toBe(true)
  })

  it('reads the v1 timestamp', () => {
    // From RFC 9562 appendix A.1: 2022-02-22 19:22:22 UTC.
    expect(inspectUuid('C232AB00-9414-11EC-B3C8-9F6BDECED846')?.time?.toISOString()).toBe('2022-02-22T19:22:22.000Z')
  })

  it('rejects non-UUIDs', () => {
    expect(inspectUuid('not-a-uuid')).toBeNull()
  })

  it('hashes with known vectors', async () => {
    expect(await digest('SHA-256', 'abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await hmac('SHA-256', 'key', 'The quick brown fox jumps over the lazy dog')).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    )
  })
})

describe('time', () => {
  it('reads seconds, milliseconds and text', () => {
    expect(parseTime('1700000000')).toEqual({ date: new Date(1_700_000_000_000), from: 'seconds' })
    expect(parseTime('1700000000000')?.from).toBe('milliseconds')
    expect(parseTime('2024-01-02T03:04:05Z')?.date.toISOString()).toBe('2024-01-02T03:04:05.000Z')
    expect(parseTime('nope')).toBeNull()
    expect(parseTime('')).toBeNull()
  })

  it('formats relative times', () => {
    const now = Date.UTC(2026, 0, 10)
    expect(relative(new Date(now - 3 * 864e5), now)).toBe('3 days ago')
    expect(relative(new Date(now + 2 * 36e5), now)).toBe('in 2 hours')
  })

  it('lists formats in the chosen time zone', () => {
    const rows = timeRows(new Date(0), 'UTC', 0)
    expect(rows.find((r) => r.label === 'Unix seconds')?.value).toBe('0')
    expect(rows.find((r) => r.label === 'UTC')?.value).toContain('1970')
  })
})

describe('findErrorIndex', () => {
  it('points at the bad character', () => {
    expect(findErrorIndex('{"a": tru}')).toBe(6)
    expect(findErrorIndex('[1, 2,]')).toBe(6)
    expect(findErrorIndex('{"a": 1} x')).toBe(9)
    expect(findErrorIndex('"abc')).toBe(4)
    expect(findErrorIndex('{"a": [1, {"b": null}], "c": "\\u00e9"}')).toBeNull()
  })
})
