import { describe, expect, it } from 'vitest'
import { diffOf } from '../timeline'

describe('diffOf', () => {
  it('sees no change in a field left undefined, whatever the record holds', () => {
    expect(diffOf({ name: 'Acme', custom: { a: 1 } }, { custom: undefined })).toEqual({})
    expect(diffOf({ name: 'Acme', custom: { a: 1 } }, { name: 'Acme', custom: undefined })).toEqual({})
  })

  it('records a real change, and a field cleared with null', () => {
    expect(diffOf<Record<string, unknown>>({ name: 'Acme', city: 'Lyon' }, { name: 'Beta', city: null })).toEqual({
      name: { before: 'Acme', after: 'Beta' },
      city: { before: 'Lyon', after: null },
    })
  })

  it('compares amounts held as bigint', () => {
    expect(diffOf({ amount: BigInt(100) }, { amount: BigInt(100) })).toEqual({})
    expect(diffOf({ amount: BigInt(100) }, { amount: BigInt(200) })).toHaveProperty('amount')
  })
})
