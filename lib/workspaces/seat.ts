import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { publicUrl } from '@/lib/public-url'
import { activeWorkspace, workspacesOf, type MemberWorkspace } from './workspaces'

/** Which workspace this browser is in. Only a preference: it opens nothing, since membership is read from the database on every request. */
const ACTIVE_WORKSPACE_COOKIE = 'soldlyne_workspace'
const A_YEAR_IN_SECONDS = 31_536_000

/** The signed-in member, the workspace this browser is in, and all those they could be in. */
export type Seat = {
  user: { id: string; name: string; email: string; emailVerified: boolean }
  workspace: MemberWorkspace
  workspaces: MemberWorkspace[]
}

async function readSeat(wanted: string | undefined): Promise<Seat | null> {
  const session = await getSession()
  if (!session) return null
  const workspaces = await workspacesOf(session.user.id)
  const workspace = activeWorkspace(workspaces, wanted)
  return workspace ? { user: session.user, workspace, workspaces } : null
}

/**
 * One read per request, whatever calls it: each `prisma` operation asks. React's `cache` only holds
 * during a render, and server actions and route handlers ask too, so it's kept against the request's
 * headers, which Next gives once per request. Keyed by the cookie as well: a page rendered after an
 * action that switched workspace, in the same request, must not get the old one. One per process,
 * since each of Next's server bundles loads its own copy of this module and an action's change has to reach the page it renders.
 */
const globalForSeats = globalThis as unknown as { seatsByRequest?: WeakMap<object, Map<string, Promise<Seat | null>>> }
const seatsByRequest = (globalForSeats.seatsByRequest ??= new WeakMap())

/** The signed-in member's seat, or null with no session or no workspace. Throws outside a request. */
export async function currentSeat(): Promise<Seat | null> {
  const requestHeaders = await headers()
  const wanted = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value ?? ''
  const seats = seatsByRequest.get(requestHeaders) ?? new Map<string, Promise<Seat | null>>()
  seatsByRequest.set(requestHeaders, seats)
  const known = seats.get(wanted)
  if (known) return known
  const seat = readSeat(wanted || undefined)
  seats.set(wanted, seat)
  return seat
}

/** The signed-in member's seat; sent to sign in, or to make or ask for a workspace, when they lack it. */
export async function requireSeat(): Promise<Seat> {
  const seat = await currentSeat()
  if (seat) return seat
  redirect((await getSession()) ? '/welcome' : '/login')
}

/** What this request knows of memberships changed: the next read goes to the database. */
async function forgetSeat() {
  seatsByRequest.delete(await headers())
}

/** Puts this browser in a workspace. Setting a cookie clears Next's client cache, so no page of the last workspace is shown again. Callers check membership first. */
export async function enterWorkspace(workspaceId: string) {
  await forgetSeat()
  ;(await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: 'lax', secure: publicUrl().startsWith('https:'), path: '/', maxAge: A_YEAR_IN_SECONDS })
}

/** For when someone leaves a workspace: this browser goes back to their first, and forgets what it held of the last. */
export async function forgetWorkspace() {
  await forgetSeat()
  ;(await cookies()).delete(ACTIVE_WORKSPACE_COOKIE)
}
