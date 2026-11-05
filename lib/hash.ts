import { createHash } from 'node:crypto'

/** How a secret we hand out once is kept: lead keys and invitation links. */
export const sha256 = (secret: string) => createHash('sha256').update(secret).digest('hex')
