import 'dotenv/config'
import { vi } from 'vitest'

// Connectors and mailboxes seal what they hold, and nothing here is real.
process.env.SOLDLYNE_SECRETS_KEY ??= Buffer.alloc(32, 7).toString('base64')

// Server actions refresh pages with revalidatePath, which needs a Next request.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: <T>(work: T) => work }))
