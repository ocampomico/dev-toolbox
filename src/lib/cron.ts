export type CronFieldKey = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek'

type FieldSpec = { key: CronFieldKey; label: string; unit: string; min: number; max: number; names?: string[] }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const CRON_FIELDS: FieldSpec[] = [
  { key: 'minute', label: 'Minute', unit: 'minute', min: 0, max: 59 },
  { key: 'hour', label: 'Hour', unit: 'hour', min: 0, max: 23 },
  { key: 'dayOfMonth', label: 'Day of month', unit: 'day of the month', min: 1, max: 31 },
  { key: 'month', label: 'Month', unit: 'month', min: 1, max: 12, names: MONTH_NAMES.map((m) => m.slice(0, 3).toUpperCase()) },
  // 7 is accepted as a second Sunday, as most cron implementations do.
  { key: 'dayOfWeek', label: 'Day of week', unit: 'day of the week', min: 0, max: 7, names: DAY_NAMES.map((d) => d.slice(0, 3).toUpperCase()) },
]

export const CRON_ALIASES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
}

/** One comma-separated piece of a field. `from` is a single start value with a step, like 5/15. */
type Part = { kind: 'all' | 'value' | 'range' | 'from'; start: number; end: number; step: number }

export type CronField = {
  key: CronFieldKey
  label: string
  source: string
  /** Allowed values, sorted. Day of week uses 0 for Sunday even when 7 was written. */
  values: number[]
  /** Cron treats a day field that starts with * as unrestricted when combining the two day fields. */
  star: boolean
  parts: Part[]
}

export type CronSchedule = {
  source: string
  /** The five-field form, which differs from `source` for @aliases. */
  expanded: string
  alias?: string
  fields: Record<CronFieldKey, CronField>
}

export type CronError = { message: string; field?: CronFieldKey; index?: number }

export type CronResult = { ok: true; schedule: CronSchedule } | { ok: false; error: CronError }

class FieldError extends Error {}

function rangeHint(spec: FieldSpec): string {
  if (spec.key === 'dayOfWeek') return '0-7 (0 and 7 are both Sunday)'
  return `${spec.min}-${spec.max}`
}

