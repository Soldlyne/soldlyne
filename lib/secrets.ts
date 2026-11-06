import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * What a workspace gave to act for it at an outside service (a connector's credentials, a mailbox's
 * tokens), sealed with the install's one key, so a copy of the database alone reveals none of it.
 * SOLDLYNE_SECRETS_KEY: 32 random bytes, base64 (openssl rand -base64 32).
 */

const KEY_BYTES = 32

const keyBytes = () => Buffer.from(process.env.SOLDLYNE_SECRETS_KEY ?? '', 'base64')

/** Whether this install can seal anything. Connecting waits for it, since nothing may ever be kept open. */
export const canSeal = () => keyBytes().length === KEY_BYTES

function key(): Buffer {
  if (!process.env.SOLDLYNE_SECRETS_KEY) throw new Error('SOLDLYNE_SECRETS_KEY is not set')
  const buffer = keyBytes()
  if (buffer.length !== KEY_BYTES) throw new Error('SOLDLYNE_SECRETS_KEY must be 32 bytes (base64)')
  return buffer
}

/** AES-256-GCM: "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function sealText(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function openText(value: string): string {
  const [version, iv, tag, data] = value.split('.')
  if (version !== 'v1') throw new Error('Unknown encryption version')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

export type Fields = Record<string, string>

export const sealFields = (fields: Fields) => sealText(JSON.stringify(fields))

export const openFields = (sealed: string): Fields => JSON.parse(openText(sealed))
