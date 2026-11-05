import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireUser } from '@/lib/session'
import { workspacesOf } from '@/lib/workspaces/workspaces'
import { ConsentButtons } from './consent-buttons'

export const metadata: Metadata = { title: 'Authorize an assistant' }

/** An assistant acts inside a workspace: someone with none gets one first, then comes back here. */
async function requireWorkspaces(query: Record<string, string | string[] | undefined>) {
  const user = await requireUser()
  const workspaces = await workspacesOf(user.id)
  if (workspaces.length > 0) return workspaces
  const here = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : [])))
  redirect(`/welcome?${new URLSearchParams({ next: `/consent?${here}` })}`)
}

const inWords = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/** Where a member approves or refuses an assistant, by the name it registered with: a name it can't prove, so it is shown with its address. */
export default async function ConsentPage({ searchParams }: PageProps<'/consent'>) {
  const query = await searchParams
  const workspaces = await requireWorkspaces(query)
  const { client_id: clientId } = query
  const client = typeof clientId === 'string' ? await auth().api.getOAuthClientPublic({ query: { client_id: clientId }, headers: await headers() }).catch(() => null) : null
  return (
    <main className="flex min-h-svh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-semibold">{client?.client_name ?? 'An assistant'} wants to use Soldlyne</h1>
        {client?.client_uri && <p className="mt-1 font-mono text-xs text-muted-foreground">{client.client_uri}</p>}
        <p className="mt-4 text-sm text-muted-foreground">
          It will act on your behalf in {workspaces.length > 1 ? `all your workspaces: ${inWords(workspaces.map(({ name }) => name))}` : `your workspace, ${workspaces[0].name}`}. It can read your companies, people and deals, move deals along, and log activities, tasks and notes. Everything it does is recorded as done by an assistant. It cannot invite, remove or change members.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">If you join another workspace later, it will reach that one too.</p>
        <div className="mt-6">
          <ConsentButtons />
        </div>
      </div>
    </main>
  )
}
