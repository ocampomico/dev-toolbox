import { describe, expect, it } from 'vitest'
import { collectMatches, compileRegex, flagString, groupNamesByNumber, highlightSegments, replacePreview } from './regex'

function re(pattern: string, flags = '') {
  const r = compileRegex(pattern, flags)
  if (!r.ok) throw new Error(r.error)
  return r.regex
}

const texts = (pattern: string, flags: string, text: string) => collectMatches(re(pattern, flags), text).matches.map((m) => m.text)

describe('compileRegex', () => {
  it('compiles valid patterns', () => {
    expect(compileRegex('a+b', 'gi').ok).toBe(true)
  })

  it('returns a short message for syntax errors', () => {
    const r = compileRegex('(abc', '')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).not.toMatch(/^Invalid regular expression/)
      expect(r.error).not.toContain('/(abc/')
      expect(r.error.length).toBeGreaterThan(3)
    }
    expect(compileRegex('a{2,1}', '').ok).toBe(false)
    expect(compileRegex('\\p{Nope}', 'u').ok).toBe(false)
  })

  it('rejects u and v together with a clear message', () => {
    const r = compileRegex('a', 'uv')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('u and v')
  })
})

describe('flagString', () => {
  it('orders flags like RegExp.prototype.flags and drops duplicates', () => {
    expect(flagString(['y', 'g', 'i', 'd', 'g'])).toBe('dgiy')
    expect(flagString(['y', 'g', 'i', 'd'])).toBe(new RegExp('', 'ygid').flags)
  })
})

describe('collectMatches', () => {
  it('finds every match with g and only the first without', () => {
    expect(texts('\\d+', 'g', 'a1 b22 c333')).toEqual(['1', '22', '333'])
    expect(texts('\\d+', '', 'a1 b22 c333')).toEqual(['1'])
  })

  it('reports index, end and length in UTF-16 units', () => {
    const [m] = collectMatches(re('b+'), 'aabbbc').matches
    expect(m).toMatchObject({ index: 2, end: 5, text: 'bbb' })
  })

  it('returns no matches when nothing matches', () => {
    expect(collectMatches(re('x', 'g'), 'abc')).toEqual({ matches: [], capped: false })
    expect(collectMatches(re('x'), 'abc')).toEqual({ matches: [], capped: false })
  })

  it('steps past zero-length matches without looping', () => {
    const list = collectMatches(re('x*', 'g'), 'axxb')
    expect(list.matches.map((m) => [m.index, m.text])).toEqual([
      [0, ''],
      [1, 'xx'],
      [3, ''],
      [4, ''],
    ])
    expect(collectMatches(re('', 'g'), 'abc').matches).toHaveLength(4)
    expect(collectMatches(re('^', 'gm'), 'a\nb\nc').matches.map((m) => m.index)).toEqual([0, 2, 4])
    expect(collectMatches(re('\\b', 'g'), 'hi yo').matches.map((m) => m.index)).toEqual([0, 2, 3, 5])
  })

  it('steps over a whole emoji on empty matches with u, and splits it without', () => {
    const text = 'a😀b'
    expect(collectMatches(re('', 'gu'), text).matches.map((m) => m.index)).toEqual([0, 1, 3, 4])
    expect(collectMatches(re('', 'g'), text).matches.map((m) => m.index)).toEqual([0, 1, 2, 3, 4])
  })

  it('matches code points with u', () => {
    expect(texts('.', 'gu', '😀é')).toEqual(['😀', 'é'])
    expect(texts('.', 'g', '😀')).toHaveLength(2)
    expect(texts('\\p{Lu}+', 'gu', 'abc ÀÉ xyz ΩΣ')).toEqual(['ÀÉ', 'ΩΣ'])
    const [m] = collectMatches(re('b', 'u'), '😀b').matches
    expect(m.index).toBe(2)
  })

  it('caps the list and says so', () => {
    const list = collectMatches(re('a', 'g'), 'a'.repeat(50), 10)
    expect(list.matches).toHaveLength(10)
    expect(list.capped).toBe(true)
    const exact = collectMatches(re('a', 'g'), 'a'.repeat(10), 10)
    expect(exact.matches).toHaveLength(10)
    expect(exact.capped).toBe(false)
  })

  it('lists numbered groups with positions, including ones that did not match', () => {
    const [m] = collectMatches(re('(a)|(b)'), 'xb').matches
    expect(m.groups).toEqual([
      { index: 1, name: undefined, value: undefined, start: undefined, end: undefined },
      { index: 2, name: undefined, value: 'b', start: 1, end: 2 },
    ])
  })

  it('names numbered groups and lists named groups', () => {
    const [m] = collectMatches(re('(?<year>\\d{4})-(\\d{2})-(?<day>\\d{2})'), 'on 2024-03-09').matches
    expect(m.groups.map((g) => [g.index, g.name, g.value, g.start])).toEqual([
      [1, 'year', '2024', 3],
      [2, undefined, '03', 8],
      [3, 'day', '09', 11],
    ])
    expect(m.named).toEqual([
      { name: 'year', value: '2024' },
      { name: 'day', value: '09' },
    ])
  })

  it('keeps names for named groups that did not take part', () => {
    const [m] = collectMatches(re('(?<a>x)|(?<b>y)'), 'y').matches
    expect(m.groups.map((g) => [g.name, g.value])).toEqual([
      ['a', undefined],
      ['b', 'y'],
    ])
    expect(m.named).toEqual([
      { name: 'a', value: undefined },
      { name: 'b', value: 'y' },
    ])
  })

  it('respects sticky matching', () => {
    expect(texts('a', 'gy', 'aaba')).toEqual(['a', 'a'])
    expect(texts('b', 'y', 'ab')).toEqual([])
    expect(texts('a', 'y', 'ab')).toEqual(['a'])
  })

  it('does not change the regex it was given', () => {
    const r = re('a', 'g')
    r.lastIndex = 2
    collectMatches(r, 'aaa')
    expect(r.lastIndex).toBe(2)
    expect(r.flags).toBe('g')
  })
})

