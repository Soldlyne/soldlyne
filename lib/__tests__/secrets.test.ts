import { afterEach, describe, expect, it, vi } from 'vitest'
import { canSeal, openFields, openText, sealFields, sealText } from '../secrets'

const KEY = Buffer.alloc(32, 7).toString('base64')
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64')

afterEach(() => vi.unstubAllEnvs())

describe('sealing', () => {
  it('round-trips with SOLDLYNE_SECRETS_KEY', () => {
    vi.stubEnv('SOLDLYNE_SECRETS_KEY', KEY)
    const sealed = sealText('refresh-token')
    expect(sealed).not.toContain('refresh-token')
    expect(openText(sealed)).toBe('refresh-token')
  })

  it('seals a set of fields as one value', () => {
    vi.stubEnv('SOLDLYNE_SECRETS_KEY', KEY)
    const sealed = sealFields({ clientId: 'the-id', clientSecret: 'the-secret' })
    expect(sealed).not.toContain('the-secret')
    expect(openFields(sealed)).toEqual({ clientId: 'the-id', clientSecret: 'the-secret' })
  })

  it('gives a different value each time', () => {
    vi.stubEnv('SOLDLYNE_SECRETS_KEY', KEY)
    expect(sealText('same')).not.toBe(sealText('same'))
  })

  it("can't open what another key sealed", () => {
    vi.stubEnv('SOLDLYNE_SECRETS_KEY', KEY)
    const sealed = sealText('secret')
    vi.stubEnv('SOLDLYNE_SECRETS_KEY', OTHER_KEY)
    expect(() => openText(sealed)).toThrow()
  })

  it('refuses a missing or short key, and says whether it can seal', () => {
    vi.stubEnv('SOLDLYNE_SECRETS_KEY', '')
    expect(canSeal()).toBe(false)
    expect(() => sealText('x')).toThrow('SOLDLYNE_SECRETS_KEY is not set')
    vi.stubEnv('SOLDLYNE_SECRETS_KEY', 'c2hvcnQ=')
    expect(canSeal()).toBe(false)
    expect(() => sealText('x')).toThrow('SOLDLYNE_SECRETS_KEY must be 32 bytes')
    vi.stubEnv('SOLDLYNE_SECRETS_KEY', KEY)
    expect(canSeal()).toBe(true)
  })
})
