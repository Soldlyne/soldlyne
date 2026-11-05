import { z } from 'zod'

export type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }

/** A page of the app, for the assistant to hand over. */
export type PageLink = (path: string) => string

const json = (data: unknown): Result => ({
  content: [{ type: 'text', text: JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? Number(v) / 100 : v), 2) }],
})

export async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    return json(await fn())
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : error instanceof Error ? error.message : String(error)
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

export const READ = { readOnlyHint: true, openWorldHint: false }
export const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
