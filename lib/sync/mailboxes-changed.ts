import { revalidateTag } from 'next/cache'

/**
 * Tags the cron's cached answer to whether it has anything to read. On its own, since whatever connects
 * or removes a mailbox or a connector clears it, and those can't all import the sync itself.
 */
export const ANY_MAILBOX_TAG = 'any-mailbox'

/** Clears the answer, so the next run asks. Next applies it when the route or action returns, so it has to be called before that. */
export const mailboxesChanged = () => revalidateTag(ANY_MAILBOX_TAG, { expire: 0 })
