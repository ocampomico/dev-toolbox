export type FlagKey = 'g' | 'i' | 'm' | 's' | 'u' | 'v' | 'y' | 'd'

export const REGEX_FLAGS: { key: FlagKey; name: string; hint: string }[] = [
  { key: 'g', name: 'global', hint: 'Find every match, not just the first' },
  { key: 'i', name: 'ignore case', hint: 'Letters match in either case' },
  { key: 'm', name: 'multiline', hint: '^ and $ match at each line break' },
  { key: 's', name: 'dot all', hint: '. also matches line breaks' },
  { key: 'u', name: 'unicode', hint: 'Code points, \\u{...} and \\p{...}' },
  { key: 'v', name: 'unicode sets', hint: 'Like u, plus set operations in [...]' },
  { key: 'y', name: 'sticky', hint: 'Each match must start where the last one ended' },
  { key: 'd', name: 'indices', hint: 'Record where each group starts and ends' },
]

// Flag order matches RegExp.prototype.flags so the /pattern/flags preview reads the same as the engine's.
const FLAG_ORDER = 'dgimsuvy'

export function flagString(flags: Iterable<string>): string {
  const set = new Set(flags)
  return [...FLAG_ORDER].filter((f) => set.has(f)).join('')
}

/** The v flag is newer than the oldest browsers this app targets, so the UI only offers it where it works. */
export function supportsFlag(flag: string): boolean {
  try {
    new RegExp('', flag)
    return true
  } catch {
    return false
  }
}

export type CompileResult = { ok: true; regex: RegExp } | { ok: false; error: string }

export function compileRegex(pattern: string, flags: string): CompileResult {
  if (flags.includes('u') && flags.includes('v')) return { ok: false, error: 'The u and v flags cannot be used together. Pick one.' }
  try {
    return { ok: true, regex: new RegExp(pattern, flags) }
  } catch (e) {
    // Engines prefix the message with the whole pattern, which the user can already see.
    const raw = e instanceof Error ? e.message : String(e)
    const message = raw.replace(/^Invalid regular expression: \/.*\/[a-z]*: /s, '').replace(/^Invalid regular expression: /, '')
    return { ok: false, error: message.charAt(0).toUpperCase() + message.slice(1) }
  }
}

export type Group = {
  /** 1-based group number, as used in $1. */
  index: number
  name?: string
  /** Undefined when the group took part in no match, like the second half of (a)|(b). */
  value: string | undefined
  start?: number
  end?: number
}

export type MatchList = {
  matches: RegexMatch[]
  /** True when more matches exist past the limit. */
  capped: boolean
}

export type RegexMatch = {
  index: number
  end: number
  text: string
  groups: Group[]
  /** Named groups straight from match.groups, which is the source of truth for names. */
  named: { name: string; value: string | undefined }[]
}

/**
 * Group names by group number (index 0 unused), found by scanning the pattern for opening parens.
 * match.groups gives names and values but not which number each name has.
 */
export function groupNamesByNumber(pattern: string, flags = ''): (string | undefined)[] {
  const names: (string | undefined)[] = [undefined]
  // With v, classes nest, as in [[a-z]--[aeiou]].
  const nested = flags.includes('v')
  let depth = 0
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\') {
      i++
    } else if (depth > 0) {
      if (c === ']') depth--
      else if (c === '[' && nested) depth++
    } else if (c === '[') {
      depth = 1
    } else if (c === '(') {
      if (pattern[i + 1] !== '?') names.push(undefined)
      else {
        const named = /^\(\?<([^>=!][^>]*)>/.exec(pattern.slice(i, i + 200))
        if (named) names.push(named[1])
      }
    }
  }
  return names
}

function toMatch(m: RegExpExecArray, names: (string | undefined)[]): RegexMatch {
  // If the scan disagrees with the engine (an odd pattern it misread), leave numbered groups unnamed.
  const trusted = names.length === m.length
  const groups: Group[] = []
  for (let i = 1; i < m.length; i++) {
    const span = m.indices?.[i]
    groups.push({ index: i, name: trusted ? names[i] : undefined, value: m[i], start: span?.[0], end: span?.[1] })
  }
  const named = Object.entries(m.groups ?? {}).map(([name, value]) => ({ name, value }))
  return { index: m.index, end: m.index + m[0].length, text: m[0], groups, named }
}

