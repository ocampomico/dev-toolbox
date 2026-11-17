export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string; line?: number; column?: number }

/** Parse JSON and turn engine-specific error positions into a line and column. */
export function parseJson(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // V8: "... at position 42" or "(line 3 column 5)"; Firefox: "at line 3 column 5".
    const lc = /line (\d+) column (\d+)/.exec(msg)
    if (lc) return { ok: false, error: msg, line: Number(lc[1]), column: Number(lc[2]) }
    const pos = /position (\d+)/.exec(msg)
    const at = pos ? Number(pos[1]) : findErrorIndex(text)
    // Engine messages can quote the whole input; keep only the first line.
    const error = msg.split('\n')[0].replace(/, ".*$/, '')
    if (at === null) return { ok: false, error }
    const before = text.slice(0, at).split('\n')
    return { ok: false, error, line: before.length, column: before.at(-1)!.length + 1 }
  }
}

/** Index of the first character that makes `text` invalid JSON, or null if none is found. */
export function findErrorIndex(text: string): number | null {
  let i = 0
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i++
  }
  const fail = (): never => {
    throw i
  }
  const lit = (w: string) => (text.startsWith(w, i) ? (i += w.length) : fail())
  const str = () => {
    i++
    while (i < text.length && text[i] !== '"') {
      if (text[i] < ' ') fail()
      if (text[i] === '\\') {
        i++
        if (text[i] === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) fail()
          i += 4
        } else if (!'"\\/bfnrt'.includes(text[i] ?? '')) fail()
      }
      i++
    }
    if (text[i] !== '"') fail()
    i++
  }
  const num = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i))
    if (!m) fail()
    i += m![0].length
  }
  const value = (): void => {
    ws()
    const c = text[i]
    if (c === '{') {
      i++
      ws()
      if (text[i] === '}') return void i++
      for (;;) {
        ws()
        if (text[i] !== '"') fail()
        str()
        ws()
        if (text[i] !== ':') fail()
        i++
        value()
        ws()
        if (text[i] === ',') i++
        else if (text[i] === '}') return void i++
        else fail()
      }
    }
    if (c === '[') {
      i++
      ws()
      if (text[i] === ']') return void i++
      for (;;) {
        value()
        ws()
        if (text[i] === ',') i++
        else if (text[i] === ']') return void i++
        else fail()
      }
    }
    if (c === '"') return str()
    if (c === 't') return void lit('true')
    if (c === 'f') return void lit('false')
    if (c === 'n') return void lit('null')
    if (c === '-' || (c >= '0' && c <= '9')) return num()
    fail()
  }
  try {
    value()
    ws()
    return i < text.length ? i : null
  } catch (at) {
    return typeof at === 'number' ? at : null
  }
}

export const formatJson = (value: unknown, indent: number | '\t' = 2) => JSON.stringify(value, null, indent)
export const minifyJson = (value: unknown) => JSON.stringify(value)

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]),
    )
  }
  return v
}
export const sortKeys = sortDeep

type Row = Record<string, unknown>

/** Flatten nested objects into dot keys. Arrays are kept whole and written as JSON. */
function flatten(obj: Row, prefix = '', out: Row = {}): Row {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) flatten(v as Row, key, out)
    else out[key] = v
  }
  return out
}

export type Delimiter = ',' | '\t' | ';'

function csvCell(v: unknown, delimiter: Delimiter): string {
  const s = cellText(v)
  return s.includes('"') || s.includes(delimiter) || s.includes('\n') || s.includes('\r') ? `"${s.replaceAll('"', '""')}"` : s
}

function toRows(value: unknown): { cols: string[]; rows: Row[] } {
  const items = Array.isArray(value) ? value : [value]
  if (!items.every((i) => i && typeof i === 'object' && !Array.isArray(i))) {
    throw new Error('Expected an object or an array of objects.')
  }
  const rows = items.map((i) => flatten(i as Row))
  const cols: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k)
        cols.push(k)
      }
    }
  }
  return { cols, rows }
}

const cellText = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** An array of objects (or one object) to CSV. Columns are the union of keys in first-seen order. */
export function jsonToCsv(value: unknown, delimiter: Delimiter = ','): string {
  if (Array.isArray(value) && !value.length) return ''
  const { cols, rows } = toRows(value)
  return [cols.map((c) => csvCell(c, delimiter)).join(delimiter), ...rows.map((r) => cols.map((c) => csvCell(r[c], delimiter)).join(delimiter))].join('\n')
}

/** The same columns as `jsonToCsv`, as strings for a preview table. */
export function toTable(value: unknown, limit = 50): { cols: string[]; rows: string[][]; total: number } {
  if (Array.isArray(value) && !value.length) return { cols: [], rows: [], total: 0 }
  const { cols, rows } = toRows(value)
  return { cols, rows: rows.slice(0, limit).map((r) => cols.map((c) => cellText(r[c]))), total: rows.length }
}

/** RFC 4180 parse: quoted fields, doubled quotes, and newlines inside quotes. */
export function parseCsv(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === delimiter) {
      row.push(cell)
      cell = ''
    }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/** Pick the delimiter that splits the first line into the most columns. */
export function detectDelimiter(text: string): Delimiter {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (d: string) => first.split(d).length
  return ([',', '\t', ';'] as const).reduce((best, d) => (count(d) > count(best) ? d : best), ',')
}

function infer(s: string): unknown {
  if (s === '') return null
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null') return null
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(s) && Number.isFinite(Number(s))) return Number(s)
  return s
}

/** CSV with a header row to an array of objects. Dot keys are rebuilt into nested objects. */
export function csvToJson(text: string, opts: { delimiter?: Delimiter; inferTypes?: boolean } = {}): Row[] {
  const delimiter = opts.delimiter ?? detectDelimiter(text)
  const [header, ...body] = parseCsv(text.trim(), delimiter)
  if (!header) return []
  return body.map((cells) => {
    const obj: Row = {}
    header.forEach((h, i) => {
      const raw = cells[i] ?? ''
      const v = opts.inferTypes === false ? raw : infer(raw)
      const parts = h.split('.')
      let target = obj
      for (const p of parts.slice(0, -1)) {
        if (!target[p] || typeof target[p] !== 'object') target[p] = {}
        target = target[p] as Row
      }
      target[parts.at(-1)!] = v
    })
    return obj
  })
}
