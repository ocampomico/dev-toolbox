import { describe, expect, it } from 'vitest'
import { CRON_ALIASES, explainCron, fieldRows, formatRun, nextRuns, parseCron, wallTimeToInstants, type CronSchedule } from './cron'

function parse(expr: string): CronSchedule {
  const r = parseCron(expr)
  if (!r.ok) throw new Error(r.error.message)
  return r.schedule
}

const explain = (expr: string) => explainCron(parse(expr))
const values = (expr: string, field: keyof CronSchedule['fields']) => parse(expr).fields[field].values
const range = (a: number, b: number, step = 1) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step)

/** Next runs as ISO strings in UTC, which keeps expectations independent of the machine's zone. */
const runs = (expr: string, after: string, count: number, zone = 'UTC') => nextRuns(parse(expr), new Date(after), count, zone).map((d) => d.toISOString())

describe('parseCron fields', () => {
  it('expands *, single values, lists and ranges', () => {
    expect(values('* * * * *', 'minute')).toEqual(range(0, 59))
    expect(values('* * * * *', 'dayOfMonth')).toEqual(range(1, 31))
    expect(values('* * * * *', 'dayOfWeek')).toEqual(range(0, 6))
    expect(values('5 * * * *', 'minute')).toEqual([5])
    expect(values('0,15,45 * * * *', 'minute')).toEqual([0, 15, 45])
    expect(values('* 9-17 * * *', 'hour')).toEqual(range(9, 17))
    expect(values('* 1-3,10,20-21 * * *', 'hour')).toEqual([1, 2, 3, 10, 20, 21])
  })

  it('expands steps on *, ranges and single start values', () => {
    expect(values('*/15 * * * *', 'minute')).toEqual([0, 15, 30, 45])
    expect(values('1-10/2 * * * *', 'minute')).toEqual([1, 3, 5, 7, 9])
    expect(values('5/20 * * * *', 'minute')).toEqual([5, 25, 45])
    expect(values('* */6 * * *', 'hour')).toEqual([0, 6, 12, 18])
    expect(values('* * */10 * *', 'dayOfMonth')).toEqual([1, 11, 21, 31])
    expect(values('* * * */3 *', 'month')).toEqual([1, 4, 7, 10])
    expect(values('*/1 * * * *', 'minute')).toEqual(range(0, 59))
    expect(values('*/60 * * * *', 'minute')).toEqual([0])
  })

  it('removes duplicates and sorts', () => {
    expect(values('30,10,10,0-20/10 * * * *', 'minute')).toEqual([0, 10, 20, 30])
  })

  it('reads month and weekday names in any case', () => {
    expect(values('* * * JAN,jul,Dec *', 'month')).toEqual([1, 7, 12])
    expect(values('* * * MAR-MAY *', 'month')).toEqual([3, 4, 5])
    expect(values('* * * * MON-FRI', 'dayOfWeek')).toEqual([1, 2, 3, 4, 5])
    expect(values('* * * * sun,Sat', 'dayOfWeek')).toEqual([0, 6])
    expect(values('* * * * MON-FRI/2', 'dayOfWeek')).toEqual([1, 3, 5])
  })

  it('treats 0 and 7 as Sunday', () => {
    expect(values('* * * * 0', 'dayOfWeek')).toEqual([0])
    expect(values('* * * * 7', 'dayOfWeek')).toEqual([0])
    expect(values('* * * * 0,7', 'dayOfWeek')).toEqual([0])
    expect(values('* * * * 5-7', 'dayOfWeek')).toEqual([0, 5, 6])
    expect(values('* * * * 0-7', 'dayOfWeek')).toEqual(range(0, 6))
    expect(values('* * * * */2', 'dayOfWeek')).toEqual([0, 2, 4, 6])
  })

  it('accepts extra whitespace and tabs between fields', () => {
    expect(parse('  0   9\t* *  1-5 ').expanded).toBe('0 9 * * 1-5')
  })

  it('marks day fields that start with *', () => {
    const s = parse('0 0 */2 * 1')
    expect(s.fields.dayOfMonth.star).toBe(true)
    expect(s.fields.dayOfWeek.star).toBe(false)
  })
})

