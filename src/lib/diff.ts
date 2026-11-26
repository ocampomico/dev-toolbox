export type DiffKind = 'added' | 'removed' | 'changed'

export type DiffEntry =
  | { kind: 'added'; path: string; after: unknown }
  | { kind: 'removed'; path: string; before: unknown }
  | { kind: 'changed'; path: string; before: unknown; after: unknown }

export type DiffCounts = Record<DiffKind, number>

type Segment = string | number

const IDENT = /^[\p{L}_$][\p{L}\p{N}_$]*$/u

/** `$.user.tags[2]`, with bracket quotes for keys that are not plain identifiers. */
export function formatPath(segments: Segment[]): string {
  let out = '$'
  for (const s of segments) {
    if (typeof s === 'number') out += `[${s}]`
    else if (IDENT.test(s)) out += `.${s}`
    else out += `[${JSON.stringify(s)}]`
  }
  return out
}

const MISSING = Symbol('missing')

type Kind = 'array' | 'object' | 'null' | 'other'

const kindOf = (v: unknown): Kind => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : 'other')

/**
 * Structural diff of two parsed JSON values. Object keys are matched by name,
 * so key order is ignored; arrays are matched by index. A value whose type
 * changes (object to null, number to string) is reported once at its path
 * rather than as a pile of removed children.
 */
export function diffJson(left: unknown, right: unknown): DiffEntry[] {
  const out: DiffEntry[] = []
  // An explicit stack so deeply nested input cannot overflow the call stack.
  const stack: { a: unknown; b: unknown; path: Segment[] }[] = [{ a: left, b: right, path: [] }]
  while (stack.length) {
    const { a, b, path } = stack.pop()!
    if (a === MISSING) {
      out.push({ kind: 'added', path: formatPath(path), after: b })
      continue
    }
    if (b === MISSING) {
      out.push({ kind: 'removed', path: formatPath(path), before: a })
      continue
    }
    const ka = kindOf(a)
    if (ka !== kindOf(b)) {
      out.push({ kind: 'changed', path: formatPath(path), before: a, after: b })
      continue
    }
    const next: typeof stack = []
    if (ka === 'array') {
      const xa = a as unknown[]
      const xb = b as unknown[]
      const n = Math.max(xa.length, xb.length)
      for (let i = 0; i < n; i++) next.push({ a: i < xa.length ? xa[i] : MISSING, b: i < xb.length ? xb[i] : MISSING, path: [...path, i] })
    } else if (ka === 'object') {
      const oa = a as Record<string, unknown>
      const ob = b as Record<string, unknown>
      for (const k of Object.keys(oa)) next.push({ a: oa[k], b: Object.hasOwn(ob, k) ? ob[k] : MISSING, path: [...path, k] })
      for (const k of Object.keys(ob)) if (!Object.hasOwn(oa, k)) next.push({ a: MISSING, b: ob[k], path: [...path, k] })
    } else if (a !== b) {
      out.push({ kind: 'changed', path: formatPath(path), before: a, after: b })
    }
    // Reversed so entries come out in document order: left's keys first, then keys only on the right.
    for (let i = next.length - 1; i >= 0; i--) stack.push(next[i])
  }
  return out
}

export function countDiff(entries: DiffEntry[]): DiffCounts {
  const c: DiffCounts = { added: 0, removed: 0, changed: 0 }
  for (const e of entries) c[e.kind]++
  return c
}

/** One-line JSON for showing a value in the diff list, cut off at `max` characters. */
export function previewValue(v: unknown, max = 200): string {
  const s = JSON.stringify(v)
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
