/**
 * Why a quote can't do what was asked, in words meant for the person asking. A thrown message is the
 * one kind that reaches them: a production build hides every other error's text from the browser.
 */
export class QuoteRefusal extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuoteRefusal'
  }
}

export type Answer<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/** Runs what a screen asked for, turning a refusal into an answer the screen can show. Anything else stays an error. */
export async function attempt<T extends object>(work: () => Promise<T | void>): Promise<Answer<T>> {
  try {
    return { ok: true, ...((await work()) as T) }
  } catch (error) {
    if (error instanceof QuoteRefusal) return { ok: false, error: error.message }
    throw error
  }
}