describe('parseCron aliases', () => {
  it('expands every shortcut', () => {
    expect(parse('@yearly').expanded).toBe('0 0 1 1 *')
    expect(parse('@annually').expanded).toBe('0 0 1 1 *')
    expect(parse('@monthly').expanded).toBe('0 0 1 * *')
    expect(parse('@weekly').expanded).toBe('0 0 * * 0')
    expect(parse('@daily').expanded).toBe('0 0 * * *')
    expect(parse('@midnight').expanded).toBe('0 0 * * *')
    expect(parse('@hourly').expanded).toBe('0 * * * *')
    expect(Object.keys(CRON_ALIASES)).toHaveLength(7)
  })

  it('ignores case and keeps the original text', () => {
    const s = parse(' @Daily ')
    expect(s.alias).toBe('@daily')
    expect(s.source).toBe('@Daily')
  })

  it('rejects unknown shortcuts and @reboot', () => {
    const bad = parseCron('@often')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.message).toContain('@hourly')
    const reboot = parseCron('@reboot')
    expect(reboot.ok).toBe(false)
    if (!reboot.ok) expect(reboot.error.message).toContain('starts')
  })
})

describe('parseCron errors', () => {
  const error = (expr: string) => {
    const r = parseCron(expr)
    if (r.ok) throw new Error(`expected ${expr} to fail`)
    return r.error
  }

  it('asks for input when empty', () => {
    expect(error('   ').message).toMatch(/Enter a cron expression/)
  })

  it('counts fields', () => {
    expect(error('* * *').message).toContain('found 3')
    expect(error('* * * * * *').message).toMatch(/found 6.*Seconds and year/)
    expect(error('* * * * * *').field).toBeUndefined()
  })

  it('points at the field and position that is wrong', () => {
    expect(error('60 * * * *')).toMatchObject({ field: 'minute', index: 0 })
    expect(error('* 24 * * *')).toMatchObject({ field: 'hour', index: 1 })
    expect(error('* * 0 * *')).toMatchObject({ field: 'dayOfMonth', index: 2 })
    expect(error('* * 32 * *')).toMatchObject({ field: 'dayOfMonth', index: 2 })
    expect(error('* * * 13 *')).toMatchObject({ field: 'month', index: 3 })
    expect(error('* * * 0 *')).toMatchObject({ field: 'month', index: 3 })
    expect(error('* * * * 8')).toMatchObject({ field: 'dayOfWeek', index: 4 })
  })

  it('names the field, its position and the allowed range in the message', () => {
    const e = error('0 25 * * *')
    expect(e.message).toContain('Hour (field 2, "25")')
    expect(e.message).toContain('0-23')
    expect(error('* * * * 9').message).toContain('0 and 7 are both Sunday')
  })

  it('reports the first bad field when several are wrong', () => {
    expect(error('* 99 * 99 *').field).toBe('hour')
  })

  it('rejects bad values, names, ranges and steps', () => {
    expect(error('abc * * * *').message).toContain('"abc" is not a number')
    expect(error('* * * FOO *').message).toContain('month name')
    expect(error('* * * * FUN').message).toContain('day name')
    expect(error('* * * MONDAY *').field).toBe('month')
    expect(error('-5 * * * *').field).toBe('minute')
    expect(error('1.5 * * * *').field).toBe('minute')
    expect(error('10-5 * * * *').message).toContain('runs backwards')
    expect(error('* * * * 5-0').message).toContain('like 5-7')
    expect(error('1-2-3 * * * *').message).toContain('start-end')
    expect(error('*/0 * * * *').message).toContain('between 1 and 60, not 0')
    expect(error('*/61 * * * *').field).toBe('minute')
    expect(error('* */25 * * *').field).toBe('hour')
    expect(error('* * * * */8').field).toBe('dayOfWeek')
    expect(error('*/x * * * *').message).toContain('whole number')
    expect(error('*/2/3 * * * *').message).toContain('more than one step')
    expect(error('1,,2 * * * *').message).toContain('stray comma')
    expect(error('1, * * * *').message).toContain('stray comma')
    expect(error('1- * * * *').message).toContain('missing')
  })

  it('explains that L, W, # and ? are not standard', () => {
    expect(error('0 9 L * *').message).toContain('L, W, # or ?')
    expect(error('0 9 15W * *').message).toContain('L, W, # or ?')
    expect(error('0 9 ? * MON').message).toContain('L, W, # or ?')
    expect(error('0 9 * * MON#2').message).toContain('L, W, # or ?')
    expect(error('0 9 * * 5L').field).toBe('dayOfWeek')
  })
})

