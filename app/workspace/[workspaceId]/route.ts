import { NextResponse } from 'next/server'
import { safeNext } from '@/lib/safe-next'
import { getSession } from '@/lib/session'
import { enterWorkspace } from '@/lib/workspaces/seat'
import { workspacesOf } from '@/lib/workspaces/workspaces'

/**
 * Where an assistant's link to a page goes through when its member has several workspaces: the
 * browser enters the workspace the assistant was working in, then opens the page. Someone not in that
 * workspace simply lands on the page in their own, and learns nothing of it.
 */
export async function GET(request: Request, { params }: RouteContext<'/workspace/[workspaceId]'>) {
  const { workspaceId } = await params
  const url = new URL(request.url)
  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL(`/login?${new URLSearchParams({ next: `${url.pathname}${url.search}` })}`, request.url))
  if ((await workspacesOf(session.user.id)).some(({ id }) => id === workspaceId)) await enterWorkspace(workspaceId)
  return NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')), request.url))
}