/**
 * Runs the regex over the text the way String.prototype.matchAll would for g, or once otherwise.
 * Always adds the d flag internally so the match list can show where each group starts and ends.
 */
export function collectMatches(regex: RegExp, text: string, limit = 1000): MatchList {
  const flags = regex.flags.includes('d') ? regex.flags : regex.flags + 'd'
  const re = new RegExp(regex.source, flags)
  const names = groupNamesByNumber(regex.source, regex.flags)
  if (!re.global) {
    re.lastIndex = 0
    const m = re.exec(text)
    return { matches: m ? [toMatch(m, names)] : [], capped: false }
  }
  const matches: RegexMatch[] = []
  // matchAll steps past empty matches (by a whole code point with u or v), so ^ or x* cannot loop forever.
  for (const m of text.matchAll(re)) {
    if (matches.length === limit) return { matches, capped: true }
    matches.push(toMatch(m, names))
  }
  return { matches, capped: false }
}

/** Native replace, so $1, $<name>, $&, $`, $' and $$ behave exactly as they would in code. */
export function replacePreview(regex: RegExp, text: string, replacement: string): string {
  const re = new RegExp(regex.source, regex.flags)
  return text.replace(re, replacement)
}

export type Segment = { text: string; match?: number }

/**
 * Splits the text into plain and matched runs for highlighting. A zero-length match becomes an
 * empty segment so the view can still mark where it happened.
 */
export function highlightSegments(text: string, matches: Pick<RegexMatch, 'index' | 'end'>[]): Segment[] {
  const out: Segment[] = []
  let pos = 0
  matches.forEach((m, i) => {
    if (m.index < pos) return
    if (m.index > pos) out.push({ text: text.slice(pos, m.index) })
    out.push({ text: text.slice(m.index, m.end), match: i })
    pos = m.end
  })
  if (pos < text.length) out.push({ text: text.slice(pos) })
  return out
}

export const CHEAT_SHEET: { title: string; items: [string, string][] }[] = [
  {
    title: 'Characters',
    items: [
      ['.', 'Any character except a line break (any at all with s)'],
      ['\\d \\D', 'Digit 0 to 9, or not a digit'],
      ['\\w \\W', 'Letter, digit or underscore, or not one'],
      ['\\s \\S', 'Whitespace, or not whitespace'],
      ['[abc] [^abc]', 'One of a, b or c, or anything else'],
      ['[a-z]', 'A character in the range a to z'],
      ['\\p{L}', 'Any letter in any script (needs u or v)'],
    ],
  },
  {
    title: 'Anchors',
    items: [
      ['^ $', 'Start and end of the input (of each line with m)'],
      ['\\b \\B', 'Word boundary, or not a word boundary'],
    ],
  },
  {
    title: 'Repeats',
    items: [
      ['* + ?', 'Zero or more, one or more, zero or one'],
      ['{3} {2,} {2,5}', 'Exactly 3, at least 2, 2 to 5 times'],
      ['*? +? ??', 'Same, but as few as possible'],
    ],
  },
  {
    title: 'Groups',
    items: [
      ['(abc)', 'Capture group, used as $1 in a replacement'],
      ['(?<name>abc)', 'Named group, used as $<name>'],
      ['(?:abc)', 'Group without capturing'],
      ['a|b', 'a or b'],
      ['\\1 \\k<name>', 'The same text a group matched earlier'],
      ['(?=a) (?!a)', 'Followed by a, or not followed by a'],
      ['(?<=a) (?<!a)', 'Preceded by a, or not preceded by a'],
    ],
  },
  {
    title: 'Replacement',
    items: [
      ['$&', 'The whole match'],
      ['$1 $<name>', 'A numbered or named group'],
      ['$` $\'', 'Text before or after the match'],
      ['$$', 'A literal $'],
    ],
  },
]
