import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BrandPage } from '@/components/layout/brand-page'
import { SignOutButton } from '@/components/layout/sign-out-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { safeNext } from '@/lib/safe-next'
import { requireUser } from '@/lib/session'
import { createWorkspaceFromForm } from '@/lib/workspaces/actions'
import { mayStartWorkspace, workspacesOf } from '@/lib/workspaces/workspaces'

export const metadata: Metadata = { title: 'Welcome' }

/** Where someone with no workspace lands, and where those who may start another name it. */
export default async function WelcomePage({ searchParams }: PageProps<'/welcome'>) {
  const { next, another } = await searchParams
  const user = await requireUser()
  const hasOne = (await workspacesOf(user.id)).length > 0
  const mayStart = mayStartWorkspace(user, process.env)
  if (hasOne && !(another && mayStart)) redirect(safeNext(next))
  return (
    <BrandPage>
        <h1 className="text-xl font-semibold">{mayStart ? (hasOne ? 'A new workspace' : 'Your first workspace') : 'You have no workspace yet'}</h1>
        {mayStart ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">One per company. Each keeps its people, deals and mailboxes to itself.</p>
            <form action={createWorkspaceFromForm} className="mt-6 space-y-3">
              <input type="hidden" name="next" value={safeNext(next)} />
              <Input name="name" required maxLength={80} placeholder="Company name" aria-label="Company name" />
              <Button type="submit" size="lg" className="w-full">
                Create the workspace
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">Ask someone in your company for an invitation, and open the link they send you.</p>
            <div className="mt-6 text-sm text-muted-foreground">
              <SignOutButton />
            </div>
          </>
        )}
    </BrandPage>
  )
}
