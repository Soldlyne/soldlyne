import 'server-only'
import { revalidateTag, unstable_cache } from 'next/cache'
import { prisma, runInWorkspace } from '@/lib/prisma'
import { trustedPrisma } from '@/lib/trusted-prisma'
import { runSync } from './contacts'

const DAY_IN_SECONDS = 86_400

/**
 * Whether the cron has anything to read, kept outside the database so that asking doesn't wake it: a
 * serverless database bills by the hour it's awake. Whatever connects or removes a mailbox clears it
 * at once; the daily refresh is only the safety net for a change made by hand.
 */
const ANY_MAILBOX_TAG = 'any-mailbox'

// Trusted: the list of workspaces is what the cron walks, each then bound before it touches anything.
const allWorkspaces = () => trustedPrisma.workspace.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } })

/** Workspace by workspace: row-level security lets no query see across them, the owner's included. */
async function findAnyMailbox(): Promise<boolean> {
  for (const { id } of await allWorkspaces()) {
    if (await runInWorkspace(id, () => prisma.mailbox.findFirst({ select: { id: true } }))) return true
  }
  return false
}

export const anyMailboxConnected = unstable_cache(findAnyMailbox, [ANY_MAILBOX_TAG], { tags: [ANY_MAILBOX_TAG], revalidate: DAY_IN_SECONDS })

/** Clears the answer, so the next run asks. Next applies it when the route or action returns, so it has to be called before that. */
export const mailboxesChanged = () => revalidateTag(ANY_MAILBOX_TAG, { expire: 0 })

type Totals = Awaited<ReturnType<typeof runSync>> & { workspaces: number; workspaceErrors: number }

const add = (totals: Totals, run: Awaited<ReturnType<typeof runSync>>) => {
  totals.emailsLogged += run.emailsLogged
  totals.mailboxErrors += run.mailboxErrors
  totals.meetings += run.meetings
  totals.calendarErrors += run.calendarErrors
}

/** The cron run, for every workspace in turn: one that fails doesn't hold back the others. */
export async function syncEveryWorkspace(): Promise<Totals> {
  const totals: Totals = { workspaces: 0, workspaceErrors: 0, emailsLogged: 0, mailboxErrors: 0, meetings: 0, calendarErrors: 0 }
  for (const { id } of await allWorkspaces()) {
    totals.workspaces++
    try {
      add(totals, await runInWorkspace(id, runSync))
    } catch (error) {
      totals.workspaceErrors++
      console.warn('Sync failed for a workspace:', id, error instanceof Error ? error.message : error)
    }
  }
  return totals
}
