import { describe, expect, it } from 'vitest'
import { formatQuoteDate, readDate, stateOf, todayUtc } from '../status'

const day = (text: string) => new Date(`${text}T00:00:00.000Z`)

describe('expiry', () => {
  const sent = { status: 'SENT' as const, validUntil: day('2026-11-05') }

  it('leaves the whole last day good, by the UTC date', () => {
    expect(stateOf(sent, new Date('2026-11-05T00:00:00Z'))).toBe('SENT')
    expect(stateOf(sent, new Date('2026-11-05T23:59:59Z'))).toBe('SENT')
    expect(stateOf(sent, new Date('2026-11-06T00:00:00Z'))).toBe('EXPIRED')
  })

  it.each(['DRAFT', 'ACCEPTED', 'DECLINED'] as const)('only touches a sent quote, not one %s', (status) => {
    expect(stateOf({ status, validUntil: day('2020-01-01') }, new Date('2026-11-06T00:00:00Z'))).toBe(status)
  })
})

describe('dates', () => {
  it('start the day at midnight UTC', () => {
    expect(todayUtc(new Date('2026-11-05T23:30:00-05:00')).toISOString()).toBe('2026-11-06T00:00:00.000Z')
  })

  it('show the date itself, in any time zone', () => {
    expect(formatQuoteDate(day('2026-11-05'))).toBe('5 Nov 2026')
  })

  it('read only a real date', () => {
    expect(readDate('2026-11-05')?.toISOString()).toBe('2026-11-05T00:00:00.000Z')
    for (const bad of ['2026-02-30', '05/11/2026', 'soon', '']) expect(readDate(bad)).toBeNull()
  })
})
