import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { BrandPage } from '@/components/layout/brand-page'
import { auth } from '@/lib/auth'
import { whereAccessGoes } from '@/lib/consent'
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

/** Where a member approves or refuses an assistant, by the name it registered with. Anyone can register under any name and address, so what the screen vouches for is where the code goes. */
export default async function ConsentPage({ searchParams }: PageProps<'/consent'>) {
  const query = await searchParams
  const workspaces = await requireWorkspaces(query)
  const { client_id: clientId, redirect_uri: redirectUri } = query
  const target = whereAccessGoes(redirectUri)
  const client = typeof clientId === 'string' ? await auth().api.getOAuthClientPublic({ query: { client_id: clientId }, headers: await headers() }).catch(() => null) : null
  return (
    <BrandPage width="max-w-md">
        <h1 className="text-xl font-semibold">{client?.client_name ?? 'An assistant'} wants to use Soldlyne</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {client?.client_name && 'It chose that name itself, and nobody has checked it. '}
          {target ? (
            <>
              Your access would go to <span className="font-mono font-medium text-foreground">{target}</span>: {"if you don't recognise that address, refuse."}
            </>
          ) : (
            "We can't tell where your access would go: refuse unless you know why you're here."
          )}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          It will act on your behalf in {workspaces.length > 1 ? `all your workspaces: ${inWords(workspaces.map(({ name }) => name))}` : `your workspace, ${workspaces[0].name}`}. It can read your companies, people and deals, move deals along, log activities, tasks and notes, write quotes and send them to your customers and, for an owner or admin, make and revoke API keys that read the workspace. Everything it does is recorded as done by an assistant. It cannot invite, remove or change members, accept a quote for a customer, or change your seller details.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">If you join another workspace later, it will reach that one too.</p>
        <div className="mt-6">
          <ConsentButtons />
        </div>
    </BrandPage>
  )
}
