import { afterEach, describe, expect, it, vi } from 'vitest'
import { decrypt, encrypt } from '../crypto'

const KEY = Buffer.alloc(32, 7).toString('base64')

afterEach(() => vi.unstubAllEnvs())

describe('token encryption', () => {
  it('round-trips with TOKENS_ENCRYPTION_KEY', () => {
    vi.stubEnv('TOKENS_ENCRYPTION_KEY', KEY)
    const sealed = encrypt('refresh-token')
    expect(sealed).not.toContain('refresh-token')
    expect(decrypt(sealed)).toBe('refresh-token')
  })

  it('refuses a missing or short key', () => {
    vi.stubEnv('TOKENS_ENCRYPTION_KEY', '')
    expect(() => encrypt('x')).toThrow('TOKENS_ENCRYPTION_KEY is not set')
    vi.stubEnv('TOKENS_ENCRYPTION_KEY', 'c2hvcnQ=')
    expect(() => encrypt('x')).toThrow('TOKENS_ENCRYPTION_KEY must be 32 bytes')
  })
})