describe('explainCron', () => {
  it('reads common schedules', () => {
    expect(explain('30 9 * * 1-5')).toBe('At 09:30 on Monday through Friday')
    expect(explain('* * * * *')).toBe('Every minute')
    expect(explain('*/15 * * * *')).toBe('Every 15 minutes')
    expect(explain('*/1 * * * *')).toBe('Every minute')
    expect(explain('0 * * * *')).toBe('At minute 0 past every hour')
    expect(explain('0 0 * * *')).toBe('At 00:00 every day')
    expect(explain('0 9,17 * * *')).toBe('At 09:00 and 17:00 every day')
    expect(explain('0,30 9 * * *')).toBe('At 09:00 and 09:30 every day')
    expect(explain('0 */2 * * *')).toBe('At minute 0 past every 2nd hour')
    expect(explain('0,30 9-17 * * *')).toBe('At minutes 0 and 30 past hours 9 through 17')
    expect(explain('*/10 9-17/2 * * 6,7')).toBe('Every 10 minutes past every 2nd hour from 9 through 17 on Saturday and Sunday')
    expect(explain('5/20 * * * *')).toBe('At every 20th minute from 5 through 59 past every hour')
    expect(explain('* 3 * * *')).toBe('Every minute past hour 3')
  })

  it('lists many explicit times as fields instead of clock times', () => {
    expect(explain('0,30 1,2,3,4 * * *')).toBe('At minutes 0 and 30 past hours 1, 2, 3 and 4')
  })

  it('describes day of month, month and weekday', () => {
    expect(explain('0 0 1 * *')).toBe('At 00:00 on day 1 of the month')
    expect(explain('0 0 1,15 * *')).toBe('At 00:00 on days 1 and 15 of the month')
    expect(explain('0 0 1-7 * *')).toBe('At 00:00 on days 1 through 7 of the month')
    expect(explain('0 0 */2 * *')).toBe('At 00:00 on every 2nd day of the month')
    expect(explain('0 0 1 1 *')).toBe('At 00:00 on day 1 of the month in January')
    expect(explain('0 12 * JAN-MAR,JUL *')).toBe('At 12:00 in January through March and July')
    expect(explain('0 12 * */3 *')).toBe('At 12:00 in every 3rd month')
    expect(explain('5 4 * * sun')).toBe('At 04:05 on Sunday')
    expect(explain('5 4 * * 7')).toBe('At 04:05 on Sunday')
    expect(explain('0 9 * * 5-7')).toBe('At 09:00 on Friday through Sunday')
    expect(explain('0 9 * * MON,WED,FRI')).toBe('At 09:00 on Monday, Wednesday and Friday')
  })

  it('says OR when both day fields are restricted, and AND when one starts with *', () => {
    expect(explain('0 9 1,15 * MON')).toBe('At 09:00 on days 1 and 15 of the month or on Monday')
    expect(explain('0 0 */2 * MON')).toBe('At 00:00 on every 2nd day of the month, but only on Monday')
  })

  it('explains aliases by their expansion', () => {
    expect(explain('@daily')).toBe('At 00:00 every day')
    expect(explain('@hourly')).toBe('At minute 0 past every hour')
    expect(explain('@weekly')).toBe('At 00:00 on Sunday')
    expect(explain('@monthly')).toBe('At 00:00 on day 1 of the month')
    expect(explain('@yearly')).toBe('At 00:00 on day 1 of the month in January')
  })
})

describe('fieldRows', () => {
  it('breaks the expression down field by field', () => {
    const rows = fieldRows(parse('*/10 9-17/2 * JAN 6,7'))
    expect(rows.map((r) => r.label)).toEqual(['Minute', 'Hour', 'Day of month', 'Month', 'Day of week'])
    expect(rows[0]).toMatchObject({ source: '*/10', allowed: '0-59', meaning: 'every 10th minute', values: '0, 10, 20, 30, 40, 50' })
    expect(rows[1]).toMatchObject({ meaning: 'every 2nd hour from 9 through 17', values: '9, 11, 13, 15, 17' })
    expect(rows[2]).toMatchObject({ source: '*', meaning: 'any day of the month', values: 'all' })
    expect(rows[3]).toMatchObject({ allowed: '1-12 or JAN-DEC', meaning: 'January', values: 'Jan' })
    expect(rows[4]).toMatchObject({ allowed: '0-7 or SUN-SAT', meaning: 'Saturday and Sunday', values: 'Sun, Sat' })
  })
})