describe('groupNamesByNumber', () => {
  it('skips lookarounds, non-capturing groups, escapes and classes', () => {
    expect(groupNamesByNumber('(?:a)(?=b)(?!c)(?<=d)(?<!e)\\((x)[(](?<n>y)')).toEqual([undefined, undefined, 'n'])
  })

  it('handles nested classes with v', () => {
    expect(groupNamesByNumber('[[a-z]--[(]](?<k>q)', 'v')).toEqual([undefined, 'k'])
  })
})

describe('replacePreview', () => {
  it('supports $&, numbered and named groups', () => {
    expect(replacePreview(re('(\\w+)@(?<host>\\w+)', 'g'), 'ann@a bob@b', '$<host>:$1 [$&]')).toBe('a:ann [ann@a] b:bob [bob@b]')
  })

  it('replaces only the first match without g', () => {
    expect(replacePreview(re('o'), 'foo', '0')).toBe('f0o')
  })

  it('handles $$, empty replacements and zero-length matches', () => {
    expect(replacePreview(re('\\d', 'g'), 'a1b2', '$$')).toBe('a$b$')
    expect(replacePreview(re('\\s+', 'g'), 'a  b c', '')).toBe('abc')
    expect(replacePreview(re('', 'g'), 'ab', '-')).toBe('-a-b-')
    expect(replacePreview(re('', 'gu'), '😀', '-')).toBe('-😀-')
  })
})

describe('highlightSegments', () => {
  it('splits text into plain and matched runs', () => {
    expect(highlightSegments('a12b3', [
      { index: 1, end: 3 },
      { index: 4, end: 5 },
    ])).toEqual([{ text: 'a' }, { text: '12', match: 0 }, { text: 'b' }, { text: '3', match: 1 }])
  })

  it('keeps zero-length matches as empty segments', () => {
    const matches = collectMatches(re('x*', 'g'), 'axb').matches
    expect(highlightSegments('axb', matches)).toEqual([
      { text: '', match: 0 },
      { text: 'a' },
      { text: 'x', match: 1 },
      { text: '', match: 2 },
      { text: 'b' },
      { text: '', match: 3 },
    ])
  })

  it('returns the whole text when nothing matched', () => {
    expect(highlightSegments('abc', [])).toEqual([{ text: 'abc' }])
    expect(highlightSegments('', [])).toEqual([])
  })

  it('keeps surrogate pairs whole when matching with u', () => {
    const matches = collectMatches(re('😀', 'gu'), 'a😀b').matches
    expect(highlightSegments('a😀b', matches).map((s) => s.text)).toEqual(['a', '😀', 'b'])
  })
})
