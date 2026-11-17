export type ParsedTime = { date: Date; from: 'seconds' | 'milliseconds' | 'text' }

/**
 * A Unix timestamp in seconds or milliseconds, or a date string. Numbers below 1e11 are read as
 * seconds (1e11 seconds is the year 5138; 1e11 milliseconds is 1973).
 */
export function parseTime(input: string): ParsedTime | null {
  const s = input.trim()
  if (!s) return null
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    const from = Math.abs(n) < 1e11 ? 'seconds' : 'milliseconds'
    const date = new Date(from === 'seconds' ? n * 1000 : n)
    return Number.isNaN(date.getTime()) ? null : { date, from }
  }
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : { date: new Date(t), from: 'text' }
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365.25 * 864e5],
  ['month', 30.44 * 864e5],
  ['week', 7 * 864e5],
  ['day', 864e5],
  ['hour', 36e5],
  ['minute', 6e4],
  ['second', 1e3],
]

export function relative(date: Date, now = Date.now()): string {
  const diff = date.getTime() - now
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === 'second') return rtf.format(Math.round(diff / ms), unit)
  }
  return ''
}

export type TimeRow = { label: string; value: string }

export function timeRows(date: Date, timeZone: string, now = Date.now()): TimeRow[] {
  const ms = date.getTime()
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(date)
  return [
    { label: 'Unix seconds', value: String(Math.floor(ms / 1000)) },
    { label: 'Unix milliseconds', value: String(ms) },
    { label: 'ISO 8601 (UTC)', value: date.toISOString() },
    { label: timeZone, value: local },
    { label: 'RFC 2822', value: date.toUTCString() },
    { label: 'Relative', value: relative(date, now) },
  ]
}