describe('nextRuns', () => {
  it('returns runs strictly after the start time', () => {
    expect(runs('*/15 * * * *', '2026-05-01T10:15:00Z', 3)).toEqual(['2026-05-01T10:30:00.000Z', '2026-05-01T10:45:00.000Z', '2026-05-01T11:00:00.000Z'])
    expect(runs('*/15 * * * *', '2026-05-01T10:14:59Z', 1)).toEqual(['2026-05-01T10:15:00.000Z'])
    expect(runs('* * * * *', '2026-05-01T23:59:30Z', 2)).toEqual(['2026-05-02T00:00:00.000Z', '2026-05-02T00:01:00.000Z'])
  })

  it('skips weekends for weekday schedules', () => {
    // 2026-11-27 is a Friday.
    expect(runs('30 9 * * 1-5', '2026-11-27T10:00:00Z', 3)).toEqual(['2026-11-30T09:30:00.000Z', '2026-12-01T09:30:00.000Z', '2026-12-02T09:30:00.000Z'])
  })

  it('crosses month and year boundaries', () => {
    expect(runs('0 0 1 * *', '2026-12-15T00:00:00Z', 2)).toEqual(['2027-01-01T00:00:00.000Z', '2027-02-01T00:00:00.000Z'])
    expect(runs('@yearly', '2026-06-01T00:00:00Z', 2)).toEqual(['2027-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z'])
  })

  it('handles month lengths', () => {
    expect(runs('0 0 31 * *', '2026-01-31T12:00:00Z', 3)).toEqual(['2026-03-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z'])
    expect(runs('0 0 30 * *', '2027-01-30T12:00:00Z', 2)).toEqual(['2027-03-30T00:00:00.000Z', '2027-04-30T00:00:00.000Z'])
  })

  it('handles leap years, including century years', () => {
    expect(runs('0 0 29 2 *', '2026-01-01T00:00:00Z', 3)).toEqual(['2028-02-29T00:00:00.000Z', '2032-02-29T00:00:00.000Z', '2036-02-29T00:00:00.000Z'])
    // 2100 is not a leap year, so the run after 2096 is in 2104.
    expect(runs('0 0 29 2 *', '2096-03-01T00:00:00Z', 1)).toEqual(['2104-02-29T00:00:00.000Z'])
    expect(runs('0 0 29 2 *', '1999-03-01T00:00:00Z', 1)).toEqual(['2000-02-29T00:00:00.000Z'])
  })

  it('returns nothing for dates that never exist', () => {
    expect(runs('0 0 30 2 *', '2026-01-01T00:00:00Z', 5)).toEqual([])
    expect(runs('0 0 31 4,6,9,11 *', '2026-01-01T00:00:00Z', 5)).toEqual([])
  })

  it('runs when either day field matches if both are restricted', () => {
    // Day 13 or any Friday in March 2026: Fri 6, Fri 13, Fri 20, Fri 27, then Apr 3.
    expect(runs('0 0 13 3 5', '2026-03-01T00:00:00Z', 5)).toEqual([
      '2026-03-06T00:00:00.000Z',
      '2026-03-13T00:00:00.000Z',
      '2026-03-20T00:00:00.000Z',
      '2026-03-27T00:00:00.000Z',
      '2027-03-05T00:00:00.000Z',
    ])
    expect(runs('0 0 1 * MON', '2026-06-01T00:00:00Z', 3)).toEqual(['2026-06-08T00:00:00.000Z', '2026-06-15T00:00:00.000Z', '2026-06-22T00:00:00.000Z'])
  })

  it('requires both day fields when one starts with *', () => {
    // Odd days of the month that are also Mondays.
    expect(runs('0 0 */2 * MON', '2026-06-01T00:00:00Z', 3)).toEqual(['2026-06-15T00:00:00.000Z', '2026-06-29T00:00:00.000Z', '2026-07-13T00:00:00.000Z'])
    expect(runs('0 0 * * 7', '2026-06-01T00:00:00Z', 1)).toEqual(['2026-06-07T00:00:00.000Z'])
  })

  it('stops at the requested count', () => {
    expect(runs('* * * * *', '2026-01-01T00:00:00Z', 5)).toHaveLength(5)
  })

  it('uses wall time in the given zone', () => {
    // 09:00 in New York is 14:00 UTC in winter and 13:00 UTC in summer.
    expect(runs('0 9 * * *', '2026-01-10T00:00:00Z', 1, 'America/New_York')).toEqual(['2026-01-10T14:00:00.000Z'])
    expect(runs('0 9 * * *', '2026-07-10T00:00:00Z', 1, 'America/New_York')).toEqual(['2026-07-10T13:00:00.000Z'])
    // Half-hour and 45-minute offsets.
    expect(runs('0 9 * * *', '2026-01-10T00:00:00Z', 1, 'Asia/Kolkata')).toEqual(['2026-01-10T03:30:00.000Z'])
    expect(runs('0 9 * * *', '2026-01-10T00:00:00Z', 1, 'Asia/Kathmandu')).toEqual(['2026-01-10T03:15:00.000Z'])
  })

  it('uses the zone date, not the UTC date, to pick days', () => {
    // 2026-11-27T03:00Z is still Thursday the 26th in Los Angeles.
    expect(runs('0 20 * * THU', '2026-11-27T03:00:00Z', 1, 'America/Los_Angeles')).toEqual(['2026-11-27T04:00:00.000Z'])
  })

  it('skips wall times that daylight saving jumps over', () => {
    // New York jumps from 02:00 to 03:00 on 2026-03-08, so 02:30 does not happen that day.
    expect(runs('30 2 * * *', '2026-03-07T12:00:00Z', 2, 'America/New_York')).toEqual(['2026-03-09T06:30:00.000Z', '2026-03-10T06:30:00.000Z'])
    expect(runs('*/30 * * * *', '2026-03-08T06:00:00Z', 3, 'America/New_York')).toEqual(['2026-03-08T06:30:00.000Z', '2026-03-08T07:00:00.000Z', '2026-03-08T07:30:00.000Z'])
  })

  it('runs a repeated wall time once when clocks fall back', () => {
    // New York repeats 01:00 to 01:59 on 2026-11-01. 01:30 EDT is 05:30 UTC.
    expect(runs('30 1 * * *', '2026-10-31T12:00:00Z', 2, 'America/New_York')).toEqual(['2026-11-01T05:30:00.000Z', '2026-11-02T06:30:00.000Z'])
    expect(runs('0 * * * *', '2026-11-01T04:30:00Z', 3, 'America/New_York')).toEqual(['2026-11-01T05:00:00.000Z', '2026-11-01T07:00:00.000Z', '2026-11-01T08:00:00.000Z'])
  })

  it('handles southern hemisphere and half-hour daylight saving', () => {
    // Sydney springs forward 02:00 to 03:00 on 2026-10-04, so the next 02:30 is on the 5th, at UTC+11.
    expect(runs('30 2 * * *', '2026-10-03T00:00:00Z', 1, 'Australia/Sydney')).toEqual(['2026-10-04T15:30:00.000Z'])
    // Lord Howe Island shifts by 30 minutes, skipping 02:00 to 02:29 on 2026-10-04.
    expect(runs('15 2 4,5 10 *', '2026-10-01T00:00:00Z', 1, 'Australia/Lord_Howe')).toEqual(['2026-10-04T15:15:00.000Z'])
  })
})

describe('wallTimeToInstants', () => {
  it('finds zero, one or two instants for a wall time', () => {
    expect(wallTimeToInstants(2026, 3, 8, 2, 30, 'America/New_York')).toEqual([])
    expect(wallTimeToInstants(2026, 3, 8, 3, 0, 'America/New_York')).toEqual([Date.UTC(2026, 2, 8, 7, 0)])
    expect(wallTimeToInstants(2026, 11, 1, 1, 30, 'America/New_York')).toEqual([Date.UTC(2026, 10, 1, 5, 30), Date.UTC(2026, 10, 1, 6, 30)])
    expect(wallTimeToInstants(2026, 6, 1, 12, 0, 'UTC')).toEqual([Date.UTC(2026, 5, 1, 12, 0)])
  })
})

describe('formatRun', () => {
  it('includes the weekday, date, 24-hour time and zone name', () => {
    expect(formatRun(new Date('2026-11-30T09:30:00Z'), 'UTC')).toBe('Mon, Nov 30, 2026, 09:30 UTC')
    expect(formatRun(new Date('2026-07-10T13:00:00Z'), 'America/New_York')).toBe('Fri, Jul 10, 2026, 09:00 EDT')
  })
})
