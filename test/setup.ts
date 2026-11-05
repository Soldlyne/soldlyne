import 'dotenv/config'
import { vi } from 'vitest'

// Server actions refresh pages with revalidatePath, which needs a Next request.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: <T>(work: T) => work }))
