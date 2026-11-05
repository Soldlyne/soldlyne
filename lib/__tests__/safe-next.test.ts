import { describe, expect, it } from 'vitest'
import { safeNext } from '../safe-next'

describe('safeNext', () => {
  it('keeps a page of this app', () => {
    expect(safeNext('/join/abc')).toBe('/join/abc')
    expect(safeNext('/consent?client_id=1')).toBe('/consent?client_id=1')
  })

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', '', undefined, null, 3, ['/a']])('goes home rather than to %j', (next) => {
    expect(safeNext(next)).toBe('/')
  })
})
