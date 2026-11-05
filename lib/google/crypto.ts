import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/** TOKENS_ENCRYPTION_KEY: 32 random bytes, base64 (openssl rand -base64 32). */
function key(): Buffer {
  const raw = process.env.TOKENS_ENCRYPTION_KEY
  if (!raw) throw new Error('TOKENS_ENCRYPTION_KEY is not set')
  const buffer = Buffer.from(raw, 'base64')
  if (buffer.length !== 32) throw new Error('TOKENS_ENCRYPTION_KEY must be 32 bytes (base64)')
  return buffer
}

/** AES-256-GCM: "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function decrypt(value: string): string {
  const [version, iv, tag, data] = value.split('.')
  if (version !== 'v1') throw new Error('Unknown encryption version')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}