/** Quartz and some hosted schedulers add L, W, # and ?; say so instead of a vague "not a number". */
function rejectExtensions(token: string) {
  if (/^(\?|LW?|\d+[LW]|\w+#\d+)$/i.test(token)) {
    throw new FieldError(`"${token}" uses L, W, # or ?, which only some cron variants support. Standard cron does not.`)
  }
}

function parseValue(token: string, spec: FieldSpec): number {
  if (/^\d+$/.test(token)) {
    const n = Number(token)
    if (n < spec.min || n > spec.max) throw new FieldError(`${n} is out of range. Use ${rangeHint(spec)}.`)
    return n
  }
  if (spec.names) {
    const i = spec.names.indexOf(token.toUpperCase())
    if (i >= 0) return spec.key === 'month' ? i + 1 : i
    rejectExtensions(token)
    throw new FieldError(`"${token}" is not a number or a ${spec.key === 'month' ? 'month name like JAN' : 'day name like MON'}.`)
  }
  rejectExtensions(token)
  throw new FieldError(token ? `"${token}" is not a number.` : 'A value is missing.')
}

function parsePart(text: string, spec: FieldSpec): Part {
  if (!text) throw new FieldError('There is an empty item in the list. Check for a stray comma.')
  const pieces = text.split('/')
  if (pieces.length > 2) throw new FieldError(`"${text}" has more than one step.`)
  const [base, stepText] = pieces
  let step = 1
  if (stepText !== undefined) {
    const count = spec.key === 'dayOfWeek' ? 7 : spec.max - spec.min + 1
    if (!/^\d+$/.test(stepText)) throw new FieldError(`The step "${stepText}" must be a whole number.`)
    step = Number(stepText)
    if (step < 1 || step > count) throw new FieldError(`The step must be between 1 and ${count}, not ${step}.`)
  }
  if (base === '*') return { kind: 'all', start: spec.min, end: spec.key === 'dayOfWeek' ? 6 : spec.max, step }
  const bounds = base.split('-')
  if (bounds.length > 2) throw new FieldError(`"${base}" is not a valid range. Write ranges as start-end.`)
  if (bounds.length === 2) {
    const start = parseValue(bounds[0], spec)
    const end = parseValue(bounds[1], spec)
    if (start > end) {
      const hint = spec.key === 'dayOfWeek' && end === 0 ? ' Use 7 for Sunday at the end of a range, like 5-7.' : ''
      throw new FieldError(`The range ${base} runs backwards. Put the smaller value first.${hint}`)
    }
    return { kind: 'range', start, end, step }
  }
  const start = parseValue(base, spec)
  if (stepText !== undefined) return { kind: 'from', start, end: spec.max, step }
  return { kind: 'value', start, end: start, step }
}

function parseField(source: string, spec: FieldSpec): CronField {
  const parts = source.split(',').map((p) => parsePart(p, spec))
  const set = new Set<number>()
  for (const p of parts) {
    for (let v = p.start; v <= p.end; v += p.step) set.add(spec.key === 'dayOfWeek' && v === 7 ? 0 : v)
  }
  return { key: spec.key, label: spec.label, source, values: [...set].sort((a, b) => a - b), star: source.startsWith('*'), parts }
}

export function parseCron(input: string): CronResult {
  const source = input.trim()
  if (!source) return { ok: false, error: { message: 'Enter a cron expression, like 30 9 * * 1-5.' } }

  let expanded = source
  let alias: string | undefined
  if (source.startsWith('@')) {
    const key = source.toLowerCase()
    if (key === '@reboot') return { ok: false, error: { message: '@reboot runs once when the machine starts, so it has no schedule to explain.' } }
    if (!CRON_ALIASES[key]) {
      return { ok: false, error: { message: `${source} is not a known shortcut. Use one of ${Object.keys(CRON_ALIASES).join(', ')}.` } }
    }
    alias = key
    expanded = CRON_ALIASES[key]
  }

  const tokens = expanded.split(/\s+/)
  if (tokens.length !== 5) {
    const extra = tokens.length === 6 ? ' Seconds and year fields are not part of standard cron.' : ''
    return {
      ok: false,
      error: { message: `Expected 5 fields (minute, hour, day of month, month, day of week) but found ${tokens.length}.${extra}` },
    }
  }

  const fields = {} as Record<CronFieldKey, CronField>
  for (let i = 0; i < 5; i++) {
    const spec = CRON_FIELDS[i]
    try {
      fields[spec.key] = parseField(tokens[i], spec)
    } catch (e) {
      if (!(e instanceof FieldError)) throw e
      return { ok: false, error: { message: `${spec.label} (field ${i + 1}, "${tokens[i]}"): ${e.message}`, field: spec.key, index: i } }
    }
  }
  return { ok: true, schedule: { source, expanded: tokens.join(' '), alias, fields } }
}

// ---------- English ----------

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

export function joinList(items: string[], word = 'and'): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`
}

function valueName(key: CronFieldKey, v: number): string {
  if (key === 'month') return MONTH_NAMES[v - 1]
  if (key === 'dayOfWeek') return DAY_NAMES[v % 7]
  return String(v)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Each list item of a field in words, without the unit for plain values. */
function partPhrase(p: Part, spec: FieldSpec): string {
  const name = (v: number) => valueName(spec.key, v)
  const every = p.step === 1 ? `every ${spec.unit}` : `every ${ordinal(p.step)} ${spec.unit}`
  switch (p.kind) {
    case 'all':
      return every
    case 'value':
      return name(p.start)
    case 'range':
      return p.step === 1 ? `${name(p.start)} through ${name(p.end)}` : `${every} from ${name(p.start)} through ${name(p.end)}`
    case 'from':
      return `${every} from ${name(p.start)} through ${name(spec.key === 'dayOfWeek' ? 6 : p.end)}`
  }
}

/** A field in words, like "every 15th minute" or "Monday through Friday". */
export function describeField(field: CronField): string {
  const spec = CRON_FIELDS.find((s) => s.key === field.key)!
  return joinList(field.parts.map((p) => partPhrase(p, spec)))
}

const isPlain = (f: CronField) => f.parts.every((p) => p.kind === 'value')
const isAll = (f: CronField) => f.parts.length === 1 && f.parts[0].kind === 'all' && f.parts[0].step === 1

/** Plain values and ranges get a noun in front ("minutes 0 and 30"); "every ..." phrases stand alone. */
function withNoun(f: CronField, singular: string, plural: string): string {
  const words = describeField(f)
  if (f.parts.every((p) => p.kind === 'all' || p.kind === 'from' || p.step > 1)) return words
  const single = f.parts.length === 1 && f.parts[0].kind === 'value'
  return `${single ? singular : plural} ${words}`
}

function describeTime(minute: CronField, hour: CronField): string {
  if (isPlain(minute) && isPlain(hour) && minute.values.length * hour.values.length <= 6) {
    const times = hour.values.flatMap((h) => minute.values.map((m) => `${pad(h)}:${pad(m)}`))
    return `At ${joinList(times)}`
  }
  let text: string
  if (isAll(minute)) text = 'Every minute'
  else if (minute.parts.length === 1 && minute.parts[0].kind === 'all') text = `Every ${minute.parts[0].step} minutes`
  else text = `At ${withNoun(minute, 'minute', 'minutes')}`
  // "Every 15 minutes" already implies every hour; a fixed minute needs it said.
  if (isAll(hour)) return text.startsWith('Every') ? text : `${text} past every hour`
  return `${text} past ${withNoun(hour, 'hour', 'hours')}`
}

function describeDays(dom: CronField, dow: CronField): string {
  let domText = ''
  if (!isAll(dom)) {
    domText = `on ${withNoun(dom, 'day', 'days')}`
    if (!domText.endsWith('of the month')) domText += ' of the month'
  }
  const dowText = isAll(dow) ? '' : `on ${describeField(dow)}`
  if (domText && dowText) {
    // With both day fields restricted, cron runs when either matches. If one starts with *, both must.
    return !dom.star && !dow.star ? `${domText} or ${dowText}` : `${domText}, but only ${dowText}`
  }
  return domText || dowText
}

export function explainCron(schedule: CronSchedule): string {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = schedule.fields
  const time = describeTime(minute, hour)
  const pieces = [time]
  const days = describeDays(dayOfMonth, dayOfWeek)
  if (days) pieces.push(days)
  else if (isAll(month) && /^At \d/.test(time)) pieces.push('every day')
  if (!isAll(month)) pieces.push(`in ${describeField(month)}`)
  return pieces.join(' ')
}

export type FieldRow = { key: CronFieldKey; label: string; source: string; allowed: string; meaning: string; values: string }

export function fieldRows(schedule: CronSchedule): FieldRow[] {
  return CRON_FIELDS.map((spec) => {
    const f = schedule.fields[spec.key]
    const all = isAll(f)
    const named = spec.key === 'month' || spec.key === 'dayOfWeek'
    return {
      key: spec.key,
      label: spec.label,
      source: f.source,
      allowed: spec.names ? `${spec.min}-${spec.max} or ${spec.names[0]}-${spec.names[spec.names.length - 1]}` : rangeHint(spec),
      meaning: all ? `any ${spec.unit}` : describeField(f),
      values: all ? 'all' : f.values.map((v) => (named ? valueName(spec.key, v).slice(0, 3) : String(v))).join(', '),
    }
  })
}

// ---------- Next runs ----------

const formatters = new Map<string, Intl.DateTimeFormat>()

function wallParts(ms: number, timeZone: string) {
  let fmt = formatters.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
    formatters.set(timeZone, fmt)
  }
  const out: Record<string, number> = {}
  for (const p of fmt.formatToParts(ms)) if (p.type !== 'literal') out[p.type] = Number(p.value)
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute }
}

/** How far the zone's wall clock is ahead of UTC at an instant, in ms. */
function offsetAt(ms: number, timeZone: string): number {
  const w = wallParts(ms, timeZone)
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(ms / 60000) * 60000
}

/**
 * Every instant at which the zone's clock reads this wall time, earliest first. Empty inside a
 * daylight saving gap; two entries when clocks fall back and the time happens twice.
 */
export function wallTimeToInstants(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number[] {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  const found = new Set<number>()
  // Offsets from a day either side cover both sides of any transition on this date.
  for (const probe of [asUtc - 864e5, asUtc, asUtc + 864e5]) {
    const t = asUtc - offsetAt(probe, timeZone)
    const w = wallParts(t, timeZone)
    if (w.year === year && w.month === month && w.day === day && w.hour === hour && w.minute === minute) found.add(t)
  }
  return [...found].sort((a, b) => a - b)
}

function dayMatches(s: CronSchedule, dom: number, dow: number): boolean {
  const { dayOfMonth, dayOfWeek } = s.fields
  const inDom = dayOfMonth.values.includes(dom)
  const inDow = dayOfWeek.values.includes(dow)
  if (!dayOfMonth.star && !dayOfWeek.star) return inDom || inDow
  return inDom && inDow
}

// 28 years covers the longest real gap: Feb 29 skips 2100, so 2096 to 2104 is 8 years.
const SEARCH_DAYS = 28 * 366

/**
 * The next `count` run times strictly after `after`, in the given IANA time zone. Wall times
 * that a daylight saving change skips are left out; times that happen twice run at the first one.
 */
export function nextRuns(schedule: CronSchedule, after: Date, count: number, timeZone: string): Date[] {
  const { minute, hour, month } = schedule.fields
  const afterMs = after.getTime()
  const start = wallParts(afterMs, timeZone)
  const runs: Date[] = []
  // A UTC date is only used as a calendar here, so it steps through days without zone effects.
  const cal = new Date(Date.UTC(start.year, start.month - 1, start.day))
  for (let i = 0; i < SEARCH_DAYS && runs.length < count; i++, cal.setUTCDate(cal.getUTCDate() + 1)) {
    const y = cal.getUTCFullYear()
    const m = cal.getUTCMonth() + 1
    const d = cal.getUTCDate()
    if (!month.values.includes(m) || !dayMatches(schedule, d, cal.getUTCDay())) continue
    for (const h of hour.values) {
      if (i === 0 && h < start.hour - 1) continue
      for (const mi of minute.values) {
        const t = wallTimeToInstants(y, m, d, h, mi, timeZone)[0]
        if (t === undefined || t <= afterMs) continue
        runs.push(new Date(t))
        if (runs.length === count) return runs
      }
    }
  }
  return runs
}

export function formatRun(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(date)
}
